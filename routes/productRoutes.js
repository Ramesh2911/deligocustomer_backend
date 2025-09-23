import express from 'express';
import {
   getCartSummary,
   getProduct,
   postProductOrder,
   getProductDetails
} from '../controllers/productController.js';

const productRoutes = express.Router();
productRoutes.get('/getproduct', getProduct);
productRoutes.post('/postproductorder', postProductOrder);
productRoutes.get('/getcartsummary', getCartSummary);
productRoutes.get('/getProductDetails', getProductDetails);
export default productRoutes;