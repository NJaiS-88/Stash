const { Router } = require('express');
const { registerUser, loginUser, logoutUser, verifyUser } = require('../controllers/auth.controller');
const verifyToken = require('../middlewares/auth.middleware');

const authRouter = Router();

authRouter.post('/register', registerUser);

authRouter.post('/login', loginUser);

authRouter.get('/logout', logoutUser);

authRouter.get('/get-me', verifyToken, verifyUser);


module.exports = authRouter;