/**
 * Phase 26 & Phase 27 — Cloud Gallery Controller
 *
 * Rules:
 * 1. Owner ALWAYS comes from req.user.id. Never from req.body.userId.
 * 2. Operates ONLY on data parsed and validated by strict Zod schemas (req.validatedData).
 * 3. Explicitly constructs every database object property-by-property.
 * 4. NEVER executes Metadata.create(req.body).
 */

const Metadata = require('../models/metadata.model');

/**
 * POST /api/gallery/images
 * Creates or upserts a single image metadata record.
 * Owner strictly comes from req.user.id.
 */
const createImageMetadata = async (req, res) => {
    try {
        const userId = req.user.id;
        const item = req.validatedData.image || req.validatedData;

        // Explicitly construct database object — NEVER pass raw req.body
        const explicitRecord = {
            userId,
            imageId: item.imageId,
            fingerprint: item.fingerprint,
            caption: item.caption,
            keywords: Array.isArray(item.keywords) ? item.keywords : [],
            status: item.status || 'available',
            captionModel: item.captionModel || null,
            captionVersion: item.captionVersion || 1,
            captionEngine: item.captionEngine || 'local',
            updatedAt: new Date()
        };

        const record = await Metadata.findOneAndUpdate(
            { userId, imageId: explicitRecord.imageId },
            { $set: explicitRecord },
            { upsert: true, new: true, runValidators: true }
        );

        return res.status(201).json({
            message: "Image metadata saved successfully",
            image: {
                userId: record.userId,
                imageId: record.imageId,
                fingerprint: record.fingerprint,
                caption: record.caption,
                captionEngine: record.captionEngine,
                captionModel: record.captionModel,
                captionVersion: record.captionVersion,
                status: record.status,
                createdAt: record.createdAt,
                updatedAt: record.updatedAt
            }
        });
    } catch (err) {
        console.error('[GalleryController] Error creating image metadata:', err);
        return res.status(500).json({ message: "Internal server error creating image metadata" });
    }
};

/**
 * PUT /api/gallery/images/:imageId
 * Updates an existing image metadata record.
 * Owner strictly comes from req.user.id.
 */
const updateImageMetadata = async (req, res) => {
    try {
        const userId = req.user.id;
        const { imageId } = req.params;
        const updateData = req.validatedData;

        // Explicitly construct update fields only
        const explicitUpdate = { updatedAt: new Date() };
        if (updateData.caption !== undefined) explicitUpdate.caption = updateData.caption;
        if (updateData.keywords !== undefined) explicitUpdate.keywords = updateData.keywords;
        if (updateData.status !== undefined) explicitUpdate.status = updateData.status;

        const record = await Metadata.findOneAndUpdate(
            { userId, imageId },
            { $set: explicitUpdate },
            { new: true }
        );

        if (!record) {
            return res.status(404).json({ message: `Image with ID ${imageId} not found for this user` });
        }

        return res.status(200).json({
            message: "Image metadata updated successfully",
            image: {
                userId: record.userId,
                imageId: record.imageId,
                fingerprint: record.fingerprint,
                caption: record.caption,
                captionEngine: record.captionEngine,
                captionModel: record.captionModel,
                captionVersion: record.captionVersion,
                status: record.status,
                updatedAt: record.updatedAt
            }
        });
    } catch (err) {
        console.error('[GalleryController] Error updating image metadata:', err);
        return res.status(500).json({ message: "Internal server error updating image metadata" });
    }
};

/**
 * DELETE /api/gallery/images/:imageId
 * Tombstones (soft-deletes) an image metadata record.
 * Owner strictly comes from req.user.id.
 */
const deleteImageMetadata = async (req, res) => {
    try {
        const userId = req.user.id;
        const { imageId } = req.params;

        const record = await Metadata.findOneAndUpdate(
            { userId, imageId },
            { $set: { status: 'deleted', updatedAt: new Date() } },
            { new: true }
        );

        if (!record) {
            return res.status(404).json({ message: `Image with ID ${imageId} not found for this user` });
        }

        return res.status(200).json({
            message: "Image metadata deleted successfully",
            imageId: record.imageId,
            status: 'deleted'
        });
    } catch (err) {
        console.error('[GalleryController] Error deleting image metadata:', err);
        return res.status(500).json({ message: "Internal server error deleting image metadata" });
    }
};

/**
 * POST /api/gallery/reconcile
 * Reconciles local device metadata states against user's cloud index.
 * Owner strictly comes from req.user.id.
 */
const reconcileMetadata = async (req, res) => {
    try {
        const userId = req.user.id;
        const localItems = req.validatedData.items;

        const localIdMap = new Map(localItems.map(item => [item.imageId, item.fingerprint]));
        const localIds = Array.from(localIdMap.keys());

        // Fetch all matching records from user's cloud index
        const cloudRecords = await Metadata.find(
            { userId, imageId: { $in: localIds } },
            'imageId fingerprint caption status'
        ).lean();

        const cloudMap = new Map(cloudRecords.map(r => [r.imageId, r]));

        const missingInCloud = [];
        const upToDate = [];
        const deletedInCloud = [];

        for (const localId of localIds) {
            const cloudRec = cloudMap.get(localId);
            if (!cloudRec) {
                missingInCloud.push(localId);
            } else if (cloudRec.status === 'deleted') {
                deletedInCloud.push(localId);
            } else {
                upToDate.push(localId);
            }
        }

        return res.status(200).json({
            reconciledCount: localIds.length,
            missingInCloudCount: missingInCloud.length,
            missingInCloud,
            upToDateCount: upToDate.length,
            deletedInCloudCount: deletedInCloud.length,
            deletedInCloud
        });
    } catch (err) {
        console.error('[GalleryController] Error reconciling metadata:', err);
        return res.status(500).json({ message: "Internal server error reconciling metadata" });
    }
};

/**
 * POST /api/gallery/search
 * Semantic & keyword search across user's indexed photo captions.
 * Owner strictly comes from req.user.id.
 */
const searchMetadata = async (req, res) => {
    try {
        const userId = req.user.id;
        const { query, limit } = req.validatedData;

        // Clean search query tokens
        const cleanQuery = query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
        const tokens = cleanQuery.split(/\s+/).filter(t => t.length > 1);

        if (tokens.length === 0) {
            return res.status(200).json({ results: [], total: 0 });
        }

        // Build regex filters for full-caption and keyword matching
        const regexPatterns = tokens.map(t => new RegExp(t, 'i'));

        const candidates = await Metadata.find({
            userId,
            status: 'available',
            $or: [
                { caption: { $in: regexPatterns } },
                { keywords: { $in: tokens } }
            ]
        }).limit(limit * 2).lean();

        // Rank candidates by token matches
        const scored = candidates.map(item => {
            let score = 0;
            const captionLower = (item.caption || '').toLowerCase();
            const keywordsLower = (item.keywords || []).map(k => k.toLowerCase());

            // Exact phrase match bonus
            if (captionLower.includes(cleanQuery)) {
                score += 10;
            }

            for (const token of tokens) {
                if (captionLower.includes(token)) score += 3;
                if (keywordsLower.includes(token)) score += 2;
            }

            return {
                imageId: item.imageId,
                fingerprint: item.fingerprint,
                caption: item.caption,
                keywords: item.keywords,
                captionEngine: item.captionEngine,
                score
            };
        });

        scored.sort((a, b) => b.score - a.score);
        const results = scored.slice(0, limit);

        return res.status(200).json({
            query,
            total: results.length,
            results
        });
    } catch (err) {
        console.error('[GalleryController] Error searching metadata:', err);
        return res.status(500).json({ message: "Internal server error searching metadata" });
    }
};

/**
 * POST /api/gallery/ask
 * AI Question-Answering over user's photo captions (RAG semantic query).
 * Owner strictly comes from req.user.id.
 */
const askMetadata = async (req, res) => {
    try {
        const userId = req.user.id;
        const { question } = req.validatedData;

        // Extract key search terms from question
        const cleanQ = question.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
        const tokens = cleanQ.split(/\s+/).filter(t => t.length > 2);

        const candidates = await Metadata.find({
            userId,
            status: 'available'
        }).limit(300).lean();

        if (candidates.length === 0) {
            return res.status(200).json({
                question,
                answer: "You do not have any photos indexed in your gallery yet. Connect a local folder to start indexing your photos.",
                referencedImages: []
            });
        }

        // Score relevant photo captions against question
        const matched = candidates.map(c => {
            let matches = 0;
            const text = `${c.caption || ''} ${(c.keywords || []).join(' ')}`.toLowerCase();
            for (const t of tokens) {
                if (text.includes(t)) matches++;
            }
            return { ...c, matches };
        }).filter(c => c.matches > 0);

        matched.sort((a, b) => b.matches - a.matches);
        const topMatches = matched.slice(0, 5);

        let answer = "";
        if (topMatches.length === 0) {
            answer = `I searched your photo library, but could not find any photos matching "${question}".`;
        } else {
            const descriptions = topMatches.map((m, idx) => `Photo ${idx + 1}: "${m.caption}"`).join("; ");
            answer = `Based on your private photo library, I found ${topMatches.length} relevant photo(s). ${descriptions}`;
        }

        return res.status(200).json({
            question,
            answer,
            referencedImages: topMatches.map(m => ({
                imageId: m.imageId,
                caption: m.caption,
                keywords: m.keywords
            }))
        });
    } catch (err) {
        console.error('[GalleryController] Error asking metadata:', err);
        return res.status(500).json({ message: "Internal server error answering question" });
    }
};

/**
 * POST /api/gallery/sync
 * Bulk sync endpoint strictly operating on req.validatedData.items.
 * Explicitly constructs database objects field by field.
 */
const syncMetadata = async (req, res) => {
    try {
        const userId = req.user.id;
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
 * POST /api/gallery/tombstones
 * Bulk tombstone endpoint.
 */
const syncTombstones = async (req, res) => {
    try {
        const userId = req.user.id;
        const validatedTombstones = req.validatedData?.tombstones;

        if (!validatedTombstones || validatedTombstones.length === 0) {
            return res.status(400).json({ message: "No validated tombstones provided" });
        }

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
 * GET /api/gallery/status
 */
const getCloudStatus = async (req, res) => {
    try {
        const userId = req.user.id;
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
    createImageMetadata,
    updateImageMetadata,
    deleteImageMetadata,
    reconcileMetadata,
    searchMetadata,
    askMetadata,
    syncMetadata,
    syncTombstones,
    getCloudStatus
};
