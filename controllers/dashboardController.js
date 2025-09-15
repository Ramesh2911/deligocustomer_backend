import con from '../db/db.js';


//===== vendor Status=====
export const dutyStats = async (req, res) => {
   const { rider_id } = req.query;

   if (!rider_id) {
      return res.status(400).json({ status: false, message: 'rider id is required' });
   }

   try {
      const [isActiveCounts] = await con.query(`
      SELECT
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active_count,
        SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) AS inactive_count
      FROM hr_product
      WHERE rider_id = ?
    `, [rider_id]);

      const [statusCounts] = await con.query(`
      SELECT status, COUNT(*) as count
      FROM hr_order
      WHERE rider_id = ?
      GROUP BY status
    `, [rider_id]);

      const [todayAmount] = await con.query(`
      SELECT IFNULL(SUM(total_amount), 0) as today_total
      FROM hr_order
      WHERE rider_id = ? AND DATE(created_time) = CURDATE()
    `, [rider_id]);

      const [monthAmount] = await con.query(`
      SELECT IFNULL(SUM(total_amount), 0) as month_total
      FROM hr_order
      WHERE rider_id = ? AND MONTH(created_time) = MONTH(CURDATE()) AND YEAR(created_time) = YEAR(CURDATE())
    `, [rider_id]);

      const statusData = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
      statusCounts.forEach(row => {
         statusData[row.status] = row.count;
      });

      res.status(200).json({
         status: true,
         message: 'Vendor data fetched successfully',
         data: {
            product_counts: {
               active: isActiveCounts[0].active_count,
               inactive: isActiveCounts[0].inactive_count
            },
            order_status: statusData,
            total_amount: {
               today: parseFloat(todayAmount[0].today_total).toFixed(2),
               this_month: parseFloat(monthAmount[0].month_total).toFixed(2)
            }
         }
      });
   } catch (error) {
      console.error('Error fetching vendor stats:', error);
      res.status(500).json({ status: false, message: 'Server Error', error: error.message });
   }
};

//===== shop Status====
export const updateRidertatus = async (req, res) => {
   const { id } = req.query;
   const { is_online } = req.body;

   if (!id || is_online === undefined) {
      return res.status(400).json({
         status: false,
         message: 'Missing id or is_online',
      });
   }

   try {
      const [result] = await con.query(
         'UPDATE hr_users SET is_online = ? WHERE id = ?',
         [is_shop_open, id]
      );

      if (result.affectedRows === 0) {
         return res.status(404).json({ status: false, message: 'User not found' });
      }

      return res.status(200).json({ status: true, message: 'Shop status updated' });
   } catch (error) {
      console.error('Update error:', error);
      return res.status(500).json({ status: false, message: 'Server error' });
   }
};
