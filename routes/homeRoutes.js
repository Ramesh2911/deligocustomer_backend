import express from 'express';
import {
   getCategory
} from '../controllers/homeController.js';

const homeRoutes = express.Router();
homeRoutes.get('/getcategory', getCategory);

export default homeRoutes;