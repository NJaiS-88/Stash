import { enumerateDirectory, flattenFiles } from './fileSystem';

/**
 * Scans a single connected folder and returns a result object containing discovered images
 * and folder availability state.
 *
 * If a drive is disconnected or permission is revoked, marks isAvailable: false
 * instead of throwing or wiping files.
 *
 * @param {Object} folder - Folder item { id, name, handle }
 * @returns {Promise<Object>} Scan result { folderId, folderName, isAvailable, files, error }
 */
export async function scanFolder(folder) {
    if (!folder?.handle) {
        return {
            folderId: folder?.id,
            folderName: folder?.name,
            isAvailable: false,
            error: 'No handle available',
            files: []
        };
    }

    try {
        let permission = 'prompt';
        try {
            permission = await folder.handle.queryPermission({ mode: 'read' });
        } catch (permErr) {
            console.warn(`Could not query permission for folder: ${folder.name}`, permErr);
            return {
                folderId: folder.id,
                folderName: folder.name,
                isAvailable: false,
                error: 'Permission query failed (Drive disconnected)',
                files: []
            };
        }

        if (permission !== 'granted') {
            console.warn(`Permission not granted for folder: ${folder.name} (${folder.id})`);
            return {
                folderId: folder.id,
                folderName: folder.name,
                isAvailable: false,
                error: 'Permission required',
                files: []
            };
        }

        // Detect if folder was renamed on disk:
        const currentDiskName = folder.handle.name;

        const enumerated = await enumerateDirectory(folder.handle);
        const flattened = flattenFiles(enumerated);

        const files = [];
        for (const item of flattened) {
            if (!item.isImage || !item.handle) continue;
            try {
                const file = await item.handle.getFile();
                // Phase 6 Fast Scan: Read fast metadata (size, lastModified) in microseconds.
                files.push({
                    folderId: folder.id,
                    folderName: currentDiskName || folder.name,
                    relativePath: item.path,
                    fileName: item.name,
                    size: file.size,
                    lastModified: file.lastModified,
                    contentHash: null, // Computed lazily during reconciliation ONLY if changed/new
                    file, // Ephemeral in RAM: used for preview, hashing, AI processing
                    handle: item.handle
                });
            } catch (fileErr) {
                console.warn(`Could not read file ${item.name}:`, fileErr);
            }
        }

        return {
            folderId: folder.id,
            folderName: currentDiskName || folder.name,
            isAvailable: true,
            files
        };
    } catch (err) {
        console.error(`Error scanning folder ${folder.name}:`, err);
        return {
            folderId: folder.id,
            folderName: folder.name,
            isAvailable: false,
            error: err.message || 'Folder inaccessible',
            files: []
        };
    }
}

/**
 * Phase 4 & Phase 12: Global Multi-Folder Scanner with Availability Detection.
 * Scans ALL connected folders in parallel. Isolates unavailable folders so
 * disconnected drives do not cause false image deletion.
 *
 * @param {Array<Object>} folders - List of connected folder items
 * @returns {Promise<Array<Object>>} Unified global snapshot (with availability metadata attached)
 */
export async function scanAllFolders(folders = []) {
    if (!folders || folders.length === 0) {
        const emptySnapshot = [];
        emptySnapshot.availableFolderIds = [];
        emptySnapshot.unavailableFolderIds = [];
        emptySnapshot.folderUpdates = [];
        return emptySnapshot;
    }

    const scanPromises = folders.map(folder => scanFolder(folder));
    const resultsPerFolder = await Promise.all(scanPromises);

    const snapshot = [];
    const availableFolderIds = [];
    const unavailableFolderIds = [];
    const folderUpdates = [];

    for (const res of resultsPerFolder) {
        if (res.isAvailable) {
            availableFolderIds.push(res.folderId);
            snapshot.push(...res.files);
            folderUpdates.push({
                folderId: res.folderId,
                name: res.folderName,
                status: 'available'
            });
        } else {
            unavailableFolderIds.push(res.folderId);
            folderUpdates.push({
                folderId: res.folderId,
                name: res.folderName,
                status: 'unavailable',
                error: res.error
            });
        }
    }

    snapshot.availableFolderIds = availableFolderIds;
    snapshot.unavailableFolderIds = unavailableFolderIds;
    snapshot.folderUpdates = folderUpdates;

    return snapshot;
}
