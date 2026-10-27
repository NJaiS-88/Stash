import { useContext, useEffect, useState, useRef } from 'react';
import GalleryContext from '../gallery.context';
import { selectDirectory, enumerateDirectory, flattenFiles, streamDirectoryFiles, resolveFileByPath } from '../services/fileSystem';
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
    purgeMissingImages,
    getPendingImages,
    updateImageAI,
    resetStaleProcessingImages,
    getLocalOwnerId
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
        setError,
        indexingState,
        pauseAI,
        resumeAI,
        triggerAI
    } = context;

    const [missingImages, setMissingImages] = useState([]);

    // Live UI card update: when background worker completes an image, update activeFolder state efficiently
    useEffect(() => {
        if (indexingState?.lastIndexed && activeFolder?.id === indexingState.lastIndexed.folderId) {
            const { imageId, caption, keywords } = indexingState.lastIndexed;
            setActiveFolder(prev => {
                if (!prev || prev.id !== indexingState.lastIndexed.folderId || !prev.imageRecords) return prev;
                const idx = prev.imageRecords.findIndex(r => r.imageId === imageId);
                if (idx === -1) return prev;
                const currentRec = prev.imageRecords[idx];
                if (currentRec.caption === caption && currentRec.captionStatus === 'completed') return prev;

                const updated = [...prev.imageRecords];
                updated[idx] = {
                    ...currentRec,
                    caption,
                    keywords,
                    captionStatus: 'completed',
                    cloudIndexStatus: currentRec.cloudIndexStatus || 'pending',
                    captionEngine: indexingState.lastIndexed.engine || currentRec.captionEngine,
                    captionModel: indexingState.lastIndexed.model || currentRec.captionModel,
                    captionVersion: 1,
                    captionedAt: Date.now(),
                    processingStartedAt: null,
                    indexingStatus: 'indexed'
                };
                return {
                    ...prev,
                    imageRecords: updated
                };
            });
        }
    }, [indexingState?.lastIndexed, activeFolder?.id]);

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

    /**
     * Connects a new folder using incremental streaming.
     * Automatically enqueues new photos into the running background AI queue.
     */
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

            const folderItem = {
                localOwnerId: getLocalOwnerId(),
                id: crypto.randomUUID(),
                name: handle.name,
                handle,
                fileCount: 0,
                addedAt: Date.now()
            };

            await saveFolder(folderItem);

            const allExisting = await getAllImages();
            let totalDiscovered = 0;

            // Stream directory in small batches directly to IndexedDB
            await streamDirectoryFiles(handle, async (batch) => {
                totalDiscovered += batch.length;
                const batchRecords = await buildImageRegistryForFolder(batch, folderItem.id, allExisting);
                await saveImageRecords(batchRecords);
            }, 100);

            folderItem.fileCount = totalDiscovered;
            await saveFolder(folderItem);

            setFolders(prev => {
                const existing = prev.filter(f => f.id !== folderItem.id);
                return [...existing, folderItem];
            });

            const savedRecords = await getImagesByFolder(folderItem.id);
            const loadedFolder = {
                ...folderItem,
                entries: [],
                flatFiles: [],
                imageRecords: savedRecords.filter(r => r.status === 'available')
            };

            setActiveFolder(loadedFolder);
            await refreshMissingImages();

            // Automatically notify background AI daemon to start processing newly added photos
            if (triggerAI) {
                triggerAI();
            }

            return loadedFolder;
        } catch (err) {
            console.error('Error adding folder:', err);
            setError(err.message || 'Failed to connect folder');
            return null;
        } finally {
            setLoading(false);
        }
    };

    /**
     * Selects and loads a folder from IndexedDB.
     * Uses lightweight image records to maintain 60fps responsiveness.
     */
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

            // Immediately display existing records from IndexedDB
            const folderRecords = await getImagesByFolder(folder.id);
            setActiveFolder({
                ...folder,
                entries: [],
                flatFiles: [],
                imageRecords: folderRecords.filter(r => r.status === 'available')
            });

            // Reconcile changes in background via streaming
            const missingRecords = await getMissingImages();
            const existingToMatch = [...folderRecords, ...missingRecords.filter(m => m.folderId !== folder.id)];

            await streamDirectoryFiles(folder.handle, async (batch) => {
                const batchRecords = await buildImageRegistryForFolder(batch, folder.id, existingToMatch);
                await saveImageRecords(batchRecords);
            }, 100);

            const refreshedRecords = await getImagesByFolder(folder.id);
            setActiveFolder(prev => (prev?.id === folder.id ? {
                ...prev,
                fileCount: refreshedRecords.length,
                imageRecords: refreshedRecords.filter(r => r.status === 'available')
            } : prev));

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
     * Reconnect an unavailable or moved folder.
     */
    const reconnectFolder = async (folderId) => {
        setError(null);
        setLoading(true);
        try {
            const folder = folders.find(f => f.id === folderId);
            if (!folder) throw new Error('Folder not found');

            const handle = await selectDirectory();
            if (!handle) {
                setLoading(false);
                return false;
            }

            let discoveredCount = 0;
            const allExisting = await getAllImages();

            await streamDirectoryFiles(handle, async (batch) => {
                discoveredCount += batch.length;
                const batchRecords = await buildImageRegistryForFolder(batch, folderId, allExisting);
                await saveImageRecords(batchRecords);
            }, 100);

            const updatedFolder = {
                ...folder,
                name: handle.name,
                handle,
                status: 'available',
                error: null,
                fileCount: discoveredCount,
                reconnectedAt: Date.now()
            };

            await saveFolder(updatedFolder);
            const savedRecords = await getImagesByFolder(folderId);

            setFolders(prev => prev.map(f => f.id === folderId ? updatedFolder : f));

            if (activeFolder?.id === folderId) {
                setActiveFolder({
                    ...updatedFolder,
                    entries: [],
                    flatFiles: [],
                    imageRecords: savedRecords.filter(r => r.status === 'available')
                });
            }

            await refreshMissingImages();
            return true;
        } catch (err) {
            console.error('Error reconnecting folder:', err);
            setError(err.message || 'Failed to reconnect folder');
            return false;
        } finally {
            setLoading(false);
        }
    };

    /**
     * Scans ALL connected folders, reconciles states, and saves updates.
     */
    const scanAll = async () => {
        setError(null);
        setLoading(true);
        try {
            const currentFolders = folders.length > 0 ? folders : await getAllFolders();
            if (!currentFolders || currentFolders.length === 0) {
                return { snapshot: [], records: [] };
            }

            const globalSnapshot = await scanAllFolders(currentFolders);

            if (globalSnapshot.folderUpdates && globalSnapshot.folderUpdates.length > 0) {
                const updatedFolders = currentFolders.map(folder => {
                    const update = globalSnapshot.folderUpdates.find(u => u.folderId === folder.id);
                    if (update) {
                        return {
                            ...folder,
                            name: update.name || folder.name,
                            status: update.status || 'available',
                            error: update.error || null
                        };
                    }
                    return folder;
                });

                for (const f of updatedFolders) {
                    await saveFolder(f);
                }
                setFolders(updatedFolders);
            }

            const allExisting = await getAllImages();
            const { allRecords, toUpsert, summary } = await reconcileGlobalSnapshot(globalSnapshot, allExisting);

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

    /**
     * Missing image reconciliation helper
     */
    useEffect(() => {
        if (folders.length > 0) {
            refreshMissingImages();
        } else {
            setMissingImages([]);
        }
    }, [folders.length]);

    const runAIIndexing = async () => {
        if (triggerAI) {
            triggerAI();
        }
        return { started: true };
    };

    const pauseAIIndexing = () => {
        if (pauseAI) {
            pauseAI();
        }
    };

    const resumeAIIndexing = () => {
        if (resumeAI) {
            resumeAI();
        }
    };

    return {
        folders,
        activeFolder,
        setActiveFolder,
        missingImages,
        indexingState: indexingState || { isIndexing: false, current: 0, total: 0, currentFile: '', modelStatus: 'Idle' },
        isAIPaused: Boolean(indexingState?.isPaused),
        loading,
        error,
        addFolder,
        selectFolder,
        removeFolder,
        scanAll,
        reconnectFolder,
        runAIIndexing,
        pauseAIIndexing,
        resumeAIIndexing,
        refreshMissingImages,
        deleteMissingPhoto,
        purgeAllMissing
    };
};
