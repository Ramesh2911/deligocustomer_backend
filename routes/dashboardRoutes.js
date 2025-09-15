import express from 'express';
import {
   updateShopStatus
} from '../controllers/dashboardController.js';

const dashboardRoutes = express.Router();
dashboardRoutes.get('/duty-stats', dutyStats);
dashboardRoutes.put('/rider-status', updateShopStatus);

export default dashboardRoutes;
