import express from 'express';
import {
   getOrders,
   postOrder,
   getOrderWithItems,
   addOrderNote,
   reorderItems
} from '../controllers/orderController.js';

const orderRoutes = express.Router();
orderRoutes.post('/reorderItems', reorderItems);
orderRoutes.put('/addOrderNote', addOrderNote);
orderRoutes.post('/postorder', postOrder);
orderRoutes.get('/getorders', getOrders);
orderRoutes.get('/getorderwithitems', getOrderWithItems);
export default orderRoutes;