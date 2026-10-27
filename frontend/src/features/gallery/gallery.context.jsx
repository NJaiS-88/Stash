import { createContext, useState, useEffect } from 'react';
import { visionQueue } from './services/visionQueue';
import { getAllFolders, resetStaleProcessingImages, getPendingImages } from './services/galleryDb';
import { checkLocalAiHealth } from './services/localAiClient';
import { cloudSyncManager } from './services/cloudSync';
import { getPrivacyBoundaryAuditLog } from './services/privacyBoundary';
import { useAuth } from '../auth/hooks/useAuth';

const GalleryContext = createContext();

export const GalleryProvider = ({ children }) => {
    const { user } = useAuth();
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

    // Autonomous background daemon: runs ONLY when user is authenticated
    useEffect(() => {
        let mounted = true;

        if (!user) {
            setFolders([]);
            visionQueue.pause();
            return;
        }

        const autoBootBackgroundAI = async () => {
            try {
                // 1. Crash/Close Recovery: Reset any interrupted or failed jobs without captions back to pending
                const recovered = await resetStaleProcessingImages({ forceAll: true });
                if (recovered > 0) {
                    console.log(`[Stash AI Daemon] Stale-job recovery: reset ${recovered} uncaptioned image(s) -> pending.`);
                }

                // 2. Fetch all connected folders
                const savedFolders = await getAllFolders();
                if (savedFolders && savedFolders.length > 0 && mounted) {
                    setFolders(savedFolders);

                    // 3. Probe Local AI and check for unindexed photos
                    const health = await checkLocalAiHealth();
                    const pending = await getPendingImages({ isLocalAiAvailable: health.available });
                    if (pending && pending.length > 0) {
                        console.log(`[Stash AI Daemon] Auto-starting AI inference for ${pending.length} unindexed photos...`);
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

        // 4. Autonomous Watchdog: Periodically checks if Local AI was started while website is open
        const watchdogInterval = setInterval(async () => {
            if (!mounted || !user) return;
            // Skip check if queue is already actively running
            if (visionQueue.isRunning && !visionQueue.isPaused) return;

            try {
                const health = await checkLocalAiHealth();
                if (health.available) {
                    const pending = await getPendingImages({ isLocalAiAvailable: true });
                    if (pending && pending.length > 0) {
                        console.log(`[Stash AI Watchdog] 🚀 Local AI detected online! Auto-starting indexing for ${pending.length} remaining images.`);
                        const currentFolders = await getAllFolders();
                        visionQueue.start(currentFolders);
                    }
                }
            } catch {
                // Ignore silent loopback probe errors
            }
        }, 4000);

        return () => {
            mounted = false;
            clearInterval(watchdogInterval);
        };
    }, [user]);

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
            resumeAI: () => user && visionQueue.resume(folders),
            triggerAI: (targetFolders = null) => user && visionQueue.start(targetFolders || folders),
            syncCloud: () => user && cloudSyncManager.syncPendingImagesToCloud(),
            getPrivacyAuditLog: () => getPrivacyBoundaryAuditLog()
        }}>
            {children}
        </GalleryContext.Provider>
    );
};

export default GalleryContext;
