import con from "../db/db.js";

//====getUserNotifications=====
export const getUserNotifications = async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({
      status: false,
      message: "userId parameter is required",
    });
  }

  try {
    const [rows] = await con.query(
      `SELECT *
       FROM hr_notification
       WHERE user_id = ?
         AND create_time >= DATE_SUB(NOW(), INTERVAL 15 DAY)
       ORDER BY create_time DESC`,
      [userId]
    );

    return res.status(200).json({
      status: true,
      message: rows.length ? "Notifications fetched successfully" : "No notifications found",
      data: rows,
    });
  } catch (error) {
    console.error("Get Notifications Error:", error);
    return res.status(500).json({
      status: false,
      message: "Server error while fetching notifications",
    });
  }
};



