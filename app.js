import cookieParser from 'cookie-parser';
import cors from 'cors';
import { config } from 'dotenv';
import express from 'express';
import addressRoutes from './routes/addressRoutes.js';
import authRoute from './routes/authRoutes.js';
import cartRoutes from './routes/cartRoutes.js';
import checkoutRoutes from './routes/checkoutRoutes.js';
import homeRoutes from './routes/homeRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import otpRoutes from './routes/otpRoutes.js';
import productRoutes from './routes/productRoutes.js';
import storeRoutes from './routes/storeRoutes.js';
import wishlistRoutes from './routes/wishlistRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';

config({
    path: './config.env'
});

const app = express();
app.use(cors({
    origin: [process.env.FRONTEND_URL, process.env.LOCAL_HOST],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api', paymentRoutes);
app.use('/api', cartRoutes);
app.use('/api', orderRoutes);
app.use('/api', checkoutRoutes);
app.use('/api', addressRoutes);
app.use('/api', otpRoutes);
app.use('/api', productRoutes);
app.use('/api', storeRoutes);
app.use('/api', wishlistRoutes);
app.use('/api', authRoute);
app.use('/api', homeRoutes);
app.use('/api', notificationRoutes);

export default app;