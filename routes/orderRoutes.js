import express from 'express';
import {
   getOrders,
   postOrder,
   getOrderWithItems
} from '../controllers/orderController.js';

const orderRoutes = express.Router();
orderRoutes.post('/postorder', postOrder);
orderRoutes.get('/getorders', getOrders);
orderRoutes.get('/getorderwithitems', getOrderWithItems);
export default orderRoutes;