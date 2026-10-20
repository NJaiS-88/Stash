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
    saveImageRecord
} from './galleryDb';
import { resolveFileByPath } from './fileSystem';
import { describeImage } from './visionModel';
import { checkLocalAiHealth, requestLocalCaption } from './localAiClient';

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

        await resetStaleProcessingImages();

        // Tier 1 Detection: Probe 127.0.0.1 Stash Local AI Helper
        const localHealth = await checkLocalAiHealth();
        if (localHealth.available) {
            this.status.activeEngine = 'local';
            this.status.activeModel = localHealth.model || 'Qwen3-VL-8B-Instruct';
            console.log('[VisionQueue] Preferred Tier 1 Active: Stash Local AI (Qwen3-VL-8B)');
        } else {
            this.status.activeEngine = 'browser';
            this.status.activeModel = 'Florence-2-base-ft';
            console.log('[VisionQueue] Stash Local AI not ready yet (offline or downloading). Using Browser AI (Florence-2 Web Worker)');
            this.initWorker();
        }

        const pendingList = await getPendingImages();
        this.status.isIndexing = true;
        this.status.isPaused = false;
        this.status.total = pendingList.length;
        this.status.current = 0;
        this.status.modelStatus = pendingList.length > 0
            ? `Starting AI queue using ${this.status.activeEngine === 'local' ? 'Local Qwen3-VL' : 'Browser AI'}...`
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
            // Claim next available pending image atomically
            const img = await claimNextPendingImage();
            if (!img) {
                // No more pending images
                break;
            }

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
                    indexingStatus: 'failed',
                    captionError: 'Folder disconnected or handle unavailable'
                });
                continue;
            }

            this.status.current = ++processedCount;
            this.status.currentFile = img.fileName;
            const engineLabel = this.status.activeEngine === 'local' ? 'Local Qwen3-VL-8B' : 'Browser AI';
            this.status.modelStatus = `Analyzing ${img.fileName} (${this.status.current}/${this.status.total}) via ${engineLabel}...`;
            this.notify();

            try {
                const file = await resolveFileByPath(folder.handle, img.relativePath);
                if (!file) {
                    console.warn('[VisionQueue] File could not be resolved:', img.relativePath);
                    await saveImageRecord({
                        ...img,
                        status: 'missing',
                        captionStatus: 'failed',
                        indexingStatus: 'failed'
                    });
                    continue;
                }

                let result = null;

                // ---------------- TIER 1: STASH LOCAL AI ----------------
                if (this.status.activeEngine === 'local') {
                    try {
                        const localRes = await requestLocalCaption(file, img.fileName);
                        result = {
                            caption: localRes.caption,
                            keywords: localRes.keywords,
                            engine: 'local',
                            model: localRes.model || 'qwen3-vl-8b-instruct'
                        };
                    } catch (localErr) {
                        console.warn('[VisionQueue] Local AI Helper request failed, falling back to Browser AI:', localErr);
                        // Seamless mid-queue fallback to browser Web Worker
                        this.status.activeEngine = 'browser';
                        this.status.activeModel = 'Florence-2-base-ft';
                        this.initWorker();
                    }
                }

                // ---------------- TIER 2: BROWSER AI FALLBACK ----------------
                if (!result || !result.caption) {
                    if (this.worker) {
                        const workerRes = await new Promise((resolve) => {
                            this.activeResolve = resolve;
                            this.worker.postMessage({
                                type: 'PROCESS_IMAGE',
                                imageId: img.imageId,
                                blob: file,
                                fileName: img.fileName
                            });
                        });
                        if (workerRes) {
                            result = {
                                caption: workerRes.caption,
                                keywords: workerRes.keywords,
                                engine: 'browser',
                                model: 'florence-2-base-ft'
                            };
                        }
                    }

                    // Emergency main-thread fallback if worker yielded nothing
                    if (!result || !result.caption) {
                        const directRes = await describeImage(file);
                        result = {
                            caption: directRes.caption,
                            keywords: directRes.keywords,
                            engine: 'browser',
                            model: 'florence-2-base-ft'
                        };
                    }
                }

                if (result && result.caption) {
                    await updateImageAI(img.imageId, {
                        caption: result.caption,
                        keywords: result.keywords,
                        engine: result.engine || 'browser',
                        model: result.model || 'florence-2-base-ft',
                        version: 1
                    });

                    // Live event notification for UI cards to immediately render new tags & caption
                    this.status.lastIndexed = {
                        imageId: img.imageId,
                        folderId: img.folderId,
                        caption: result.caption,
                        keywords: result.keywords,
                        engine: result.engine,
                        model: result.model
                    };
                    this.notify();
                }
            } catch (err) {
                console.warn(`[VisionQueue] Failed to index ${img.fileName}:`, err);
            }
        }

        this.isRunning = false;
        this.status.isIndexing = false;
        this.status.currentFile = '';
        this.status.modelStatus = this.isPaused ? 'AI inference paused.' : 'AI indexing complete!';
        this.notify();
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

