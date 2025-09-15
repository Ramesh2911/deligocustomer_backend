import express from 'express';
import {
   toggleWishlist,
   toggleWishlistProduct
} from '../controllers/wishlistController.js';

const wishlistRoutes = express.Router();
wishlistRoutes.post('/wishlist', toggleWishlist);
wishlistRoutes.post('/wishlistproduct', toggleWishlistProduct);
export default wishlistRoutes;