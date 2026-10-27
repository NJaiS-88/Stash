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
 * Phase 27: Semantic & keyword search across user's indexed photo captions
 * POST /api/gallery/search
 */
export async function searchCloudMetadata(query, limit = 50) {
    const response = await galleryApi.post('/search', { query, limit });
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
