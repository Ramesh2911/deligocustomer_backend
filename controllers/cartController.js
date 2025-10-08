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
        coid: Number(r.coid),
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

//===== removeCartItem=====
export const removeCartItem = async (req, res) => {
  try {
    const { coid, user_id } = req.body;

    if (!coid || !user_id) {
      return res.status(400).json({ status: false, message: "coid and user_id are required" });
    }
   
    const [rows] = await con.query(
      "SELECT * FROM hr_cart_order_item WHERE coid = ? AND user_id = ?",
      [coid, user_id]
    );

    if (!rows.length) {
      return res.status(404).json({ status: false, message: "Cart item not found" });
    }
   
    await con.query(
      "DELETE FROM hr_cart_order_item WHERE coid = ? AND user_id = ?",
      [coid, user_id]
    );

    return res.json({ status: true, message: "Item removed successfully" });
  } catch (error) {
    console.error("Error removing cart item:", error);
    return res.status(500).json({ status: false, message: "Something went wrong" });
  }
};

//=====updateCartQuantity=====
export const updateCartQuantity = async (req, res) => {
  try {
    const { coid, user_id, change } = req.body;

    if (!coid || !user_id || typeof change !== "number") {
      return res.status(400).json({ status: false, message: "coid, user_id, and change are required" });
    }
    
    const [rows] = await con.query(
      "SELECT quantity FROM hr_cart_order_item WHERE coid = ? AND user_id = ?",
      [coid, user_id]
    );

    if (!rows.length) {
      return res.status(404).json({ status: false, message: "Cart item not found" });
    }

    const currentQuantity = Number(rows[0].quantity);
    const newQuantity = Math.max(0, currentQuantity + change); 

    if (newQuantity === 0) {
      await con.query("DELETE FROM hr_cart_order_item WHERE coid = ? AND user_id = ?", [coid, user_id]);
      return res.json({ status: true, message: "Item removed from cart", newQuantity: 0 });
    }
    
    await con.query(
      "UPDATE hr_cart_order_item SET quantity = ? WHERE coid = ? AND user_id = ?",
      [newQuantity, coid, user_id]
    );

    return res.json({ status: true, message: "Quantity updated successfully", newQuantity });
  } catch (error) {
    console.error("Error updating quantity:", error);
    return res.status(500).json({ status: false, message: "Something went wrong" });
  }
};


