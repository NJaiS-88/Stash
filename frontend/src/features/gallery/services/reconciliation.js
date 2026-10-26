import { computeFileHash, computeFingerprint } from './crypto';

/**
 * Creates a catalog registry record for an image file according to Phase 2/Phase 5/Phase 7 schema.
 * Computes or preserves contentHash and user-specific HMAC fingerprint without storing binary data.
 *
 * @param {Object} fileItem
 * @param {string} folderId
 * @param {Object|null} existingRecord
 * @returns {Promise<Object|null>}
 */
export async function createImageRecord(fileItem, folderId, existingRecord = null) {
    try {
        const file = await fileItem.handle.getFile();
        const isUnchanged = existingRecord &&
            file.size === existingRecord.size &&
            file.lastModified === existingRecord.lastModified;

        const contentHash = (isUnchanged && existingRecord.contentHash)
            ? existingRecord.contentHash
            : await computeFileHash(file);

        const fingerprint = (isUnchanged && existingRecord.fingerprint)
            ? existingRecord.fingerprint
            : (contentHash ? await computeFingerprint(contentHash) : null);

        return {
            imageId: existingRecord?.imageId || crypto.randomUUID(),
            folderId,
            relativePath: fileItem.path,
            fileName: fileItem.name,
            size: file.size,
            lastModified: file.lastModified,
            contentHash,
            fingerprint,
            status: "available",
            missingSince: null,
            // Phase 14: Decoupled Image Processing State
            captionStatus: isUnchanged ? (existingRecord?.captionStatus || (existingRecord?.caption ? "completed" : "pending")) : "pending",
            cloudIndexStatus: isUnchanged ? (existingRecord?.cloudIndexStatus || (existingRecord?.embedding ? "completed" : "pending")) : "pending",
            caption: isUnchanged ? (existingRecord?.caption || null) : null,
            captionEngine: isUnchanged ? (existingRecord?.captionEngine || null) : null,
            captionModel: isUnchanged ? (existingRecord?.captionModel || null) : null,
            captionVersion: isUnchanged ? (existingRecord?.captionVersion || null) : null,
            queuePriority: isUnchanged ? (existingRecord?.queuePriority || (existingRecord?.captionStatus === 'completed' ? null : 3)) : 1,
            retryCount: isUnchanged ? (existingRecord?.retryCount || 0) : 0,
            processingStartedAt: null,
            captionedAt: isUnchanged ? (existingRecord?.captionedAt || null) : null,
            indexedAt: isUnchanged ? (existingRecord?.indexedAt || null) : null,
            indexingStatus: isUnchanged ? (existingRecord?.indexingStatus || "pending") : "pending"
        };
    } catch (err) {
        console.warn('Could not read metadata for:', fileItem.name, err);
        return null;
    }
}

/**
 * Builds and reconciles image registry records for all image files in a single folder.
 * Preserves permanent imageId even across renames or moves.
 *
 * @param {Array} flatFiles
 * @param {string} folderId
 * @param {Array} existingRecords
 * @returns {Promise<Array>}
 */
const IMAGE_EXTENSIONS = new Set([
    'jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp', 'avif', 'heic', 'tiff'
]);

function checkIsImage(fileName) {
    if (!fileName) return false;
    const ext = fileName.split('.').pop()?.toLowerCase();
    return IMAGE_EXTENSIONS.has(ext);
}

export async function buildImageRegistryForFolder(flatFiles, folderId, existingRecords = []) {
    const imageFiles = flatFiles.filter(f => (f.isImage || checkIsImage(f.name)) && f.handle);
    const discoveredFiles = [];

    for (const fileItem of imageFiles) {
        try {
            let size = fileItem.size;
            let lastModified = fileItem.lastModified;
            if (size === undefined || lastModified === undefined) {
                const file = await fileItem.handle.getFile();
                size = file.size;
                lastModified = file.lastModified;
            }
            discoveredFiles.push({
                fileItem,
                path: fileItem.path,
                name: fileItem.name,
                size,
                lastModified
            });
        } catch (err) {
            console.warn('Could not read metadata for:', fileItem.name, err);
        }
    }

    const matchedExistingIds = new Set();
    const matchedDiscoveredPaths = new Set();
    const results = [];

    const existingByPath = new Map(existingRecords.map(r => [r.relativePath, r]));

    // Pass 1: Fast Change Detection — 4-tuple match (folderId, relativePath, size, lastModified)
    for (const disc of discoveredFiles) {
        const existing = existingByPath.get(disc.path);
        if (existing && !matchedExistingIds.has(existing.imageId)) {
            matchedExistingIds.add(existing.imageId);
            matchedDiscoveredPaths.add(disc.path);

            const isIdentical = disc.size === existing.size && disc.lastModified === existing.lastModified;

            let contentHash = existing.contentHash;
            if (!isIdentical) {
                try {
                    const file = await disc.fileItem.handle.getFile();
                    contentHash = await computeFileHash(file);
                } catch {
                    contentHash = null;
                }
            }

            const fingerprint = (isIdentical && existing.fingerprint)
                ? existing.fingerprint
                : (contentHash ? await computeFingerprint(contentHash) : null);

            results.push({
                ...existing,
                imageId: existing.imageId,
                folderId,
                relativePath: disc.path,
                fileName: disc.name,
                size: disc.size,
                lastModified: disc.lastModified,
                contentHash,
                fingerprint,
                status: "available",
                missingSince: null,
                // Phase 14: Decoupled Image Processing State
                captionStatus: isIdentical ? (existing.captionStatus || (existing.caption ? "completed" : "pending")) : "pending",
                cloudIndexStatus: isIdentical ? (existing.cloudIndexStatus || (existing.embedding ? "completed" : "pending")) : "pending",
                caption: isIdentical ? (existing.caption || null) : null,
                captionEngine: isIdentical ? (existing.captionEngine || null) : null,
                captionModel: isIdentical ? (existing.captionModel || null) : null,
                captionVersion: isIdentical ? (existing.captionVersion || null) : null,
                queuePriority: isIdentical ? (existing.queuePriority || (existing.captionStatus === 'completed' ? null : 3)) : 1,
                retryCount: isIdentical ? (existing.retryCount || 0) : 0,
                processingStartedAt: null,
                captionedAt: isIdentical ? (existing.captionedAt || null) : null,
                indexedAt: isIdentical ? (existing.indexedAt || null) : null,
                indexingStatus: isIdentical ? (existing.indexingStatus || "pending") : "pending"
            });
        }
    }

    // Unmatched pool for Pass 2 (Rename / Move detection)
    const remainingExisting = existingRecords.filter(r => !matchedExistingIds.has(r.imageId));

    for (const disc of discoveredFiles) {
        if (matchedDiscoveredPaths.has(disc.path)) continue;

        let renameMatchIndex = remainingExisting.findIndex(r =>
            !matchedExistingIds.has(r.imageId) &&
            r.size === disc.size &&
            r.lastModified === disc.lastModified
        );

        let discHash = null;
        if (renameMatchIndex === -1) {
            try {
                const file = await disc.fileItem.handle.getFile();
                discHash = await computeFileHash(file);
            } catch {
                discHash = null;
            }

            if (discHash) {
                renameMatchIndex = remainingExisting.findIndex(r =>
                    !matchedExistingIds.has(r.imageId) &&
                    r.contentHash &&
                    r.contentHash === discHash
                );
            }
        }

        if (renameMatchIndex !== -1) {
            const existing = remainingExisting[renameMatchIndex];
            matchedExistingIds.add(existing.imageId);
            matchedDiscoveredPaths.add(disc.path);

            const finalHash = discHash || existing.contentHash;
            const fingerprint = existing.fingerprint || (finalHash ? await computeFingerprint(finalHash) : null);

            results.push({
                ...existing,
                imageId: existing.imageId,
                folderId,
                relativePath: disc.path,
                fileName: disc.name,
                size: disc.size,
                lastModified: disc.lastModified,
                contentHash: finalHash,
                fingerprint,
                status: "available",
                missingSince: null,
                // Phase 14: Decoupled Image Processing State
                captionStatus: existing.captionStatus || (existing.caption ? "completed" : "pending"),
                cloudIndexStatus: existing.cloudIndexStatus || (existing.embedding ? "completed" : "pending"),
                caption: existing.caption || null,
                captionEngine: existing.captionEngine || null,
                captionModel: existing.captionModel || null,
                captionVersion: existing.captionVersion || null,
                queuePriority: existing.queuePriority || (existing.captionStatus === 'completed' ? null : 3),
                retryCount: existing.retryCount || 0,
                processingStartedAt: null,
                captionedAt: existing.captionedAt || null,
                indexedAt: existing.indexedAt || null,
                indexingStatus: existing.indexingStatus || "pending"
            });
        } else {
            disc._computedHash = discHash;
        }
    }

    // Pass 3: Brand new images
    for (const disc of discoveredFiles) {
        if (matchedDiscoveredPaths.has(disc.path)) continue;

        let hash = disc._computedHash;
        if (!hash) {
            try {
                const file = await disc.fileItem.handle.getFile();
                hash = await computeFileHash(file);
            } catch {
                hash = null;
            }
        }

        const fingerprint = hash ? await computeFingerprint(hash) : null;

        results.push({
            imageId: crypto.randomUUID(),
            folderId,
            relativePath: disc.path,
            fileName: disc.name,
            size: disc.size,
            lastModified: disc.lastModified,
            contentHash: hash,
            fingerprint,
            status: "available",
            missingSince: null,
            // Phase 14: Decoupled Image Processing State
            captionStatus: "pending",
            cloudIndexStatus: "pending",
            caption: null,
            captionEngine: null,
            captionModel: null,
            captionVersion: null,
            queuePriority: 1, // Priority 1: New image
            retryCount: 0,
            processingStartedAt: null,
            captionedAt: null,
            indexedAt: null,
            indexingStatus: "pending"
        });
    }

    // Pass 4: Missing images
    // CRITICAL FIX: Only mark an image as missing if it previously belonged to THIS folder!
    // Never mark photos from other connected folders as missing during a single folder scan.
    for (const existing of remainingExisting) {
        if (!matchedExistingIds.has(existing.imageId) && existing.folderId === folderId) {
            results.push({
                ...existing,
                status: "missing",
                missingSince: existing.missingSince || Date.now()
            });
        }
    }

    return results;
}

/**
 * Phase 8 & 9: Formal Reconciliation Engine with Soft Lifecycle & Missing Detection.
 * Compares current filesystem snapshot against previous IndexedDB state.
 *
 * Scenarios handled:
 * - Scenario A: UNCHANGED (same folderId, relativePath, size, lastModified) ➔ Zero DB write
 * - Scenario B: RENAMED (same folderId, new fileName, same hash) ➔ Keeps imageId, updates name
 * - Scenario C: MOVED WITHIN FOLDER (same folderId, new relativePath, same hash) ➔ Keeps imageId, updates path
 * - Scenario D: MOVED BETWEEN ATTACHED FOLDERS (new folderId, new relativePath, same hash) ➔ Keeps imageId, updates folderId
 * - Scenario E: RESTORED (previously missing image rediscovered) ➔ Restores status: "available", clears missingSince
 * - MODIFIED: Same location, altered size/lastModified ➔ Rehashes & marks pending
 * - NEW: Newly added file ➔ Mints permanent imageId
 * - MISSING: Record not found in ANY attached folder ➔ Marks status: "missing", preserves imageId and metadata
 *
 * @param {Array<Object>} globalSnapshot - Output from scanAllFolders
 * @param {Array<Object>} allExistingRecords - All records from IndexedDB images store
 * @returns {Promise<{ allRecords: Array, toUpsert: Array, summary: Object }>}
 */
export async function reconcileGlobalSnapshot(globalSnapshot, allExistingRecords = []) {
    const matchedExistingIds = new Set();
    const matchedSnapshotIndices = new Set();

    // Classification buckets
    const unchanged = [];
    const modified = [];
    const renamed = [];
    const movedWithinFolder = [];
    const movedBetweenFolders = [];
    const restored = [];
    const created = [];
    const missing = [];
    const newlyMissing = [];
    const alreadyMissing = [];

    const getCompoundKey = (folderId, path) => `${folderId}:::${path}`;

    const existingByCompoundKey = new Map(
        allExistingRecords.map(r => [getCompoundKey(r.folderId, r.relativePath), r])
    );

    // =========================================================================
    // PASS 1: Exact Location Match (Scenario A: Unchanged, Restored, or Modified)
    // =========================================================================
    for (let i = 0; i < globalSnapshot.length; i++) {
        const item = globalSnapshot[i];
        const key = getCompoundKey(item.folderId, item.relativePath);
        const existing = existingByCompoundKey.get(key);

        if (existing && !matchedExistingIds.has(existing.imageId)) {
            matchedExistingIds.add(existing.imageId);
            matchedSnapshotIndices.add(i);

            const isIdentical = item.size === existing.size && item.lastModified === existing.lastModified;

            if (isIdentical && existing.status === 'available') {
                // SCENARIO A — UNCHANGED
                // Zero byte read, Zero hashing, Zero DB write needed!
                unchanged.push(existing);
            } else if (isIdentical && existing.status === 'missing') {
                // SCENARIO E — RESTORED: Previously missing image reappeared at its original location!
                // Zero AI re-computation: all caption, keywords, embedding and indexingStatus preserved
                restored.push({
                    ...existing,
                    status: "available",
                    missingSince: null,
                    captionStatus: existing.captionStatus || (existing.caption ? "completed" : "pending"),
                    cloudIndexStatus: existing.cloudIndexStatus || (existing.embedding ? "completed" : "pending"),
                    caption: existing.caption || null,
                    captionEngine: existing.captionEngine || null,
                    captionModel: existing.captionModel || null,
                    captionVersion: existing.captionVersion || null,
                    queuePriority: existing.queuePriority || (existing.captionStatus === 'completed' ? null : 3),
                    retryCount: existing.retryCount || 0,
                    processingStartedAt: null,
                    captionedAt: existing.captionedAt || null,
                    indexedAt: existing.indexedAt || null,
                    indexingStatus: existing.indexingStatus || "pending"
                });
            } else {
                // MODIFIED: Same location, but file contents or timestamp changed
                const contentHash = await computeFileHash(item.file);
                const fingerprint = contentHash ? await computeFingerprint(contentHash) : null;

                modified.push({
                    imageId: existing.imageId, // Keep permanent identity
                    folderId: item.folderId,
                    relativePath: item.relativePath,
                    fileName: item.fileName,
                    size: item.size,
                    lastModified: item.lastModified,
                    contentHash,
                    fingerprint,
                    status: "available",
                    missingSince: null,
                    // Phase 14: Content changed, reset caption and cloud index stages
                    captionStatus: "pending",
                    cloudIndexStatus: "pending",
                    caption: null,
                    captionEngine: null,
                    captionModel: null,
                    captionVersion: null,
                    queuePriority: 2, // Priority 2: Modified image
                    retryCount: 0,
                    processingStartedAt: null,
                    captionedAt: null,
                    indexedAt: null,
                    indexingStatus: "pending" // Needs AI re-indexing
                });
            }
        }
    }

    // Pool of existing records that were not matched at their previous path
    const remainingExisting = allExistingRecords.filter(r => !matchedExistingIds.has(r.imageId));

    // =========================================================================
    // PASS 2: Rename & Move Detection (Scenarios B, C, D, and Restorations)
    // =========================================================================
    for (let i = 0; i < globalSnapshot.length; i++) {
        if (matchedSnapshotIndices.has(i)) continue;
        const item = globalSnapshot[i];

        // 1. Try cheap metadata match first
        let match = remainingExisting.find(r =>
            !matchedExistingIds.has(r.imageId) &&
            r.size === item.size &&
            r.lastModified === item.lastModified
        );

        // 2. If no cheap stat match, compute hash on this candidate to verify against existing hashes
        let itemHash = item.contentHash;
        if (!match) {
            itemHash = await computeFileHash(item.file);
            item.contentHash = itemHash;
            if (itemHash) {
                match = remainingExisting.find(r =>
                    !matchedExistingIds.has(r.imageId) &&
                    r.contentHash &&
                    r.contentHash === itemHash
                );
            }
        }

        if (match) {
            matchedExistingIds.add(match.imageId);
            matchedSnapshotIndices.add(i);

            const finalHash = itemHash || match.contentHash;
            const fingerprint = match.fingerprint || (finalHash ? await computeFingerprint(finalHash) : null);
            const wasMissing = match.status === 'missing';

            // Phase 11: Preserve all AI semantic metadata (...match) & keep indexingStatus
            const updatedRecord = {
                ...match,
                imageId: match.imageId, // Permanent imageId survives!
                folderId: item.folderId, // May have moved to another connected folder
                relativePath: item.relativePath,
                fileName: item.fileName,
                size: item.size,
                lastModified: item.lastModified,
                contentHash: finalHash,
                fingerprint,
                status: "available",
                missingSince: null,
                captionStatus: match.captionStatus || (match.caption ? "completed" : "pending"),
                cloudIndexStatus: match.cloudIndexStatus || (match.embedding ? "completed" : "pending"),
                caption: match.caption || null,
                captionEngine: match.captionEngine || null,
                captionModel: match.captionModel || null,
                captionVersion: match.captionVersion || null,
                queuePriority: match.queuePriority || (match.captionStatus === 'completed' ? null : 3),
                retryCount: match.retryCount || 0,
                processingStartedAt: null,
                captionedAt: match.captionedAt || null,
                indexedAt: match.indexedAt || null,
                indexingStatus: match.indexingStatus || "pending"
            };

            // Classify scenario
            if (wasMissing) {
                // SCENARIO E: Previously missing image rediscovered in an attached folder
                restored.push(updatedRecord);
            } else if (item.folderId !== match.folderId) {
                // SCENARIO D: Moved between attached folders (e.g. Trips -> Favorites)
                movedBetweenFolders.push(updatedRecord);
            } else if (item.fileName !== match.fileName) {
                // SCENARIO B: Renamed (e.g. beach.jpg -> goa_sunset.jpg)
                renamed.push(updatedRecord);
            } else {
                // SCENARIO C: Moved within folder (e.g. Goa/beach.jpg -> Favorites/beach.jpg)
                movedWithinFolder.push(updatedRecord);
            }
        }
    }

    // =========================================================================
    // PASS 3: Newly Added Files
    // =========================================================================
    for (let i = 0; i < globalSnapshot.length; i++) {
        if (matchedSnapshotIndices.has(i)) continue;
        const item = globalSnapshot[i];

        const hash = item.contentHash || await computeFileHash(item.file);
        const fingerprint = hash ? await computeFingerprint(hash) : null;

        // Check if ANY existing image in the database already has this exact hash and is captioned!
        const existingCaptioned = allExistingRecords.find(r =>
            r.contentHash && r.contentHash === hash && r.caption && r.caption.trim().length > 0
        ) || created.find(r =>
            r.contentHash && r.contentHash === hash && r.caption && r.caption.trim().length > 0
        );

        if (existingCaptioned) {
            // Instant zero-compute reuse: identical photo already has an AI caption!
            created.push({
                imageId: crypto.randomUUID(),
                folderId: item.folderId,
                relativePath: item.relativePath,
                fileName: item.fileName,
                size: item.size,
                lastModified: item.lastModified,
                contentHash: hash,
                fingerprint,
                status: "available",
                missingSince: null,
                caption: existingCaptioned.caption,
                keywords: existingCaptioned.keywords || [],
                captionEngine: existingCaptioned.captionEngine || existingCaptioned.engine || 'local',
                captionModel: existingCaptioned.captionModel || existingCaptioned.model || 'qwen3-vl-8b-instruct',
                captionVersion: existingCaptioned.captionVersion || 1,
                captionStatus: "completed",
                cloudIndexStatus: "pending",
                queuePriority: null,
                retryCount: 0,
                processingStartedAt: null,
                captionedAt: Date.now(),
                indexedAt: null,
                indexingStatus: "indexed"
            });
        } else {
            created.push({
                imageId: crypto.randomUUID(), // Brand-new identity
                folderId: item.folderId,
                relativePath: item.relativePath,
                fileName: item.fileName,
                size: item.size,
                lastModified: item.lastModified,
                contentHash: hash,
                fingerprint,
                status: "available",
                missingSince: null,
                captionStatus: "pending",
                cloudIndexStatus: "pending",
                caption: null,
                captionEngine: null,
                captionModel: null,
                captionVersion: null,
                queuePriority: 1, // Priority 1: New image
                retryCount: 0,
                processingStartedAt: null,
                captionedAt: null,
                indexedAt: null,
                indexingStatus: "pending"
            });
        }
    }

    // =========================================================================
    // PASS 4: Missing Files (Unlocated records across all connected folders)
    // Phase 12 Protection: Shield records of unavailable folders (unplugged drives)
    // from being erroneously marked as missing!
    // =========================================================================
    const unavailableFolderIds = new Set(globalSnapshot.unavailableFolderIds || []);
    const shieldedFromMissing = [];

    for (const existing of remainingExisting) {
        if (!matchedExistingIds.has(existing.imageId)) {
            // If the parent folder is unavailable (e.g. drive unplugged, permission needed),
            // do NOT flag these photos as missing! Their files are safe on the unplugged drive.
            if (unavailableFolderIds.has(existing.folderId)) {
                shieldedFromMissing.push(existing);
                continue;
            }

            const isAlreadyMissing = existing.status === 'missing';
            const missingRecord = {
                ...existing,
                status: "missing",
                missingSince: existing.missingSince || Date.now()
            };

            missing.push(missingRecord);

            if (isAlreadyMissing) {
                // Already marked missing previously — skip redundant DB write!
                alreadyMissing.push(missingRecord);
            } else {
                // Just went missing in this scan (e.g. moved outside attached folders)
                newlyMissing.push(missingRecord);
            }
        }
    }

    // Minimal records to write to IndexedDB (skips unchanged AND already-missing records!)
    const toUpsert = [
        ...modified,
        ...restored,
        ...renamed,
        ...movedWithinFolder,
        ...movedBetweenFolders,
        ...created,
        ...newlyMissing
    ];

    // Complete unified list for UI display
    const allRecords = [
        ...unchanged,
        ...shieldedFromMissing,
        ...alreadyMissing,
        ...toUpsert
    ];

    const summary = {
        total: allRecords.length,
        unchanged: unchanged.length,
        modified: modified.length,
        renamed: renamed.length,
        movedWithinFolder: movedWithinFolder.length,
        movedBetweenFolders: movedBetweenFolders.length,
        created: created.length,
        missing: missing.length,
        newlyMissing: newlyMissing.length,
        restored: restored.length,
        shieldedFromMissing: shieldedFromMissing.length,
        upsertCount: toUpsert.length
    };

    return {
        allRecords,
        toUpsert,
        summary
    };
}
