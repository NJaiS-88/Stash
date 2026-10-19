/**
 * Phase 14: Browser Vision Model (100% Client-Side Privacy Engine).
 * Runs lightweight vision models directly inside the browser using WebAssembly.
 * Local image bytes and pixels NEVER leave the client or touch Express.
 */

let captionPipeline = null;
let initPromise = null;

const STOP_WORDS = new Set([
    'a', 'an', 'the', 'in', 'on', 'at', 'is', 'are', 'was', 'were', 'it', 'its',
    'of', 'for', 'to', 'from', 'with', 'by', 'and', 'or', 'that', 'this', 'there',
    'image', 'picture', 'photo', 'photograph', 'close', 'up', 'view', 'background'
]);

/**
 * Dynamically imports Transformers.js at runtime using browser ESM.
 * Uses /* @vite-ignore *\/ to prevent Vite from failing static import analysis.
 */
async function loadTransformersModule() {
    const cdnUrl = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';
    return await import(/* @vite-ignore */ cdnUrl);
}

/**
 * Initializes and caches the client-side vision captioning pipeline.
 * Model weights are cached locally in the browser's CacheStorage.
 *
 * @param {Function|null} onProgress - Progress callback for model download
 * @returns {Promise<Function>} Captioning pipeline
 */
export async function getVisionPipeline(onProgress = null) {
    if (captionPipeline) return captionPipeline;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        try {
            const { pipeline, env } = await loadTransformersModule();

            // Configure browser cache & remote fetch
            if (env) {
                env.allowLocalModels = false;
                env.useBrowserCache = true;
            }

            // Lightweight, quantized in-browser vision captioner (~60MB, fast inference)
            captionPipeline = await pipeline('image-to-text', 'Xenova/vit-gpt2-image-captioning', {
                progress_callback: onProgress
            });

            return captionPipeline;
        } catch (err) {
            console.error('Failed to initialize browser vision model:', err);
            initPromise = null;
            throw err;
        }
    })();

    return initPromise;
}

/**
 * Extracts searchable keyword tags from a natural language caption.
 *
 * @param {string} caption
 * @returns {Array<string>} Array of clean unique lowercase keywords
 */
export function extractKeywords(caption) {
    if (!caption || typeof caption !== 'string') return [];

    const cleaned = caption.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
    const tokens = cleaned.split(/\s+/).filter(t => t.length > 2 && !STOP_WORDS.has(t));

    return Array.from(new Set(tokens));
}

/**
 * Runs in-browser visual inference on a local image File or Blob.
 * Ephemeral object URLs are cleaned up immediately after inference.
 *
 * @param {File|Blob} file - Local image file object
 * @param {Function|null} onModelProgress - Optional model download progress callback
 * @returns {Promise<{ caption: string, keywords: Array<string> }>}
 */
export async function describeImage(file, onModelProgress = null) {
    if (!file) throw new Error('No file provided for vision inference');

    let objectUrl = null;
    try {
        const pipe = await getVisionPipeline(onModelProgress);
        objectUrl = URL.createObjectURL(file);

        // Run inference entirely inside client WebAssembly runtime
        const output = await pipe(objectUrl, {
            max_new_tokens: 30
        });

        let rawCaption = '';
        if (Array.isArray(output) && output.length > 0) {
            rawCaption = output[0]?.generated_text || '';
        } else if (typeof output === 'string') {
            rawCaption = output;
        }

        const caption = rawCaption.trim();
        const keywords = extractKeywords(caption);

        return {
            caption,
            keywords
        };
    } catch (err) {
        console.warn('Vision model inference error:', err);
        // Fallback: derive keywords from filename so indexing doesn't fail completely
        const fallbackKeywords = extractKeywords(file.name || '');
        return {
            caption: file.name ? `Photo of ${file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')}` : 'Local image',
            keywords: fallbackKeywords
        };
    } finally {
        if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
        }
    }
}
