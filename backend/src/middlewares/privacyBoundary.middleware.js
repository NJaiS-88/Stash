/**
 * Phase 25 — Backend Cloud Privacy Boundary Middleware
 *
 * Strictly enforces that incoming requests contain ONLY allowed semantic metadata.
 * Instantly rejects any request with HTTP 400 Bad Request if it detects:
 * - Image binaries, Blobs, or Base64 data
 * - Thumbnails
 * - Filesystem paths (absolute, relative, or Windows drive paths)
 * - File names or folder handles
 * - Raw content hashes
 */

const ALLOWED_CLOUD_FIELDS = new Set([
    'imageId',
    'fingerprint',
    'caption',
    'keywords',
    'status',
    'captionModel',
    'captionVersion',
    'captionEngine'
]);

const FORBIDDEN_KEYS = new Set([
    'file',
    'blob',
    'thumbnail',
    'base64',
    'data',
    'path',
    'relativePath',
    'absolutePath',
    'handle',
    'contentHash',
    'fileName',
    'folderId',
    'folderName',
    'size',
    'lastModified',
    'url',
    'blobUrl',
    'buffer',
    'arrayBuffer'
]);

function isBase64Data(val) {
    if (typeof val !== 'string') return false;
    if (val.startsWith('data:image/') || val.startsWith('data:application/')) return true;
    if (val.length > 256 && /^[A-Za-z0-9+/=]{256,}$/.test(val)) return true;
    return false;
}

function isLocalPath(val) {
    if (typeof val !== 'string') return false;
    if (/^[a-zA-Z]:[/\\]/.test(val)) return true; // Windows drive path
    if (val.startsWith('/') && !val.startsWith('//')) return true; // Unix root path
    if (val.includes('\\')) return true;
    if (/\.(jpg|jpeg|png|webp|gif|avif|heic|tiff|bmp|svg)$/i.test(val)) return true;
    return false;
}

function validateSingleItem(item, index) {
    const violations = [];

    if (!item || typeof item !== 'object') {
        violations.push(`Item at index ${index} must be an object`);
        return violations;
    }

    // Check for unallowlisted keys
    for (const key of Object.keys(item)) {
        if (!ALLOWED_CLOUD_FIELDS.has(key)) {
            violations.push(`Item ${index}: Unallowed property '${key}' detected`);
        }
        if (FORBIDDEN_KEYS.has(key)) {
            violations.push(`Item ${index}: Forbidden property '${key}' detected`);
        }
    }

    // Inspect values
    for (const [key, value] of Object.entries(item)) {
        if (isBase64Data(value)) {
            violations.push(`Item ${index}: Base64 binary data detected in '${key}'`);
        }
        if (typeof value === 'string' && value.toLowerCase().startsWith('blob:')) {
            violations.push(`Item ${index}: Blob URL detected in '${key}'`);
        }
        if (key !== 'caption' && isLocalPath(value)) {
            violations.push(`Item ${index}: Local filesystem path detected in '${key}'`);
        }
    }

    // Ensure imageId exists
    if (!item.imageId || typeof item.imageId !== 'string') {
        violations.push(`Item ${index}: Missing or invalid imageId`);
    }

    return violations;
}

const enforceCloudPrivacyBoundary = (req, res, next) => {
    const items = req.body.items || req.body.tombstones || (req.body.item ? [req.body.item] : null);

    if (!items || !Array.isArray(items)) {
        return res.status(400).json({
            message: "Privacy Boundary Error: Request body must contain an 'items' or 'tombstones' array."
        });
    }

    if (items.length > 500) {
        return res.status(400).json({
            message: "Privacy Boundary Error: Batch size exceeds 500 items."
        });
    }

    const allViolations = [];
    for (let i = 0; i < items.length; i++) {
        const violations = validateSingleItem(items[i], i);
        if (violations.length > 0) {
            allViolations.push(...violations);
        }
    }

    if (allViolations.length > 0) {
        console.warn(`[CloudPrivacyBoundary] 🛑 Rejected payload: ${allViolations.length} violation(s).`);
        return res.status(400).json({
            error: "Privacy Boundary Violation",
            message: "Incoming payload violates device privacy boundaries. Private files, paths, or unallowlisted data detected.",
            violations: allViolations.slice(0, 10)
        });
    }

    next();
};

module.exports = enforceCloudPrivacyBoundary;
