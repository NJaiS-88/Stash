const mongoose = require('mongoose');

async function connectDB() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('[Database] CRITICAL: MONGODB_URI environment variable is missing or undefined!');
        return;
    }

    try {
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 5000,
        });
        console.log('[Database] Successfully connected to MongoDB');
    } catch (error) {
        console.error('[Database] Failed to connect to MongoDB:', error.message);
    }
}

mongoose.connection.on('connected', () => console.log('[Database] Mongoose connected to MongoDB'));
mongoose.connection.on('error', (err) => console.error('[Database] Mongoose connection error:', err.message));
mongoose.connection.on('disconnected', () => console.warn('[Database] Mongoose disconnected from MongoDB'));

module.exports = connectDB;