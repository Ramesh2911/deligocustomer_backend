import dotenv from 'dotenv';
import twilio from 'twilio';
import con from '../db/db.js';
dotenv.config();

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);


//=======send OTP======
export const sendOTP = async (req, res) => {
   const { phone, areacode, countryid } = req.body;

   if (!phone || !areacode || !countryid) {
      return res.status(400).json({
         status: false,
         message: 'Phone number, country code, and country ID are required',
      });
   }

   try {
      const [userRows] = await con.query(
         `SELECT * FROM hr_users WHERE mobile = ? AND country_id = ?`,
         [phone, countryid]
      );

      if (userRows.length > 0) {
         return res.status(200).json({
            status: false,
            message:"Phone number already exists in the system. Please use a different phone number or proceed to login.",
         });
      }

      const otp = Math.floor(1000 + Math.random() * 9000);
      const fullPhone = `+${areacode}${phone}`;

      const message = await client.messages.create({
         body: `Your Deligo OTP Service Verification code ${otp}`,
         from: process.env.TWILIO_PHONE_NUMBER,
         to: fullPhone,
      });

      await con.query(
         `INSERT INTO hr_otp (user_id, country_id, mobile, otp) VALUES (0, ?, ?, ?)`,
         [countryid, phone, otp]
      );

      return res.status(200).json({
         status: true,
         message: 'OTP sent successfully',
      });

   } catch (error) {
      console.error(' DB Error:', error);
      return res.status(500).json({
         status: false,
         message: 'Failed to send and store OTP',
      });
   }
};

//=====verify OTP=====
export const verifyOTP = async (req, res) => {
   const { phone, otp, countryid } = req.body;

   if (!phone || !otp || !countryid) {
      return res.status(400).json({
         status: false,
         message: 'Phone, OTP, and country ID are required',
      });
   }

   try {
      const [rows] = await con.query(
         'SELECT * FROM hr_otp WHERE mobile = ? AND country_id = ? AND otp = ?',
         [phone, countryid, otp]
      );

      if (rows.length === 0) {
         return res.status(401).json({
            status: false,
            message: 'Invalid OTP',
         });
      }

      await con.query('DELETE FROM hr_otp WHERE mobile = ?', [phone]);

      return res.status(200).json({
         status: true,
         message: 'OTP verified successfully',
      });
   } catch (error) {
      console.error('OTP Verification Error:', error.message);
      return res.status(500).json({
         status: false,
         message: 'Server error during OTP verification',
      });
   }
};

//===== resend OTP====
export const resendOTP = async (req, res) => {
   const { phone, countryid, areacode } = req.body;

   if (!phone || !countryid || !areacode) {
      return res.status(400).json({
         status: false,
         message: 'Phone number, country ID, and area code are required',
      });
   }

   try {
      const [userRows] = await con.query(
         `SELECT * FROM hr_users WHERE mobile = ? AND country_id = ?`,
         [phone, countryid]
      );

      if (userRows.length > 0) {
         return res.status(200).json({
            status: false,
            message:"Phone number already exists in the system. Please use a different phone number or proceed to login.",
         });
      }

      const otp = Math.floor(1000 + Math.random() * 9000);
      const fullPhone = `+${areacode}${phone}`;

      const message = await client.messages.create({
         body: `Your Deligo OTP Service Verification code ${otp}`,
         from: process.env.TWILIO_PHONE_NUMBER,
         to: fullPhone,
      });

      await con.query(
         `INSERT INTO hr_otp (user_id, country_id, mobile, otp) VALUES (0, ?, ?, ?)`,
         [countryid, phone, otp]
      );

      return res.status(200).json({
         status: true,
         message: 'OTP sent successfully',
      });

   } catch (error) {
      console.error('Resend OTP Error:', error);
      return res.status(500).json({
         status: false,
         message: 'Failed to resend OTP',
      });
   }
};

//===== delete OTP=====
export const deleteOTP = async (req, res) => {
  const { phone, countryid } = req.body;

  if (!phone || !countryid) {
    return res.status(400).json({
      status: false,
      message: 'Phone number and country ID are required',
    });
  }

  try {
    const [rows] = await con.query(
      `SELECT * FROM hr_otp WHERE country_id = ? AND mobile = ?`,
      [countryid, phone]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        status: false,
        message: 'No OTP record found to delete',
      });
    }

    await con.query(
      `DELETE FROM hr_otp WHERE country_id = ? AND mobile = ?`,
      [countryid, phone]
    );

    return res.status(200).json({
      status: true,
      message: 'OTP deleted successfully',
    });
  } catch (error) {
    console.error('Delete OTP Error:', error);
    return res.status(500).json({
      status: false,
      message: 'Failed to delete OTP',
    });
  }
};
