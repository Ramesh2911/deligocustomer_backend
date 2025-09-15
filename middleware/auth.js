import { admin } from '../models/adminModels.js';
import jwt from 'jsonwebtoken';

// ======admin auth=====
export const adminAuth = async (req, res, next) => {
	try {
		const { admin_token } = req.cookies;
		if (!admin_token) {
			res.status(401).json({
				message: 'admin not logged in'
			});
		}
		else {
			const token_decode = jwt.verify(admin_token, process.env.JWT_SECRET);
			req.admin_details = await admin.findById(token_decode.id);
			next();
		}
	}
	catch (error) {
		res.status(500).json({
			message: 'server error'
		});
	}
};