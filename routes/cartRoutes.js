import express from 'express';
import {
   getMyCart
} from '../controllers/cartController.js';

const cartRoutes = express.Router();
cartRoutes.get('/getmycart', getMyCart);
export default cartRoutes;