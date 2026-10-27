import axios from 'axios';
import { enforcePrivacyBoundary } from './privacyBoundary';
import { API_BASE_URL } from '../../../config/api.config';

const galleryApi = axios.create({
    baseURL: `${API_BASE_URL}/api/gallery`,
    withCredentials: true,
});

// Automatic token refresh interceptor
galleryApi.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        if (
            error.response?.status === 401 &&
            !originalRequest._retry
        ) {
            originalRequest._retry = true;
            try {
                await axios.post(`${API_BASE_URL}/api/auth/refresh-token`, {}, { withCredentials: true });
                return galleryApi(originalRequest);
            } catch (refreshErr) {
                return Promise.reject(refreshErr);
            }
        }
        return Promise.reject(error);
    }
);

/**
 * Phase 29: Read single image metadata
 * GET /api/gallery/images/:imageId
 */
export async function getCloudImageMetadata(imageId) {
    const response = await galleryApi.get(`/images/${imageId}`);
    return response.data;
}

/**
 * Phase 27: Create/Upsert single image metadata
 * POST /api/gallery/images
 */
export async function createCloudImageMetadata(record) {
    const scrubbed = enforcePrivacyBoundary(record);
    const response = await galleryApi.post('/images', scrubbed);
    return response.data;
}

/**
 * Phase 27: Update existing image metadata
 * PUT /api/gallery/images/:imageId
 */
export async function updateCloudImageMetadata(imageId, updates) {
    const scrubbed = enforcePrivacyBoundary(updates, { partial: true });
    const response = await galleryApi.put(`/images/${imageId}`, scrubbed);
    return response.data;
}

/**
 * Phase 27: Soft delete / tombstone image metadata
 * DELETE /api/gallery/images/:imageId
 */
export async function deleteCloudImageMetadata(imageId) {
    const response = await galleryApi.delete(`/images/${imageId}`);
    return response.data;
}

/**
 * Phase 29: Hard delete / purge image metadata permanently
 * DELETE /api/gallery/images/:imageId/permanent
 */
export async function purgeCloudImageMetadata(imageId) {
    const response = await galleryApi.delete(`/images/${imageId}/permanent`);
    return response.data;
}

/**
 * Phase 27: Reconcile local images against cloud index
 * POST /api/gallery/reconcile
 */
export async function reconcileCloudMetadata(records) {
    const scrubbedItems = records.map(r => enforcePrivacyBoundary(r));
    const response = await galleryApi.post('/reconcile', { items: scrubbedItems });
    return response.data;
}

/**
 * Phase 27 & Phase 34: Semantic & vector search across user's indexed photo captions
 * POST /api/gallery/search
 */
export async function searchCloudMetadata(query, limit = 50) {
    const response = await galleryApi.post('/search', { query, limit, top_k: limit });
    return response.data;
}

/**
 * Phase 34: Natural Language Semantic Search via Pinecone
 * POST /api/gallery/semantic-search
 *
 * query -> Zod -> Auth -> text embedding -> Pinecone -> user-scoped retrieval -> [ { imageId, score } ]
 *
 * @param {string} query Natural language query (e.g. "Show me beach photos at sunset")
 * @param {number} [top_k=20] Max results to return
 * @returns {Promise<{ query: string, total: number, results: Array<{ imageId: string, score: number }> }>}
 */
export async function semanticSearch(query, top_k = 20) {
    const response = await galleryApi.post('/semantic-search', { query, limit: top_k, top_k });
    return response.data;
}

/**
 * Phase 27: AI question-answering over photo captions
 * POST /api/gallery/ask
 */
export async function askCloudMetadata(question, limit = 20) {
    const response = await galleryApi.post('/ask', { question, limit });
    return response.data;
}

/**
 * Phase 30: Availability Synchronization
 * POST /api/gallery/availability
 * Synchronizes 'available' <-> 'missing' status to cloud MongoDB,
 * strictly preserving caption and fingerprint.
 *
 * @param {Array<{ imageId: string, status: 'available'|'missing' }>} updates
 */
export async function syncCloudAvailability(updates) {
    if (!updates || updates.length === 0) return { matchedCount: 0, modifiedCount: 0 };
    const response = await galleryApi.post('/availability', { updates });
    return response.data;
}
