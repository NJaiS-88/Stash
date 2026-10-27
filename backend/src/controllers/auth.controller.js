const { UserModel } = require('../models/user.model');
const blacklistModel = require('../models/blacklist.model');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'stash_default_jwt_secret_key_32_chars';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || (JWT_SECRET + '_refresh');

const generateTokens = (userId) => {
    const accessToken = jwt.sign(
        { userId, id: userId },
        JWT_SECRET,
        { expiresIn: '15m' }
    );
    const refreshToken = jwt.sign(
        { userId, id: userId, type: 'refresh' },
        REFRESH_SECRET,
        { expiresIn: '7d' }
    );
    return { accessToken, refreshToken };
};

const setAuthCookies = (res, accessToken, refreshToken) => {
    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie('token', accessToken, {
        httpOnly: true,
        secure: isProduction,
        maxAge: 15 * 60 * 1000, // 15 minutes
        sameSite: isProduction ? 'strict' : 'lax'
    });

    if (refreshToken) {
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: isProduction,
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            sameSite: isProduction ? 'strict' : 'lax'
        });
    }
};

const registerUser = async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const userExists = await UserModel.findOne({
            $or: [{ username }, { email }]
        });
        if (userExists) {
            return res.status(400).json({ message: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await UserModel.create({
            username,
            email,
            password: hashedPassword
        });

        const { accessToken, refreshToken } = generateTokens(newUser._id);
        setAuthCookies(res, accessToken, refreshToken);

        return res.status(201).json({
            message: "User created successfully",
            user: {
                id: newUser._id,
                username: newUser.username,
                email: newUser.email,
                fingerprintSecret: newUser.fingerprintSecret
            }
        });
    } catch (error) {
        return res.status(500).json({ message: error.message || "Server error" });
    }
};

const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const user = await UserModel.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if (!isPasswordCorrect) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        // Auto-populate fingerprintSecret for existing users if missing
        if (!user.fingerprintSecret) {
            user.fingerprintSecret = require('crypto').randomBytes(32).toString('hex');
            await user.save();
        }

        const { accessToken, refreshToken } = generateTokens(user._id);
        setAuthCookies(res, accessToken, refreshToken);

        return res.status(200).json({
            message: "Login successful",
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                fingerprintSecret: user.fingerprintSecret
            }
        });
    } catch (error) {
        return res.status(500).json({ message: error.message || "Server error" });
    }
};

const refreshTokenHandler = async (req, res) => {
    try {
        const refreshToken = req.cookies.refreshToken;
        if (!refreshToken) {
            return res.status(401).json({ message: "No refresh token provided" });
        }

        const isBlacklisted = await blacklistModel.findOne({ token: refreshToken });
        if (isBlacklisted) {
            return res.status(401).json({ message: "Refresh token has been revoked" });
        }

        const decoded = jwt.verify(refreshToken, REFRESH_SECRET);
        const user = await UserModel.findById(decoded.userId);
        if (!user) {
            return res.status(401).json({ message: "User no longer exists" });
        }

        const { accessToken, refreshToken: newRefreshToken } = generateTokens(user._id);

        // Invalidate old refresh token and set new tokens
        await blacklistModel.create({ token: refreshToken });
        setAuthCookies(res, accessToken, newRefreshToken);

        return res.status(200).json({
            message: "Tokens refreshed successfully",
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                fingerprintSecret: user.fingerprintSecret
            }
        });
    } catch (error) {
        return res.status(401).json({ message: "Invalid or expired refresh token" });
    }
};

const logoutUser = async (req, res) => {
    try {
        const token = req.cookies.token;
        const refreshToken = req.cookies.refreshToken;

        const tokensToBlacklist = [];
        if (token) tokensToBlacklist.push({ token });
        if (refreshToken) tokensToBlacklist.push({ token: refreshToken });

        if (tokensToBlacklist.length > 0) {
            await blacklistModel.insertMany(tokensToBlacklist).catch(() => {});
        }

        res.clearCookie('token');
        res.clearCookie('refreshToken');

        return res.status(200).json({ message: "Logout successful" });
    } catch (error) {
        return res.status(500).json({ message: error.message || "Server error" });
    }
};

const verifyUser = async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        let user = await UserModel.findById(userId).select("-password");
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (!user.fingerprintSecret) {
            user.fingerprintSecret = require('crypto').randomBytes(32).toString('hex');
            await user.save();
        }

        return res.status(200).json({ user });
    } catch (error) {
        return res.status(500).json({ message: error.message || "Server error" });
    }
};

module.exports = {
    registerUser,
    loginUser,
    logoutUser,
    verifyUser,
    refreshTokenHandler
};
