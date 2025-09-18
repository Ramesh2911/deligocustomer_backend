import express from 'express';
import multer from "multer";
import { verifyToken } from '../middleware/auth.js';
const upload = multer({ storage: multer.memoryStorage() });

import {
   createuser,
   getCountries,
   login,
   logout
} from '../controllers/authController.js';

const authRoutes = express.Router();
authRoutes.post('/login', login);
authRoutes.post("/createuser", upload.single("profile_image"), createuser);
authRoutes.post('/logout', verifyToken, logout);
authRoutes.get('/country-list', getCountries);

export default authRoutes;