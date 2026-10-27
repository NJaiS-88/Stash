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
    askRequestSchema,
    availabilitySyncRequestSchema
} = require('../validators/metadata.schema');
const {
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
} = require('../controllers/gallery.controller');

// All gallery endpoints require verified JWT authentication (owner strictly req.user.id)
router.use(verifyToken);

// Single & List Image Metadata Endpoints (Phase 29: Strictly paired with req.user.id)
router.get(
    '/images',
    getAllImagesMetadata
);

router.get(
    '/images/:imageId',
    getImageMetadata
);

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

router.delete(
    '/images/:imageId/permanent',
    purgeImageMetadata
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
    '/semantic-search',
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

// Phase 30: Availability Synchronization
router.post(
    '/availability',
    enforceCloudPrivacyBoundary,
    validateRequest(availabilitySyncRequestSchema),
    syncAvailability
);

router.get(
    '/status',
    getCloudStatus
);

module.exports = router;
