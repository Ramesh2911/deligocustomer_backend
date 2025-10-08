import express from 'express';
import {
   getMyCart,
   removeCartItem
} from '../controllers/cartController.js';

const cartRoutes = express.Router();

cartRoutes.get('/getmycart', getMyCart);
cartRoutes.post("/removeCartItem", removeCartItem);

export default cartRoutes;