import express from 'express';
import {
   getMyCart,
   removeCartItem,
   updateCartQuantity
} from '../controllers/cartController.js';

const cartRoutes = express.Router();

cartRoutes.get('/getmycart', getMyCart);
cartRoutes.post("/removeCartItem", removeCartItem);
cartRoutes.put("/updateCartQuantity", updateCartQuantity);

export default cartRoutes;