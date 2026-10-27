/**
 * Phase 35 — Local Search Result Resolution
 *
 * Implements the core privacy-preserving resolution pipeline:
 *
 * Pinecone:    Which photo is relevant? (Returns imageId, e.g. A101)
 *     ↓
 * IndexedDB:   Where is that photo? (Resolves folderId + relativePath)
 *     ↓
 * Filesystem:  Actual photo (FileSystemDirectoryHandle -> File -> temporary Blob URL -> <img>)
 *
 * Guarantees zero image data, local paths, or folder structures are leaked to the cloud.
 */

import { getImageById, getFolderById } from './galleryDb';
import { resolveFileByPath } from './fileSystem';
import { createTrackedBlobUrl, revokeTrackedBlobUrl } from './blobRegistry';

/**
 * Resolves a single image identifier (e.g. "A101") from Pinecone search results
 * to an on-device File and temporary tracked Blob URL.
 *
 * Pipeline:
 * imageId
 *   ↓
 * IndexedDB (getImageById)
 *   ↓
 * folderId + relativePath
 *   ↓
 * FileSystemDirectoryHandle (getFolderById -> folder.handle)
 *   ↓
 * File (resolveFileByPath)
 *   ↓
 * temporary Blob URL (createTrackedBlobUrl)
 *   ↓
 * <img>
 *
 * @param {string} imageId - Unique image identifier from Pinecone
 * @returns {Promise<{
 *   success: boolean,
 *   imageId: string,
 *   blobUrl?: string,
 *   file?: File,
 *   record?: Object,
 *   reason?: string
 * }>}
 */
export async function resolveLocalSearchResult(imageId) {
    if (!imageId) {
        return { success: false, imageId: null, reason: 'missing_image_id' };
    }

    try {
        // Step 1: IndexedDB lookup by imageId
        const imageRecord = await getImageById(imageId);
        if (!imageRecord) {
            return {
                success: false,
                imageId,
                reason: 'record_not_in_indexeddb'
            };
        }

        // Check if image is marked missing
        if (imageRecord.status === 'missing') {
            return {
                success: false,
                imageId,
                record: imageRecord,
                reason: 'image_marked_missing'
            };
        }

        // Step 2: Extract folderId + relativePath
        const { folderId, relativePath, fileName } = imageRecord;
        const targetPath = relativePath || fileName;

        if (!folderId || !targetPath) {
            return {
                success: false,
                imageId,
                record: imageRecord,
                reason: 'incomplete_location_metadata'
            };
        }

        // Step 3: Retrieve FileSystemDirectoryHandle from IndexedDB folders store
        const folderRecord = await getFolderById(folderId);
        if (!folderRecord || !folderRecord.handle) {
            return {
                success: false,
                imageId,
                record: imageRecord,
                reason: 'directory_handle_unavailable'
            };
        }

        const directoryHandle = folderRecord.handle;

        // Verify permission if supported
        if (directoryHandle.queryPermission) {
            const perm = await directoryHandle.queryPermission({ mode: 'read' });
            if (perm === 'prompt') {
                // Needs user gesture to request; report required permission
                return {
                    success: false,
                    imageId,
                    record: imageRecord,
                    reason: 'permission_prompt_required'
                };
            } else if (perm === 'denied') {
                return {
                    success: false,
                    imageId,
                    record: imageRecord,
                    reason: 'permission_denied'
                };
            }
        }

        // Step 4: Resolve native File from filesystem
        const file = await resolveFileByPath(directoryHandle, targetPath);
        if (!file) {
            return {
                success: false,
                imageId,
                record: imageRecord,
                reason: 'file_not_found_on_disk'
            };
        }

        // Step 5: Generate temporary tracked Blob URL (managed by blobRegistry.js)
        const blobUrl = createTrackedBlobUrl(file);
        if (!blobUrl) {
            return {
                success: false,
                imageId,
                record: imageRecord,
                reason: 'blob_url_creation_failed'
            };
        }

        // Step 6: Return resolved result ready for <img>
        return {
            success: true,
            imageId,
            blobUrl,
            file,
            record: imageRecord,
            fileName: imageRecord.fileName || file.name,
            relativePath: targetPath
        };
    } catch (err) {
        console.warn(`[LocalSearchResolver] Error resolving ${imageId}:`, err);
        return {
            success: false,
            imageId,
            reason: err.message || 'resolution_error'
        };
    }
}

/**
 * Resolves an array of search results from Pinecone in parallel.
 *
 * @param {Array<{ imageId: string, score: number }>} searchResults
 * @returns {Promise<Array<Object>>} Resolved objects with blobUrls
 */
export async function resolveBatchSearchResults(searchResults) {
    if (!Array.isArray(searchResults) || searchResults.length === 0) {
        return [];
    }

    const promises = searchResults.map(async (item) => {
        const imageId = item.imageId || item.id;
        const resolved = await resolveLocalSearchResult(imageId);
        return {
            ...item,
            imageId,
            score: item.score,
            ...resolved
        };
    });

    return await Promise.all(promises);
}

/**
 * Revokes a resolved temporary Blob URL when no longer displayed.
 * @param {string} blobUrl
 */
export function revokeResolvedBlobUrl(blobUrl) {
    if (blobUrl) {
        revokeTrackedBlobUrl(blobUrl);
    }
}
