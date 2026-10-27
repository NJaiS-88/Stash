const mongoose = require('mongoose');

async function connectDB() {
    let rawUri = process.env.MONGODB_URI;
    if (!rawUri) {
        console.error('[Database] CRITICAL: MONGODB_URI environment variable is missing or undefined!');
        return;
    }

    // Strip accidental surrounding quotes or whitespace from environment variable
    let uri = rawUri.replace(/^["']|["']$/g, '').trim();

    try {
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 5000,
            family: 4, // Force IPv4 to avoid cloud IPv6 routing handshake delays
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