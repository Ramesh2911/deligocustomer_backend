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

//====getUnreadNotificationCount=====
export const getUnreadNotificationCount = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ status: false, message: "userId is required" });
    }

     const userIdInt = parseInt(userId, 10); 

    const [rows] = await con.query(
      `SELECT COUNT(*) AS totalUnread 
       FROM hr_notification 
       WHERE user_id = ? AND readwrite = 0`,
      [userIdInt]
    );

    const totalUnread = rows[0]?.totalUnread || 0;

    return res.status(200).json({
      status: true,
      message: "Unread notifications count fetched successfully",
      totalUnread
    });

  } catch (error) {
    console.error("Error fetching unread notification count:", error);
    return res.status(500).json({
      status: false,
      message: "Server error while fetching unread notifications"
    });
  }
};

//====markNotificationsAsRead=====
export const markNotificationsAsRead = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ status: false, message: 'userId is required' });
    }

    const [result] = await con.query(
      `UPDATE hr_notification SET readwrite = 1 WHERE user_id = ? AND readwrite = 0`,
      [userId]
    );

    return res.status(200).json({
      status: true,
      message: 'Notifications marked as read successfully',
      affectedRows: result.affectedRows
    });
  } catch (error) {
    console.error('Error updating notifications:', error);
    return res.status(500).json({ status: false, message: 'Internal server error' });
  }
};

