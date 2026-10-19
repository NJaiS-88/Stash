import { useContext, useEffect, useState } from 'react';
import GalleryContext from '../gallery.context';
import { selectDirectory, enumerateDirectory, flattenFiles } from '../services/fileSystem';
import { buildImageRegistryForFolder, reconcileGlobalSnapshot } from '../services/reconciliation';
import { scanAllFolders } from '../services/scanner';
import {
    saveFolder,
    getAllFolders,
    deleteFolder,
    saveImageRecords,
    getImagesByFolder,
    getAllImages,
    deleteImagesByFolder,
    getMissingImages,
    deleteImagePermanently,
    purgeMissingImages
} from '../services/galleryDb';

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

    const [missingImages, setMissingImages] = useState([]);

    const refreshMissingImages = async () => {
        try {
            const missing = await getMissingImages();
            setMissingImages(missing);
            return missing;
        } catch (err) {
            console.error('Error fetching missing images:', err);
            return [];
        }
    };

    const deleteMissingPhoto = async (imageId) => {
        try {
            const success = await deleteImagePermanently(imageId);
            if (success) {
                setMissingImages(prev => prev.filter(img => img.imageId !== imageId));
            }
            return success;
        } catch (err) {
            console.error('Error deleting image permanently:', err);
            return false;
        }
    };

    const purgeAllMissing = async () => {
        try {
            const purged = await purgeMissingImages();
            setMissingImages([]);
            return purged;
        } catch (err) {
            console.error('Error purging all missing images:', err);
            return [];
        }
    };

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

            // Phase 2 & 11: Reconcile against all existing records so newly connected folders immediately restore missing images!
            const allExisting = await getAllImages();
            const imageRecords = await buildImageRegistryForFolder(flattened, folderItem.id, allExisting);
            await saveImageRecords(imageRecords);

            setFolders(prev => {
                const existing = prev.filter(f => f.id !== folderItem.id);
                return [...existing, folderItem];
            });

            const loadedFolder = {
                ...folderItem,
                entries: enumerated,
                flatFiles: flattened,
                imageRecords: imageRecords.filter(r => r.status === 'available')
            };

            setActiveFolder(loadedFolder);
            await refreshMissingImages();
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

            // Phase 2 & 11: Load folder records and cross-folder missing records to detect restorations
            const folderRecords = await getImagesByFolder(folder.id);
            const missingRecords = await getMissingImages();
            const existingToMatch = [...folderRecords, ...missingRecords.filter(m => m.folderId !== folder.id)];
            const imageRecords = await buildImageRegistryForFolder(flattened, folder.id, existingToMatch);
            await saveImageRecords(imageRecords);

            setActiveFolder({
                ...folder,
                entries: enumerated,
                flatFiles: flattened,
                imageRecords: imageRecords.filter(r => r.status === 'available')
            });

            await refreshMissingImages();
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
            await refreshMissingImages();
        } catch (err) {
            console.error('Error removing folder:', err);
            setError(err.message || 'Failed to disconnect folder');
        }
    };

    /**
     * Phase 4: Global Multi-Folder Scan
     * Scans ALL connected folders in parallel, aggregates their files into a single snapshot,
     * reconciles against all existing records in IndexedDB, and persists updates.
     *
     * @returns {Promise<{ snapshot: Array, records: Array }>}
     */
    const scanAll = async () => {
        setError(null);
        setLoading(true);
        try {
            const currentFolders = folders.length > 0 ? folders : await getAllFolders();
            if (!currentFolders || currentFolders.length === 0) {
                return { snapshot: [], records: [] };
            }

            // 1. Scan ALL folders into a single unified global snapshot
            const globalSnapshot = await scanAllFolders(currentFolders);

            // 2. Reconcile across all folders (Scenario A, B, C, D, E)
            const allExisting = await getAllImages();
            const { allRecords, toUpsert, summary } = await reconcileGlobalSnapshot(globalSnapshot, allExisting);

            // 3. Persist ONLY toUpsert into IndexedDB (unchanged & already-missing records skip DB writes)
            if (toUpsert && toUpsert.length > 0) {
                await saveImageRecords(toUpsert);
            }

            const missing = allRecords.filter(r => r.status === 'missing');
            setMissingImages(missing);

            return {
                snapshot: globalSnapshot,
                records: allRecords,
                toUpsert,
                summary
            };
        } catch (err) {
            console.error('Error during global multi-folder scan:', err);
            setError(err.message || 'Failed to scan all folders');
            return { snapshot: [], records: [] };
        } finally {
            setLoading(false);
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
                        const folderRecords = await getImagesByFolder(first.id);
                        const missingRecords = await getMissingImages();
                        const existingToMatch = [...folderRecords, ...missingRecords.filter(m => m.folderId !== first.id)];
                        const imageRecords = await buildImageRegistryForFolder(flattened, first.id, existingToMatch);
                        await saveImageRecords(imageRecords);

                        setActiveFolder({
                            ...first,
                            entries: enumerated,
                            flatFiles: flattened,
                            imageRecords: imageRecords.filter(r => r.status === 'available')
                        });
                    }
                }
            } catch (err) {
                console.warn('Could not restore saved folders:', err);
            }
        };

        restoreAllFolders();
        refreshMissingImages();
    }, []);

    return {
        folders,
        activeFolder,
        setActiveFolder,
        missingImages,
        loading,
        error,
        addFolder,
        selectFolder,
        removeFolder,
        scanAll,
        refreshMissingImages,
        deleteMissingPhoto,
        purgeAllMissing
    };
};
