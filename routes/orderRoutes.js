import express from 'express';
import {
   getOrders,
   postOrder,
   getOrderWithItems,
   reorderItems,
   addOrderNote
} from '../controllers/orderController.js';

const orderRoutes = express.Router();
orderRoutes.post('/postorder', postOrder);
orderRoutes.get('/getorders', getOrders);
orderRoutes.get('/getorderwithitems', getOrderWithItems);
orderRoutes.post('/reorderItems', reorderItems);
orderRoutes.post('/addOrderNote', addOrderNote);
export default orderRoutes;