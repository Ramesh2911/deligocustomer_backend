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

//=====New order=====
export const postOrder = async (req, res) => {
  try {
    const { userid, paymentmethod, catid, vendorid } = req.body;

    // Fetch active address for user
    const [addressRows] = await con.execute(
      'SELECT * FROM hr_addresses WHERE user_id = ? AND is_active = 1',
      [userid]
    );
    //console.log('addressRows Result:', addressRows);
    if (addressRows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'No active address found for user' });
    }
    const address = addressRows[0];

    // Sum total_amount and get vendor_id from cart order item for user, vendor and category
    const [cartSumRows] = await con.execute(
      'SELECT SUM(total_amount) AS ptval, vendor_id FROM hr_cart_order_item WHERE parent_categor_id = ? AND vendor_id = ? AND user_id = ?',
      [catid, vendorid, userid]
    );

    const ptval = parseFloat(cartSumRows[0].ptval) || 0;
    const deliveryfee = 2.0;
    const totalAmount = ptval + deliveryfee;

    // Insert into hr_order
    const [orderResult] = await con.execute(
      `INSERT INTO hr_order (
        user_id, vendor_id, product_amount, delivery_amount, discount, tax_amount, total_amount,
        payment_method, full_name, mobile, latitude, longitude, shipping_address, billing_address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userid,
        vendorid,
        ptval.toFixed(2),
        deliveryfee.toFixed(2),
        '0.00',
        '0.00',
        totalAmount.toFixed(2),
        paymentmethod || 1,
        address.full_name,
        address.mobile,
        address.lat,
        address.lng,
        address.house,
        address.house,
      ]
    );
//console.log("orderResult---",orderResult);
    const lastInsertId = orderResult.insertId;

    // Get cart items for that user, vendor and category
    const [cartItems] = await con.execute(
      'SELECT * FROM hr_cart_order_item WHERE parent_categor_id = ? AND vendor_id = ? AND user_id = ?',
      [catid, vendorid, userid]
    );

    // Insert each item into hr_order_item
    for (const item of cartItems) {
      await con.execute(
        `INSERT INTO hr_order_item (
          order_id, product_id, product_name, sku, quantity, unit_price, discount, total_price, tax_amount, total_amount, vendor_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          lastInsertId,
          item.product_id,
          item.product_name,         
          item.sku,
          item.quantity,
          item.unit_price,
          item.discount,
          item.total_price,
          item.tax_amount,
          item.total_amount,
          item.vendor_id,
        ]
      );
    }

    // Delete cart items after creating the order
    await con.execute(
      'DELETE FROM hr_cart_order_item WHERE parent_categor_id = ? AND vendor_id = ? AND user_id = ?',
      [catid, vendorid, userid]
    );

    return res.json({ status: 'success', message: 'Product saved successfully!' });
  } catch (error) {
    console.error('postOrder error:', error);
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

//=== order list by customer====
export const getOrders = async (req, res) => {
  try {
    const { userid } = req.query;
  
    const fetchOrders = async (statusCondition) => {
      const [rows] = await con.query(`
        SELECT 
          o.oid, 
          o.vendor_id, 
          o.shipping_address AS deliveryAddress,
          u.shop_logo AS restaurantImage, 
          u.business_name AS restaurantName, 
          u.company_name AS restaurantCName, 
          u.country_code AS restaurantCCode, 
          u.contact_mobile AS restaurantCMobile, 
          o.total_amount AS totalAmount, 
          o.delivery_id, 
          DATE_FORMAT(o.created_time, '%l:%i %p') AS orderTime,
          s.od_status_name AS status,
          GROUP_CONCAT(oi.product_name ORDER BY oi.oiid SEPARATOR '||') AS orderItems
        FROM hr_order o
        JOIN hr_users u ON o.vendor_id = u.id
        JOIN hr_order_status s ON o.status = s.osid
        JOIN hr_order_item oi ON o.oid = oi.order_id
        WHERE o.user_id = ?
          AND ${statusCondition}
        GROUP BY o.oid
        ORDER BY o.oid DESC
      `, [userid]);

      return Promise.all(rows.map(async order => ({
        id: String(order.oid),
        restaurantName: order.restaurantName,
        restaurantImage: await getImageUrl(order.restaurantImage),
        orderItems: order.orderItems ? order.orderItems.split('||').map(item => item.trim()) : [],
        totalAmount: Number(order.totalAmount),
        status: order.status.toLowerCase(),
        orderTime: order.orderTime,
        orderNumber: `#${order.oid}`,
        rating: null,
        deliveryAddress: order.deliveryAddress,
        restaurantMobileNo: order.restaurantCCode+order.restaurantCMobile        
      })));
    };

    // Fetch both sets of orders
    // Fetch and process both sets of orders
    const [activeOrders, completedOrders] = await Promise.all([
      fetchOrders('o.status < 4'),
      fetchOrders('o.status > 3')
    ]);

    // Send both in one response
    res.json({
      activeOrders,
      completedOrders
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ status: false, message: 'Error fetching orders' });
  }
};

export const getOrderWithItems = async (req, res) => {
  try {
    const { orderId } = req.query;
    console.log("API Called with orderId:", orderId);

    if (!orderId) {
      return res.status(400).json({ error: "orderId is required" });
    }

    const sql = `
     SELECT 
    o.oid AS order_id,
    o.user_id,
    o.vendor_id,
    o.product_amount,
    o.delivery_amount,
    o.discount AS order_discount,
    o.tax_amount AS order_tax,
    o.total_amount AS order_total,
    o.payment_method,
    o.full_name,
    o.mobile,
    o.shipping_address,
    o.billing_address,
    o.status AS order_status,
    o.notes,
    o.created_time,

    -- Delivery details
    d.id AS delivery_id,
    d.rating AS delivery_rating,
    d.first_name AS delivery_name,
    d.mobile AS delivery_mobile,
    d.profile_picture AS delivery_profile_picture,

    -- Order items
    i.oiid AS item_id,
    i.product_id,
    i.product_name,
    i.sku,
    i.quantity,
    i.unit_price,
    i.discount AS item_discount,
    i.total_price,
    i.tax_amount AS item_tax,
    i.total_amount AS item_total,
    i.status AS item_status,
    p.product_image,   

    -- User active address
    a.lat AS user_latitude,
    a.lng AS user_longitude,

    -- Vendor details
    v.business_name,
    v.company_name,
    v.shop_logo,
    v.latitude AS vendor_latitude,
    v.longitude AS vendor_longitude

FROM hr_order o
LEFT JOIN hr_order_item i 
    ON o.oid = i.order_id
LEFT JOIN hr_product p               
-- ✅ join product table
    ON p.pid = i.product_id
LEFT JOIN hr_users d
    ON o.delivery_id = d.id
LEFT JOIN hr_addresses a
    ON a.user_id = o.user_id AND a.is_active = 1
LEFT JOIN hr_users v
    ON v.id = o.vendor_id
WHERE o.oid = ? `;

   // console.log("Executing SQL:", sql, "with orderId:", orderId);

    const [results] = await con.query(sql, [orderId]);

    if (!results || results.length === 0) {
      console.warn("⚠️ No order found for ID:", orderId);
      return res.status(404).json({ message: "Order not found" });
    }

     // Build order object
    const OrderDetails = {
      status:true,
      orderId: results[0].order_id,
      user_id: results[0].user_id,
      vendor_id: results[0].vendor_id,
      product_amount: Number(results[0].product_amount),
      delivery_amount: Number(results[0].delivery_amount),
      discount: Number(results[0].order_discount),
      tax_amount: Number(results[0].order_tax),
      total_amount: Number(results[0].order_total),
      payment_method: results[0].payment_method,
      full_name: results[0].full_name,
      mobile: results[0].mobile,
      shipping_address: results[0].shipping_address,
      billing_address: results[0].billing_address,
      deliverystatus: results[0].order_status,
      notes: results[0].notes,
      created_time: results[0].created_time,

      deliveryPartner: results[0].delivery_id
        ? {
            id: results[0].delivery_id,
            name: results[0].delivery_name,
            rating: results[0].delivery_rating,
            phone: results[0].delivery_mobile,
            image: results[0].delivery_profile_picture,
          }
        : null,

      user_latitude: Number(results[0].user_latitude),
      user_longitude: Number(results[0].user_longitude),

      storeName: results[0].business_name,
      vendor_company_name: results[0].company_name,
      vendor_latitude: Number(results[0].vendor_latitude),
      vendor_longitude: Number(results[0].vendor_longitude),
      storeImage: results[0].shop_logo,

      deliverystatus: "delivered", // 👈 keeping as delivered for demo rating
      estimatedTime: "8 minutes",

      payment: {
        subtotal: Number(results[0].product_amount),
        deliveryFee: Number(results[0].delivery_amount),
        tax: Number(results[0].order_tax),
        total: Number(results[0].order_total),
      },

      items: results
        .filter((row) => row.item_id) // only valid rows with items
        .map((row) => ({
          //id: row.item_id,
          id: row.product_id,
          name: row.product_name,
          image: row.product_image,
          quantity: Number(row.quantity),
          price: Number(row.total_price),
          //discount: Number(row.item_discount),
         // total_price: Number(row.total_price),
         // tax_amount: Number(row.item_tax),
         // total_amount: Number(row.item_total),
         // status: row.item_status,
        })),
    };

    //console.log("✅ Final Order Object:", JSON.stringify(OrderDetails, null, 2));
    res.json(OrderDetails);

  } catch (error) {
    console.error("❌ Unexpected Error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};
