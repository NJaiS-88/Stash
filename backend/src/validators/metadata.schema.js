/**
 * Phase 26 & Phase 27 — Strict Zod Metadata Validation Schemas
 *
 * Enforces strict schemas for every cloud metadata request.
 * All schemas call .strict() so unexpected fields such as Base64 image data,
 * file paths, directory handles, or raw hashes are rejected rather than accepted.
 */

let z;
try {
    z = require('zod');
} catch {
    try {
        // Fallback to workspace node_modules resolution
        z = require('../../../frontend/node_modules/zod');
    } catch {
        throw new Error('[MetadataSchema] Zod validation library not found. Please run npm install zod');
    }
}

/**
 * Strict schema for a single image semantic metadata item.
 * .strict() guarantees that unexpected fields (base64, blobs, paths, raw hashes)
 * cause validation to fail immediately.
 */
const imageMetadataSchema = z.object({
    imageId: z.string().min(1, {
        message: "imageId must be a non-empty string"
    }).max(128, {
        message: "imageId cannot exceed 128 characters"
    }),
    fingerprint: z.string().min(1, {
        message: "fingerprint must be a non-empty string"
    }).max(256, {
        message: "fingerprint exceeds maximum allowed length of 256 characters"
    }),
    caption: z.string().trim().min(1, {
        message: "caption cannot be empty"
    }).max(1000, {
        message: "caption cannot exceed 1000 characters"
    }),
    keywords: z.array(
        z.string().trim().min(1).max(60)
    ).max(50, {
        message: "keywords array cannot exceed 50 entries"
    }).optional().default([]),
    status: z.enum(['available', 'missing', 'deleted'], {
        errorMap: () => ({ message: "status must be one of: 'available', 'missing', 'deleted'" })
    }).default('available'),
    captionModel: z.string().trim().min(1).max(100).optional().nullable().default(null),
    captionVersion: z.number().int().positive().optional().default(1),
    captionEngine: z.enum(['local', 'browser'], {
        errorMap: () => ({ message: "captionEngine must be 'local' or 'browser'" })
    }).optional().default('local')
}).strict({
    message: "Unexpected field detected. Binary image data, paths, and raw hashes are strictly forbidden."
});

/**
 * Strict schema for bulk metadata sync request payload:
 * { items: [ imageMetadataSchema, ... ] }
 */
const syncMetadataRequestSchema = z.object({
    items: z.array(imageMetadataSchema)
        .min(1, { message: "items array must contain at least 1 record" })
        .max(500, { message: "items array cannot exceed 500 records per batch" })
}).strict({
    message: "Unexpected field in sync request wrapper. Only 'items' array is permitted."
});

/**
 * Strict schema for single image metadata creation / upsert (POST /api/gallery/images)
 * Accepts either the direct image metadata object or wrapped as { image: ... }.
 */
const singleImageRequestSchema = z.union([
    imageMetadataSchema,
    z.object({
        image: imageMetadataSchema
    }).strict()
]);

/**
 * Strict schema for updating an existing image metadata (PUT /api/gallery/images/:imageId)
 */
const updateImageRequestSchema = z.object({
    caption: z.string().trim().min(1).max(1000).optional(),
    keywords: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
    status: z.enum(['available', 'missing', 'deleted']).optional()
}).strict({
    message: "Unexpected field in update image request. Only 'caption', 'keywords', and 'status' can be updated."
});

/**
 * Strict schema for a single purged image tombstone item.
 */
const tombstoneItemSchema = z.object({
    imageId: z.string().min(1, {
        message: "imageId must be a non-empty string"
    }).max(128),
    fingerprint: z.string().min(1).max(256).optional().nullable().default(null),
    status: z.literal('deleted', {
        errorMap: () => ({ message: "tombstone status must be 'deleted'" })
    }).default('deleted')
}).strict({
    message: "Unexpected field in tombstone item. Local file names and paths are strictly forbidden."
});

/**
 * Strict schema for tombstone sync request payload:
 * { tombstones: [ tombstoneItemSchema, ... ] }
 */
const syncTombstonesRequestSchema = z.object({
    tombstones: z.array(tombstoneItemSchema)
        .min(1, { message: "tombstones array must contain at least 1 record" })
        .max(500, { message: "tombstones array cannot exceed 500 records per batch" })
}).strict({
    message: "Unexpected field in tombstone request wrapper. Only 'tombstones' array is permitted."
});

/**
 * Strict schema for Phase 27 reconciliation request payload:
 * { items: [ { imageId, fingerprint }, ... ] }
 */
const reconcileRequestSchema = z.object({
    items: z.array(z.object({
        imageId: z.string().uuid({ message: "imageId must be a valid UUID string" }),
        fingerprint: z.string().min(1).max(256).optional().nullable()
    }).strict()).min(1, { message: "Reconcile items cannot be empty" }).max(5000, { message: "Cannot reconcile more than 5000 items in a single request" })
}).strict({
    message: "Unexpected field in reconcile request. Only 'items' array is permitted."
});

/**
 * Strict schema for Phase 27 / 29 semantic / keyword search request:
 * { query: string, limit?: number, imageId?: string }
 */
const searchRequestSchema = z.object({
    query: z.string().trim().min(1, { message: "Search query cannot be empty" }).max(200, { message: "Search query cannot exceed 200 characters" }),
    limit: z.number().int().min(1).max(100).optional().default(30),
    imageId: z.string().min(1).max(128).optional().nullable()
}).strict({
    message: "Unexpected field in search request. Only 'query', 'limit', and optional 'imageId' are permitted."
});

/**
 * Strict schema for Phase 27 / 29 AI Q&A RAG ask request:
 * { question: string, imageId?: string }
 */
const askRequestSchema = z.object({
    question: z.string().trim().min(1, { message: "Question cannot be empty" }).max(500, { message: "Question cannot exceed 500 characters" }),
    imageId: z.string().min(1).max(128).optional().nullable()
}).strict({
    message: "Unexpected field in ask request. Only 'question' and optional 'imageId' are permitted."
});

module.exports = {
    z,
    imageMetadataSchema,
    syncMetadataRequestSchema,
    singleImageRequestSchema,
    updateImageRequestSchema,
    tombstoneItemSchema,
    syncTombstonesRequestSchema,
    reconcileRequestSchema,
    searchRequestSchema,
    askRequestSchema
};
