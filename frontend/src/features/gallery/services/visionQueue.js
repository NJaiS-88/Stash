/**
 * Vision Queue Controller
 * Orchestrates off-thread AI image captioning using vision.worker.js.
 * Guarantees atomic claims via IndexedDB, concurrency = 1, and zero main-thread freezing.
 */

import {
    claimNextPendingImage,
    updateImageAI,
    getPendingImages,
    getAllFolders,
    resetStaleProcessingImages
} from './galleryDb';
import { resolveFileByPath } from './fileSystem';
import { describeImage } from './visionModel';

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
            modelStatus: 'Idle'
        };
    }

    /**
     * Subscribe to queue state updates (progress, status, file updates).
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
     * Initialize worker thread with fallback to in-thread inference.
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
                console.warn('[VisionQueue] Worker encountered error, falling back:', err);
                if (this.activeResolve) {
                    this.activeResolve(null);
                    this.activeResolve = null;
                }
            };

            this.worker.postMessage({ type: 'INIT' });
        } catch (err) {
            console.warn('[VisionQueue] Web Worker unsupported or failed to spawn; falling back to main-thread engine:', err);
            this.worker = null;
        }
    }

    /**
     * Start or resume the AI indexing queue.
     * @param {Array} folders - Optional folder handles list
     */
    async start(folders = null) {
        if (this.isRunning && !this.isPaused) return;

        this.isPaused = false;
        this.isRunning = true;
        this.initWorker();

        await resetStaleProcessingImages();

        const pendingList = await getPendingImages();
        this.status.isIndexing = true;
        this.status.isPaused = false;
        this.status.total = pendingList.length;
        this.status.current = 0;
        this.status.modelStatus = pendingList.length > 0 ? 'Starting AI queue...' : 'All photos indexed.';
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
                // No more pending images in database
                break;
            }

            let folder = folderMap.get(img.folderId);
            if (!folder?.handle) {
                // Refresh folder map in case a new folder was connected dynamically
                const refreshedFolders = await getAllFolders();
                for (const f of refreshedFolders) {
                    folderMap.set(f.id, f);
                }
                folder = folderMap.get(img.folderId);
            }

            if (!folder?.handle) {
                console.warn('[VisionQueue] Missing handle for folder:', img.folderId);
                continue;
            }

            this.status.current = ++processedCount;
            this.status.currentFile = img.fileName;
            this.status.modelStatus = `Analyzing ${img.fileName} (${this.status.current}/${this.status.total})...`;
            this.notify();

            try {
                const file = await resolveFileByPath(folder.handle, img.relativePath);
                if (!file) {
                    console.warn('[VisionQueue] File could not be resolved:', img.relativePath);
                    continue;
                }

                let result = null;

                if (this.worker) {
                    // Send to off-thread Web Worker
                    result = await new Promise((resolve) => {
                        this.activeResolve = resolve;
                        this.worker.postMessage({
                            type: 'PROCESS_IMAGE',
                            imageId: img.imageId,
                            blob: file,
                            fileName: img.fileName
                        });
                    });
                }

                // If worker wasn't available or returned null, use direct engine
                if (!result) {
                    result = await describeImage(file);
                }

                if (result) {
                    await updateImageAI(img.imageId, {
                        caption: result.caption,
                        keywords: result.keywords
                    });

                    // Live event notification for UI cards to immediately render new tags & caption
                    this.status.lastIndexed = {
                        imageId: img.imageId,
                        folderId: img.folderId,
                        caption: result.caption,
                        keywords: result.keywords
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
