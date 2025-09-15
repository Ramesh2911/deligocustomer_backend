import con from '../db/db.js';

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
  return R * c;
}

// ===== getMyCart =====
export const getMyCart = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    // 1. Get user active address (lat/lng)
    const [[userLoc]] = await con.query(
      "SELECT latitude, longitude FROM hr_addresse WHERE user_id=? AND is_active=1",
      [userId]
    );

    if (!userLoc) {
      return res.status(404).json({ error: "User address not found" });
    }

    // 2. Fetch cart with vendor & product details
    const sql = `
      SELECT 
        u.id  AS vendor_id,
        u.business_name AS vendor_name,
        u.shop_logo  AS vendor_image,
        u.latitude AS vendor_lat,
        u.longitude AS vendor_lng,
        p.pid           AS product_id,
        p.product_name  AS product_name,
        p.product_image AS product_image,
        p.sku           AS sku,
        p.brand         AS brand,
        p.mrp_price     AS mrp,
        COALESCE(coi.unit_price, p.price) AS price,
        coi.quantity    AS quantity,
        p.product_cat   AS category,
        p.product_sub_cat AS sub_category,
        p.product_unit_id AS product_unit_id
      FROM hr_cart_order_item AS coi
      JOIN hr_product AS p  ON p.pid = coi.product_id
      JOIN hr_users   AS u  ON u.id  = p.vendor_id
      WHERE coi.user_id = ?
        AND coi.quantity > 0
      ORDER BY u.id, p.product_name
    `;

    const [rows] = await con.query(sql, [userId]);

    // 3. Group by vendor
    const byVendor = new Map();

    for (const r of rows) {
      if (!byVendor.has(r.vendor_id)) {
        // compute distance (if vendor has lat/lng)
        let distance = null;
        let deliveryTime = null;
        if (r.vendor_lat && r.vendor_lng) {
          distance = getDistance(
            userLoc.latitude,
            userLoc.longitude,
            r.vendor_lat,
            r.vendor_lng
          );
          // Example: assume 30 km/h average delivery speed
          deliveryTime = Math.round((distance / 30) * 60); // in minutes
        }

        byVendor.set(r.vendor_id, {
          id: String(r.vendor_id),
          name: r.vendor_name,
          image: r.vendor_image || null,
          distance: distance ? distance.toFixed(2) + " km" : null,
          deliveryTime: deliveryTime ? `${deliveryTime} mins` : null,
          items: [],
        });
      }

      byVendor.get(r.vendor_id).items.push({
        id: String(r.product_id),
        name: r.product_name,
        image: r.product_image || null,
        price: Number(r.price),
        mrp: Number(r.mrp ?? r.price),
        quantity: Number(r.quantity),
        isVeg: r.sub_category
          ? r.sub_category.toLowerCase() === "veg"
            ? true
            : r.sub_category.toLowerCase() === "non-veg"
            ? false
            : null
          : null,
        category: String(r.category ?? ""),
        weight: r.product_unit_id ? `Unit ${r.product_unit_id}` : null,
        sku: r.sku,
        brand: r.brand || null,
      });
    }

    // 4. Return response
    res.json(Array.from(byVendor.values()));

  } catch (error) {
    console.error("Error fetching cart:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};
