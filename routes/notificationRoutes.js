import express from 'express';
import {
   getUserNotifications
} from '../controllers/notificationController.js';

const notificationRoutes = express.Router();
notificationRoutes.get('/getUserNotifications', getUserNotifications);

export default notificationRoutes;