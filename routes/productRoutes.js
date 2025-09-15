import express from 'express';
import {
   getCartSummary,
   getProduct,
   postProductOrder
} from '../controllers/productController.js';

const productRoutes = express.Router();
productRoutes.get('/getproduct', getProduct);
productRoutes.post('/postproductorder', postProductOrder);
productRoutes.get('/getcartsummary', getCartSummary);
export default productRoutes;