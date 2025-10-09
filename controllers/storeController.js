import con from '../db/db.js';
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "../config/awsConfig.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";

async function getImageUrl(key) {
  if (!key) return null;
  const cleanedKey = key.replace(/^https?:\/\/[^/]+\/[^/]+\//, "");

  const command = new GetObjectCommand({
    Bucket: "deligo.image",
    Key: cleanedKey, 
  });

  return await getSignedUrl(s3, command, { expiresIn: 3600 });
}

//=====getAddress=======
// export const getStore = async (req, res) => {   
//    const { categoryId, userid } = req.query;

//    try {
//       const [rows] = await con.query(
//          `SELECT 
//     u.*,
//     c.category_name,
//     c.category_image,
//     CASE WHEN wls.store_id IS NOT NULL THEN 1 ELSE 0 END AS is_wishlist
// FROM 
//     hr_users u
// JOIN 
//     hr_category c 
//     ON u.business_type_id = c.cid
// LEFT JOIN 
//     hr_wishlist_store wls 
//     ON wls.store_id = u.id   
// WHERE  
//     u.business_type_id = ?
//     AND u.role_id = '4' 
//     AND u.is_active = 'Y'
//     AND c.is_active = 1`,
//          [categoryId]
//       );

//       if (rows.length === 0) {
//          return res.status(200).json({
//             status: false,
//             message: 'No active stores found',
//             data: [],
//          });
//       }

//       // Map rows into desired format
//       const stores = rows.map((store) => ({
//          id: store.id,
//          name: store.business_name,
//          image:
//             store.shop_logo || '',
//          rating: parseFloat(store.rating) || 4.8,
//          deliveryTime: store.delivery_time || '25-30 min',
//          acceptOrdersTill: store.accept_orders_till || '11:30 PM',
//          offers: [
//             'Free delivery on orders above ₹299',
//             '20% off on first order',
//          ],
//          category: store.category_name,
//          distance: store.distance || '1.2 km',
//          deliveryFee: store.delivery_fee || 0,
//          is_wishlist: store.is_wishlist,
//          isPromoted: false,
//       }));

//       return res.status(200).json({
//          status: true,
//          message: 'Stores fetched successfully',
//          data: stores,
//       });
//    } catch (error) {
//       console.error('Error fetching stores:', error);
//       return res.status(500).json({
//          status: false,
//          message: 'Internal server error',
//       });
//    }
// };


export const getStore = async (req, res) => {
  const { categoryId, userId } = req.query;

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
        hr_category c ON u.business_type_id = c.cid
      LEFT JOIN 
        hr_wishlist_store wls ON wls.store_id = u.id AND wls.user_id = ?
      WHERE  
        u.business_type_id = ?
        AND u.role_id = '4' 
        AND u.is_active = 'Y'
        AND c.is_active = 1`,
      [userId, categoryId]
    );

    if (rows.length === 0) {
      return res.status(200).json({
        status: false,
        message: "No active stores found",
        data: [],
      });
    }

    // Generate signed URLs for each store logo
    const stores = await Promise.all(
      rows.map(async (store) => ({
        id: store.id,
        name: store.business_name,
        image: await getImageUrl(store.shop_logo),
        rating: parseFloat(store.rating) ,
        deliveryTime: store.delivery_time ,
        acceptOrdersTill: store.accept_orders_till ,
        offers: ["Free delivery on orders above €299", "20% off on first order"],
        category: store.category_name,
        distance: store.distance ,
        deliveryFee: store.delivery_fee || 0,
        is_wishlist: store.is_wishlist,
        isPromoted: false,
        is_online: store.is_online,
      }))
    );

    return res.status(200).json({
      status: true,
      message: "Stores fetched successfully",
      data: stores,
    });
  } catch (error) {
    console.error("Error fetching stores:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};