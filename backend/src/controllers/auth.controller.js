const { UserModel } = require('../models/user.model');
const blacklistModel = require('../models/blacklist.model');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
dotenv.config();


const registerUser = async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if(!username || !email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }
        const userExists = await UserModel.findOne({ 
            $or: [{ username }, { email }] 
        });
        if(userExists) {
            return res.status(400).json({ message: "User already exists" });
        }
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await UserModel.create({ 
            username, 
            email, 
            password: hashedPassword 
        });

        const token = jwt.sign({
            userId: newUser._id }, 
            process.env.JWT_SECRET, 
            { expiresIn: '1d' }
        );

        res.cookie('token', token, { 
            httpOnly: true, 
            secure: process.env.NODE_ENV === 'production', 
            maxAge: 24 * 60 * 60 * 1000, 
            sameSite: 'strict'
        });
        return res.status(201).json({ 
            message: "User created successfully", 
            user: { 
                id: newUser._id, 
                username: newUser.username, 
                email: newUser.email }
        });
    } catch (error) {
        return res.status(500).json({ message: error.message || "Server error" });
    }
}


const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        if(!email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }
        const user = await UserModel.findOne({ email });
        if(!user) {
            return res.status(400).json({ message: "Invalid credentials" });
        }
        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if(!isPasswordCorrect) {
            return res.status(400).json({ message: "Invalid credentials" });
        }
        const token = jwt.sign({
            userId: user._id }, 
            process.env.JWT_SECRET, 
            { expiresIn: '1d' }
        );

        res.cookie('token', token, { 
            httpOnly: true, 
            secure: process.env.NODE_ENV === 'production', 
            maxAge: 24 * 60 * 60 * 1000, 
            sameSite: 'strict'
        });

        return res.status(200).json({ 
            message: "Login successful", 
            user: { 
                id: user._id, 
                username: user.username, 
                email: user.email }
        });
    } catch (error) {
        return res.status(500).json({ message: error.message || "Server error" });
    }
}


const logoutUser = async (req, res) => {
    try {
        const token = req.cookies.token;
        if(!token) {
            return res.status(400).json({ message: "No token found" });
        }
        await blacklistModel.create({ token });
        res.clearCookie('token');
        return res.status(200).json({ message: "Logout successful" });
    } catch (error) {
        return res.status(500).json({ message: error.message || "Server error" });
    }
}


const verifyUser = async (req, res) => {
    try {
        const user = await UserModel.findById(req.user.userId).select("-password");
        if(!user) {
            return res.status(404).json({ message: "User not found" });
        }
        return res.status(200).json({ user });
    } catch (error) {
        return res.status(500).json({ message: error.message || "Server error" });
    }
}

module.exports = { registerUser, loginUser, logoutUser, verifyUser };
