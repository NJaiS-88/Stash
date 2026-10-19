const DB_NAME = 'stash_db';
const DB_VERSION = 4;
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
