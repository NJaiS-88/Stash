/**
 * Global Blob URL Registry
 * Tracks all active object URLs created across the application.
 * Guarantees instant comprehensive revocation upon user logout or account switch,
 * preventing memory leaks and cross-user visual thumbnail leakage.
 */

const activeBlobUrls = new Set();

export function createTrackedBlobUrl(blobOrFile) {
    if (!blobOrFile) return null;
    try {
        const url = URL.createObjectURL(blobOrFile);
        activeBlobUrls.add(url);
        return url;
    } catch (err) {
        console.warn('[BlobRegistry] Failed to create object URL:', err);
        return null;
    }
}

export function revokeTrackedBlobUrl(url) {
    if (!url) return;
    activeBlobUrls.delete(url);
    try {
        URL.revokeObjectURL(url);
    } catch {
        // ignore
    }
}

export function revokeAllBlobUrls() {
    const count = activeBlobUrls.size;
    if (count > 0) {
        console.log(`[BlobRegistry] 🧹 Revoking all ${count} active Blob URL(s) on session logout.`);
        for (const url of activeBlobUrls) {
            try {
                URL.revokeObjectURL(url);
            } catch {
                // ignore
            }
        }
        activeBlobUrls.clear();
    }
}
