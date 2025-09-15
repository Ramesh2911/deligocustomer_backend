import con from '../db/db.js';

//=====getAddress=======
export const getStore = async (req, res) => {   
   const { categoryId, userid } = req.query;

   try {
      const [rows] = await con.query(
         `SELECT 
    u.*,
    c.category_name,
    c.category_image,
    CASE WHEN wls.store_id IS NOT NULL THEN 1 ELSE 0 END AS is_wishlist
FROM 
    hr_users u
JOIN 
    hr_category c 
    ON u.business_type_id = c.cid
LEFT JOIN 
    hr_wishlist_store wls 
    ON wls.store_id = u.id   
WHERE  
    u.business_type_id = ?
    AND u.role_id = '4' 
    AND u.is_active = 'Y'
    AND c.is_active = 1`,
         [categoryId]
      );

      if (rows.length === 0) {
         return res.status(200).json({
            status: false,
            message: 'No active stores found',
            data: [],
         });
      }

      // Map rows into desired format
      const stores = rows.map((store) => ({
         id: store.id,
         name: store.business_name,
         image:
            store.shop_logo || 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80',
         rating: parseFloat(store.rating) || 4.8,
         deliveryTime: store.delivery_time || '25-30 min',
         acceptOrdersTill: store.accept_orders_till || '11:30 PM',
         offers: [
            'Free delivery on orders above ₹299',
            '20% off on first order',
         ],
         category: store.category_name,
         distance: store.distance || '1.2 km',
         deliveryFee: store.delivery_fee || 0,
         is_wishlist: store.is_wishlist,
         isPromoted: false,
      }));

      return res.status(200).json({
         status: true,
         message: 'Stores fetched successfully',
         data: stores,
      });
   } catch (error) {
      console.error('Error fetching stores:', error);
      return res.status(500).json({
         status: false,
         message: 'Internal server error',
      });
   }
};