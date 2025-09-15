import con from '../db/db.js';

// ===== Get Companies Grouped by Category & Sorted by Distance =====
export const getCategory = async (req, res) => {
  try {
    const { userId } = req.query; // Pass ?userId=49 in request

    if (!userId) {
      return res.status(400).json({
        status: false,
        message: 'userId is required',
      });
    }

    // Query to get all companies with calculated distance
    const [rows] = await con.query(     
      `SELECT *
FROM (
    SELECT 
        u.id,
        u.business_type_id,        
        u.business_name AS name,
        u.company_name,
        u.shop_banner AS image,
        u.rating,
        u.latitude AS store_lat,
        u.longitude AS store_lng,
        c.cid,
        c.category_name,
        a.lat AS user_lat,
        a.lng AS user_lng,
        (6371 * ACOS(
            COS(RADIANS(a.lat)) * COS(RADIANS(u.latitude)) *
            COS(RADIANS(u.longitude) - RADIANS(a.lng)) +
            SIN(RADIANS(a.lat)) * SIN(RADIANS(u.latitude))
        )) AS distance_km,
        CASE 
            WHEN w.store_id IS NOT NULL THEN 1 
            ELSE 0 
        END AS is_wishlist,
        ROW_NUMBER() OVER (
            PARTITION BY c.cid 
            ORDER BY distance_km ASC
        ) AS rn
    FROM hr_users u
    JOIN hr_addresses a 
        ON a.user_id = ?
       AND a.is_active = 1
    JOIN hr_category c 
        ON c.cid = u.business_type_id 
       AND c.is_active = 1
    LEFT JOIN hr_wishlist_store w 
        ON w.store_id = u.id 
       AND w.user_id = ?
    WHERE u.role_id = 4 
      AND u.is_active = 'Y'
) AS sub
WHERE rn <= 5
ORDER BY cid, distance_km ASC`,
      [userId, userId] 
    );

    // Group results by category
    const groupedCompanies = rows.reduce((acc, company) => {
      const category = company.category_name;
      if (!acc[category]) acc[category] = [];
      acc[category].push(company);
      return acc;
    }, {});

    return res.status(200).json({
      status: true,
      message: 'Companies fetched successfully',
      baseStores: groupedCompanies,
    });

  } catch (error) {
    console.error('Get Companies Error:', error.message);
    return res.status(500).json({
      status: false,
      message: 'Server error while fetching companies',
    });
  }
};
