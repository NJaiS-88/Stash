/**
 * Browser Vision Model (100% Client-Side Privacy Engine).
 * Runs Microsoft's Florence-2-base-ft directly in browser using WebGPU/WASM.
 * Local image bytes and pixels NEVER leave the client or touch any server.
 */

let captionPipeline = null;
let activeDevice = 'wasm';
let initPromise = null;

const STOP_WORDS = new Set([
    'a', 'an', 'the', 'in', 'on', 'at', 'is', 'are', 'was', 'were', 'it', 'its',
    'of', 'for', 'to', 'from', 'with', 'by', 'and', 'or', 'that', 'this', 'there',
    'image', 'picture', 'photo', 'photograph', 'close', 'up', 'view', 'background'
]);

/**
 * Dynamically imports Transformers.js v3 at runtime using browser ESM.
 * Uses /* @vite-ignore *\/ to prevent Vite from failing static import analysis.
 */
async function loadTransformersModule() {
    const cdnUrl = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';
    return await import(/* @vite-ignore */ cdnUrl);
}

function parseFlorenceCaption(output) {
    let caption = '';
    if (!output) return '';

    if (typeof output === 'string') {
        caption = output;
    } else if (Array.isArray(output) && output.length > 0) {
        const item = output[0]?.generated_text !== undefined ? output[0].generated_text : output[0];
        if (typeof item === 'object' && item !== null) {
            caption = item['<MORE_DETAILED_CAPTION>'] || item['<DETAILED_CAPTION>'] || item['<CAPTION>'] || Object.values(item)[0] || '';
        } else if (typeof item === 'string') {
            caption = item;
        }
    } else if (typeof output === 'object') {
        caption = output['<MORE_DETAILED_CAPTION>'] || output['<DETAILED_CAPTION>'] || output['<CAPTION>'] || Object.values(output)[0] || '';
    }

    return String(caption).replace(/<[^>]+>/g, '').trim();
}

/**
 * Initializes and caches the client-side vision captioning pipeline.
 * Tries WebGPU with mixed precision (FP16 vision + Q4 decoder), falling back to WASM.
 *
 * @param {Function|null} onProgress - Progress callback for model download
 * @returns {Promise<Function>} Captioning pipeline
 */
export async function getVisionPipeline(onProgress = null) {
    if (captionPipeline) return captionPipeline;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        try {
            const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;
            activeDevice = hasWebGPU ? 'webgpu' : 'wasm';

            const { pipeline, env } = await loadTransformersModule();

            if (env) {
                env.allowLocalModels = false;
                env.useBrowserCache = true;
            }

            const modelId = 'onnx-community/Florence-2-base-ft';

            try {
                captionPipeline = await pipeline('image-to-text', modelId, {
                    device: activeDevice,
                    dtype: hasWebGPU ? {
                        embed_tokens: 'fp16',
                        vision_encoder: 'fp16',
                        encoder_model: 'q4',
                        decoder_model_merged: 'q4',
                    } : 'q4',
                    progress_callback: onProgress
                });
            } catch (florenceErr) {
                console.warn('Florence-2 WebGPU init failed, falling back to WASM / vit-gpt2:', florenceErr);
                activeDevice = 'wasm';
                captionPipeline = await pipeline('image-to-text', 'Xenova/vit-gpt2-image-captioning', {
                    device: 'wasm',
                    progress_callback: onProgress
                });
            }

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
 * Runs in-browser visual inference on a local image File or Blob using Florence-2.
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

        // Run Florence-2 with <MORE_DETAILED_CAPTION> prompt
        const output = await pipe(objectUrl, {
            text: '<MORE_DETAILED_CAPTION>',
            max_new_tokens: 100
        });

        const caption = parseFlorenceCaption(output) || (file.name ? `Photo: ${file.name}` : 'Local image');
        const keywords = extractKeywords(caption);

        return {
            caption,
            keywords: keywords.length > 0 ? keywords : extractKeywords(file.name || '')
        };
    } catch (err) {
        console.warn('Vision model inference error:', err);
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
