import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import multer from "multer";
import con from '../db/db.js';
import { adminCookie } from '../utils/cookies.js';
import nodemailer from 'nodemailer';

dotenv.config();

const upload = multer({ storage: multer.memoryStorage() });
const generateOTP = () => Math.floor(1000 + Math.random() * 9000);

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

//==== change password====
export const changePassword = async (req, res) => {
  try {
    const { id, old_password, confirm_password } = req.body;

    if (!id || !old_password || !confirm_password) {
      return res.status(400).json({ status: false, message: "All fields are required" });
    }

    // 1. Get user by ID
    const [rows] = await con.query(
      "SELECT password FROM hr_users WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    const hashedPassword = rows[0].password;

    // 2. Compare old password
    const isMatch = await bcrypt.compare(old_password, hashedPassword);
    if (!isMatch) {
      return res.status(400).json({ status: false, message: "Old password is incorrect" });
    }

    // 3. Hash new password
    const salt = await bcrypt.genSalt(10);
    const newHashedPassword = await bcrypt.hash(confirm_password, salt);

    // 4. Update password in DB
    await con.query(
      "UPDATE hr_users SET password = ? WHERE id = ?",
      [newHashedPassword, id]
    );

    return res.status(200).json({ status: true, message: "Password updated successfully" });
  } catch (error) {
    console.error("Change Password Error:", error);
    return res.status(500).json({ status: false, message: "Internal server error" });
  }
};

//=====forgotPassword====
export const sendResetOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.json({
        status: false,
        message: 'Email is required'
      });
    }

    // Check if user exists
    const [userResult] = await con.query(
      'SELECT id FROM hr_users WHERE email = ? AND is_active = "Y"',
      [email]
    );

    if (userResult.length === 0) {
      return res.json({
        status: false,
        message: 'User not found with this email'
      });
    }

    const otp = generateOTP();

    // Create nodemailer transporter
    const transporter = nodemailer.createTransport({
      host: "smtp-relay.brevo.com",
      port: 587,
      auth: {
        user: process.env.BREVO_USER,
        pass: process.env.BREVO_PASSWORD
      }
    });

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'Password Reset OTP',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Password Reset OTP</h2>
          <p>Your OTP for password reset is: <strong>${otp}</strong></p>
          <p>This OTP will expire in 10 minutes.</p>
          <p>If you didn't request this, please ignore this email.</p>
        </div>
      `
    };

    // Send email
    await transporter.sendMail(mailOptions);

    // Save OTP in database
    await con.query(
      'INSERT INTO hr_mail_otp (mail, otp, create_time) VALUES (?, ?, NOW())',
      [email, otp]
    );

    return res.json({
      status: true,
      message: 'OTP sent successfully'
    });

  } catch (error) {
    console.error('Error in sendResetOtp:', error);
    return res.json({ 
      status: false, 
      message: 'Failed to send OTP email. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

//==== resendResetOtp====
export const resendResetOtp = async (req, res) => {
  const { email, phone } = req.body;

  if (!email && !phone) {
    return res.status(400).json({ status: false, message: 'Email or phone is required' });
  }

  try {
    let query = '';
    let value = '';

    if (email) {
      query = 'SELECT * FROM hr_users WHERE email = ?';
      value = email;
    } else {
      query = 'SELECT * FROM hr_users WHERE phone = ?';
      value = phone;
    }

    const [result] = await con.query(query, [value]);

    if (result.length === 0) {
      return res.status(404).json({ status: false, message: 'User not found' });
    }

    const otp = generateOTP();

    if (email) {
      const transporter = nodemailer.createTransport({
        host: process.env.MAILER_HOST.replace(/'/g, ''),
        port: parseInt(process.env.MAILER_PORT.replace(/'/g, '')),
        secure: false,
        auth: {
          user: process.env.MAILER_USER,
          pass: process.env.MAILER_PASSWORD,
        },
      });

      const mailOptions = {
        from: `"${process.env.MAILER_SENDER_NAME}" <${process.env.MAILER_USER}>`,
        to: email,
        subject: 'Resend OTP - Password Reset',
        text: `Your OTP for password reset is: ${otp}`,
      };

      await transporter.sendMail(mailOptions);
    }

    if (phone) {
      await client.messages.create({
        body: `Your OTP for password reset is: ${otp}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phone.startsWith('+') ? phone : `+91${phone}`,
      });
    }

    const insertOtpQuery = `INSERT INTO hr_mail_otp (mail, otp, create_time) VALUES (?, ?, NOW())`;
    await con.query(insertOtpQuery, [email, otp]);

    return res.status(200).json({
      status: true,
      message: 'OTP resent successfully',
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: 'Internal server error' });
  }
};

//==== verify OTP====
export const verifyResetOtp = async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ status: false, message: 'Email and OTP are required' });
  }

  try {
    // 1. Get OTP from DB
    const [result] = await con.query(
      'SELECT * FROM hr_mail_otp WHERE mail = ? AND otp = ?',
      [email, otp]
    );

    if (result.length === 0) {
      return res.status(400).json({ status: false, message: 'Invalid OTP' });
    }

    // 2. Delete OTP row after successful verification
    await con.query('DELETE FROM hr_mail_otp WHERE mail = ?', [email]);

    return res.status(200).json({
      status: true,
      message: 'OTP verified successfully',
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: false, message: 'Server error' });
  }
};

//==== update password email=====
export const resetPassword = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      status: false,
      message: "Email and new password are required."
    });
  }

  try {
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update query
    const query = "UPDATE hr_users SET password = ? WHERE email = ?";
    const params = [hashedPassword, email];

    const [result] = await con.query(query, params);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status: false,
        message: "User not found."
      });
    }

    res.json({
      status: true,
      message: "Password reset successfully."
    });
  } catch (error) {
    console.error("Reset Password Error:", error);
    res.status(500).json({
      status: false,
      message: "Server error."
    });
  }
};