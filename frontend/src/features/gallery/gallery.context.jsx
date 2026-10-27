import { createContext, useState, useEffect } from 'react';
import { visionQueue } from './services/visionQueue';
import { getAllFolders, getImagesByFolder, resetStaleProcessingImages, getPendingImages } from './services/galleryDb';
import { checkLocalAiHealth } from './services/localAiClient';
import { cloudSyncManager } from './services/cloudSync';
import { getPrivacyBoundaryAuditLog } from './services/privacyBoundary';
import { revokeAllBlobUrls } from './services/blobRegistry';
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

    // Autonomous background daemon: runs ONLY when user is authenticated and scoped to user
    useEffect(() => {
        let mounted = true;

        if (!user) {
            // User logged out: clear React gallery state and terminate background tasks
            setFolders([]);
            setActiveFolder(null);
            setError(null);
            setLoading(false);
            visionQueue.stop();
            revokeAllBlobUrls();
            return;
        }

        const ownerId = String(user.id || user._id);

        const autoBootBackgroundAI = async () => {
            try {
                // 1. Crash/Close Recovery: Reset any interrupted or failed jobs strictly for this user
                const recovered = await resetStaleProcessingImages({ forceAll: true, ownerId });
                if (recovered > 0) {
                    console.log(`[Stash AI Daemon] Stale-job recovery for user ${ownerId}: reset ${recovered} uncaptioned image(s) -> pending.`);
                }

                // 2. Fetch all connected folders for this user
                const savedFolders = await getAllFolders(ownerId);
                if (!mounted) return;

                if (savedFolders && savedFolders.length > 0) {
                    setFolders(savedFolders);

                    // Auto-activate first folder if none active
                    const first = savedFolders[0];
                    try {
                        const perm = await first.handle.queryPermission({ mode: 'read' });
                        if (perm === 'granted' && mounted) {
                            const folderRecords = await getImagesByFolder(first.id, ownerId);
                            setActiveFolder({
                                ...first,
                                entries: [],
                                flatFiles: [],
                                imageRecords: folderRecords.filter(r => r.status === 'available')
                            });
                        }
                    } catch (pErr) {
                        console.warn('[Stash AI Daemon] Could not query initial folder permission:', pErr);
                    }

                    // 3. Probe Local AI and check for unindexed photos for this user
                    const health = await checkLocalAiHealth();
                    const pending = await getPendingImages({ isLocalAiAvailable: health.available, ownerId });
                    if (pending && pending.length > 0) {
                        console.log(`[Stash AI Daemon] Auto-starting AI inference for ${pending.length} unindexed photos (User: ${ownerId})...`);
                        visionQueue.start(savedFolders, ownerId);
                    } else {
                        console.log(`[Stash AI Daemon] All connected photos for User ${ownerId} are already indexed.`);
                    }
                } else {
                    setFolders([]);
                    setActiveFolder(null);
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
                    const pending = await getPendingImages({ isLocalAiAvailable: true, ownerId });
                    if (pending && pending.length > 0) {
                        console.log(`[Stash AI Watchdog] 🚀 Local AI detected online! Auto-starting indexing for ${pending.length} remaining images (User: ${ownerId}).`);
                        const currentFolders = await getAllFolders(ownerId);
                        visionQueue.start(currentFolders, ownerId);
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
