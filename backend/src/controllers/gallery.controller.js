/**
 * Phase 26 — Cloud Gallery Controller with Explicit Database Object Construction
 *
 * Rules:
 * 1. Operates ONLY on data parsed and validated by strict Zod schemas (req.validatedData).
 * 2. Explicitly constructs every database object property-by-property.
 * 3. NEVER executes Metadata.create(req.body) or bulkWrite(req.body).
 */

const Metadata = require('../models/metadata.model');

/**
 * Syncs strictly validated semantic metadata into the user's cloud index.
 * Explicitly constructs each database object field by field.
 */
const syncMetadata = async (req, res) => {
    try {
        const userId = req.user.userId;
        const validatedItems = req.validatedData?.items;

        if (!validatedItems || validatedItems.length === 0) {
            return res.status(400).json({ message: "No validated items provided for sync" });
        }

        // Explicitly construct database objects — NEVER pass raw req.body
        const bulkOps = validatedItems.map(item => {
            const explicitRecord = {
                userId,
                imageId: item.imageId,
                fingerprint: item.fingerprint,
                caption: item.caption,
                keywords: Array.isArray(item.keywords) ? item.keywords : [],
                status: item.status,
                captionModel: item.captionModel || null,
                captionVersion: item.captionVersion,
                captionEngine: item.captionEngine,
                updatedAt: new Date()
            };

            return {
                updateOne: {
                    filter: { userId, imageId: explicitRecord.imageId },
                    update: { $set: explicitRecord },
                    upsert: true
                }
            };
        });

        const result = await Metadata.bulkWrite(bulkOps);

        return res.status(200).json({
            message: "Metadata synced successfully with strict schema validation",
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
 * Processes purged image tombstones.
 * Explicitly extracts validated imageId and sets status to 'deleted'.
 */
const syncTombstones = async (req, res) => {
    try {
        const userId = req.user.userId;
        const validatedTombstones = req.validatedData?.tombstones;

        if (!validatedTombstones || validatedTombstones.length === 0) {
            return res.status(400).json({ message: "No validated tombstones provided" });
        }

        // Explicitly extract validated imageId strings only
        const validImageIds = validatedTombstones.map(t => t.imageId);

        const result = await Metadata.updateMany(
            { userId, imageId: { $in: validImageIds } },
            { $set: { status: 'deleted', updatedAt: new Date() } }
        );

        return res.status(200).json({
            message: "Tombstones processed successfully with strict schema validation",
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
            privacyBoundaryActive: true,
            strictValidationActive: true
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
