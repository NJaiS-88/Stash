import axios from "axios";

const api = axios.create({
    baseURL: "http://localhost:3000/api/auth",
    withCredentials: true,
});

const getErrorMessage = (error) => {
    return error.response?.data?.message || error.message || "Something went wrong";
};

export async function registerUser({username, email, password}) {
    try {
        const response = await api.post("/register", {username, email, password});
        return response.data;
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}

export async function loginUser({email, password}) {
    try {
        const response = await api.post("/login", {email, password});
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

export async function getUser() {
    try {
        const response = await api.get("/get-me");
        return response.data;
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}

