import con from '../db/db.js';

//====getAddress=====
export const getAddress = async (req, res) => {
  try {
        const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        status: false,
        message: 'User ID is required in query parameter (?userId=)',
      });
    }
    
    const [rows] = await con.query(
      `SELECT id, type,you_are_here, user_id,postal_code, is_active,house as address_name FROM hr_addresses WHERE user_id = ?`,
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

//====addAddress=====
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
      const user_id = req.query.user_id;
      const id = req.query.id;

      if (!user_id || !id) {
         return res.json({
            status: false,
            message: "user_id and id are required parameters"
         });
      }

      await con.query(
         `UPDATE hr_addresses SET is_active = 0 WHERE user_id = ?`,
         [user_id]
      );

      await con.query(
         `UPDATE hr_addresses SET is_active = 1 WHERE id = ?`,
         [id]
      );

      return res.json({
         status: true,
         message: "Address updated successfully"
      });
   } catch (error) {
      console.error('Update Address Error:', error.message);
      return res.json({
         status: false,
         message: "Server error"
      });
   }
};
