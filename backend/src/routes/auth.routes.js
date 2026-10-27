const { Router } = require('express');
const {
    registerUser,
    loginUser,
    logoutUser,
    verifyUser,
    refreshTokenHandler
} = require('../controllers/auth.controller');
const verifyToken = require('../middlewares/auth.middleware');

const authRouter = Router();

authRouter.post('/register', registerUser);
authRouter.post('/login', loginUser);
authRouter.post('/refresh-token', refreshTokenHandler);
authRouter.post('/logout', logoutUser);
authRouter.get('/logout', logoutUser);
authRouter.get('/get-me', verifyToken, verifyUser);

module.exports = authRouter;