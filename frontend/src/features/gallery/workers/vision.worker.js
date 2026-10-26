/**
 * Vision Model Web Worker — Florence-2-base-ft & vit-gpt2
 * Runs vision caption models strictly off-thread via Transformers.js v3.
 * React Main Thread remains 100% fluid for gallery scrolling, navigation, and user interactions.
 *
 * Architecture:
 * React Main Thread (UI, Scrolling, Navigation)
 *       ↓ (postMessage blob)
 * AI Web Worker (Image Preprocessing & Resizing)
 *       ↓
 * Inference Engine (Florence-2 WebGPU/WASM -> vit-gpt2 WASM lightweight fallback)
 *       ↓
 * React Main Thread (Standardized Caption Output)
 */

let pipelineInstance = null;
let activeDevice = 'wasm';
let isInitializing = false;

const STOP_WORDS = new Set([
    'a', 'an', 'the', 'in', 'on', 'at', 'is', 'are', 'was', 'were', 'it', 'its',
    'of', 'for', 'to', 'from', 'with', 'by', 'and', 'or', 'that', 'this', 'there',
    'image', 'picture', 'photo', 'photograph', 'close', 'up', 'view', 'background'
]);

function extractKeywords(caption) {
    if (!caption || typeof caption !== 'string') return [];
    const cleaned = caption.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
    const tokens = cleaned.split(/\s+/).filter(t => t.length > 2 && !STOP_WORDS.has(t));
    return Array.from(new Set(tokens));
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

    // Strip special tokens e.g. <MORE_DETAILED_CAPTION>
    return String(caption).replace(/<[^>]+>/g, '').trim();
}

/**
 * Preprocesses an image Blob off-thread inside the Web Worker.
 * Downsamples high-resolution photos (e.g. 40MP phone shots) to max 768px using OffscreenCanvas
 * so inference is lightning fast, memory footprint is low, and the React main thread never stutters.
 */
async function preprocessImageInWorker(blob) {
    if (typeof createImageBitmap === 'undefined' || typeof OffscreenCanvas === 'undefined') {
        return blob;
    }

    try {
        const bmp = await createImageBitmap(blob);
        const maxDim = 768;
        let { width, height } = bmp;

        if (width <= maxDim && height <= maxDim) {
            bmp.close();
            return blob;
        }

        if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
        } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
        }

        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bmp, 0, 0, width, height);
        bmp.close();

        const resizedBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
        return resizedBlob || blob;
    } catch {
        return blob;
    }
}

async function initModel() {
    if (pipelineInstance) return pipelineInstance;
    if (isInitializing) {
        while (isInitializing) {
            await new Promise(r => setTimeout(r, 100));
        }
        return pipelineInstance;
    }

    isInitializing = true;
    try {
        const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;
        activeDevice = hasWebGPU ? 'webgpu' : 'wasm';

        self.postMessage({
            type: 'STATUS',
            status: 'loading_model',
            message: `Loading Florence-2-base-ft via ${activeDevice.toUpperCase()}...`
        });

        // Transformers.js v3 CDN
        const cdnUrl = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';
        const { pipeline, env } = await import(/* @vite-ignore */ cdnUrl);

        if (env) {
            env.allowLocalModels = false;
            env.useBrowserCache = true;
        }

        const modelId = 'onnx-community/Florence-2-base-ft';

        try {
            // Primary attempt: Florence-2-base-ft with mixed-precision / WebGPU
            pipelineInstance = await pipeline('image-to-text', modelId, {
                device: activeDevice,
                dtype: hasWebGPU ? {
                    embed_tokens: 'fp16',
                    vision_encoder: 'fp16',
                    encoder_model: 'q4',
                    decoder_model_merged: 'q4',
                } : 'q4',
                progress_callback: (prog) => {
                    self.postMessage({ type: 'MODEL_PROGRESS', progress: prog, model: 'Florence-2-base-ft' });
                }
            });
            pipelineInstance.modelKey = 'florence-2-base-ft';
        } catch (florenceErr) {
            console.warn('[Worker] WebGPU Florence-2 init failed, falling back to lightweight WASM vit-gpt2:', florenceErr);
            // Fallback to WASM lightweight captioner (~80MB)
            activeDevice = 'wasm';
            pipelineInstance = await pipeline('image-to-text', 'Xenova/vit-gpt2-image-captioning', {
                device: 'wasm',
                progress_callback: (prog) => {
                    self.postMessage({ type: 'MODEL_PROGRESS', progress: prog, model: 'vit-gpt2-fallback' });
                }
            });
            pipelineInstance.modelKey = 'vit-gpt2';
        }

        self.postMessage({
            type: 'STATUS',
            status: 'ready',
            device: activeDevice,
            message: `Vision model ready (${pipelineInstance.modelKey || 'florence-2-base-ft'} on ${activeDevice.toUpperCase()}).`
        });

        return pipelineInstance;
    } catch (err) {
        self.postMessage({ type: 'ERROR', error: err.message || 'Failed to initialize vision model' });
        throw err;
    } finally {
        isInitializing = false;
    }
}

self.onmessage = async (e) => {
    const data = e.data;
    if (!data) return;

    if (data.type === 'INIT') {
        try {
            await initModel();
        } catch (err) {
            console.warn('[Worker] Init error:', err);
        }
        return;
    }

    if (data.type === 'PROCESS_IMAGE') {
        const { imageId, blob, fileName } = data;

        let objectUrl = null;
        try {
            const pipe = await initModel();

            // Off-thread preprocessing: downsample high-res photo in worker to prevent UI lag
            const processedBlob = await preprocessImageInWorker(blob);
            objectUrl = URL.createObjectURL(processedBlob);

            let caption = '';
            if (pipe.modelKey === 'vit-gpt2') {
                const output = await pipe(objectUrl, { max_new_tokens: 50 });
                caption = output[0]?.generated_text || '';
            } else {
                // Execute detailed captioning task on Florence-2
                const output = await pipe(objectUrl, {
                    text: '<MORE_DETAILED_CAPTION>',
                    max_new_tokens: 100
                });
                caption = parseFlorenceCaption(output);
            }

            const keywords = extractKeywords(caption);

            self.postMessage({
                type: 'IMAGE_INDEXED',
                imageId,
                caption: caption || `Photo: ${fileName}`,
                engine: 'browser',
                model: pipe.modelKey || (activeDevice === 'wasm' ? 'vit-gpt2' : 'florence-2-base-ft'),
                captionVersion: 1,
                keywords: keywords.length > 0 ? keywords : extractKeywords(fileName),
                device: activeDevice
            });
        } catch (err) {
            console.warn('[Worker] Processing error for', fileName, err);
            const fallbackKeywords = extractKeywords(fileName || '');
            const fallbackCaption = fileName
                ? `Photo of ${fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')}`
                : 'Local image';

            self.postMessage({
                type: 'IMAGE_INDEXED',
                imageId,
                caption: fallbackCaption,
                engine: 'browser',
                model: 'fallback-heuristics',
                captionVersion: 1,
                keywords: fallbackKeywords,
                fallback: true
            });
        } finally {
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        }
    }
};
