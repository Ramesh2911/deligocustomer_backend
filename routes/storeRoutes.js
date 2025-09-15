import express from 'express';
import {
   getStore
} from '../controllers/storeController.js';

const storeRoutes = express.Router();
storeRoutes.get('/getstore', getStore);

export default storeRoutes;