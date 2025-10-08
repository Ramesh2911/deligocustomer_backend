import express from 'express';
import {
   getUserNotifications,
   getUnreadNotificationCount
} from '../controllers/notificationController.js';

const notificationRoutes = express.Router();
notificationRoutes.get('/getUserNotifications', getUserNotifications);
notificationRoutes.get('/unreadNotificationsCount', getUnreadNotificationCount);

export default notificationRoutes;