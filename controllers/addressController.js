import con from '../db/db.js';
export const getAddress = async (req, res) => {
  try {
        const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        status: false,
        message: 'User ID is required in query parameter (?userId=)',
      });
    }

    // ✅ Fetch address from DB
    const [rows] = await con.query(
      `SELECT id, type,you_are_here, user_id, is_active,house as address_name FROM hr_addresses WHERE user_id = ?`,
      [userId]
    );

    return res.status(200).json({
      status: true,
      message: `User addresses fetched successfully`,
      address: rows,
    });

  } catch (error) {
    console.error('Get Address Error:', error.message);
    return res.status(500).json({
      status: false,
      message: 'Server error while fetching addresses',
    });
  }
};

//====updateAddress=====
export const orderAccept = async (req, res) => {
  let connection;

  try {
    const { orderId, userId, latitude, longitude } = req.body;

    if (!orderId || !userId) {
      return res.status(400).json({
        status: false,
        message: 'orderId and userId are required',
      });
    }

    // 🔑 Get a connection from the pool
    connection = await con.getConnection();
    await connection.beginTransaction();

    // 1️⃣ Atomic update: accept only if still unassigned
    const [activateResult] = await connection.query(
      `UPDATE hr_order 
       SET delivery_id = ?, 
           delivery_accept_latitude = ?, 
           delivery_accept_longitude = ? 
       WHERE oid = ? 
         AND status = 2 
         AND (delivery_id = 0 OR delivery_id IS NULL)`,
      [userId, latitude || null, longitude || null, orderId]
    );

    if (activateResult.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({
        status: false,
        message: 'Order already accepted or invalid',
      });
    }

    // 2️⃣ Commit the transaction
    await connection.commit();

    // 3️⃣ Success response
    return res.json({
      status: true,
      message: 'Order accepted successfully',
    });

  } catch (err) {
    console.error('❌ Error in orderAccept:', err);
    if (connection) await connection.rollback();
    return res.status(500).json({ status: false, message: 'Server error' });
  } finally {
    if (connection) connection.release(); // 🔑 Release the connection back to pool
  }
};

export const addAddress = async (req, res) => {
  try {
    const data = req.body;

    const userId = data.userid ?? null;
    const latitude = data.latitude ?? null;
    const longitude = data.longitude ?? null;
    const address = data.address ?? null;
    const postalCode = data.postalCode ?? null;
    const label = data.label ?? null;
    const fullname = data.fullname ?? null;
    const mobile = data.mobile ?? null;

    if (!userId || !address || !fullname) {
      return res.status(400).json({
        success: false,
        message: 'userId, address, and fullname are required.'
      });
    }

    let labelId = '0';
    if (label === 'Home') labelId = '1';
    else if (label === 'Work') labelId = '2';
    else labelId = '3';

    // Check if it's the first address
    const [existing] = await con.query(
      `SELECT COUNT(*) AS count FROM hr_addresses WHERE user_id = ?`,
      [userId]
    );
    const isActive = existing[0].count === 0 ? 1 : 0;

    const insertQuery = `
      INSERT INTO hr_addresses (
        type, user_id, you_are_here, full_name, mobile,
        house, street, city, postal_code, country_code,
        district, region_id, lat, lng, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, '', '', ?, NULL, NULL, '0', ?, ?, ?)
    `;

    const values = [
      labelId,
      userId,
      label,
      fullname,
      mobile,
      address,
      postalCode,
      latitude,
      longitude,
      isActive
    ];

    const [result] = await con.query(insertQuery, values);

    return res.status(201).json({
      success: true,
      message: 'Created.',
      addressId: result.insertId
    });

  } catch (error) {
    console.error('Create Address Error:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};



//====updateAddress=====
export const updateAddress = async (req, res) => {
   try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
         return res.status(401).json({
            status: false,
            message: 'Authorization token missing or invalid',
         });
      }

      const token = authHeader.split(' ')[1];
      jwt.verify(token, 'deligo@JWT!9dKz');

      const { user_id, id } = req.params;

      await con.query(
         `UPDATE hr_addresses SET is_active = 0 WHERE user_id = ?`,
         [user_id]
      );

      await con.query(
         `UPDATE hr_addresses SET is_active = 1 WHERE id = ?`,
         [id]
      );

      return res.status(200).json({
         status: true,
         message: 'Address updated successfully',
      });
   } catch (error) {
      console.error('Update Address Error:', error.message);
      return res.status(500).json({
         status: false,
         message: 'Server error or invalid token',
      });
   }
};
