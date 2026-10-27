const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/auth.middleware');
const enforceCloudPrivacyBoundary = require('../middlewares/privacyBoundary.middleware');
const validateRequest = require('../middlewares/validateRequest.middleware');
const {
    syncMetadataRequestSchema,
    syncTombstonesRequestSchema
} = require('../validators/metadata.schema');
const {
    syncMetadata,
    syncTombstones,
    getCloudStatus
} = require('../controllers/gallery.controller');

// Multi-tier security: Authentication -> Privacy Boundary Inspector -> Strict Zod Validation -> Explicit DB Construction
router.post(
    '/sync',
    verifyToken,
    enforceCloudPrivacyBoundary,
    validateRequest(syncMetadataRequestSchema),
    syncMetadata
);

router.post(
    '/tombstones',
    verifyToken,
    enforceCloudPrivacyBoundary,
    validateRequest(syncTombstonesRequestSchema),
    syncTombstones
);

router.get(
    '/status',
    verifyToken,
    getCloudStatus
);

module.exports = router;
