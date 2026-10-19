/**
 * Cryptographic service for Stash (Phase 5 & Phase 7).
 * Handles hardware-accelerated SHA-256 content hashing and
 * per-user HMAC-SHA256 cloud-safe fingerprinting via native Web Crypto API.
 */

/**
 * Retrieves the active per-user fingerprint secret key.
 * Prefers the logged-in user's fingerprintSecret from localStorage,
 * falling back to a persistent local secret for guest/offline operation.
 *
 * @returns {string} Hex-encoded 256-bit secret key
 */
export function getFingerprintSecret() {
    const userSecret = localStorage.getItem('stash_user_fingerprint_secret');
    if (userSecret) return userSecret;

    const LOCAL_KEY = 'stash_local_fingerprint_secret';
    let localSecret = localStorage.getItem(LOCAL_KEY);
    if (!localSecret) {
        const randomBytes = crypto.getRandomValues(new Uint8Array(32));
        localSecret = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
        localStorage.setItem(LOCAL_KEY, localSecret);
    }
    return localSecret;
}

/**
 * Computes the cryptographic SHA-256 content hash of a file's raw bytes in RAM.
 * Uses browser native Web Crypto API (crypto.subtle).
 *
 * @param {File} file - Native browser File object
 * @returns {Promise<string|null>} Hexadecimal SHA-256 hash string
 */
export async function computeFileHash(file) {
    if (!file) return null;
    try {
        const arrayBuffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (err) {
        console.warn('Could not compute SHA-256 for file:', file?.name, err);
        return null;
    }
}

/**
 * Phase 7: Computes a user-specific HMAC-SHA256 fingerprint from a contentHash.
 *
 *   contentHash (raw SHA-256)
 *          │
 *          ▼
 *   HMAC-SHA256(userSpecificKey, contentHash)
 *          │
 *          ▼
 *     fingerprint (cloud-safe reconciliation identity)
 *
 * @param {string} contentHash - Hexadecimal SHA-256 content hash
 * @param {string} [customSecret] - Optional specific secret key
 * @returns {Promise<string|null>} Hexadecimal HMAC-SHA256 fingerprint
 */
export async function computeFingerprint(contentHash, customSecret = null) {
    if (!contentHash) return null;
    try {
        const secret = customSecret || getFingerprintSecret();
        const encoder = new TextEncoder();
        const keyData = encoder.encode(secret);

        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyData,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );

        const messageData = encoder.encode(contentHash);
        const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
        const hashArray = Array.from(new Uint8Array(signature));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (err) {
        console.warn('Could not compute HMAC fingerprint:', err);
        return null;
    }
}
