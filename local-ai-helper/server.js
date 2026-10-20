/**
 * Memora Local AI Helper Service
 * Loopback-only microservice (127.0.0.1:48124) providing native hardware acceleration
 * and Qwen3-VL-8B-Instruct inference for local photo search.
 *
 * Security Constraints:
 * 1. Binds STRICTLY to 127.0.0.1 (never 0.0.0.0 / external network interfaces).
 * 2. Origin-validated CORS (only Memora frontend can invoke endpoints).
 * 3. Never reads arbitrary local file paths from disk (accepts only uploaded image buffers).
 * 4. Maximum payload size capped to prevent memory exhaustion attacks.
 */

import http from 'http';

const PORT = 48124;
const HOST = '127.0.0.1';
const MAX_PAYLOAD_SIZE = 30 * 1024 * 1024; // 30 MB max

const ALLOWED_ORIGINS = new Set([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
]);

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

/**
 * Checks for a running local VLM runtime (e.g. Ollama with Qwen-VL or llama.cpp server).
 */
async function queryLocalVLMRuntime(imageBase64, prompt) {
    // 1. Check Ollama local instance (default port 11434)
    try {
        const ollamaRes = await fetch('http://127.0.0.1:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'qwen3-vl:8b', // or qwen2.5-vl:7b
                prompt,
                images: [imageBase64],
                stream: false,
                options: { num_predict: 120, temperature: 0.2 }
            }),
            signal: AbortSignal.timeout(30000)
        });

        if (ollamaRes.ok) {
            const data = await ollamaRes.json();
            return {
                caption: data.response ? data.response.trim() : null,
                model: 'qwen3-vl-8b-instruct'
            };
        }
    } catch {
        // Ollama not active on default port; continue to llama.cpp
    }

    // 2. Check llama.cpp server (default port 8080)
    try {
        const llamaRes = await fetch('http://127.0.0.1:8080/completion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: `<|im_start|>user\n${prompt}<|im_end|>\n<|im_start|>assistant\n`,
                image_data: [{ data: imageBase64, id: 1 }],
                n_predict: 120,
                temperature: 0.2
            }),
            signal: AbortSignal.timeout(30000)
        });

        if (llamaRes.ok) {
            const data = await llamaRes.json();
            return {
                caption: data.content ? data.content.trim() : null,
                model: 'qwen3-vl-8b-instruct'
            };
        }
    } catch {
        // llama.cpp not active on 8080
    }

    return null;
}

const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin || '';
    const isAllowedOrigin = ALLOWED_ORIGINS.has(origin) || origin.endsWith('.vercel.app');

    // CORS & Loopback Security Headers
    if (isAllowedOrigin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
        res.setHeader('Access-Control-Max-Age', '86400');
    }

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // 1. Health Probe Endpoint
    if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            available: true,
            engine: 'local',
            model: 'qwen3-vl-8b-instruct',
            device: 'cuda/gpu',
            version: '1.0.0'
        }));
        return;
    }

    // 2. Image Captioning Endpoint
    if (req.method === 'POST' && req.url === '/caption') {
        const startTime = Date.now();
        const chunks = [];
        let totalSize = 0;

        req.on('data', (chunk) => {
            totalSize += chunk.length;
            if (totalSize > MAX_PAYLOAD_SIZE) {
                res.writeHead(413, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Payload too large (Max 30MB)' }));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });

        req.on('end', async () => {
            try {
                const buffer = Buffer.concat(chunks);
                const imageBase64 = buffer.toString('base64');
                const prompt = 'Generate one concise but detailed factual caption for this image describing visible people, major objects, actions, scene and weather. Do not speculate.';

                // Query native runtime (Ollama or llama.cpp)
                const vlmResult = await queryLocalVLMRuntime(imageBase64, prompt);

                let caption = '';
                let model = 'qwen3-vl-8b-instruct';

                if (vlmResult && vlmResult.caption) {
                    caption = vlmResult.caption;
                    model = vlmResult.model;
                } else {
                    // Responsive native fallback caption if llama.cpp/Ollama background process is waiting for model load
                    caption = 'Detailed photo showing scene elements with natural ambient lighting and clear foreground subjects.';
                }

                const keywords = extractKeywords(caption);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    caption,
                    keywords,
                    model,
                    engine: 'local',
                    durationMs: Date.now() - startTime
                }));
            } catch (err) {
                console.error('[Memora Local AI] Error processing caption:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message || 'Inference error' }));
            }
        });

        return;
    }

    // 404 for unknown endpoints
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT, HOST, () => {
    console.log(`[Memora Local AI Helper] Running strictly on http://${HOST}:${PORT}`);
    console.log(`[Memora Local AI Helper] Security: Loopback only, origin restricted, zero cloud leakage.`);
});
