import express from 'express';
import {
   paymentSheet, 
   
} from '../controllers/paymentController.js';

const paymentRoutes = express.Router();


paymentRoutes.post('/paymentsheet', paymentSheet);
export default paymentRoutes;