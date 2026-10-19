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
            indexingStatus: isUnchanged ? (existingRecord.indexingStatus || "pending") : "pending"
        };
    } catch (err) {
        console.warn('Could not read metadata for:', fileItem.name, err);
        return null;
    }
}

/**
 * Builds and reconciles image registry records for all image files in a folder.
 * Preserves permanent imageId even across renames or moves.
 *
 * Algorithm:
 * 1. Pass 1 - Fast Change Detection: 4-tuple match (folderId, path, size, lastModified)
 *    skips hashing for unchanged files.
 * 2. Pass 2 - Rename / Move Detection: Matches unmatched files by identical
 *    (size + lastModified) or contentHash, preserving imageId and updating path.
 * 3. Pass 3 - New Images: Assigns a newly minted crypto.randomUUID().
 * 4. Pass 4 - Missing Images: Preserves missing records with status: 'missing'.
 *
 * @param {Array} flatFiles
 * @param {string} folderId
 * @param {Array} existingRecords
 * @returns {Promise<Array>}
 */
export async function buildImageRegistryForFolder(flatFiles, folderId, existingRecords = []) {
    const imageFiles = flatFiles.filter(f => f.isImage && f.handle);
    const discoveredFiles = [];

    for (const fileItem of imageFiles) {
        try {
            const file = await fileItem.handle.getFile();
            discoveredFiles.push({
                fileItem,
                path: fileItem.path,
                name: fileItem.name,
                size: file.size,
                lastModified: file.lastModified
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

            // Phase 6: UNCHANGED ➔ DO NOT read bytes or compute hash. Reuse existing hash and status!
            let contentHash = existing.contentHash;
            if (!isIdentical) {
                // Size or lastModified changed: recompute hash for this specific modified file
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
                imageId: existing.imageId, // Stable identity preserved
                folderId,
                relativePath: disc.path,
                fileName: disc.name,
                size: disc.size,
                lastModified: disc.lastModified,
                contentHash,
                fingerprint,
                status: "available",
                indexingStatus: isIdentical ? (existing.indexingStatus || "pending") : "pending"
            });
        }
    }

    // Unmatched existing pool for Pass 2
    const remainingExisting = existingRecords.filter(r => !matchedExistingIds.has(r.imageId));

    // Pass 2: Rename / Move Detection (via cheap size+lastModified first, then SHA-256 only if needed)
    for (const disc of discoveredFiles) {
        if (matchedDiscoveredPaths.has(disc.path)) continue;

        // Try cheap metadata match first
        let renameMatchIndex = remainingExisting.findIndex(r =>
            !matchedExistingIds.has(r.imageId) &&
            r.size === disc.size &&
            r.lastModified === disc.lastModified
        );

        let discHash = null;
        // If not matched by metadata, hash this candidate to check against existing contentHashes
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
                imageId: existing.imageId, // Permanent imageId survives rename/relocation!
                folderId,
                relativePath: disc.path,    // Updated location
                fileName: disc.name,        // Updated filename
                size: disc.size,
                lastModified: disc.lastModified,
                contentHash: finalHash,
                fingerprint,
                status: "available",
                indexingStatus: existing.indexingStatus || "pending"
            });
        } else {
            // Unmatched file becomes a Pass 3 candidate with its computed hash
            disc._computedHash = discHash;
        }
    }

    // Pass 3: Brand new images (assign stable UUID and store computed SHA-256 hash & HMAC fingerprint)
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
            imageId: crypto.randomUUID(), // New stable identity
            folderId,
            relativePath: disc.path,
            fileName: disc.name,
            size: disc.size,
            lastModified: disc.lastModified,
            contentHash: hash,
            fingerprint,
            status: "available",
            indexingStatus: "pending"
        });
    }

    // Pass 4: Existing records no longer found on disk (mark missing, keep imageId)
    for (const existing of remainingExisting) {
        if (!matchedExistingIds.has(existing.imageId)) {
            results.push({
                ...existing,
                status: "missing"
            });
        }
    }

    return results;
}

/**
 * Phase 4, 5 & 6: Fast Change Detection & Global Multi-Folder Reconciliation.
 * Compares 4-tuple: (folderId, relativePath, size, lastModified).
 * If unchanged: ZERO hashing, ZERO byte reading, instantly reuses existing hash & status.
 * Hashes only when a file is new, modified, or a potential cross-folder move.
 *
 * @param {Array<Object>} globalSnapshot - Output from scanAllFolders
 * @param {Array<Object>} allExistingRecords - All records from the images store
 * @returns {Promise<Array<Object>>} Reconciled records to save in IndexedDB
 */
export async function reconcileGlobalSnapshot(globalSnapshot, allExistingRecords = []) {
    const matchedExistingIds = new Set();
    const matchedSnapshotKeys = new Set();
    const results = [];

    const getCompoundKey = (folderId, path) => `${folderId}:::${path}`;

    const existingByCompoundKey = new Map(
        allExistingRecords.map(r => [getCompoundKey(r.folderId, r.relativePath), r])
    );

    // Pass 1: Fast Change Detection — 4-tuple match (folderId, relativePath, size, lastModified)
    for (const item of globalSnapshot) {
        const key = getCompoundKey(item.folderId, item.relativePath);
        const existing = existingByCompoundKey.get(key);

        if (existing && !matchedExistingIds.has(existing.imageId)) {
            matchedExistingIds.add(existing.imageId);
            matchedSnapshotKeys.add(key);

            const isIdentical = item.size === existing.size && item.lastModified === existing.lastModified;

            // Phase 6: UNCHANGED ➔ DO NOT read bytes or compute hash. Re-use existing!
            let contentHash = existing.contentHash;
            if (!isIdentical) {
                // Modified file: compute hash only for this specific file
                contentHash = await computeFileHash(item.file);
            }

            const fingerprint = (isIdentical && existing.fingerprint)
                ? existing.fingerprint
                : (contentHash ? await computeFingerprint(contentHash) : null);

            results.push({
                imageId: existing.imageId, // Retain stable identity
                folderId: item.folderId,
                relativePath: item.relativePath,
                fileName: item.fileName,
                size: item.size,
                lastModified: item.lastModified,
                contentHash,
                fingerprint,
                status: "available",
                indexingStatus: isIdentical ? (existing.indexingStatus || "pending") : "pending"
            });
        }
    }

    // Unmatched pool for Pass 2 (Rename / Move / Cross-folder Move detection)
    const remainingExisting = allExistingRecords.filter(r => !matchedExistingIds.has(r.imageId));

    // Pass 2: Rename / Move / Cross-Folder Relocation match (cheap metadata first, hash only if needed)
    for (const item of globalSnapshot) {
        const key = getCompoundKey(item.folderId, item.relativePath);
        if (matchedSnapshotKeys.has(key)) continue;

        // Try cheap metadata match first
        let renameMatch = remainingExisting.find(r =>
            !matchedExistingIds.has(r.imageId) &&
            r.size === item.size &&
            r.lastModified === item.lastModified
        );

        let itemHash = item.contentHash;
        if (!renameMatch) {
            itemHash = await computeFileHash(item.file);
            item.contentHash = itemHash;
            if (itemHash) {
                renameMatch = remainingExisting.find(r =>
                    !matchedExistingIds.has(r.imageId) &&
                    r.contentHash &&
                    r.contentHash === itemHash
                );
            }
        }

        if (renameMatch) {
            matchedExistingIds.add(renameMatch.imageId);
            matchedSnapshotKeys.add(key);

            const finalHash = itemHash || renameMatch.contentHash;
            const fingerprint = renameMatch.fingerprint || (finalHash ? await computeFingerprint(finalHash) : null);

            results.push({
                imageId: renameMatch.imageId, // Permanent imageId survives even cross-folder moves!
                folderId: item.folderId,       // Updated folderId
                relativePath: item.relativePath,
                fileName: item.fileName,
                size: item.size,
                lastModified: item.lastModified,
                contentHash: finalHash,
                fingerprint,
                status: "available",
                indexingStatus: renameMatch.indexingStatus || "pending"
            });
        }
    }

    // Pass 3: Brand new images (compute hash & HMAC fingerprint)
    for (const item of globalSnapshot) {
        const key = getCompoundKey(item.folderId, item.relativePath);
        if (matchedSnapshotKeys.has(key)) continue;

        const hash = item.contentHash || await computeFileHash(item.file);
        const fingerprint = hash ? await computeFingerprint(hash) : null;

        results.push({
            imageId: crypto.randomUUID(), // Brand-new identity
            folderId: item.folderId,
            relativePath: item.relativePath,
            fileName: item.fileName,
            size: item.size,
            lastModified: item.lastModified,
            contentHash: hash,
            fingerprint,
            status: "available",
            indexingStatus: "pending"
        });
    }

    // Pass 4: Existing records not found in any connected folder (mark missing)
    for (const existing of remainingExisting) {
        if (!matchedExistingIds.has(existing.imageId)) {
            results.push({
                ...existing,
                status: "missing"
            });
        }
    }

    return results;
}
