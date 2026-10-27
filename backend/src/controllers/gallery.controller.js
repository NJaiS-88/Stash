/**
 * Phase 29 — Cloud Authorization / User Isolation
 *
 * Rules:
 * 1. Owner ALWAYS comes from req.user.id. Never from client input.
 * 2. Every single image query pairs: { imageId, userId: req.user.id }. Never { imageId } alone.
 * 3. Operates ONLY on data parsed and validated by strict Zod schemas (req.validatedData).
 * 4. Explicitly constructs every database object property-by-property.
 * 5. NEVER executes Metadata.create(req.body).
 */

const Metadata = require('../models/metadata.model');

/**
 * GET /api/gallery/images/:imageId
 * Phase 29: Read a single image metadata record.
 * Query MUST pair: { imageId, userId: req.user.id }. Never { imageId } alone.
 */
const getImageMetadata = async (req, res) => {
    try {
        const userId = req.user.id;
        const { imageId } = req.params;

        const record = await Metadata.findOne({ imageId, userId }).lean();

        if (!record) {
            return res.status(404).json({ message: `Image with ID ${imageId} not found for this user` });
        }

        return res.status(200).json({
            image: {
                userId: record.userId,
                imageId: record.imageId,
                fingerprint: record.fingerprint,
                caption: record.caption,
                captionEngine: record.captionEngine,
                captionModel: record.captionModel,
                captionVersion: record.captionVersion,
                status: record.status,
                keywords: record.keywords || [],
                createdAt: record.createdAt,
                updatedAt: record.updatedAt
            }
        });
    } catch (err) {
        console.error('[GalleryController] Error reading image metadata:', err);
        return res.status(500).json({ message: "Internal server error reading image metadata" });
    }
};

/**
 * GET /api/gallery/images
 * Phase 29: Read all images for the authenticated user.
 * Query strictly scoped to: { userId: req.user.id }
 */
const getAllImagesMetadata = async (req, res) => {
    try {
        const userId = req.user.id;
        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const status = req.query.status || 'available';

        const filter = { userId, status };
        const [total, records] = await Promise.all([
            Metadata.countDocuments(filter),
            Metadata.find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean()
        ]);

        return res.status(200).json({
            total,
            page,
            limit,
            images: records.map(r => ({
                userId: r.userId,
                imageId: r.imageId,
                fingerprint: r.fingerprint,
                caption: r.caption,
                captionEngine: r.captionEngine,
                captionModel: r.captionModel,
                captionVersion: r.captionVersion,
                status: r.status,
                keywords: r.keywords || [],
                createdAt: r.createdAt,
                updatedAt: r.updatedAt
            }))
        });
    } catch (err) {
        console.error('[GalleryController] Error listing images metadata:', err);
        return res.status(500).json({ message: "Internal server error listing images metadata" });
    }
};

/**
 * POST /api/gallery/images
 * Creates or upserts a single image metadata record.
 * Query MUST pair: { imageId, userId: req.user.id }. Never { imageId } alone.
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
            { imageId: explicitRecord.imageId, userId },
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
 * Phase 29: Updates an existing image metadata record.
 * Query MUST pair: { imageId, userId: req.user.id }. Never { imageId } alone.
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
            { imageId, userId },
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
 * Phase 29: Tombstones (soft-deletes) an image metadata record.
 * Query MUST pair: { imageId, userId: req.user.id }. Never { imageId } alone.
 */
const deleteImageMetadata = async (req, res) => {
    try {
        const userId = req.user.id;
        const { imageId } = req.params;

        const record = await Metadata.findOneAndUpdate(
            { imageId, userId },
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
 * DELETE /api/gallery/images/:imageId/permanent
 * Phase 29: Hard-deletes / purges an image metadata record permanently.
 * Query MUST pair: { imageId, userId: req.user.id }. Never { imageId } alone.
 */
const purgeImageMetadata = async (req, res) => {
    try {
        const userId = req.user.id;
        const { imageId } = req.params;

        const record = await Metadata.findOneAndDelete({ imageId, userId });

        if (!record) {
            return res.status(404).json({ message: `Image with ID ${imageId} not found for this user` });
        }

        return res.status(200).json({
            message: "Image metadata permanently deleted from cloud index",
            imageId: record.imageId,
            status: 'purged'
        });
    } catch (err) {
        console.error('[GalleryController] Error purging image metadata:', err);
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

        const localMap = new Map(localItems.map(item => [item.imageId, item]));
        const localIds = Array.from(localMap.keys());

        // Fetch all matching records from user's cloud index
        const cloudRecords = await Metadata.find(
            { imageId: { $in: localIds }, userId },
            'imageId fingerprint caption status'
        ).lean();

        const cloudMap = new Map(cloudRecords.map(r => [r.imageId, r]));

        const missingInCloud = [];
        const upToDate = [];
        const deletedInCloud = [];
        const availabilitySyncOps = [];

        for (const [localId, localItem] of localMap.entries()) {
            const cloudRec = cloudMap.get(localId);
            if (!cloudRec) {
                missingInCloud.push(localId);
            } else if (cloudRec.status === 'deleted') {
                deletedInCloud.push(localId);
            } else {
                // Phase 30: Availability Synchronization
                // If local status differs from cloud status (available <-> missing), update MongoDB
                // while strictly keeping caption & fingerprint intact.
                if (localItem.status && localItem.status !== cloudRec.status && localItem.status !== 'deleted') {
                    availabilitySyncOps.push({
                        updateOne: {
                            filter: { imageId: localId, userId },
                            update: {
                                $set: {
                                    status: localItem.status,
                                    updatedAt: new Date()
                                }
                            }
                        }
                    });
                }
                upToDate.push(localId);
            }
        }

        if (availabilitySyncOps.length > 0) {
            await Metadata.bulkWrite(availabilitySyncOps);
            console.log(`[Reconcile] Phase 30: Synchronized availability for ${availabilitySyncOps.length} photo(s) in cloud.`);
        }

        return res.status(200).json({
            reconciledCount: localIds.length,
            missingInCloudCount: missingInCloud.length,
            missingInCloud,
            upToDateCount: upToDate.length,
            deletedInCloudCount: deletedInCloud.length,
            deletedInCloud,
            availabilitySynchronizedCount: availabilitySyncOps.length
        });
    } catch (err) {
        console.error('[GalleryController] Error reconciling metadata:', err);
        return res.status(500).json({ message: "Internal server error reconciling metadata" });
    }
};

/**
 * POST /api/gallery/availability
 * Phase 30: Availability Synchronization
 * When an image transitions: available <-> missing:
 * Updates status in MongoDB for { imageId, userId: req.user.id }.
 * Strictly preserves caption, fingerprint, and all semantic information.
 * Does NOT immediately permanently delete semantic information.
 */
const syncAvailability = async (req, res) => {
    try {
        const userId = req.user.id;
        const { updates } = req.validatedData;

        // Construct atomic bulk update operations paired strictly with userId
        const bulkOps = updates.map(item => ({
            updateOne: {
                filter: { imageId: item.imageId, userId },
                update: {
                    $set: {
                        status: item.status,
                        updatedAt: new Date()
                    }
                }
            }
        }));

        const result = await Metadata.bulkWrite(bulkOps);

        return res.status(200).json({
            message: "Availability synchronized successfully",
            matchedCount: result.matchedCount,
            modifiedCount: result.modifiedCount,
            syncedCount: updates.length
        });
    } catch (err) {
        console.error('[GalleryController] Error synchronizing availability:', err);
        return res.status(500).json({ message: "Internal server error synchronizing availability" });
    }
};

/**
 * POST /api/gallery/search
 * Phase 29: Semantic & keyword search across user's indexed photo captions.
 * Query strictly pairs: { ...(imageId ? { imageId } : {}), userId: req.user.id }
 * Never { imageId } alone.
 */
const searchMetadata = async (req, res) => {
    try {
        const userId = req.user.id;
        const { query, limit, imageId } = req.validatedData;

        // Clean search query tokens
        const cleanQuery = query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
        const tokens = cleanQuery.split(/\s+/).filter(t => t.length > 1);

        if (tokens.length === 0) {
            return res.status(200).json({ results: [], total: 0 });
        }

        // Build regex filters for full-caption and keyword matching
        const regexPatterns = tokens.map(t => new RegExp(t, 'i'));

        const filter = {
            userId,
            status: 'available',
            $or: [
                { caption: { $in: regexPatterns } },
                { keywords: { $in: tokens } }
            ]
        };

        // If scoped to a specific imageId, pair { imageId, userId }
        if (imageId) {
            filter.imageId = imageId;
        }

        const candidates = await Metadata.find(filter).limit(limit * 2).lean();

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
 * Phase 29: AI Question-Answering over user's photo captions (RAG semantic query).
 * Query strictly pairs: { ...(imageId ? { imageId } : {}), userId: req.user.id }
 * Never { imageId } alone.
 */
const askMetadata = async (req, res) => {
    try {
        const userId = req.user.id;
        const { question, imageId } = req.validatedData;

        // Extract key search terms from question
        const cleanQ = question.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
        const tokens = cleanQ.split(/\s+/).filter(t => t.length > 2);

        const filter = {
            userId,
            status: 'available'
        };

        // If asking about a specific image, pair { imageId, userId }
        if (imageId) {
            filter.imageId = imageId;
        }

        const candidates = await Metadata.find(filter).limit(300).lean();

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
    getImageMetadata,
    getAllImagesMetadata,
    createImageMetadata,
    updateImageMetadata,
    deleteImageMetadata,
    purgeImageMetadata,
    reconcileMetadata,
    searchMetadata,
    askMetadata,
    syncAvailability,
    syncMetadata,
    syncTombstones,
    getCloudStatus
};
