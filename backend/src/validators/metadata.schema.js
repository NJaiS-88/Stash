/**
 * Phase 26 — Strict Zod Metadata Validation Schemas
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
    imageId: z.string().uuid({
        message: "imageId must be a valid UUID string"
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
 * Strict schema for a single purged image tombstone item.
 */
const tombstoneItemSchema = z.object({
    imageId: z.string().uuid({
        message: "imageId must be a valid UUID string"
    }),
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

module.exports = {
    z,
    imageMetadataSchema,
    syncMetadataRequestSchema,
    tombstoneItemSchema,
    syncTombstonesRequestSchema
};
