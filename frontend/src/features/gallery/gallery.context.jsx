import { createContext, useState, useEffect } from 'react';
import { visionQueue } from './services/visionQueue';
import { getAllFolders, resetStaleProcessingImages, getPendingImages } from './services/galleryDb';

const GalleryContext = createContext();

export const GalleryProvider = ({ children }) => {
    const [folders, setFolders] = useState([]);
    const [activeFolder, setActiveFolder] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [indexingState, setIndexingState] = useState(visionQueue.status);

    // Subscribe to centralized background AI queue state
    useEffect(() => {
        return visionQueue.subscribe((state) => {
            setIndexingState(state);
        });
    }, []);

    // Autonomous background daemon: runs automatically every time website is loaded or refreshed
    useEffect(() => {
        const autoBootBackgroundAI = async () => {
            try {
                // 1. Recover any interrupted jobs from previous sessions
                await resetStaleProcessingImages();

                // 2. Fetch all connected folders
                const savedFolders = await getAllFolders();
                if (savedFolders && savedFolders.length > 0) {
                    setFolders(savedFolders);

                    // 3. Check for any pending photos across all folders
                    const pending = await getPendingImages();
                    if (pending && pending.length > 0) {
                        console.log(`[Stash AI Daemon] Auto-starting background AI inference for ${pending.length} unindexed photos...`);
                        visionQueue.start(savedFolders);
                    } else {
                        console.log('[Stash AI Daemon] All connected photos are already indexed.');
                    }
                }
            } catch (err) {
                console.warn('[Stash AI Daemon] Auto-boot error:', err);
            }
        };

        autoBootBackgroundAI();
    }, []);

    return (
        <GalleryContext.Provider value={{
            folders,
            setFolders,
            activeFolder,
            setActiveFolder,
            loading,
            setLoading,
            error,
            setError,
            indexingState,
            pauseAI: () => visionQueue.pause(),
            resumeAI: () => visionQueue.resume(folders),
            triggerAI: (targetFolders = null) => visionQueue.start(targetFolders || folders)
        }}>
            {children}
        </GalleryContext.Provider>
    );
};

export default GalleryContext;

