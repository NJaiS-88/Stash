/**
 * Vision Queue Controller — Two-Tier Local Inference System
 * Tier 1 (Preferred): Stash Local AI Helper on 127.0.0.1 (Qwen3-VL-8B-Instruct).
 * Tier 2 (Zero-Install Fallback): Browser Web Worker (Florence-2-base-ft / vit-gpt2).
 * Guarantees zero cloud image leakage, concurrency = 1, and atomic IndexedDB leasing.
 */

import {
    claimNextPendingImage,
    updateImageAI,
    getPendingImages,
    getAllFolders,
    resetStaleProcessingImages,
    saveImageRecord,
    markBrowserCaptionsForUpgrade,
    getExistingCaptionByContentHash,
    getQueueStats
} from './galleryDb';
import { resolveFileByPath } from './fileSystem';
import { computeFileHash } from './crypto';
import { checkLocalAiHealth, requestLocalCaption } from './localAiClient';
import { cloudSyncManager } from './cloudSync';

class VisionQueueManager {
    constructor() {
        this.worker = null;
        this.isRunning = false;
        this.isPaused = false;
        this.currentTask = null;
        this.activeResolve = null;
        this.listeners = new Set();
        this.status = {
            isIndexing: false,
            isPaused: false,
            current: 0,
            total: 0,
            currentFile: '',
            modelStatus: 'Idle',
            activeEngine: 'browser', // 'local' | 'browser'
            activeModel: 'Florence-2-base-ft'
        };
    }

    /**
     * Subscribe to queue state updates (progress, status, file updates, active engine).
     * @param {Function} callback
     * @returns {Function} Unsubscribe function
     */
    subscribe(callback) {
        this.listeners.add(callback);
        callback({ ...this.status });
        return () => this.listeners.delete(callback);
    }

    notify() {
        const snapshot = { ...this.status };
        for (const listener of this.listeners) {
            try {
                listener(snapshot);
            } catch (err) {
                console.warn('[VisionQueue] Listener error:', err);
            }
        }
    }

    /**
     * Initialize worker thread for Tier 2 browser fallback.
     */
    initWorker() {
        if (this.worker) return;

        try {
            this.worker = new Worker(
                new URL('../workers/vision.worker.js', import.meta.url),
                { type: 'module' }
            );

            this.worker.onmessage = (e) => {
                const data = e.data;
                if (!data) return;

                if (data.type === 'MODEL_PROGRESS') {
                    this.status.modelStatus = 'Loading model weights into cache...';
                    this.notify();
                } else if (data.type === 'STATUS') {
                    this.status.modelStatus = data.message || 'Ready';
                    this.notify();
                } else if (data.type === 'IMAGE_INDEXED') {
                    if (this.activeResolve) {
                        this.activeResolve(data);
                        this.activeResolve = null;
                    }
                }
            };

            this.worker.onerror = (err) => {
                console.warn('[VisionQueue] Web Worker error:', err);
                if (this.activeResolve) {
                    this.activeResolve(null);
                    this.activeResolve = null;
                }
            };

            this.worker.postMessage({ type: 'INIT' });
        } catch (err) {
            console.warn('[VisionQueue] Web Worker unsupported; falling back to main-thread engine:', err);
            this.worker = null;
        }
    }

    /**
     * Start or resume the two-tier AI indexing queue.
     * Probes Local AI Helper first; defaults to Qwen3-VL-8B if healthy, falls back to Browser AI.
     * @param {Array} folders - Optional folder handles list
     */
    async start(folders = null) {
        if (this.isRunning && !this.isPaused) return;

        this.isPaused = false;
        this.isRunning = true;

        // Phase 21: Recover any interrupted jobs from previous sessions
        await resetStaleProcessingImages({ forceAll: true });

        // Tier 1 Detection: Probe 127.0.0.1 Stash Local AI Helper
        const localHealth = await checkLocalAiHealth();
        if (localHealth.available) {
            this.status.activeEngine = 'local';
            this.status.activeModel = localHealth.model || 'Qwen3-VL-8B-Instruct';
            console.log('[VisionQueue] 🚀 Preferred Tier 1 Active: Stash Local AI (Qwen3-VL-8B). Browser AI is DISABLED.');
            // Terminate any existing browser worker so it never triggers or consumes CPU/memory
            if (this.worker) {
                this.worker.terminate();
                this.worker = null;
            }
            // Automatically upgrade any photos previously captioned by browser fallback
            const upgraded = await markBrowserCaptionsForUpgrade();
            if (upgraded > 0) {
                console.log(`[VisionQueue] Re-queued ${upgraded} photos from browser fallback to upgrade to Qwen3-VL.`);
            }
        } else {
            this.status.activeEngine = 'browser';
            this.status.activeModel = 'Florence-2-base-ft';
            console.log('[VisionQueue] Stash Local AI not detected. Using Browser AI fallback.');
            this.initWorker();
        }

        const isLocalAvailable = this.status.activeEngine === 'local';
        const stats = await getQueueStats();
        const pendingList = await getPendingImages({ isLocalAiAvailable: isLocalAvailable });

        this.status.isIndexing = true;
        this.status.isPaused = false;
        this.status.total = stats.total > 0 ? stats.total : pendingList.length;
        this.status.current = stats.completed;
        this.status.modelStatus = pendingList.length > 0
            ? `Starting AI queue using ${this.status.activeEngine === 'local' ? 'Local Qwen3-VL-8B' : 'Browser AI'}...`
            : 'All photos indexed.';
        this.notify();

        if (pendingList.length === 0) {
            this.isRunning = false;
            this.status.isIndexing = false;
            this.notify();
            return;
        }

        const activeFolders = folders || await getAllFolders();
        const folderMap = new Map(activeFolders.map(f => [f.id, f]));

        let processedCount = 0;

        while (this.isRunning && !this.isPaused) {
            let img = null;
            try {
                img = await claimNextPendingImage({ isLocalAiAvailable: this.status.activeEngine === 'local' });
            } catch (claimErr) {
                console.warn('[VisionQueue] Error claiming pending image:', claimErr);
                break;
            }

            if (!img) {
                console.log('[VisionQueue] All pending images have been processed.');
                break;
            }
            console.log(`[VisionQueue] Claimed photo ${processedCount + 1}: ${img.fileName} (ID: ${img.imageId})`);

            let folder = folderMap.get(img.folderId);
            if (!folder?.handle) {
                const refreshedFolders = await getAllFolders();
                for (const f of refreshedFolders) {
                    folderMap.set(f.id, f);
                }
                folder = folderMap.get(img.folderId);
            }

            // Fallback: If folder ID mismatch (e.g. folder was reconnected with new UUID), check any available handle
            if (!folder?.handle) {
                for (const candidate of folderMap.values()) {
                    if (candidate?.handle) {
                        try {
                            const candidateFile = await resolveFileByPath(candidate.handle, img.relativePath);
                            if (candidateFile) {
                                folder = candidate;
                                img.folderId = candidate.id;
                                break;
                            }
                        } catch {
                            // continue checking
                        }
                    }
                }
            }

            if (!folder?.handle) {
                // Folder genuinely missing or permission revoked; mark failed to prevent continuous infinite loop
                await saveImageRecord({
                    ...img,
                    captionStatus: 'failed',
                    queuePriority: 4,
                    retryCount: (img.retryCount || 0) + 1,
                    processingStartedAt: Date.now(),
                    indexingStatus: 'failed',
                    captionError: 'Folder disconnected or handle unavailable'
                });
                continue;
            }

            processedCount++;
            this.status.currentFile = img.fileName;
            const engineLabel = this.status.activeEngine === 'local' ? 'Local Qwen3-VL-8B' : 'Browser AI';
            this.status.modelStatus = `Analyzing ${img.fileName} (${this.status.current + 1}/${this.status.total}) via ${engineLabel}...`;
            this.notify();

            let file = null;
            let result = null;

            try {
                file = await resolveFileByPath(folder.handle, img.relativePath);
                if (!file) {
                    console.warn('[VisionQueue] File could not be resolved:', img.relativePath);
                    await saveImageRecord({
                        ...img,
                        status: 'missing',
                        captionStatus: 'failed',
                        queuePriority: 4,
                        retryCount: (img.retryCount || 0) + 1,
                        processingStartedAt: Date.now(),
                        indexingStatus: 'failed'
                    });
                    continue;
                }

                // ---------------- STEP 0: INSTANT HASH DEDUPLICATION ----------------
                // Ensure contentHash is present (computed lazily in microseconds if missing)
                if (!img.contentHash && file) {
                    try {
                        img.contentHash = await computeFileHash(file);
                    } catch (hashErr) {
                        console.warn('[VisionQueue] Hash computation skipped:', hashErr);
                    }
                }

                // If this image shares the same SHA-256 hash as an already-captioned image, reuse it in 0ms!
                if (img.contentHash) {
                    const existingMatch = await getExistingCaptionByContentHash(img.contentHash);
                    if (existingMatch && existingMatch.caption && existingMatch.imageId !== img.imageId) {
                        console.log(`[VisionQueue] ⚡ Instant Hash Reuse for ${img.fileName}: Reusing existing caption from ${existingMatch.fileName}`);
                        result = {
                            imageId: img.imageId,
                            contentHash: img.contentHash,
                            caption: existingMatch.caption,
                            engine: existingMatch.captionEngine || existingMatch.engine || 'local',
                            model: existingMatch.captionModel || existingMatch.model || 'qwen3-vl-8b-instruct',
                            captionVersion: existingMatch.captionVersion || 1,
                            keywords: existingMatch.keywords || []
                        };
                    }
                }

                // ---------------- TIER 1: STASH LOCAL AI (NO TIME LIMITS, NO BROWSER FALLBACK) ----------------
                if (!result && this.status.activeEngine === 'local') {
                    try {
                        const localRes = await requestLocalCaption(file, img.fileName, { imageId: img.imageId });
                        if (localRes && localRes.caption && localRes.caption.trim().length > 0) {
                            result = {
                                imageId: localRes.imageId || img.imageId,
                                contentHash: img.contentHash,
                                caption: localRes.caption.trim(),
                                engine: 'local',
                                model: localRes.model || 'qwen3-vl-8b-instruct',
                                captionVersion: localRes.captionVersion || 1,
                                keywords: localRes.keywords || []
                            };
                            console.log(`[VisionQueue] ✅ Local Qwen3-VL captioned (${img.fileName}): "${result.caption.slice(0, 70)}..."`);
                        }
                    } catch (localErr) {
                        console.warn(`[VisionQueue] Local AI Helper failed for ${img.fileName}:`, localErr);
                        // PROBE: Did the user shut down or close the Local AI Helper?
                        const health = await checkLocalAiHealth();
                        if (!health.available) {
                            console.warn('[VisionQueue] 🛑 Local AI helper was closed or disconnected. Pausing queue immediately.');
                            // Revert this image back to pending so it is NEVER marked as failed!
                            await saveImageRecord({
                                ...img,
                                captionStatus: 'pending',
                                queuePriority: 3,
                                processingStartedAt: null,
                                indexingStatus: 'pending'
                            });
                            this.isPaused = true;
                            this.isRunning = false;
                            this.status.isIndexing = false;
                            this.status.isPaused = true;
                            this.status.modelStatus = 'Local AI service closed. Paused until Local AI starts.';
                            this.notify();
                            return; // Stop immediately! Do NOT mark remaining photos as failed!
                        }
                    }
                }

                // ---------------- TIER 2: BROWSER AI ONLY IF LOCAL AI IS NOT RUNNING ----------------
                // Strict isolation: Browser AI will NEVER be triggered if local AI is detected
                if (!result && this.status.activeEngine === 'browser') {
                    if (!this.worker) {
                        this.initWorker();
                    }

                    if (this.worker) {
                        const workerRes = await new Promise((resolve) => {
                            this.activeResolve = (data) => resolve(data);
                            this.worker.postMessage({
                                type: 'PROCESS_IMAGE',
                                imageId: img.imageId,
                                blob: file,
                                fileName: img.fileName
                            });
                        });

                        if (workerRes && workerRes.caption) {
                            result = {
                                imageId: workerRes.imageId || img.imageId,
                                contentHash: img.contentHash,
                                caption: workerRes.caption,
                                engine: 'browser',
                                model: workerRes.model || 'florence-2-base-ft',
                                captionVersion: workerRes.captionVersion || 1,
                                keywords: workerRes.keywords || []
                            };
                        }
                    }
                }

                if (result && result.caption) {
                    await updateImageAI(result.imageId, {
                        caption: result.caption,
                        keywords: result.keywords || [],
                        contentHash: img.contentHash || result.contentHash || null,
                        engine: result.engine || this.status.activeEngine,
                        model: result.model || this.status.activeModel,
                        captionVersion: result.captionVersion || 1
                    });

                    // Live event notification for UI cards to immediately render new tags & caption
                    this.status.lastIndexed = {
                        imageId: result.imageId,
                        folderId: img.folderId,
                        caption: result.caption,
                        keywords: result.keywords || [],
                        engine: result.engine || this.status.activeEngine,
                        model: result.model || this.status.activeModel,
                        captionVersion: result.captionVersion
                    };
                    this.status.current = Math.min(this.status.total, this.status.current + 1);
                    this.status.modelStatus = `Indexed ${img.fileName} (${this.status.current}/${this.status.total})`;
                    this.notify();
                    console.log(`[VisionQueue] ✅ Completed ${img.fileName}. Advancing immediately to next photo...`);
                } else {
                    console.warn(`[VisionQueue] No caption returned for ${img.fileName}`);
                    await saveImageRecord({
                        ...img,
                        captionStatus: 'failed',
                        queuePriority: 4,
                        retryCount: (img.retryCount || 0) + 1,
                        processingStartedAt: Date.now(),
                        captionError: 'Empty caption returned',
                        indexingStatus: 'failed'
                    });
                }
            } catch (err) {
                console.warn(`[VisionQueue] Failed to index ${img.fileName}:`, err);
                await saveImageRecord({
                    ...img,
                    captionStatus: 'failed',
                    queuePriority: 4,
                    retryCount: (img.retryCount || 0) + 1,
                    processingStartedAt: Date.now(),
                    captionError: err?.message || 'Caption inference failed',
                    indexingStatus: 'failed'
                });
            } finally {
                file = null;
                result = null;
            }
        }

        const finalStats = await getQueueStats();
        this.isRunning = false;
        this.status.isIndexing = false;
        this.status.current = finalStats.completed;
        this.status.total = finalStats.total;
        this.status.currentFile = '';
        this.status.modelStatus = this.isPaused ? 'AI inference paused.' : 'AI indexing complete!';
        this.notify();

        // Phase 25: Trigger background cloud synchronization under strict Privacy Boundary
        if (!this.isPaused) {
            cloudSyncManager.syncPendingImagesToCloud().catch(err => {
                console.warn('[VisionQueue] Cloud sync background notification:', err?.message || err);
            });
        }
    }

    /**
     * Pause the indexing queue safely.
     */
    pause() {
        this.isPaused = true;
        this.status.isPaused = true;
        this.status.isIndexing = false;
        this.status.modelStatus = 'AI inference paused by user.';
        this.notify();
    }

    /**
     * Resume paused queue.
     * @param {Array} folders
     */
    resume(folders = null) {
        this.start(folders);
    }
}

// Global singleton instance
export const visionQueue = new VisionQueueManager();

