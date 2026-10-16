import { useContext, useEffect } from 'react';
import GalleryContext from '../gallery.context';
import { selectDirectory, enumerateDirectory, flattenFiles } from '../services/fileSystem';
import { saveDirectoryHandle, getDirectoryHandle, clearDirectoryHandle } from '../services/galleryDb';

export const useGallery = () => {
    const context = useContext(GalleryContext);
    if (!context) {
        throw new Error('useGallery must be used within a GalleryProvider');
    }

    const {
        directoryHandle,
        setDirectoryHandle,
        folderName,
        setFolderName,
        entries,
        setEntries,
        flatFiles,
        setFlatFiles,
        loading,
        setLoading,
        error,
        setError
    } = context;

    const loadDirectory = async (handle) => {
        setLoading(true);
        setError(null);
        try {
            console.log(handle);
            setDirectoryHandle(handle);
            setFolderName(handle.name);

            const enumerated = await enumerateDirectory(handle);
            const flattened = flattenFiles(enumerated);

            setEntries(enumerated);
            setFlatFiles(flattened);
            await saveDirectoryHandle(handle);
        } catch (err) {
            console.error('Failed to enumerate directory:', err);
            setError(err.message || 'Failed to read folder contents');
        } finally {
            setLoading(false);
        }
    };

    const handleConnectFolder = async () => {
        setError(null);
        try {
            const handle = await selectDirectory();
            if (!handle) return;
            await loadDirectory(handle);
        } catch (err) {
            console.error('Error connecting folder:', err);
            setError(err.message || 'Failed to connect folder');
        }
    };

    const handleDisconnectFolder = async () => {
        setDirectoryHandle(null);
        setFolderName('');
        setEntries([]);
        setFlatFiles([]);
        setError(null);
        await clearDirectoryHandle();
    };

    useEffect(() => {
        const restoreFolder = async () => {
            try {
                const savedHandle = await getDirectoryHandle();
                if (!savedHandle) return;

                const permission = await savedHandle.queryPermission({ mode: 'read' });
                if (permission === 'granted') {
                    await loadDirectory(savedHandle);
                }
            } catch (err) {
                console.warn('Could not auto-restore directory handle:', err);
            }
        };

        restoreFolder();
    }, []);

    return {
        directoryHandle,
        folderName,
        entries,
        flatFiles,
        loading,
        error,
        handleConnectFolder,
        handleDisconnectFolder
    };
};
