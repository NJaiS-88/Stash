const express = require('express');
const authRouter = require('./routes/auth.routes');
const galleryRouter = require('./routes/gallery.routes');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const app = express();

// Trust reverse proxy for Render / Cloud deployments (enables secure cookies over HTTPS proxy)
app.set('trust proxy', 1);

const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://stash-phi-lake.vercel.app'
];
if (process.env.FRONTEND_URL) {
    allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
            return callback(null, true);
        }
        return callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
}));

app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRouter);
app.use('/api/gallery', galleryRouter);

module.exports = app;