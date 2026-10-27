import axios from "axios";

export const api = axios.create({
    baseURL: "http://localhost:3000/api/auth",
    withCredentials: true,
});

const getErrorMessage = (error) => {
    return error.response?.data?.message || error.message || "Something went wrong";
};

// Response interceptor for automatic refresh token rotation
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        if (
            error.response?.status === 401 &&
            !originalRequest._retry &&
            !originalRequest.url.includes('/login') &&
            !originalRequest.url.includes('/register') &&
            !originalRequest.url.includes('/refresh-token')
        ) {
            originalRequest._retry = true;
            try {
                await api.post('/refresh-token');
                return api(originalRequest);
            } catch (refreshErr) {
                return Promise.reject(refreshErr);
            }
        }
        return Promise.reject(error);
    }
);

export async function registerUser({ username, email, password }) {
    try {
        const response = await api.post("/register", { username, email, password });
        return response.data;
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}

export async function loginUser({ email, password }) {
    try {
        const response = await api.post("/login", { email, password });
        return response.data;
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}

export async function logoutUser() {
    try {
        const response = await api.post("/logout");
        return response.data;
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}

export async function refreshTokens() {
    try {
        const response = await api.post("/refresh-token");
        return response.data;
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}

export async function getUser() {
    try {
        const response = await api.get("/get-me");
        return response.data;
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}
