import express from 'express';
import {
   deleteOTP,
   resendOTP,
   sendOTP,
   verifyOTP,
} from '../controllers/otpController.js';

const otpRoutes = express.Router();
otpRoutes.post('/userphoneverifiy', sendOTP);
otpRoutes.post('/otpvarification', verifyOTP);
otpRoutes.post('/resendotp', resendOTP);
otpRoutes.post('/deleteotp', deleteOTP);

export default otpRoutes;
