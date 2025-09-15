import express from 'express';
import {
   getCheckout,
   getCheckoutUpdate
} from '../controllers/checkoutController.js';

const getCheckoutRoutes = express.Router();
getCheckoutRoutes.get('/getcheckout', getCheckout);
getCheckoutRoutes.post('/getcheckoutupdate', getCheckoutUpdate);

export default getCheckoutRoutes;