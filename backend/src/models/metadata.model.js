const mongoose = require('mongoose');

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
        index: true,
        default: null
    },
    caption: {
        type: String,
        default: ''
    },
    keywords: [{
        type: String,
        trim: true
    }],
    status: {
        type: String,
        enum: ['available', 'missing', 'deleted'],
        default: 'available',
        index: true
    },
    captionModel: {
        type: String,
        default: null
    },
    captionVersion: {
        type: Number,
        default: 1
    },
    captionEngine: {
        type: String,
        enum: ['local', 'browser'],
        default: 'local'
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// Compound unique index ensuring each user can have one record per imageId
metadataSchema.index({ userId: 1, imageId: 1 }, { unique: true });

module.exports = mongoose.model('Metadata', metadataSchema);
