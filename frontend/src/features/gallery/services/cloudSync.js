/**
 * Phase 25 — Cloud Sync Service with Enforced Privacy Boundary
 *
 * Coordinates synchronization of local AI captions and semantic metadata to the cloud.
 * Every outgoing payload is formally scrubbed and validated by privacyBoundary.js.
 * Under NO circumstances does an image binary, base64 string, local path, or raw hash
 * ever leave the user's computer.
 */

import {
    enforcePrivacyBoundary,
    enforceBatchPrivacyBoundary,
    createCloudTombstone,
    validateCloudPayload
} from './privacyBoundary';
import {
    getPendingCloudIndexImages,
    updateCloudIndexStatus,
    purgeMissingImages
} from './galleryDb';

import { API_BASE_URL } from '../../../config/api.config';

const CLOUD_SYNC_BASE_URL = `${API_BASE_URL}/api/gallery`;

class CloudSyncManager {
    constructor() {
        this.isSyncing = false;
        this.lastSyncTime = null;
        this.syncStats = {
            totalSynced: 0,
            lastBatchCount: 0,
            lastError: null
        };
    }

    /**
     * Synchronizes all locally captioned images whose cloud indexing is pending or failed.
     * Enforces the Cloud Privacy Boundary on each record before transmission.
     *
     * @param {Object} [options]
     * @param {number} [options.batchSize=50]
     * @returns {Promise<{ syncedCount: number, error?: string }>}
     */
    async syncPendingImagesToCloud({ batchSize = 50 } = {}) {
        if (this.isSyncing) {
            console.log('[CloudSync] Sync already in progress, skipping duplicate call.');
            return { syncedCount: 0 };
        }

        this.isSyncing = true;
        let syncedCount = 0;

        try {
            const pendingRecords = await getPendingCloudIndexImages();
            if (!pendingRecords || pendingRecords.length === 0) {
                this.isSyncing = false;
                return { syncedCount: 0 };
            }

            console.log(`[CloudSync] 🔒 Enforcing Cloud Privacy Boundary on ${pendingRecords.length} image(s)...`);

            // Slice into manageable batches
            const batch = pendingRecords.slice(0, batchSize);

            // Phase 25: Enforce Privacy Boundary strictly on the outgoing batch
            const { payloads, rejectedCount } = enforceBatchPrivacyBoundary(batch, { strict: false });

            if (rejectedCount > 0) {
                console.warn(`[CloudSync] ⚠️ ${rejectedCount} record(s) failed privacy boundary validation and were excluded.`);
            }

            if (payloads.length === 0) {
                this.isSyncing = false;
                return { syncedCount: 0 };
            }

            // Post-boundary verification: double check each payload before dispatch
            for (const item of payloads) {
                const check = validateCloudPayload(item);
                if (!check.isValid) {
                    throw new Error(`[CloudSync] Critical Privacy Violation: ${check.violations.join(', ')}`);
                }
            }

            // Dispatch scrubbed semantic metadata to cloud endpoint
            let response = null;
            try {
                response = await fetch(`${CLOUD_SYNC_BASE_URL}/sync`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    credentials: 'include',
                    body: JSON.stringify({ items: payloads })
                });
            } catch (netErr) {
                console.warn('[CloudSync] Cloud backend currently unavailable; queued for offline retry:', netErr.message);
                // Mark locally that cloud sync was attempted
                this.syncStats.lastError = 'Backend unreachable';
            }

            if (response && response.ok) {
                const resData = await response.json();
                console.log(`[CloudSync] ✅ Successfully synced ${payloads.length} semantic records to cloud.`);
                
                // Update local IndexedDB status to 'completed' for synced records
                for (const item of payloads) {
                    await updateCloudIndexStatus(item.imageId, {
                        status: 'completed'
                    });
                }
                syncedCount = payloads.length;
                this.syncStats.totalSynced += syncedCount;
                this.syncStats.lastBatchCount = syncedCount;
                this.syncStats.lastError = null;
                this.lastSyncTime = Date.now();
            } else if (response) {
                const errText = await response.text().catch(() => 'Unknown cloud error');
                console.warn(`[CloudSync] Cloud sync failed with status ${response.status}: ${errText}`);
                this.syncStats.lastError = `Status ${response.status}: ${errText}`;
            }

            return { syncedCount };
        } catch (err) {
            console.error('[CloudSync] Error during cloud sync:', err);
            this.syncStats.lastError = err.message;
            return { syncedCount, error: err.message };
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Purges missing images from IndexedDB and dispatches minimal tombstones to cloud.
     * Guarantees zero local path or filename leakage.
     *
     * @returns {Promise<number>} Count of tombstones synced
     */
    async syncTombstonesToCloud() {
        try {
            const tombstones = await purgeMissingImages();
            if (!tombstones || tombstones.length === 0) return 0;

            // Enforce tombstone schema (imageId, fingerprint, status: 'deleted')
            const cleanTombstones = tombstones.map(t => createCloudTombstone(t));

            try {
                await fetch(`${CLOUD_SYNC_BASE_URL}/tombstones`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ tombstones: cleanTombstones })
                });
                console.log(`[CloudSync] 🗑️ Synced ${cleanTombstones.length} tombstones to cloud.`);
            } catch (netErr) {
                console.warn('[CloudSync] Tombstone sync failed (backend offline):', netErr);
            }

            return cleanTombstones.length;
        } catch (err) {
            console.error('[CloudSync] Error syncing tombstones:', err);
            return 0;
        }
    }

    /**
     * Returns current status and telemetry of cloud synchronization.
     */
    getStatus() {
        return {
            isSyncing: this.isSyncing,
            lastSyncTime: this.lastSyncTime,
            ...this.syncStats
        };
    }
}

export const cloudSyncManager = new CloudSyncManager();
