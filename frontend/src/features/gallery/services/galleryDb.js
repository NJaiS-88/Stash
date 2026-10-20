const DB_NAME = 'stash_db';
const DB_VERSION = 6;
const FOLDERS_STORE = 'folders';
const IMAGES_STORE = 'images';

function getDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = request.result;

            if (!db.objectStoreNames.contains(FOLDERS_STORE)) {
                db.createObjectStore(FOLDERS_STORE);
            }

            let imageStore;
            if (!db.objectStoreNames.contains(IMAGES_STORE)) {
                imageStore = db.createObjectStore(IMAGES_STORE, { keyPath: 'imageId' });
            } else {
                imageStore = request.transaction.objectStore(IMAGES_STORE);
            }

            if (!imageStore.indexNames.contains('folderId')) {
                imageStore.createIndex('folderId', 'folderId', { unique: false });
            }
            if (!imageStore.indexNames.contains('folder_path')) {
                imageStore.createIndex('folder_path', ['folderId', 'relativePath'], { unique: true });
            }
            // Phase 5: Index on SHA-256 contentHash for instant duplicate detection & rename resolution
            if (!imageStore.indexNames.contains('contentHash')) {
                imageStore.createIndex('contentHash', 'contentHash', { unique: false });
            }
            // Phase 7: Index on user-specific HMAC fingerprint for cloud reconciliation
            if (!imageStore.indexNames.contains('fingerprint')) {
                imageStore.createIndex('fingerprint', 'fingerprint', { unique: false });
            }
            // Phase 9: Index on status ('available' vs 'missing')
            if (!imageStore.indexNames.contains('status')) {
                imageStore.createIndex('status', 'status', { unique: false });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// ----------------- FOLDERS STORE -----------------

export async function saveFolder(folder) {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(FOLDERS_STORE, 'readwrite');
            const req = tx.objectStore(FOLDERS_STORE).put(folder, folder.id);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    } catch (error) {
        console.error('Error saving folder:', error);
        return false;
    }
}

export async function getAllFolders() {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(FOLDERS_STORE, 'readonly');
            const req = tx.objectStore(FOLDERS_STORE).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    } catch (error) {
        console.error('Error getting all folders:', error);
        return [];
    }
}

export async function deleteFolder(folderId) {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(FOLDERS_STORE, 'readwrite');
            const req = tx.objectStore(FOLDERS_STORE).delete(folderId);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    } catch (error) {
        console.error('Error deleting folder:', error);
        return false;
    }
}

// ----------------- IMAGES REGISTRY STORE -----------------

export async function saveImageRecord(record) {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IMAGES_STORE, 'readwrite');
            const req = tx.objectStore(IMAGES_STORE).put(record);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    } catch (error) {
        console.error('Error saving image record:', error);
        return false;
    }
}

export async function saveImageRecords(records) {
    if (!records || records.length === 0) return true;
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IMAGES_STORE, 'readwrite');
            const store = tx.objectStore(IMAGES_STORE);
            for (const record of records) {
                store.put(record);
            }
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    } catch (error) {
        console.error('Error batch saving image records:', error);
        return false;
    }
}

export async function getImagesByFolder(folderId) {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IMAGES_STORE, 'readonly');
            const index = tx.objectStore(IMAGES_STORE).index('folderId');
            const req = index.getAll(folderId);
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    } catch (error) {
        console.error('Error getting images by folder:', error);
        return [];
    }
}

export async function getAllImages() {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IMAGES_STORE, 'readonly');
            const req = tx.objectStore(IMAGES_STORE).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    } catch (error) {
        console.error('Error getting all images:', error);
        return [];
    }
}

export async function deleteImagesByFolder(folderId) {
    try {
        const db = await getDB();
        const records = await getImagesByFolder(folderId);
        if (records.length === 0) return true;

        return new Promise((resolve, reject) => {
            const tx = db.transaction(IMAGES_STORE, 'readwrite');
            const store = tx.objectStore(IMAGES_STORE);
            for (const item of records) {
                store.delete(item.imageId);
            }
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    } catch (error) {
        console.error('Error deleting images for folder:', error);
        return false;
    }
}

/**
 * Retrieves all images matching a specific SHA-256 contentHash.
 * Useful for finding duplicate copies or verifying renames.
 *
 * @param {string} contentHash
 * @returns {Promise<Array>}
 */
export async function getImagesByContentHash(contentHash) {
    if (!contentHash) return [];
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IMAGES_STORE, 'readonly');
            const index = tx.objectStore(IMAGES_STORE).index('contentHash');
            const req = index.getAll(contentHash);
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    } catch (error) {
        console.error('Error getting images by contentHash:', error);
        return [];
    }
}

/**
 * Groups and returns all duplicate images across connected folders
 * where two or more records share the exact same SHA-256 contentHash.
 *
 * @returns {Promise<Array<{ hash: string, count: number, images: Array }>>}
 */
export async function findDuplicateImages() {
    try {
        const all = await getAllImages();
        const hashMap = new Map();

        for (const img of all) {
            if (!img.contentHash) continue;
            if (!hashMap.has(img.contentHash)) {
                hashMap.set(img.contentHash, []);
            }
            hashMap.get(img.contentHash).push(img);
        }

        const duplicates = [];
        for (const [hash, group] of hashMap.entries()) {
            if (group.length > 1) {
                duplicates.push({
                    hash,
                    count: group.length,
                    images: group
                });
            }
        }

        return duplicates;
    } catch (error) {
        console.error('Error finding duplicate images:', error);
        return [];
    }
}

/**
 * Retrieves all images matching a specific status ('available' or 'missing').
 *
 * @param {'available'|'missing'} status
 * @returns {Promise<Array>}
 */
export async function getImagesByStatus(status) {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IMAGES_STORE, 'readonly');
            const index = tx.objectStore(IMAGES_STORE).index('status');
            const req = index.getAll(status);
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    } catch (error) {
        console.error('Error getting images by status:', error);
        return [];
    }
}

/**
 * Returns all currently missing image records.
 *
 * @returns {Promise<Array>}
 */
export async function getMissingImages() {
    return getImagesByStatus('missing');
}

/**
 * Returns all currently available image records.
 *
 * @returns {Promise<Array>}
 */
export async function getAvailableImages() {
    return getImagesByStatus('available');
}

/**
 * Phase 10: Returns only active available images for a specific folder, isolating missing files.
 *
 * @param {string} folderId
 * @returns {Promise<Array>}
 */
export async function getAvailableImagesByFolder(folderId) {
    const images = await getImagesByFolder(folderId);
    return images.filter(img => img.status === 'available');
}

/**
 * Phase 10: Permanently deletes a single image record from IndexedDB (DELETED state).
 * Prepares deleted imageId for cloud tombstone cleanup (MongoDB & Pinecone).
 *
 * @param {string} imageId
 * @returns {Promise<boolean>}
 */
export async function deleteImagePermanently(imageId) {
    if (!imageId) return false;
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IMAGES_STORE, 'readwrite');
            const req = tx.objectStore(IMAGES_STORE).delete(imageId);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    } catch (error) {
        console.error('Error permanently deleting image:', imageId, error);
        return false;
    }
}

/**
 * Phase 10: Permanently deletes all missing image records from IndexedDB (DELETED state).
 * Returns array of purged image metadata (imageId, fingerprint) for cloud MongoDB & Pinecone cleanup.
 *
 * @returns {Promise<Array<{ imageId: string, fingerprint: string|null, fileName: string }>>}
 */
export async function purgeMissingImages() {
    try {
        const db = await getDB();
        const missing = await getMissingImages();
        if (missing.length === 0) return [];

        return new Promise((resolve, reject) => {
            const tx = db.transaction(IMAGES_STORE, 'readwrite');
            const store = tx.objectStore(IMAGES_STORE);
            for (const item of missing) {
                store.delete(item.imageId);
            }
            tx.oncomplete = () => resolve(missing.map(m => ({
                imageId: m.imageId,
                fingerprint: m.fingerprint,
                fileName: m.fileName
            })));
            tx.onerror = () => reject(tx.error);
        });
    } catch (error) {
        console.error('Error purging missing images:', error);
        return [];
    }
}

/**
 * Phase 14: Returns all available images with indexingStatus === 'pending'
 * that require in-browser vision AI inference.
 *
 * @returns {Promise<Array>}
 */
export async function getPendingImages() {
    try {
        const available = await getAvailableImages();
        return available.filter(img => img.indexingStatus === 'pending');
    } catch (error) {
        console.error('Error getting pending images:', error);
        return [];
    }
}

/**
 * Phase 14: Updates an image record in IndexedDB with in-browser AI vision results.
 * Sets indexingStatus to 'indexed' and preserves all other fields.
 *
 * @param {string} imageId
 * @param {Object} aiData - { caption, keywords, embedding }
 * @returns {Promise<boolean>}
 */
export async function updateImageAI(imageId, { caption, keywords, embedding = null }) {
    if (!imageId) return false;
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IMAGES_STORE, 'readwrite');
            const store = tx.objectStore(IMAGES_STORE);
            const getReq = store.get(imageId);

            getReq.onsuccess = () => {
                const record = getReq.result;
                if (!record) {
                    resolve(false);
                    return;
                }

                const updatedRecord = {
                    ...record,
                    caption: caption || record.caption,
                    keywords: keywords || record.keywords || [],
                    embedding: embedding || record.embedding || null,
                    indexingStatus: 'indexed',
                    processingStartedAt: null,
                    indexedAt: Date.now()
                };

                const putReq = store.put(updatedRecord);
                putReq.onsuccess = () => resolve(true);
                putReq.onerror = () => reject(putReq.error);
            };

            getReq.onerror = () => reject(getReq.error);
        });
    } catch (error) {
        console.error('Error updating image AI metadata:', imageId, error);
        return false;
    }
}

/**
 * High-performance count query using IndexedDB IDBIndex.count()
 * Returns total photos in microseconds without loading objects into memory.
 *
 * @param {string} folderId
 * @returns {Promise<number>}
 */
export async function getImagesCountByFolder(folderId) {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IMAGES_STORE, 'readonly');
            const index = tx.objectStore(IMAGES_STORE).index('folderId');
            const req = index.count(folderId);
            req.onsuccess = () => resolve(req.result || 0);
            req.onerror = () => reject(req.error);
        });
    } catch (error) {
        console.error('Error counting images by folder:', error);
        return 0;
    }
}

/**
 * Windowed pagination query using IDB cursors.
 * Loads only a visible slice (e.g. 60 items) rather than holding 50,000 photos in React state.
 *
 * @param {string|null} folderId - Optional folder filter
 * @param {number} offset - Number of records to skip
 * @param {number} limit - Maximum number of records to return
 * @returns {Promise<Array>}
 */
export async function getImagesPaged(folderId = null, offset = 0, limit = 60) {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IMAGES_STORE, 'readonly');
            const store = tx.objectStore(IMAGES_STORE);
            const source = folderId ? store.index('folderId') : store;
            const range = folderId ? IDBKeyRange.only(folderId) : null;
            const req = source.openCursor(range);

            const results = [];
            let advanced = false;

            req.onsuccess = (e) => {
                const cursor = e.target.result;
                if (!cursor) {
                    resolve(results);
                    return;
                }

                if (offset > 0 && !advanced) {
                    advanced = true;
                    cursor.advance(offset);
                    return;
                }

                const rec = cursor.value;
                if (rec.status === 'available') {
                    results.push(rec);
                }

                if (results.length < limit) {
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };
            req.onerror = () => reject(req.error);
        });
    } catch (error) {
        console.error('Error getting paged images:', error);
        return [];
    }
}

/**
 * Resets any image stuck in 'processing' state back to 'pending'
 * (e.g. if the user closed the tab mid-inference). Prevents orphaned jobs.
 *
 * @param {number} maxAgeMs - Maximum allowed processing age before resetting (default: 2 mins)
 * @returns {Promise<number>} Count of reset records
 */
export async function resetStaleProcessingImages(maxAgeMs = 120000) {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IMAGES_STORE, 'readwrite');
            const store = tx.objectStore(IMAGES_STORE);
            const req = store.openCursor();
            let count = 0;
            const now = Date.now();

            req.onsuccess = (e) => {
                const cursor = e.target.result;
                if (!cursor) {
                    resolve(count);
                    return;
                }
                const record = cursor.value;
                if (record.indexingStatus === 'processing') {
                    const started = record.processingStartedAt || 0;
                    if (now - started > maxAgeMs) {
                        record.indexingStatus = 'pending';
                        record.processingStartedAt = null;
                        record.retryCount = (record.retryCount || 0) + 1;
                        cursor.update(record);
                        count++;
                    }
                }
                cursor.continue();
            };
            req.onerror = () => reject(req.error);
        });
    } catch (error) {
        console.error('Error resetting stale processing images:', error);
        return 0;
    }
}

/**
 * Atomically claims the next pending image for background AI worker processing.
 *
 * @returns {Promise<Object|null>}
 */
export async function claimNextPendingImage() {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IMAGES_STORE, 'readwrite');
            const store = tx.objectStore(IMAGES_STORE);
            const req = store.openCursor();

            req.onsuccess = (e) => {
                const cursor = e.target.result;
                if (!cursor) {
                    resolve(null);
                    return;
                }
                const record = cursor.value;
                if (record.indexingStatus === 'pending' && record.status === 'available') {
                    record.indexingStatus = 'processing';
                    record.processingStartedAt = Date.now();
                    cursor.update(record);
                    resolve(record);
                    return;
                }
                cursor.continue();
            };
            req.onerror = () => reject(req.error);
        });
    } catch (error) {
        console.error('Error claiming pending image:', error);
        return null;
    }
}


