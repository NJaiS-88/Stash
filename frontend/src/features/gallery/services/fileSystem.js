/**
 * File System Access API service for Stash gallery.
 * Handles local folder selection and recursive file enumeration.
 * All operations run purely inside the user's browser without uploading files to any backend.
 */

const IMAGE_EXTENSIONS = new Set([
    'jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp', 'avif', 'heic', 'tiff'
]);

/**
 * Checks if a filename has an image extension.
 * @param {string} fileName 
 * @returns {boolean}
 */
export function isImageFile(fileName) {
    if (!fileName) return false;
    const ext = fileName.split('.').pop()?.toLowerCase();
    return IMAGE_EXTENSIONS.has(ext);
}

/**
 * Prompt the user to select a local folder via the browser's File System Access API.
 * @returns {Promise<FileSystemDirectoryHandle|null>}
 */
export async function selectDirectory() {
    if (!('showDirectoryPicker' in window)) {
        throw new Error('Your browser does not support the File System Access API. Please use Chrome, Edge, Brave, or another Chromium-based browser.');
    }

    try {
        const directoryHandle = await window.showDirectoryPicker({
            mode: 'read',
        });
        return directoryHandle;
    } catch (err) {
        if (err.name === 'AbortError') {
            return null;
        }
        throw err;
    }
}

/**
 * Recursively enumerates all files and subdirectories from a directory handle.
 *
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {string} relativePath
 * @returns {Promise<Array>}
 */
export async function enumerateDirectory(dirHandle, relativePath = '') {
    const entries = [];

    for await (const entry of dirHandle.values()) {
        const currentPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

        if (entry.kind === 'file') {
            entries.push({
                kind: 'file',
                name: entry.name,
                path: currentPath,
                handle: entry,
                isImage: isImageFile(entry.name),
            });
        } else if (entry.kind === 'directory') {
            const children = await enumerateDirectory(entry, currentPath);
            entries.push({
                kind: 'directory',
                name: entry.name,
                path: currentPath,
                handle: entry,
                children,
            });
        }
    }

    // Sort: folders first, then files alphabetically
    entries.sort((a, b) => {
        if (a.kind === b.kind) {
            return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        }
        return a.kind === 'directory' ? -1 : 1;
    });

    return entries;
}

/**
 * Flattens the hierarchical directory tree into a single array of files.
 * @param {Array} entries
 * @returns {Array}
 */
export function flattenFiles(entries) {
    let files = [];
    for (const item of entries) {
        if (item.kind === 'file') {
            files.push(item);
        } else if (item.kind === 'directory' && item.children) {
            files = files.concat(flattenFiles(item.children));
        }
    }
    return files;
}

/**
 * Retrieves the native File object from a FileSystemFileHandle.
 * @param {FileSystemFileHandle} handle 
 * @returns {Promise<File>}
 */
export async function getFileFromHandle(handle) {
    return await handle.getFile();
}

/**
 * Creates a catalog registry record for an image file according to Phase 2 schema.
 * Extracts size and lastModified for change detection without storing any binary/blob data.
 *
 * @param {Object} fileItem
 * @param {string} folderId
 * @param {Object|null} existingRecord
 * @returns {Promise<Object|null>}
 */
export async function createImageRecord(fileItem, folderId, existingRecord = null) {
    try {
        const file = await fileItem.handle.getFile();
        return {
            imageId: existingRecord?.imageId || crypto.randomUUID(),
            folderId,
            relativePath: fileItem.path,
            fileName: fileItem.name,
            size: file.size,
            lastModified: file.lastModified,
            contentHash: existingRecord?.contentHash || null,
            fingerprint: existingRecord?.fingerprint || null,
            status: "available",
            indexingStatus: existingRecord?.indexingStatus || "pending"
        };
    } catch (err) {
        console.warn('Could not read metadata for:', fileItem.name, err);
        return null;
    }
}

/**
 * Builds and reconciles image registry records for all image files in a folder.
 * Preserves permanent imageId even across renames or moves.
 *
 * Algorithm:
 * 1. Pass 1 - Exact Location Match: Matches by relativePath if unchanged.
 * 2. Pass 2 - Rename / Move Detection: Matches unmatched files by identical
 *    (size + lastModified) or contentHash, preserving imageId and updating path.
 * 3. Pass 3 - New Images: Assigns a newly minted crypto.randomUUID().
 * 4. Pass 4 - Missing Images: Preserves missing records with status: 'missing'.
 *
 * @param {Array} flatFiles
 * @param {string} folderId
 * @param {Array} existingRecords
 * @returns {Promise<Array>}
 */
export async function buildImageRegistryForFolder(flatFiles, folderId, existingRecords = []) {
    const imageFiles = flatFiles.filter(f => f.isImage && f.handle);
    const discoveredFiles = [];

    for (const fileItem of imageFiles) {
        try {
            const file = await fileItem.handle.getFile();
            discoveredFiles.push({
                fileItem,
                path: fileItem.path,
                name: fileItem.name,
                size: file.size,
                lastModified: file.lastModified
            });
        } catch (err) {
            console.warn('Could not read metadata for:', fileItem.name, err);
        }
    }

    const matchedExistingIds = new Set();
    const matchedDiscoveredPaths = new Set();
    const results = [];

    const existingByPath = new Map(existingRecords.map(r => [r.relativePath, r]));

    // Pass 1: Exact location / relativePath match
    for (const disc of discoveredFiles) {
        const existing = existingByPath.get(disc.path);
        if (existing && !matchedExistingIds.has(existing.imageId)) {
            matchedExistingIds.add(existing.imageId);
            matchedDiscoveredPaths.add(disc.path);

            const isIdentical = disc.size === existing.size && disc.lastModified === existing.lastModified;

            results.push({
                imageId: existing.imageId, // Stable identity preserved
                folderId,
                relativePath: disc.path,
                fileName: disc.name,
                size: disc.size,
                lastModified: disc.lastModified,
                contentHash: isIdentical ? existing.contentHash : null,
                fingerprint: isIdentical ? existing.fingerprint : null,
                status: "available",
                indexingStatus: isIdentical ? (existing.indexingStatus || "pending") : "pending"
            });
        }
    }

    // Unmatched existing pool for Pass 2
    const remainingExisting = existingRecords.filter(r => !matchedExistingIds.has(r.imageId));

    // Pass 2: Rename / Move Detection (same size + lastModified, or contentHash)
    for (const disc of discoveredFiles) {
        if (matchedDiscoveredPaths.has(disc.path)) continue;

        const renameMatchIndex = remainingExisting.findIndex(r =>
            !matchedExistingIds.has(r.imageId) &&
            ((r.contentHash && disc.contentHash && r.contentHash === disc.contentHash) ||
             (r.size === disc.size && r.lastModified === disc.lastModified))
        );

        if (renameMatchIndex !== -1) {
            const existing = remainingExisting[renameMatchIndex];
            matchedExistingIds.add(existing.imageId);
            matchedDiscoveredPaths.add(disc.path);

            results.push({
                imageId: existing.imageId, // Permanent imageId survives rename/relocation!
                folderId,
                relativePath: disc.path,    // Updated location
                fileName: disc.name,        // Updated filename
                size: disc.size,
                lastModified: disc.lastModified,
                contentHash: existing.contentHash || null,
                fingerprint: existing.fingerprint || null,
                status: "available",
                indexingStatus: existing.indexingStatus || "pending"
            });
        }
    }

    // Pass 3: Brand new images (assign stable UUID)
    for (const disc of discoveredFiles) {
        if (matchedDiscoveredPaths.has(disc.path)) continue;

        results.push({
            imageId: crypto.randomUUID(), // New stable identity
            folderId,
            relativePath: disc.path,
            fileName: disc.name,
            size: disc.size,
            lastModified: disc.lastModified,
            contentHash: null,
            fingerprint: null,
            status: "available",
            indexingStatus: "pending"
        });
    }

    // Pass 4: Existing records no longer found on disk (mark missing, keep imageId)
    for (const existing of remainingExisting) {
        if (!matchedExistingIds.has(existing.imageId)) {
            results.push({
                ...existing,
                status: "missing"
            });
        }
    }

    return results;
}

/**
 * Scans a single connected folder and returns a snapshot of all discovered images.
 * Extracts ephemeral File objects into RAM for display, hashing, and AI indexing.
 *
 * @param {Object} folder - Folder item { id, name, handle }
 * @returns {Promise<Array<Object>>} Discovered snapshot items
 */
export async function scanFolder(folder) {
    if (!folder?.handle) return [];

    try {
        const permission = await folder.handle.queryPermission({ mode: 'read' });
        if (permission !== 'granted') {
            console.warn(`Permission not granted for folder: ${folder.name} (${folder.id})`);
            return [];
        }

        const enumerated = await enumerateDirectory(folder.handle);
        const flattened = flattenFiles(enumerated);

        const snapshot = [];
        for (const item of flattened) {
            if (!item.isImage || !item.handle) continue;
            try {
                const file = await item.handle.getFile();
                snapshot.push({
                    folderId: folder.id,
                    folderName: folder.name,
                    relativePath: item.path,
                    fileName: item.name,
                    size: file.size,
                    lastModified: file.lastModified,
                    file, // Ephemeral in RAM: used for preview, hashing, AI processing
                    handle: item.handle
                });
            } catch (fileErr) {
                console.warn(`Could not read file ${item.name}:`, fileErr);
            }
        }

        return snapshot;
    } catch (err) {
        console.error(`Error scanning folder ${folder.name}:`, err);
        return [];
    }
}

/**
 * Phase 4: Global Multi-Folder Scanner.
 * Scans ALL connected folders in parallel and aggregates all discovered images
 * into a single unified current snapshot.
 *
 * @param {Array<Object>} folders - List of connected folder items
 * @returns {Promise<Array<Object>>} Unified global snapshot
 */
export async function scanAllFolders(folders = []) {
    if (!folders || folders.length === 0) return [];

    const scanPromises = folders.map(folder => scanFolder(folder));
    const resultsPerFolder = await Promise.all(scanPromises);

    return resultsPerFolder.flat();
}

/**
 * Phase 4: Reconciles the global multi-folder snapshot against all existing records in IndexedDB.
 * Handles renames, moves within a folder, and cross-folder moves seamlessly.
 *
 * @param {Array<Object>} globalSnapshot - Output from scanAllFolders
 * @param {Array<Object>} allExistingRecords - All records from the images store
 * @returns {Array<Object>} Reconciled records to save in IndexedDB
 */
export function reconcileGlobalSnapshot(globalSnapshot, allExistingRecords = []) {
    const matchedExistingIds = new Set();
    const matchedSnapshotKeys = new Set();
    const results = [];

    const getCompoundKey = (folderId, path) => `${folderId}:::${path}`;

    const existingByCompoundKey = new Map(
        allExistingRecords.map(r => [getCompoundKey(r.folderId, r.relativePath), r])
    );

    // Pass 1: Exact location match (same folderId + relativePath)
    for (const item of globalSnapshot) {
        const key = getCompoundKey(item.folderId, item.relativePath);
        const existing = existingByCompoundKey.get(key);

        if (existing && !matchedExistingIds.has(existing.imageId)) {
            matchedExistingIds.add(existing.imageId);
            matchedSnapshotKeys.add(key);

            const isIdentical = item.size === existing.size && item.lastModified === existing.lastModified;

            results.push({
                imageId: existing.imageId, // Retain stable identity
                folderId: item.folderId,
                relativePath: item.relativePath,
                fileName: item.fileName,
                size: item.size,
                lastModified: item.lastModified,
                contentHash: isIdentical ? existing.contentHash : null,
                fingerprint: isIdentical ? existing.fingerprint : null,
                status: "available",
                indexingStatus: isIdentical ? (existing.indexingStatus || "pending") : "pending"
            });
        }
    }

    // Unmatched pool for Pass 2 (Rename / Move / Cross-folder Move detection)
    const remainingExisting = allExistingRecords.filter(r => !matchedExistingIds.has(r.imageId));

    // Pass 2: Rename / Move / Cross-Folder Relocation match (same size + lastModified, or contentHash)
    for (const item of globalSnapshot) {
        const key = getCompoundKey(item.folderId, item.relativePath);
        if (matchedSnapshotKeys.has(key)) continue;

        const renameMatchIndex = remainingExisting.findIndex(r =>
            !matchedExistingIds.has(r.imageId) &&
            ((r.contentHash && item.contentHash && r.contentHash === item.contentHash) ||
             (r.size === item.size && r.lastModified === item.lastModified))
        );

        if (renameMatchIndex !== -1) {
            const existing = remainingExisting[renameMatchIndex];
            matchedExistingIds.add(existing.imageId);
            matchedSnapshotKeys.add(key);

            results.push({
                imageId: existing.imageId, // Permanent imageId survives even cross-folder moves!
                folderId: item.folderId,    // Updated folderId
                relativePath: item.relativePath,
                fileName: item.fileName,
                size: item.size,
                lastModified: item.lastModified,
                contentHash: existing.contentHash || null,
                fingerprint: existing.fingerprint || null,
                status: "available",
                indexingStatus: existing.indexingStatus || "pending"
            });
        }
    }

    // Pass 3: Brand new images
    for (const item of globalSnapshot) {
        const key = getCompoundKey(item.folderId, item.relativePath);
        if (matchedSnapshotKeys.has(key)) continue;

        results.push({
            imageId: crypto.randomUUID(), // Brand-new identity
            folderId: item.folderId,
            relativePath: item.relativePath,
            fileName: item.fileName,
            size: item.size,
            lastModified: item.lastModified,
            contentHash: null,
            fingerprint: null,
            status: "available",
            indexingStatus: "pending"
        });
    }

    // Pass 4: Existing records not found in any connected folder (mark missing)
    for (const existing of remainingExisting) {
        if (!matchedExistingIds.has(existing.imageId)) {
            results.push({
                ...existing,
                status: "missing"
            });
        }
    }

    return results;
}
