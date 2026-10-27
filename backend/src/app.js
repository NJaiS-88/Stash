const express = require('express');
const authRouter = require('./routes/auth.routes');
const galleryRouter = require('./routes/gallery.routes');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const app = express();

app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true,
}));

app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRouter);
app.use('/api/gallery', galleryRouter);

module.exports = app;