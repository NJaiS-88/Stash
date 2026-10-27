const Metadata = require('../models/metadata.model');

/**
 * Phase 25: Cloud Sync Endpoint
 * Receives allowlisted semantic metadata across the privacy boundary and upserts
 * records in the user's cloud index.
 */
const syncMetadata = async (req, res) => {
    try {
        const userId = req.user.userId;
        const items = req.body.items;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ message: "No items provided for sync" });
        }

        const bulkOps = items.map(item => ({
            updateOne: {
                filter: { userId, imageId: item.imageId },
                update: {
                    $set: {
                        userId,
                        imageId: item.imageId,
                        fingerprint: item.fingerprint || null,
                        caption: item.caption || '',
                        keywords: Array.isArray(item.keywords) ? item.keywords : [],
                        status: item.status || 'available',
                        captionModel: item.captionModel || null,
                        captionVersion: item.captionVersion || 1,
                        captionEngine: item.captionEngine || 'local',
                        updatedAt: new Date()
                    }
                },
                upsert: true
            }
        }));

        const result = await Metadata.bulkWrite(bulkOps);

        return res.status(200).json({
            message: "Metadata synced successfully across privacy boundary",
            matchedCount: result.matchedCount,
            modifiedCount: result.modifiedCount,
            upsertedCount: result.upsertedCount
        });
    } catch (err) {
        console.error('[GalleryController] Error syncing metadata:', err);
        return res.status(500).json({ message: "Internal server error syncing metadata" });
    }
};

/**
 * Phase 25: Cloud Tombstone Endpoint
 * Receives purged image tombstones ({ imageId, fingerprint, status: 'deleted' })
 * and flags them as deleted in cloud storage.
 */
const syncTombstones = async (req, res) => {
    try {
        const userId = req.user.userId;
        const tombstones = req.body.tombstones;

        if (!tombstones || !Array.isArray(tombstones) || tombstones.length === 0) {
            return res.status(400).json({ message: "No tombstones provided" });
        }

        const imageIds = tombstones.map(t => t.imageId).filter(Boolean);

        const result = await Metadata.updateMany(
            { userId, imageId: { $in: imageIds } },
            { $set: { status: 'deleted', updatedAt: new Date() } }
        );

        return res.status(200).json({
            message: "Tombstones processed successfully",
            deletedCount: result.modifiedCount
        });
    } catch (err) {
        console.error('[GalleryController] Error syncing tombstones:', err);
        return res.status(500).json({ message: "Internal server error syncing tombstones" });
    }
};

/**
 * Returns telemetry and summary stats for the user's cloud index.
 */
const getCloudStatus = async (req, res) => {
    try {
        const userId = req.user.userId;
        const totalIndexed = await Metadata.countDocuments({ userId, status: 'available' });
        const totalDeleted = await Metadata.countDocuments({ userId, status: 'deleted' });

        return res.status(200).json({
            totalIndexed,
            totalDeleted,
            privacyBoundaryActive: true
        });
    } catch (err) {
        console.error('[GalleryController] Error fetching cloud status:', err);
        return res.status(500).json({ message: "Internal server error fetching cloud status" });
    }
};

module.exports = {
    syncMetadata,
    syncTombstones,
    getCloudStatus
};
