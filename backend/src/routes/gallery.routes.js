const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/auth.middleware');
const enforceCloudPrivacyBoundary = require('../middlewares/privacyBoundary.middleware');
const validateRequest = require('../middlewares/validateRequest.middleware');
const {
    singleImageRequestSchema,
    updateImageRequestSchema,
    syncMetadataRequestSchema,
    syncTombstonesRequestSchema,
    reconcileRequestSchema,
    searchRequestSchema,
    askRequestSchema
} = require('../validators/metadata.schema');
const {
    createImageMetadata,
    updateImageMetadata,
    deleteImageMetadata,
    reconcileMetadata,
    searchMetadata,
    askMetadata,
    syncMetadata,
    syncTombstones,
    getCloudStatus
} = require('../controllers/gallery.controller');

// All gallery endpoints require verified JWT authentication (owner strictly req.user.id)
router.use(verifyToken);

// Single Image Metadata Endpoints (Phase 27)
router.post(
    '/images',
    enforceCloudPrivacyBoundary,
    validateRequest(singleImageRequestSchema),
    createImageMetadata
);

router.put(
    '/images/:imageId',
    enforceCloudPrivacyBoundary,
    validateRequest(updateImageRequestSchema),
    updateImageMetadata
);

router.delete(
    '/images/:imageId',
    deleteImageMetadata
);

// Semantic Operations & Synchronization Endpoints (Phase 27)
router.post(
    '/reconcile',
    enforceCloudPrivacyBoundary,
    validateRequest(reconcileRequestSchema),
    reconcileMetadata
);

router.post(
    '/search',
    enforceCloudPrivacyBoundary,
    validateRequest(searchRequestSchema),
    searchMetadata
);

router.post(
    '/ask',
    enforceCloudPrivacyBoundary,
    validateRequest(askRequestSchema),
    askMetadata
);

// Bulk Operations
router.post(
    '/sync',
    enforceCloudPrivacyBoundary,
    validateRequest(syncMetadataRequestSchema),
    syncMetadata
);

router.post(
    '/tombstones',
    enforceCloudPrivacyBoundary,
    validateRequest(syncTombstonesRequestSchema),
    syncTombstones
);

router.get(
    '/status',
    getCloudStatus
);

module.exports = router;
