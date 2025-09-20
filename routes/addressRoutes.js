import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import {
   addAddress,
   getAddress,
   updateAddress
} from '../controllers/addressController.js';

const addressRoutes = express.Router();
addressRoutes.get('/getaddress', getAddress);
addressRoutes.post('/updateaddress', updateAddress);
addressRoutes.post('/addaddress', addAddress);
export default addressRoutes;