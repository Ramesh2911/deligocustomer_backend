import express from 'express';
import {
   getUserNotifications,
   getUnreadNotificationCount,
   markNotificationsAsRead
} from '../controllers/notificationController.js';

const notificationRoutes = express.Router();
notificationRoutes.get('/getUserNotifications', getUserNotifications);
notificationRoutes.get('/unreadNotificationsCount', getUnreadNotificationCount);
notificationRoutes.put('/markAsRead', markNotificationsAsRead);

export default notificationRoutes;