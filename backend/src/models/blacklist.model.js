const mongoose = require('mongoose');

const blacklistSchema = new mongoose.Schema({
    token: {
        type: String,
        required: true,
        index: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: '7d' // Auto-expire after 7 days
    }
}, { timestamps: true });

const tokenBlacklistModel = mongoose.model('TokenBlacklist', blacklistSchema);
module.exports = tokenBlacklistModel;