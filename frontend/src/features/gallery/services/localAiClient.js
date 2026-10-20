/**
 * Stash Local AI Helper Client
 * Communicates with the native loopback helper service on 127.0.0.1:48124.
 * Runs Qwen3-VL-8B-Instruct with native GPU acceleration and zero cloud leakage.
 */

export const LOCAL_AI_DEFAULT_PORT = 48124;
export const LOCAL_AI_BASE_URL = `http://127.0.0.1:${LOCAL_AI_DEFAULT_PORT}`;
export const LOCAL_AI_SETUP_DOWNLOAD_URL = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? '/downloads/StashLocalAI-Setup.exe'
    : 'https://github.com/NJaiS-88/Stash/releases/latest/download/StashLocalAI-Setup.exe';

export const SEARCH_RETRIEVAL_PROMPT = `Generate one concise, highly detailed factual caption for this image optimized for search retrieval.

Describe all visible information accurately:
- Image type & subjects: people, animals, landscapes, cityscapes, food, vehicles, objects, art, screenshots, documents, or UI.
- Visible text/titles: transcribe key legible text, titles, brand names, or error messages (for screenshots, receipts, signs, or slides).
- Context & attributes: activities, scene/setting, colors, lighting, materials, and layout.

Do not speculate on hidden identities, unverified relationships, or unseen facts. Return only the caption.`;

const STOP_WORDS = new Set([
    'a', 'an', 'the', 'in', 'on', 'at', 'is', 'are', 'was', 'were', 'it', 'its',
    'of', 'for', 'to', 'from', 'with', 'by', 'and', 'or', 'that', 'this', 'there',
    'image', 'picture', 'photo', 'photograph', 'close', 'up', 'view', 'background'
]);

export function extractKeywords(caption) {
    if (!caption || typeof caption !== 'string') return [];
    const cleaned = caption.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
    const tokens = cleaned.split(/\s+/).filter(t => t.length > 2 && !STOP_WORDS.has(t));
    return Array.from(new Set(tokens));
}

/**
 * Checks if the Stash Local AI Helper is running and healthy on 127.0.0.1.
 * Fast 1-second timeout prevents any stalling if the helper is not installed.
 *
 * @returns {Promise<{ available: boolean, model?: string, device?: string, version?: string }>}
 */
export async function checkLocalAiHealth() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1200);

        const res = await fetch(`${LOCAL_AI_BASE_URL}/health`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (res.ok) {
            const data = await res.json();
            return {
                connected: true,
                available: Boolean(data.modelReady && data.status === 'ready'),
                modelReady: Boolean(data.modelReady),
                status: data.status,
                model: data.model || 'qwen3-vl-8b-instruct',
                device: data.device || 'gpu',
                version: data.version || '1.0.0'
            };
        }
        return { connected: false, available: false, modelReady: false };
    } catch {
        return { connected: false, available: false, modelReady: false };
    }
}

/**
 * Fetches safe telemetry and download progress from the Local AI Helper.
 * @returns {Promise<Object|null>}
 */
export async function getLocalAiStatus() {
    try {
        const res = await fetch(`${LOCAL_AI_BASE_URL}/status`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        if (res.ok) {
            return await res.json();
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Sends an image to the local helper for Qwen3-VL-8B-Instruct inference.
 * The photo never leaves 127.0.0.1.
 *
 * @param {Blob|File} fileBlob - Image file binary
 * @param {string} fileName - Original file name
 * @param {Object} options - Custom generation options
 * @returns {Promise<{ caption: string, keywords: Array<string>, model: string, engine: string }>}
 */
export async function requestLocalCaption(fileBlob, fileName = 'image.jpg', options = {}) {
    const formData = new FormData();
    formData.append('image', fileBlob, fileName);
    formData.append('prompt', options.prompt || SEARCH_RETRIEVAL_PROMPT);
    formData.append('maxTokens', options.maxTokens || 120);

    const res = await fetch(`${LOCAL_AI_BASE_URL}/caption`, {
        method: 'POST',
        body: formData
    });

    if (!res.ok) {
        const errText = await res.text().catch(() => 'Unknown error');
        throw new Error(`Local AI Helper error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const caption = (data.caption || '').trim();
    const keywords = data.keywords && data.keywords.length > 0
        ? data.keywords
        : extractKeywords(caption);

    return {
        caption,
        keywords,
        model: data.model || 'qwen3-vl-8b-instruct',
        engine: 'local',
        durationMs: data.durationMs || 0
    };
}
