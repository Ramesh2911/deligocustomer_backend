import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import multer from "multer";
import con from '../db/db.js';
import { adminCookie } from '../utils/cookies.js';

dotenv.config();

const upload = multer({ storage: multer.memoryStorage() });

// ===== LOGIN =====
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: false,
        message: 'Email and password are required',
      });
    }

    const [rows] = await con.query(
      `SELECT hr_users.*, hr_addresses.id AS address_id, hr_addresses.you_are_here, hr_addresses.house as address_name
       FROM hr_users
       LEFT JOIN hr_addresses ON hr_users.id = hr_addresses.user_id
       WHERE hr_users.role_id = '3'
       AND hr_users.is_active = 'Y'
       AND hr_addresses.is_active = '1'
       AND hr_users.email = ?`,
      [email]
    );

    if (rows.length === 0) {
      return res.status(400).json({
        status: false,
        message: 'Invalid credentials',
      });
    }

    const user = rows[0];

    // ✅ Fix PHP hash issue ($2y$ → $2a$)
    let dbPassword = user.password;
    if (dbPassword.startsWith("$2y$")) {
      dbPassword = "$2a$" + dbPassword.slice(4);
    }

    // ✅ Compare password with hash
    const isMatch = await bcrypt.compare(password, dbPassword);
    if (!isMatch) {
      return res.status(400).json({
        status: false,
        message: 'Invalid credentials',
      });
    }

    const fullname = `${user.first_name} ${user.last_name}`;

    const responseData = {
      status: 'success',
      role: user.role_id,
      userid: user.id,
      profileimage: user.profile_picture,
      prefix: user.prefix,
      fmname: user.first_name,
      lmname: user.last_name,
      fullname: fullname,
      you_are_here: user.you_are_here,
      email: user.email,
      mobile: user.mobile,
      address_name: user.address_name,
      setcurrentcategory: '0'
    };

    // ✅ Set auth cookie
    adminCookie(process.env.JWT_SECRET, user, res, `${fullname} logged in`);

    return res.json(responseData);

  } catch (error) {
    console.error('Login Error:', error.message);
    return res.status(500).json({
      status: false,
      message: 'Server error',
    });
  }
};

// ===== LOGOUT =====
export const logout = async (req, res) => {
  try {
    res.clearCookie('admin_token', {
      httpOnly: true,
      sameSite: 'none',
      secure: true
    });

    return res.status(200).json({
      status: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Logout Error:', error.message);
    res.status(500).json({
      status: false,
      message: 'Server error during logout',
    });
  }
};

// ===== GET COUNTRIES =====
export const getCountries = async (req, res) => {
  try {
    const [rows] = await con.query(
      `SELECT * FROM hr_countries WHERE phonecode > 0 AND is_active = '1' ORDER BY hr_countries.name DESC`
    );

    return res.status(200).json({
      status: true,
      message: 'Active countries fetched successfully',
      data: rows,
    });
  } catch (error) {
    console.error('Get Active Countries Error:', error.message);
    return res.status(500).json({
      status: false,
      message: 'Server error while fetching active countries',
    });
  }
};

// ===== CREATE USER =====
export const createuser = async (req, res) => {
  let response = { status: false, message: "" };

  try {
    const {
      prefix,
      firstname,
      lastname,
      email,
      password,
      address,
      zipcode,
      countryid,
      areacode,
      phone,
      latitude,
      longitude,
    } = req.body;

    console.log("📩 Incoming body:", req.body);
    console.log("📷 Uploaded file:", req.file);

    if (!firstname || !lastname || !email || !password) {
      return res.json({ status: false, message: "Missing required fields" });
    }

    // Check if email exists
    const [rows] = await con.query("SELECT id FROM hr_users WHERE email = ?", [email]);
    if (rows.length > 0) {
      return res.json({ status: false, message: "Email already exists" });
    }

    // ✅ Hash password before storing
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert into hr_users
    const [result] = await con.query(
      `INSERT INTO hr_users 
       (prefix, first_name, last_name, password, email, country_id, country_code, mobile, address, pincode, latitude, longitude, role_id, built_in, exclude, profile_picture, passport, vehicle_type, is_login_active, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 3, 0, 0, ?, '', 0, 'Y', 'Y')`,
      [
        prefix || "",
        firstname,
        lastname,
        hashedPassword,
        email,
        countryid || "",
        areacode || "",
        phone || "",
        address,
        zipcode,
        latitude,
        longitude,
        req.file ? req.file.originalname : "", // save filename if uploaded
      ]
    );

    const userId = result.insertId;

    // Insert into hr_addresses
    await con.query(
      `INSERT INTO hr_addresses 
       (type, user_id, house, street, city, postal_code, country_code, district, region_id, lat, lng, is_active)
       VALUES (1, ?, ?, '', '', ?, NULL, NULL, 0, ?, ?, 1)`,
      [userId, address, zipcode, latitude, longitude]
    );

    response.status = true;
    response.userid = userId;
    response.message = "Created successfully.";
    return res.json(response);

  } catch (err) {
    console.error(err);
    response.status = false;
    response.message = err.message;
    return res.json(response);
  }
};
