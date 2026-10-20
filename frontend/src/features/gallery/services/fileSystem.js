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
 * Lazily resolves a single local File object from a root directory handle and relative path.
 * Traverses intermediate directories on demand without preloading thousands of handles into RAM.
 *
 * @param {FileSystemDirectoryHandle} rootHandle
 * @param {string} relativePath - e.g. "Goa/Beach/sunset.jpg" or "photo.png"
 * @returns {Promise<File|null>}
 */
export async function resolveFileByPath(rootHandle, relativePath) {
    if (!rootHandle || !relativePath) return null;
    try {
        const parts = relativePath.split(/[/\\]+/).filter(Boolean);
        let currentHandle = rootHandle;

        for (let i = 0; i < parts.length - 1; i++) {
            currentHandle = await currentHandle.getDirectoryHandle(parts[i]);
        }

        const fileHandle = await currentHandle.getFileHandle(parts[parts.length - 1]);
        return await fileHandle.getFile();
    } catch (err) {
        // File may have been renamed, moved, or deleted outside
        return null;
    }
}

/**
 * High-performance streaming directory traverser for large libraries (10,000–50,000+ files).
 * Emits files in batches (default: 100) via onBatch callback and yields to the main thread
 * after every batch, preventing UI stutter or memory bloat.
 *
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {Function} onBatch - Callback receiving Array of { name, path, size, lastModified, handle }
 * @param {number} batchSize - Number of items per batch (default: 100)
 * @param {string} relativePath - Base relative path
 * @returns {Promise<number>} Total count of discovered image files
 */
export async function streamDirectoryFiles(dirHandle, onBatch, batchSize = 100, relativePath = '') {
    let currentBatch = [];
    let totalCount = 0;

    async function walk(handle, currentPath) {
        for await (const entry of handle.values()) {
            const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;

            if (entry.kind === 'file') {
                if (isImageFile(entry.name)) {
                    try {
                        const file = await entry.getFile();
                        currentBatch.push({
                            name: entry.name,
                            path: entryPath,
                            size: file.size,
                            lastModified: file.lastModified,
                            handle: entry
                        });
                        totalCount++;

                        if (currentBatch.length >= batchSize) {
                            await onBatch(currentBatch);
                            currentBatch = [];
                            // Yield to the browser main thread to guarantee 60fps responsiveness
                            await new Promise(r => setTimeout(r, 0));
                        }
                    } catch (fileErr) {
                        console.warn('Could not read file stat:', entry.name, fileErr);
                    }
                }
            } else if (entry.kind === 'directory') {
                await walk(entry, entryPath);
            }
        }
    }

    await walk(dirHandle, relativePath);

    // Flush any remaining items in the final batch
    if (currentBatch.length > 0) {
        await onBatch(currentBatch);
    }

    return totalCount;
}

// Re-export modular services for backwards compatibility
export * from './crypto';
export * from './reconciliation';
export * from './scanner';
