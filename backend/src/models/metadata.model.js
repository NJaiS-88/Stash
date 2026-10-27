const mongoose = require('mongoose');

/**
 * Phase 28 — MongoDB Semantic Store
 *
 * ARCHITECTURAL SEPARATION OF RESPONSIBILITY:
 * ─────────────────────────────────────────────────────────────
 * • MongoDB knows:   "What does A101 represent?"
 *   - Semantic caption, vision AI model/engine, status, salted fingerprint
 *   - Completely BLIND to local paths, directories, filenames, or binaries
 *
 * • IndexedDB knows: "Where is A101 currently located?"
 *   - Local directory handles, relative file paths, filenames, on-device cache
 * ─────────────────────────────────────────────────────────────
 */

const FORBIDDEN_FILESYSTEM_FIELDS = Object.freeze([
    'path', 'filePath', 'absolutePath', 'relativePath',
    'fileName', 'folderId', 'folderName', 'handle',
    'directory', 'dirHandle', 'fileHandle', 'blob',
    'blobUrl', 'base64', 'binary', 'contentHash', 'rawHash'
]);

const metadataSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    imageId: {
        type: String,
        required: true,
        index: true
    },
    fingerprint: {
        type: String,
        required: true,
        index: true
    },
    caption: {
        type: String,
        required: true,
        trim: true
    },
    captionEngine: {
        type: String,
        enum: ['local', 'browser'],
        default: 'local'
    },
    captionModel: {
        type: String,
        default: null
    },
    captionVersion: {
        type: Number,
        default: 1
    },
    status: {
        type: String,
        enum: ['available', 'missing', 'deleted'],
        default: 'available',
        index: true
    },
    keywords: [{
        type: String,
        trim: true
    }]
}, {
    timestamps: true,
    strict: true // Strict schema rejection of unexpected fields
});

// Guardrail: Enforce zero filesystem leakage at the database layer
metadataSchema.pre('validate', function(next) {
    for (const field of FORBIDDEN_FILESYSTEM_FIELDS) {
        if (this.get(field) !== undefined) {
            return next(new Error(`[SemanticStore] Privacy Violation: MongoDB cannot store local filesystem location field '${field}'.`));
        }
    }
    next();
});

// Indexes for high-performance semantic retrieval
metadataSchema.index({ userId: 1, imageId: 1 }, { unique: true });
metadataSchema.index({ userId: 1, fingerprint: 1 });
metadataSchema.index({ userId: 1, status: 1 });
metadataSchema.index({ userId: 1, caption: 'text' });

/**
 * Phase 29 — Cloud Authorization / User Isolation Guardrail
 * Enforces fail-closed database query isolation.
 * Every query containing `imageId` MUST be paired with `userId: req.user.id`.
 * Never allows { imageId } alone.
 */
const QUERY_MIDDLEWARE_METHODS = [
    'find',
    'findOne',
    'findOneAndUpdate',
    'findOneAndDelete',
    'findOneAndReplace',
    'updateOne',
    'updateMany',
    'deleteOne',
    'deleteMany',
    'countDocuments',
    'estimatedDocumentCount'
];

metadataSchema.pre(QUERY_MIDDLEWARE_METHODS, function() {
    const filter = this.getQuery() || {};

    // Rule: Never { imageId } alone. Always { imageId, userId }
    if (filter.imageId !== undefined && !filter.userId) {
        throw new Error('[CloudAuthorization] Security Violation: Query specifies imageId without userId! Every query must pair { imageId, userId: req.user.id }.');
    }

    // Fail-closed guard: Reject any query lacking userId unless querying internal _id or explicit system bypass
    if (filter.userId === undefined && !filter._id && !this.options?._systemBypass) {
        throw new Error('[CloudAuthorization] Security Violation: Unscoped query on Metadata collection! userId is strictly required for user isolation.');
    }
});

module.exports = mongoose.model('Metadata', metadataSchema);
