const DB_NAME = 'stash_db';
const STORE_NAME = 'handles';

function getDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            request.result.createObjectStore(STORE_NAME);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function saveDirectoryHandle(handle) {
    try {
        const db = await getDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(handle, 'directoryHandle');
        return true;
    } catch (error) {
        console.error('Error saving directory handle:', error);
        return false;
    }
}

export async function getDirectoryHandle() {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).get('directoryHandle');
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    } catch (error) {
        console.error('Error getting directory handle:', error);
        return null;
    }
}

export async function clearDirectoryHandle() {
    try {
        const db = await getDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete('directoryHandle');
        return true;
    } catch (error) {
        console.error('Error clearing directory handle:', error);
        return false;
    }
}
