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

// Re-export modular services for backwards compatibility
export * from './crypto';
export * from './reconciliation';
export * from './scanner';
