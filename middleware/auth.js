import jwt from 'jsonwebtoken';

// ======token auth=====
export const verifyToken = (req, res, next) => {
	const token = req.headers["authorization"];

	if (!token) {
		return res.status(403).json({ status: false, message: "No token provided." });
	}

	try {
		const bearerToken = token.split(" ")[1]; 
		const decoded = jwt.verify(bearerToken, process.env.JWT_SECRET);
		req.user = decoded;
		next();
	} catch (err) {
		return res.status(401).json({ status: false, message: "Unauthorized! Invalid or expired token." });
	}
};