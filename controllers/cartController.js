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

// Utility: Haversine formula (distance in km)
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // km
}

//===== getMyCart =====
// export const getMyCart = async (req, res) => {
//   try {
//     const { userId } = req.query;

//     if (!userId) {
//       return res.status(400).json({ error: "userId is required" });
//     }

//     // 1. Get user active address (lat/lng)
//     const [[userLoc]] = await con.query(
//       "SELECT lat as latitude, lng as longitude FROM hr_addresses WHERE user_id=? and is_active=1",
//       [userId]
//     );

//     if (!userLoc) {
//       return res.status(404).json({ error: "User address not found" });
//     }

//     // 2. Get delivery settings
//     const [[settings]] = await con.query(
//       "SELECT delivery_rider_per_km_price, rider_speed FROM hr_settings WHERE sid=1"
//     );

//     const deliveryRate = Number(settings?.delivery_rider_per_km_price ?? 0);
//     const riderSpeed = Number(settings?.rider_speed ?? 30); // fallback 30 km/h

//     // 3. Fetch cart with vendor + products
//     const sql = `
//       SELECT 
//         u.id AS vendor_id,
//          u.business_type_id AS vendorcategoryid,
//         u.latitude AS vendor_lat,
//         u.longitude AS vendor_lng,
//         COALESCE(u.business_name, CONCAT(u.first_name, ' ', u.last_name)) AS vendor_name,
//         u.company_name AS vendor_image, -- TODO: replace with a real image/logo column
//         p.pid AS product_id,
//         p.product_name AS product_name,
//         p.product_image AS product_image,
//         p.sku AS sku,
//         p.brand AS brand,
//         p.mrp_price AS mrp,
//         COALESCE(coi.unit_price, p.price) AS price,
//         coi.quantity AS quantity,
//         p.product_cat AS category,
//         p.product_sub_cat AS sub_category,
//         p.product_unit_id AS product_unit_id
//       FROM hr_cart_order_item AS coi
//       JOIN hr_product AS p ON p.pid = coi.product_id
//       JOIN hr_users AS u ON u.id = p.vendor_id
//       WHERE coi.user_id = ? AND coi.quantity > 0
//       ORDER BY u.id, p.product_name
//     `;

//     const [rows] = await con.query(sql, [userId]);

//     // 4. Group by vendor
//     const byVendor = new Map();

//     for await (const r of rows) {
//       // calculate vendor distance
//       let distance = null;
//       let deliveryTime = null;

//       if (r.vendor_lat && r.vendor_lng) {
//         distance = getDistance(
//           Number(userLoc.latitude),
//           Number(userLoc.longitude),
//           Number(r.vendor_lat),
//           Number(r.vendor_lng)
//         );

//         // Example: minutes = distance / speed * 60
//         deliveryTime = Math.round((distance / riderSpeed) * 60);
//       }

//       if (!byVendor.has(r.vendor_id)) {
//         byVendor.set(r.vendor_id, {
//           id: String(r.vendor_id),
//           name: r.vendor_name,
//           vendorcategoryid: r.vendorcategoryid,
//           image: r.vendor_image || null,
//           distance: distance ? Number(distance.toFixed(2)) : null, // number rounded to 2 decimals
//           deliveryFee: r.deliveryFee ? r.deliveryFee.toFixed(2) : null,
//           deliveryTime: deliveryTime ? `${deliveryTime} mins` : null,
//           items: [],
//         });
//       }

//       byVendor.get(r.vendor_id).items.push({
//         id: String(r.product_id),
//         name: r.product_name,
//         image: await getImageUrl(r.product_image) || null,
//         price: Number(r.price),
//         mrp: Number(r.mrp ?? r.price),
//         quantity: Number(r.quantity),
//         isVeg: r.sub_category?.toString().toLowerCase().includes("veg") || null,
//         category: String(r.category ?? ""),
//         weight: r.product_unit_id ? `Unit ${r.product_unit_id}` : null,
//         sku: r.sku,
//         brand: r.brand || null,
//       });
//     }

//     res.json(Array.from(byVendor.values()));
//   } catch (error) {
//     console.error("Error fetching cart:", error);
//     res.status(500).json({ error: "Something went wrong" });
//   }
// };


export const getMyCart = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    // 1. Get user active address (lat/lng)
    const [[userLoc]] = await con.query(
      "SELECT lat as latitude, lng as longitude FROM hr_addresses WHERE user_id=? AND is_active=1",
      [userId]
    );

    if (!userLoc) {
      return res.status(404).json({ error: "User address not found" });
    }

    // 2. Get delivery settings
    const [[settings]] = await con.query(
      "SELECT delivery_rider_per_km_price, rider_speed FROM hr_settings WHERE sid=1"
    );

    const deliveryRate = Number(settings?.delivery_rider_per_km_price ?? 0);
    const riderSpeed = Number(settings?.rider_speed ?? 30); // fallback 30 km/h

    // 3. Fetch cart with vendor + products (your provided query)
    const sql = `
      SELECT 
        c.*,
        p.product_name,
        p.product_image,
        p.product_desc AS product_description,
        p.product_short,
        p.price,
        p.mrp_price,
        p.stock_quantity,
        p.sku,
        p.brand,
        p.product_sub_cat,
        p.product_cat AS product_parent_category_id,
        v.company_name,
        v.business_name,
        v.shop_logo,
        v.latitude,
        v.longitude
      FROM hr_cart_order_item c
      LEFT JOIN hr_product p ON c.product_id = p.pid
      LEFT JOIN hr_users v ON c.vendor_id = v.id
      WHERE c.user_id = ?
      ORDER BY c.coid DESC
    `;

    const [rows] = await con.query(sql, [userId]);

    if (!rows.length) {
      return res.json([]);
    }

    // 4. Group by vendor
    const byVendor = new Map();

    for await (const r of rows) {
      // calculate vendor distance & delivery time
      let distance = null;
      let deliveryTime = null;
      let deliveryFee = null;

      if (r.latitude && r.longitude) {
        distance = getDistance(
          Number(userLoc.latitude),
          Number(userLoc.longitude),
          Number(r.latitude),
          Number(r.longitude)
        );

        deliveryTime = Math.round((distance / riderSpeed) * 60);
        deliveryFee = Number((distance * deliveryRate).toFixed(2));
      }

      if (!byVendor.has(r.vendor_id)) {
        byVendor.set(r.vendor_id, {
          id: String(r.vendor_id),
          name: r.business_name || r.company_name,
          image: await getImageUrl(r.shop_logo) || null,
          distance: distance ? Number(distance.toFixed(2)) : null,
          deliveryFee: deliveryFee ?? null,
          deliveryTime: deliveryTime ? `${deliveryTime} mins` : null,
          items: [],
        });
      }

      byVendor.get(r.vendor_id).items.push({
        id: String(r.product_id),
        name: r.product_name,
        image: await getImageUrl(r.product_image) || null,
        description: r.product_description || "",
        shortDescription: r.product_short || "",
        price: Number(r.price),
        mrp: Number(r.mrp_price ?? r.price),
        quantity: Number(r.quantity),
        stock_quantity: Number(r.stock_quantity ?? 0),
        category: String(r.product_parent_category_id ?? ""),
        subCategory: r.product_sub_cat || null,
        sku: r.sku,
        brand: r.brand || null,
      });
    }

    res.json(Array.from(byVendor.values()));
  } catch (error) {
    console.error("Error fetching cart:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};
