const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const blacklistModel = require('../models/blacklist.model');
dotenv.config();

const verifyToken = async (req, res, next) => {
    const token = req.cookies.token;
    if(!token) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    try {
        const isBlacklisted = await blacklistModel.findOne({ token });
        if(isBlacklisted) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ message: "Unauthorized" });
    }
}
module.exports = verifyToken;