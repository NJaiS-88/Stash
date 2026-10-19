import { useContext, useEffect } from 'react';
import GalleryContext from '../gallery.context';
import { selectDirectory, enumerateDirectory, flattenFiles, buildImageRegistryForFolder } from '../services/fileSystem';
import { saveFolder, getAllFolders, deleteFolder, saveImageRecords, getImagesByFolder, deleteImagesByFolder } from '../services/galleryDb';

export const useGallery = () => {
    const context = useContext(GalleryContext);
    if (!context) {
        throw new Error('useGallery must be used within a GalleryProvider');
    }

    const {
        folders,
        setFolders,
        activeFolder,
        setActiveFolder,
        loading,
        setLoading,
        error,
        setError
    } = context;

    const addFolder = async () => {
        setError(null);
        setLoading(true);
        try {
            const handle = await selectDirectory();
            if (!handle) {
                setLoading(false);
                return null;
            }

            console.log('Connected folder handle:', handle);

            const enumerated = await enumerateDirectory(handle);
            const flattened = flattenFiles(enumerated);

            const folderItem = {
                id: crypto.randomUUID(),
                name: handle.name,
                handle,
                fileCount: flattened.length,
                addedAt: Date.now()
            };

            await saveFolder(folderItem);

            // Phase 2: Build local Image Registry records and save to IndexedDB
            const imageRecords = await buildImageRegistryForFolder(flattened, folderItem.id);
            await saveImageRecords(imageRecords);

            setFolders(prev => {
                const existing = prev.filter(f => f.id !== folderItem.id);
                return [...existing, folderItem];
            });

            const loadedFolder = {
                ...folderItem,
                entries: enumerated,
                flatFiles: flattened,
                imageRecords
            };

            setActiveFolder(loadedFolder);
            return loadedFolder;
        } catch (err) {
            console.error('Error adding folder:', err);
            setError(err.message || 'Failed to connect folder');
            return null;
        } finally {
            setLoading(false);
        }
    };

    const selectFolder = async (folderId) => {
        setError(null);
        setLoading(true);
        try {
            const folder = folders.find(f => f.id === folderId);
            if (!folder) return;

            const permission = await folder.handle.queryPermission({ mode: 'read' });
            if (permission !== 'granted') {
                const requestPerm = await folder.handle.requestPermission({ mode: 'read' });
                if (requestPerm !== 'granted') {
                    throw new Error('Permission to access folder was denied');
                }
            }

            const enumerated = await enumerateDirectory(folder.handle);
            const flattened = flattenFiles(enumerated);

            // Phase 2: Load existing image records and reconcile any new/changed files
            const existingRecords = await getImagesByFolder(folder.id);
            const imageRecords = await buildImageRegistryForFolder(flattened, folder.id, existingRecords);
            await saveImageRecords(imageRecords);

            setActiveFolder({
                ...folder,
                entries: enumerated,
                flatFiles: flattened,
                imageRecords
            });
        } catch (err) {
            console.error('Error selecting folder:', err);
            setError(err.message || 'Failed to open folder');
        } finally {
            setLoading(false);
        }
    };

    const removeFolder = async (folderId) => {
        try {
            await deleteFolder(folderId);
            // Phase 2: Clean up image registry records for this folder
            await deleteImagesByFolder(folderId);

            setFolders(prev => prev.filter(f => f.id !== folderId));
            if (activeFolder?.id === folderId) {
                setActiveFolder(null);
            }
        } catch (err) {
            console.error('Error removing folder:', err);
            setError(err.message || 'Failed to disconnect folder');
        }
    };

    useEffect(() => {
        const restoreAllFolders = async () => {
            try {
                const saved = await getAllFolders();
                if (!saved || saved.length === 0) return;

                setFolders(saved);

                // Auto-activate the first folder if none active
                if (!activeFolder && saved.length > 0) {
                    const first = saved[0];
                    const perm = await first.handle.queryPermission({ mode: 'read' });
                    if (perm === 'granted') {
                        const enumerated = await enumerateDirectory(first.handle);
                        const flattened = flattenFiles(enumerated);
                        const existingRecords = await getImagesByFolder(first.id);
                        const imageRecords = await buildImageRegistryForFolder(flattened, first.id, existingRecords);
                        await saveImageRecords(imageRecords);

                        setActiveFolder({
                            ...first,
                            entries: enumerated,
                            flatFiles: flattened,
                            imageRecords
                        });
                    }
                }
            } catch (err) {
                console.warn('Could not restore saved folders:', err);
            }
        };

        restoreAllFolders();
    }, []);

    return {
        folders,
        activeFolder,
        setActiveFolder,
        loading,
        error,
        addFolder,
        selectFolder,
        removeFolder
    };
};
