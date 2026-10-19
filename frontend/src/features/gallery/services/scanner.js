import { enumerateDirectory, flattenFiles } from './fileSystem';

/**
 * Scans a single connected folder and returns a snapshot of all discovered images.
 * Extracts fast metadata (size, lastModified) in microseconds and holds ephemeral
 * File objects in RAM for on-demand preview, hashing, and AI indexing.
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
                // Phase 6 Fast Scan: Read fast metadata (size, lastModified) in microseconds.
                // DO NOT read raw bytes or compute SHA-256 here!
                snapshot.push({
                    folderId: folder.id,
                    folderName: folder.name,
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
