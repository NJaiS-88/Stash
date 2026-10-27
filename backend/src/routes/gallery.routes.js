const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/auth.middleware');
const enforceCloudPrivacyBoundary = require('../middlewares/privacyBoundary.middleware');
const {
    syncMetadata,
    syncTombstones,
    getCloudStatus
} = require('../controllers/gallery.controller');

// Enforce authentication & Cloud Privacy Boundary on all sync endpoints
router.post('/sync', verifyToken, enforceCloudPrivacyBoundary, syncMetadata);
router.post('/tombstones', verifyToken, enforceCloudPrivacyBoundary, syncTombstones);
router.get('/status', verifyToken, getCloudStatus);

module.exports = router;
