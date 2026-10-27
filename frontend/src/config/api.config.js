/**
 * Unified Backend API Configuration
 * Supports VITE_API_URL, VITE_BACKEND_URL, or VITE_BASE_URL from deployment environment
 * Strips any trailing slashes automatically.
 */
const rawUrl = (
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_BACKEND_URL ||
    import.meta.env.VITE_BASE_URL ||
    (import.meta.env.PROD ? "https://stash-backend-545f.onrender.com" : "http://localhost:3000")
);

export const API_BASE_URL = rawUrl.replace(/\/+$/, '');
