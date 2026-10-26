/**
 * Stash Local AI Helper Client
 * Communicates with the native loopback helper service on 127.0.0.1:48124.
 * Runs Qwen3-VL-8B-Instruct with native GPU acceleration and zero cloud leakage.
 */

export const LOCAL_AI_DEFAULT_PORT = 48124;
export const LOCAL_AI_BASE_URL = `http://127.0.0.1:${LOCAL_AI_DEFAULT_PORT}`;
export const LOCAL_AI_SETUP_DOWNLOAD_URL = '/downloads/StashLocalAI-Setup.exe';

export const SEARCH_RETRIEVAL_PROMPT = `Describe this image in one factual, highly detailed sentence optimized for visual search retrieval.

Follow these rules:
1. Describe visible subjects, their specific actions or poses, the physical environment, lighting, colors, and layout.
2. If distinct text, signage, or titles are clearly visible, transcribe them.
3. Target style: "Three people standing on a sandy beach beside the ocean at sunset, with waves and an orange sky in the background."
4. Avoid vague output like: "People enjoying their vacation."
5. Avoid unsupported inference about:
- identity;
- relationships;
- exact location;
- event;
- emotions.
6. For now, caption is the primary semantic representation. Provide only the factual caption without conversational filler or bullet points.`;

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
 * 2.5-second timeout ensures health check never falsely fails under heavy CPU load.
 *
 * @returns {Promise<{ available: boolean, model?: string, device?: string, version?: string }>}
 */
export async function checkLocalAiHealth() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);

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
                device: data.device || 'cpu',
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
 * @param {Object} options - Custom generation options (including imageId)
 * @returns {Promise<{ imageId: string, caption: string, engine: string, model: string, captionVersion: number, keywords: Array<string> }>}
 */
export async function requestLocalCaption(fileBlob, fileName = 'image.jpg', options = {}) {
    const formData = new FormData();
    formData.append('image', fileBlob, fileName);
    formData.append('prompt', options.prompt || SEARCH_RETRIEVAL_PROMPT);
    formData.append('maxTokens', options.maxTokens || 85);
    if (options.imageId) {
        formData.append('imageId', options.imageId);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s timeout for CPU inference

    try {
        const res = await fetch(`${LOCAL_AI_BASE_URL}/caption`, {
            method: 'POST',
            body: formData,
            signal: controller.signal
        });
        clearTimeout(timeoutId);

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
            imageId: data.imageId || options.imageId || fileName,
            caption,
            engine: 'local',
            model: data.model || 'qwen3-vl-8b-instruct',
            captionVersion: data.captionVersion || 1,
            keywords,
            durationMs: data.durationMs || 0
        };
    } catch (err) {
        clearTimeout(timeoutId);
        throw err;
    }
}
