const DB_NAME = 'stash_db';
const DB_VERSION = 10;
const FOLDERS_STORE = 'folders';
const IMAGES_STORE = 'images';

// In-memory & session-synced active local user identifier
let currentLocalOwnerId = typeof sessionStorage !== 'undefined'
    ? sessionStorage.getItem('stash_local_owner_id')
    : null;

/**
 * Sets the active localOwnerId for all IndexedDB operations.
 * Called automatically on login and cleared on logout.
 *
 * @param {string|null} ownerId - Opaque account identifier (e.g. user._id)
 */
export function setLocalOwnerId(ownerId) {
    currentLocalOwnerId = ownerId ? String(ownerId) : null;
    if (typeof sessionStorage !== 'undefined') {
        if (currentLocalOwnerId) {
            sessionStorage.setItem('stash_local_owner_id', currentLocalOwnerId);
        } else {
            sessionStorage.removeItem('stash_local_owner_id');
        }
    }
    console.log(`[GalleryDB] Local account scope active: ${currentLocalOwnerId || 'none (logged out)'}`);
}

/**
 * Returns the currently authenticated localOwnerId.
 * @returns {string|null}
 */
export function getLocalOwnerId() {
    return currentLocalOwnerId;
}

function getDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = request.result;

            let foldersStore;
            if (!db.objectStoreNames.contains(FOLDERS_STORE)) {
                foldersStore = db.createObjectStore(FOLDERS_STORE);
            } else {
                foldersStore = request.transaction.objectStore(FOLDERS_STORE);
            }
            if (!foldersStore.indexNames.contains('localOwnerId')) {
                foldersStore.createIndex('localOwnerId', 'localOwnerId', { unique: false });
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
            if (!imageStore.indexNames.contains('contentHash')) {
                imageStore.createIndex('contentHash', 'contentHash', { unique: false });
            }
            if (!imageStore.indexNames.contains('fingerprint')) {
                imageStore.createIndex('fingerprint', 'fingerprint', { unique: false });
            }
            if (!imageStore.indexNames.contains('status')) {
                imageStore.createIndex('status', 'status', { unique: false });
            }
            if (!imageStore.indexNames.contains('captionStatus')) {
                imageStore.createIndex('captionStatus', 'captionStatus', { unique: false });
            }
            if (!imageStore.indexNames.contains('cloudIndexStatus')) {
                imageStore.createIndex('cloudIndexStatus', 'cloudIndexStatus', { unique: false });
            }
            if (!imageStore.indexNames.contains('queuePriority')) {
                imageStore.createIndex('queuePriority', 'queuePriority', { unique: false });
            }

            // User-scoped indexes: isolate local data per authenticated account
            if (!imageStore.indexNames.contains('localOwnerId')) {
                imageStore.createIndex('localOwnerId', 'localOwnerId', { unique: false });
            }
            if (!imageStore.indexNames.contains('owner_folder')) {
                imageStore.createIndex('owner_folder', ['localOwnerId', 'folderId'], { unique: false });
            }
            if (!imageStore.indexNames.contains('owner_captionStatus')) {
                imageStore.createIndex('owner_captionStatus', ['localOwnerId', 'captionStatus'], { unique: false });
            }
            if (!imageStore.indexNames.contains('owner_status')) {
                imageStore.createIndex('owner_status', ['localOwnerId', 'status'], { unique: false });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// ----------------- FOLDERS STORE (User-Scoped) -----------------

export async function saveFolder(folder) {
    try {
        const ownerId = folder.localOwnerId || getLocalOwnerId();
        if (!ownerId) {
            console.warn('[GalleryDB] Refusing to save folder without active localOwnerId');
            return false;
        }

        const scopedFolder = {
            ...folder,
            localOwnerId: ownerId
        };

        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(FOLDERS_STORE, 'readwrite');
            const req = tx.objectStore(FOLDERS_STORE).put(scopedFolder, scopedFolder.id);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    } catch (error) {
        console.error('Error saving folder:', error);
        return false;
    }
}

export async function getAllFolders(ownerId = getLocalOwnerId()) {
    if (!ownerId) return [];
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(FOLDERS_STORE, 'readonly');
            const store = tx.objectStore(FOLDERS_STORE);

            if (store.indexNames.contains('localOwnerId')) {
                const req = store.index('localOwnerId').getAll(ownerId);
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => reject(req.error);
            } else {
                const req = store.getAll();
                req.onsuccess = () => {
                    const all = req.result || [];
                    resolve(all.filter(f => f.localOwnerId === ownerId || !f.localOwnerId));
                };
                req.onerror = () => reject(req.error);
            }
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

// ----------------- IMAGES REGISTRY STORE (User-Scoped) -----------------

export async function saveImageRecord(record) {
    if (!record) return false;
    const ownerId = record.localOwnerId || getLocalOwnerId();
    if (!ownerId) {
        console.warn('[GalleryDB] Refusing to save image record without active localOwnerId');
        return false;
    }

    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IMAGES_STORE, 'readwrite');
            const normalized = {
                ...record,
                localOwnerId: ownerId,
                captionStatus: record.captionStatus || (record.caption ? 'completed' : 'pending'),
                cloudIndexStatus: record.cloudIndexStatus || (record.embedding ? 'completed' : 'pending'),
                caption: record.caption || null,
                captionEngine: record.captionEngine || (record.caption ? (record.engine || 'browser') : null),
                captionModel: record.captionModel || (record.caption ? (record.model || 'florence-2-base-ft') : null),
                captionVersion: record.captionVersion || (record.caption ? 1 : null),
                retryCount: record.retryCount || 0,
                processingStartedAt: record.processingStartedAt || null,
                captionedAt: record.captionedAt || (record.caption ? Date.now() : null),
                indexedAt: record.indexedAt || (record.embedding ? Date.now() : null),
                indexingStatus: record.indexingStatus || (record.caption ? 'indexed' : 'pending')
            };
            const req = tx.objectStore(IMAGES_STORE).put(normalized);
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
    const defaultOwnerId = getLocalOwnerId();

    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IMAGES_STORE, 'readwrite');
            const store = tx.objectStore(IMAGES_STORE);
            for (const record of records) {
                const ownerId = record.localOwnerId || defaultOwnerId;
                if (!ownerId) continue;

                const normalized = {
                    ...record,
                    localOwnerId: ownerId,
                    captionStatus: record.captionStatus || (record.caption ? 'completed' : 'pending'),
                    cloudIndexStatus: record.cloudIndexStatus || (record.embedding ? 'completed' : 'pending'),
                    caption: record.caption || null,
                    captionEngine: record.captionEngine || (record.caption ? (record.engine || 'browser') : null),
                    captionModel: record.captionModel || (record.caption ? (record.model || 'florence-2-base-ft') : null),
                    captionVersion: record.captionVersion || (record.caption ? 1 : null),
                    queuePriority: record.queuePriority !== undefined
                        ? record.queuePriority
                        : (record.captionStatus === 'completed' || record.caption ? null : 3),
                    retryCount: record.retryCount || 0,
                    processingStartedAt: record.processingStartedAt || null,
                    captionedAt: record.captionedAt || (record.caption ? Date.now() : null),
                    indexedAt: record.indexedAt || (record.embedding ? Date.now() : null),
                    indexingStatus: record.indexingStatus || (record.caption ? 'indexed' : 'pending')
                };
                store.put(normalized);
            }
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    } catch (error) {
        console.error('Error batch saving image records:', error);
        return false;
    }
}

export async function getImagesByFolder(folderId, ownerId = getLocalOwnerId()) {
    if (!folderId || !ownerId) return [];
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IMAGES_STORE, 'readonly');
            const store = tx.objectStore(IMAGES_STORE);

            if (store.indexNames.contains('owner_folder')) {
                const req = store.index('owner_folder').getAll([ownerId, folderId]);
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => reject(req.error);
            } else {
                const index = store.index('folderId');
                const req = index.getAll(folderId);
                req.onsuccess = () => {
                    const all = req.result || [];
                    resolve(all.filter(img => img.localOwnerId === ownerId || !img.localOwnerId));
                };
                req.onerror = () => reject(req.error);
            }
        });
    } catch (error) {
        console.error('Error getting images by folder:', error);
        return [];
    }
}

export async function getAllImages(ownerId = getLocalOwnerId()) {
    if (!ownerId) return [];
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IMAGES_STORE, 'readonly');
            const store = tx.objectStore(IMAGES_STORE);

            if (store.indexNames.contains('localOwnerId')) {
                const req = store.index('localOwnerId').getAll(ownerId);
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => reject(req.error);
            } else {
                const req = store.getAll();
                req.onsuccess = () => {
                    const all = req.result || [];
                    resolve(all.filter(img => img.localOwnerId === ownerId || !img.localOwnerId));
                };
                req.onerror = () => reject(req.error);
            }
        });
    } catch (error) {
        console.error('Error getting all images:', error);
        return [];
    }
}

export async function deleteImagesByFolder(folderId, ownerId = getLocalOwnerId()) {
    try {
        const db = await getDB();
        const records = await getImagesByFolder(folderId, ownerId);
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
 * Looks up any existing image record sharing the same SHA-256 contentHash that already has a valid caption.
 * Enables instant zero-cost caption reuse for duplicated, renamed, or re-uploaded photos.
 *
 * @param {string} contentHash - SHA-256 hash string
 * @returns {Promise<Object|null>} Existing image record with caption, or null
 */
export async function getExistingCaptionByContentHash(contentHash, ownerId = getLocalOwnerId()) {
    if (!contentHash || !ownerId) return null;
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IMAGES_STORE, 'readonly');
            const store = tx.objectStore(IMAGES_STORE);
            const index = store.index('contentHash');
            const req = index.getAll(contentHash);
            req.onsuccess = () => {
                const results = req.result || [];
                const match = results.find(img =>
                    img.localOwnerId === ownerId &&
                    img.caption &&
                    typeof img.caption === 'string' &&
                    img.caption.trim().length > 0
                );
                resolve(match || null);
            };
            req.onerror = () => reject(req.error);
        });
    } catch (error) {
        console.error('Error finding caption by contentHash:', error);
        return null;
    }
}


/**
 * Retrieves all images matching a specific status ('available' or 'missing').
 *
 * @param {'available'|'missing'} status
 * @returns {Promise<Array>}
 */
export async function getImagesByStatus(status, ownerId = getLocalOwnerId()) {
    if (!ownerId) return [];
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IMAGES_STORE, 'readonly');
            const store = tx.objectStore(IMAGES_STORE);
            if (store.indexNames.contains('owner_status')) {
                const req = store.index('owner_status').getAll([ownerId, status]);
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => reject(req.error);
            } else {
                const index = store.index('status');
                const req = index.getAll(status);
                req.onsuccess = () => {
                    const all = req.result || [];
                    resolve(all.filter(img => img.localOwnerId === ownerId || !img.localOwnerId));
                };
                req.onerror = () => reject(req.error);
            }
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
export async function getMissingImages(ownerId = getLocalOwnerId()) {
    try {
        const all = await getAllImages(ownerId);
        return all.filter(img => img && img.status === 'missing');
    } catch {
        return [];
    }
}

/**
 * Returns all currently available image records scoped to the authenticated user.
 *
 * @param {string} [ownerId]
 * @returns {Promise<Array>}
 */
export async function getAvailableImages(ownerId = getLocalOwnerId()) {
    try {
        const all = await getAllImages(ownerId);
        return all.filter(img => img && img.status !== 'missing');
    } catch {
        return [];
    }
}

/**
 * Returns active available images for a specific folder and user.
 *
 * @param {string} folderId
 * @param {string} [ownerId]
 * @returns {Promise<Array>}
 */
export async function getAvailableImagesByFolder(folderId, ownerId = getLocalOwnerId()) {
    const images = await getImagesByFolder(folderId, ownerId);
    return images.filter(img => img.status === 'available');
}

/**
 * Phase 30: Updates an image record's availability status ('available' | 'missing').
 * Strictly preserves caption, fingerprint, keywords, and all semantic information.
 * Does not delete the record.
 *
 * @param {string} imageId
 * @param {'available'|'missing'} status
 * @param {string} [ownerId]
 * @returns {Promise<boolean>}
 */
export async function setImageAvailability(imageId, status, ownerId = getLocalOwnerId()) {
    if (!imageId || !status) return false;
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IMAGES_STORE, 'readwrite');
            const store = tx.objectStore(IMAGES_STORE);
            const req = store.get(imageId);
            req.onsuccess = () => {
                const record = req.result;
                if (!record) {
                    resolve(false);
                    return;
                }
                const updated = {
                    ...record,
                    status,
                    missingSince: status === 'missing' ? (record.missingSince || Date.now()) : null
                };
                const putReq = store.put(updated);
                putReq.onsuccess = () => resolve(true);
                putReq.onerror = () => reject(putReq.error);
            };
            req.onerror = () => reject(req.error);
        });
    } catch (err) {
        console.error('Error updating image availability in IndexedDB:', imageId, err);
        return false;
    }
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
export async function purgeMissingImages(ownerId = getLocalOwnerId()) {
    try {
        const db = await getDB();
        const missing = await getMissingImages(ownerId);
        if (missing.length === 0) return [];

        return new Promise((resolve, reject) => {
            const tx = db.transaction(IMAGES_STORE, 'readwrite');
            const store = tx.objectStore(IMAGES_STORE);
            for (const item of missing) {
                store.delete(item.imageId);
            }
            tx.oncomplete = () => resolve(missing.map(m => ({
                imageId: m.imageId,
                fingerprint: m.fingerprint || null,
                status: 'deleted'
            })));
            tx.onerror = () => reject(tx.error);
        });
    } catch (error) {
        console.error('Error purging missing images:', error);
        return [];
    }
}

/**
 * Returns all available images with captionStatus === 'pending'
 * that require visual AI inference, scoped to the authenticated user.
 *
 * @param {Object} [options]
 * @param {boolean} [options.isLocalAiAvailable=false]
 * @param {string} [options.ownerId]
 * @returns {Promise<Array>}
 */
export async function getPendingImages({ isLocalAiAvailable = false, ownerId = getLocalOwnerId() } = {}) {
    try {
        const available = await getAvailableImages(ownerId);
        return available.filter(img => {
            if (img.status === 'missing') return false;
            const hasCaption = Boolean(img.caption && typeof img.caption === 'string' && img.caption.trim().length > 0);

            // 1. Any photo without a completed caption needs visual AI indexing!
            if (!hasCaption) return true;

            // 2. Browser captions eligible for local AI upgrade (Priority 5)
            if (isLocalAiAvailable && hasCaption && (
                img.captionEngine === 'browser' ||
                img.captionModel === 'florence-2-base-ft' ||
                img.captionModel === 'vit-gpt2' ||
                (typeof img.caption === 'string' && img.caption.includes('A vibrant scene featuring clear outdoor lighting'))
            )) return true;

            return false;
        });
    } catch (error) {
        console.error('Error getting pending images:', error);
        return [];
    }
}

/**
 * Returns images where local AI captioning is completed, but cloud vector indexing
 * is still pending or failed, scoped to the authenticated user.
 *
 * @param {string} [ownerId]
 * @returns {Promise<Array>}
 */
export async function getPendingCloudIndexImages(ownerId = getLocalOwnerId()) {
    try {
        const available = await getAvailableImages(ownerId);
        return available.filter(img =>
            img.status === 'available' &&
            img.captionStatus === 'completed' &&
            img.caption &&
            (img.cloudIndexStatus === 'pending' || img.cloudIndexStatus === 'failed')
        );
    } catch (error) {
        console.error('Error getting pending cloud index images:', error);
        return [];
    }
}

/**
 * Updates the cloudIndexStatus without modifying or re-triggering captioning.
 *
 * @param {string} imageId
 * @param {Object} options - { status: 'pending'|'processing'|'completed'|'failed', embedding, error }
 * @returns {Promise<boolean>}
 */
export async function updateCloudIndexStatus(imageId, {
    status,
    embedding = null,
    error = null
}) {
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

                const updated = {
                    ...record,
                    cloudIndexStatus: status,
                    embedding: embedding || record.embedding,
                    cloudIndexError: error,
                    indexedAt: status === 'completed' ? Date.now() : record.indexedAt
                };

                const putReq = store.put(updated);
                putReq.onsuccess = () => resolve(true);
                putReq.onerror = () => reject(putReq.error);
            };
            getReq.onerror = () => reject(getReq.error);
        });
    } catch (err) {
        console.error('Error updating cloud index status:', imageId, err);
        return false;
    }
}

/**
 * Re-queues images that were captioned via browser fallback (Florence-2 / vit-gpt2)
 * so they are automatically upgraded with superior Qwen3-VL local AI captions.
 *
 * @returns {Promise<number>} Number of images marked for upgrade
 */
export async function markBrowserCaptionsForUpgrade() {
    try {
        const db = await getDB();
        const available = await getAvailableImages();
        const browserImages = available.filter(img =>
            img.captionEngine === 'browser' ||
            img.captionModel === 'florence-2-base-ft' ||
            img.captionModel === 'vit-gpt2' ||
            (img.caption && img.caption.includes('A vibrant scene featuring clear outdoor lighting'))
        );

        if (browserImages.length === 0) return 0;

        return new Promise((resolve, reject) => {
            const tx = db.transaction(IMAGES_STORE, 'readwrite');
            const store = tx.objectStore(IMAGES_STORE);

            for (const img of browserImages) {
                store.put({
                    ...img,
                    captionStatus: 'pending',
                    indexingStatus: 'pending'
                });
            }

            tx.oncomplete = () => resolve(browserImages.length);
            tx.onerror = () => reject(tx.error);
        });
    } catch (error) {
        console.error('Error marking browser captions for upgrade:', error);
        return 0;
    }
}

/**
 * Updates an image record in IndexedDB with local or browser AI vision results.
 * Sets captionStatus to 'completed', cloudIndexStatus to 'pending',
 * and records caption provenance (engine, model, version).
 *
 * @param {string} imageId
 * @param {Object} aiData - { caption, keywords, embedding, engine, model, version }
 * @returns {Promise<boolean>}
 */
export async function updateImageAI(imageId, {
    caption,
    keywords,
    contentHash = null,
    embedding = null,
    engine = 'browser', // 'local' | 'browser'
    model = 'florence-2-base-ft',
    version = 1,
    captionVersion = 1
}) {
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
                    contentHash: contentHash || record.contentHash || null,
                    embedding: embedding || record.embedding || null,
                    // Phase 14 Decoupled Two-Stage State Machine
                    captionStatus: 'completed',
                    cloudIndexStatus: embedding ? 'completed' : (record.cloudIndexStatus || 'pending'),
                    // Caption Provenance
                    captionEngine: engine,
                    captionModel: model,
                    captionVersion: captionVersion ?? version ?? 1,
                    queuePriority: null, // Cleared from queue upon completion
                    captionedAt: Date.now(),
                    processingStartedAt: null,
                    retryCount: 0,
                    // Backward compatibility
                    indexingStatus: 'indexed',
                    indexedAt: embedding ? Date.now() : (record.indexedAt || null)
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
 * Phase 21: Crash / Refresh / Close Recovery — Stale Job Recovery
 *
 * Scans IndexedDB for any image left in 'processing' state.
 * When the browser closes mid-inference, any in-flight task has an interrupted
 * or stale processingStartedAt timestamp.
 *
 * Rules:
 * 1. If forceAll === true (fresh app launch / next boot when no queue is alive):
 *    All uncompleted 'processing' records are immediately reset back to 'pending'.
 * 2. If forceAll === false (during runtime):
 *    Any 'processing' record where (now - processingStartedAt > maxAgeMs) is considered stale and reset.
 * 3. Completed images (captionStatus === 'completed', e.g. A100, A101) must NEVER be reset or reprocessed.
 *
 * @param {Object|number} [optionsOrMaxAge=300000] - Options object or max age in ms
 * @param {number} [optionsOrMaxAge.maxAgeMs=300000] - Stale threshold for running session (default: 5 mins)
 * @param {boolean} [optionsOrMaxAge.forceAll=false] - Reset all processing records on startup
 * @returns {Promise<number>} Count of recovered records
 */
export async function resetStaleProcessingImages(optionsOrMaxAge = 300000, ownerId = getLocalOwnerId()) {
    let maxAgeMs = 300000;
    let forceAll = false;

    if (typeof optionsOrMaxAge === 'object' && optionsOrMaxAge !== null) {
        maxAgeMs = optionsOrMaxAge.maxAgeMs ?? 300000;
        forceAll = Boolean(optionsOrMaxAge.forceAll);
        if (optionsOrMaxAge.ownerId) ownerId = optionsOrMaxAge.ownerId;
    } else if (typeof optionsOrMaxAge === 'number') {
        maxAgeMs = optionsOrMaxAge;
    }

    if (!ownerId) return 0;

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
                    if (count > 0) {
                        console.log(`[StaleRecovery] Recovered ${count} interrupted image(s) from 'processing' -> 'pending'.`);
                    }
                    resolve(count);
                    return;
                }

                const record = cursor.value;

                // Isolate strictly by authenticated user
                if (record.localOwnerId && record.localOwnerId !== ownerId) {
                    cursor.continue();
                    return;
                }

                // Completed images (A100, A101) must NEVER be reprocessed or reset:
                if (record.captionStatus === 'completed' || Boolean(record.caption && record.caption.trim())) {
                    cursor.continue();
                    return;
                }

                const isProcessing = record.captionStatus === 'processing' || record.indexingStatus === 'processing';
                const isFailed = record.captionStatus === 'failed';
                const started = record.processingStartedAt || 0;
                const isStale = forceAll || isFailed || (now - started > maxAgeMs);

                if (isProcessing || (forceAll && isFailed) || isStale) {
                    record.localOwnerId = record.localOwnerId || ownerId;
                    record.captionStatus = 'pending';
                    record.indexingStatus = 'pending';
                    record.processingStartedAt = null;
                    record.retryCount = 0;
                    if (!record.queuePriority) {
                        record.queuePriority = 3;
                    }
                    cursor.update(record);
                    count++;
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
 * Phase 15 & 28: Atomically claims the next image from IndexedDB strictly scoped to
 * the authenticated account (localOwnerId) and following 5-Tier Queue Priority:
 *
 * @param {Object} options - { isLocalAiAvailable: boolean, ownerId?: string }
 * @returns {Promise<Object|null>}
 */
export async function claimNextPendingImage({ isLocalAiAvailable = false, ownerId = getLocalOwnerId() } = {}) {
    if (!ownerId) return null;

    try {
        const db = await getDB();
        return new Promise((resolve) => {
            const tx = db.transaction(IMAGES_STORE, 'readwrite');
            const store = tx.objectStore(IMAGES_STORE);
            const now = Date.now();
            let resolved = false;

            const finish = (result) => {
                if (!resolved) {
                    resolved = true;
                    resolve(result);
                }
            };

            tx.onerror = () => finish(null);
            tx.onabort = () => finish(null);

            const req = store.openCursor();
            req.onsuccess = (e) => {
                const cursor = e.target.result;
                if (!cursor) {
                    finish(null);
                    return;
                }

                const rec = cursor.value;

                // Account isolation check: never claim another account's photos
                if (rec.localOwnerId && rec.localOwnerId !== ownerId) {
                    cursor.continue();
                    return;
                }

                if (rec && rec.status !== 'missing') {
                    const hasCaption = Boolean(rec.caption && typeof rec.caption === 'string' && rec.caption.trim().length > 0);

                    // Check if eligible for local AI upgrade from browser fallback
                    const isEligibleUpgrade = isLocalAiAvailable && hasCaption && (
                        rec.captionEngine === 'browser' ||
                        rec.captionModel === 'florence-2-base-ft' ||
                        rec.captionModel === 'vit-gpt2' ||
                        (typeof rec.caption === 'string' && rec.caption.includes('A vibrant scene featuring clear outdoor lighting'))
                    );

                    // Uncaptioned photos need captioning!
                    const isPending = !hasCaption && (
                        rec.captionStatus !== 'processing' ||
                        (now - (rec.processingStartedAt || 0) > 30000)
                    );

                    if (isPending || isEligibleUpgrade) {
                        rec.localOwnerId = rec.localOwnerId || ownerId;
                        rec.captionStatus = 'processing';
                        rec.indexingStatus = 'processing';
                        rec.processingStartedAt = now;
                        const updateReq = cursor.update(rec);
                        updateReq.onsuccess = () => finish(rec);
                        updateReq.onerror = () => finish(rec);
                        return;
                    }
                }

                cursor.continue();
            };

            req.onerror = () => finish(null);
        });
    } catch (error) {
        console.error('Error claiming pending image:', error);
        return null;
    }
}

/**
 * Returns a high-level statistical summary of the persistent IndexedDB queue.
 *
 * @returns {Promise<Object>}
 */
export async function getQueueStats(ownerId = getLocalOwnerId()) {
    try {
        const all = await getAllImages(ownerId);
        const available = all.filter(img => img.status === 'available');
        return {
            total: available.length,
            completed: available.filter(i => i.captionStatus === 'completed').length,
            pending: available.filter(i => i.captionStatus === 'pending').length,
            processing: available.filter(i => i.captionStatus === 'processing').length,
            failed: available.filter(i => i.captionStatus === 'failed').length,
            newImages: available.filter(i => i.queuePriority === 1 && i.captionStatus === 'pending').length,
            modifiedImages: available.filter(i => i.queuePriority === 2 && i.captionStatus === 'pending').length,
            neverCaptioned: available.filter(i => i.captionStatus === 'pending' && !i.caption).length,
            retryableFailed: available.filter(i => i.captionStatus === 'failed' && (i.retryCount || 0) < 3).length,
            browserUpgradeEligible: available.filter(i => i.captionStatus === 'completed' && (i.captionEngine === 'browser' || i.captionModel === 'florence-2-base-ft')).length
        };
    } catch (err) {
        console.error('Error calculating queue stats:', err);
        return null;
    }
}


