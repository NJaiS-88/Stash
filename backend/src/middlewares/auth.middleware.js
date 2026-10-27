const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const blacklistModel = require('../models/blacklist.model');
dotenv.config();

/**
 * Robust JWT Verification Middleware
 * Extracts JWT from httpOnly cookie or Authorization Bearer header.
 * Verifies against revocation blacklist and attaches req.user.id.
 */
const verifyToken = async (req, res, next) => {
    const token = req.cookies.token || (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null);

    if (!token) {
        return res.status(401).json({ message: "Unauthorized: No token provided" });
    }

    try {
        const isBlacklisted = await blacklistModel.findOne({ token });
        if (isBlacklisted) {
            return res.status(401).json({ message: "Unauthorized: Token has been revoked" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Owner ALWAYS comes from req.user.id
        req.user = {
            id: String(decoded.userId || decoded.id),
            userId: String(decoded.userId || decoded.id),
            ...decoded
        };

        next();
    } catch (error) {
        return res.status(401).json({ message: "Unauthorized: Invalid or expired token" });
    }
};

module.exports = verifyToken;