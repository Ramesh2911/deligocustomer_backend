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

    // 1. Fetch active address for user
    const [addressRows] = await con.execute(
      'SELECT * FROM hr_addresses WHERE user_id = ? AND is_active = 1',
      [userid]
    );

    if (addressRows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'No active address found for user' });
    }
    const address = addressRows[0];

    // 2. Sum total_amount from cart
    const [cartSumRows] = await con.execute(
      `SELECT hcoi.vendor_id, hcoi.quantity, hp.price 
       FROM hr_cart_order_item hcoi
       LEFT JOIN hr_product hp ON hp.pid = hcoi.product_id
       WHERE hcoi.parent_categor_id = ? 
         AND hcoi.vendor_id = ? 
         AND hcoi.user_id = ?`,
      [catid, vendorid, userid]
    );

    if (cartSumRows.length === 0) {
      return res.status(400).json({ status: 'error', message: 'No items found in cart' });
    }

    // Calculate product total
    const ptval = cartSumRows.reduce((acc, row) => acc + (row.quantity * row.price), 0);
    const deliveryfee = 2.0; // TODO: dynamic per vendor/config
    const totalAmount = ptval + deliveryfee;

    // 3. Insert into hr_order
    const [orderResult] = await con.execute(
      `INSERT INTO hr_order (
        user_id, vendor_id, product_amount, delivery_amount, discount, tax_amount, total_amount,
        payment_method, full_name, mobile, latitude, longitude, shipping_address, billing_address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userid,
        vendorid,
        Number(ptval.toFixed(2)),
        Number(deliveryfee.toFixed(2)),
        0.00, // discount
        0.00, // tax_amount (order-level, can recalc later)
        Number(totalAmount.toFixed(2)),
        paymentmethod || 1,
        address.full_name,
        address.mobile,
        address.lat,
        address.lng,
        address.house,
        address.house,
      ]
    );

    const lastInsertId = orderResult.insertId;

    // 4. Get cart items with product details (added hp.tax_price)
    const [cartItems] = await con.execute(
      `SELECT hcoi.vendor_id, hcoi.product_id, hp.product_name, hp.sku, hp.discount,
              hcoi.quantity, hp.price, hp.tax_price
       FROM hr_cart_order_item hcoi
       LEFT JOIN hr_product hp ON hp.pid = hcoi.product_id
       WHERE hcoi.parent_categor_id = ? 
         AND hcoi.vendor_id = ? 
         AND hcoi.user_id = ?`,
      [catid, vendorid, userid]
    );

    // 5. Insert each cart item into hr_order_item
    for (const item of cartItems) {
      const unitPrice = Number(item.price) || 0;
      const discount = Number(item.discount) || 0;
      const taxRate = Number(item.tax_price) || 0;

      const totalPrice = item.quantity * unitPrice;
      const taxAmount = item.quantity * taxRate;
      const totalAmountItem = totalPrice + taxAmount - discount;

      await con.execute(
        `INSERT INTO hr_order_item (
          order_id, product_id, product_name, sku, quantity, unit_price, discount, 
          total_price, tax_amount, total_amount, vendor_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          lastInsertId,
          item.product_id,
          item.product_name,
          item.sku,
          item.quantity,
          unitPrice,
          discount,
          totalPrice,
          taxAmount,
          totalAmountItem,
          item.vendor_id,
        ]
      );
    }

    // 6. Delete cart items after order is placed
    await con.execute(
      'DELETE FROM hr_cart_order_item WHERE parent_categor_id = ? AND vendor_id = ? AND user_id = ?',
      [catid, vendorid, userid]
    );

    return res.json({ status: 'success', message: 'Order placed successfully!', order_id: lastInsertId });
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

// export const getOrderWithItems = async (req, res) => {
//   try {
//     const { orderId } = req.query;
//     if (!orderId) {
//       return res.status(400).json({ error: "orderId is required" });
//     }

//     const sql = `
//      SELECT 
//     o.oid AS order_id,
//     o.user_id,
//     o.vendor_id,
//     o.product_amount,
//     o.delivery_amount,
//     o.discount AS order_discount,
//     o.tax_amount AS order_tax,
//     o.total_amount AS order_total,
//     o.payment_method,
//     o.full_name,
//     o.mobile,
//     o.shipping_address,
//     o.billing_address,
//     o.status AS order_status,
//     o.notes,
//     o.created_time,

//     -- Delivery details
//     d.id AS delivery_id,
//     d.rating AS delivery_rating,
//     d.first_name AS delivery_name,
//     d.mobile AS delivery_mobile,
//     d.profile_picture AS delivery_profile_picture,

//     -- Order items
//     i.oiid AS item_id,
//     i.product_id,
//     i.product_name,
//     i.sku,
//     i.quantity,
//     i.unit_price,
//     i.discount AS item_discount,
//     i.total_price,
//     i.tax_amount AS item_tax,
//     i.total_amount AS item_total,
//     i.status AS item_status,
//     p.product_image,   

//     -- User active address
//     a.lat AS user_latitude,
//     a.lng AS user_longitude,

//     -- Vendor details
//     v.business_name,
//     v.company_name,
//     v.shop_logo,
//     v.latitude AS vendor_latitude,
//     v.longitude AS vendor_longitude

// FROM hr_order o
// LEFT JOIN hr_order_item i 
//     ON o.oid = i.order_id
// LEFT JOIN hr_product p               
// -- ✅ join product table
//     ON p.pid = i.product_id
// LEFT JOIN hr_users d
//     ON o.delivery_id = d.id
// LEFT JOIN hr_addresses a
//     ON a.user_id = o.user_id AND a.is_active = 1
// LEFT JOIN hr_users v
//     ON v.id = o.vendor_id
// WHERE o.oid = ? `;

//    // console.log("Executing SQL:", sql, "with orderId:", orderId);

//     const [results] = await con.query(sql, [orderId]);

//     if (!results || results.length === 0) {
//       console.warn("⚠️ No order found for ID:", orderId);
//       return res.status(404).json({ message: "Order not found" });
//     }

//      // Build order object
//     const OrderDetails = {
//       status:true,
//       orderId: results[0].order_id,
//       user_id: results[0].user_id,
//       vendor_id: results[0].vendor_id,
//       product_amount: Number(results[0].product_amount),
//       delivery_amount: Number(results[0].delivery_amount),
//       discount: Number(results[0].order_discount),
//       tax_amount: Number(results[0].order_tax),
//       total_amount: Number(results[0].order_total),
//       payment_method: results[0].payment_method,
//       full_name: results[0].full_name,
//       mobile: results[0].mobile,
//       shipping_address: results[0].shipping_address,
//       billing_address: results[0].billing_address,
//       deliverystatus: results[0].order_status,
//       notes: results[0].notes,
//       created_time: results[0].created_time,

//       deliveryPartner: results[0].delivery_id
//         ? {
//             id: results[0].delivery_id,
//             name: results[0].delivery_name,
//             rating: results[0].delivery_rating,
//             phone: results[0].delivery_mobile,
//             image: results[0].delivery_profile_picture,
//           }
//         : null,

//       user_latitude: Number(results[0].user_latitude),
//       user_longitude: Number(results[0].user_longitude),

//       storeName: results[0].business_name,
//       vendor_company_name: results[0].company_name,
//       vendor_latitude: Number(results[0].vendor_latitude),
//       vendor_longitude: Number(results[0].vendor_longitude),
//       storeImage: results[0].shop_logo,

//       deliverystatus: "delivered", 
//       estimatedTime: "8 minutes",

//       payment: {
//         subtotal: Number(results[0].product_amount),
//         deliveryFee: Number(results[0].delivery_amount),
//         tax: Number(results[0].order_tax),
//         total: Number(results[0].order_total),
//       },

//       items: results
//         .filter((row) => row.item_id) // only valid rows with items
//         .map((row) => ({
//           //id: row.item_id,
//           id: row.product_id,
//           name: row.product_name,
//           image: row.product_image,
//           quantity: Number(row.quantity),
//           price: Number(row.total_price),
//           //discount: Number(row.item_discount),
//          // total_price: Number(row.total_price),
//          // tax_amount: Number(row.item_tax),
//          // total_amount: Number(row.item_total),
//          // status: row.item_status,
//         })),
//     };

//     //console.log("✅ Final Order Object:", JSON.stringify(OrderDetails, null, 2));
//     res.json(OrderDetails);

//   } catch (error) {
//     console.error("❌ Unexpected Error:", error);
//     res.status(500).json({ error: "Something went wrong" });
//   }
// };


export const getOrderWithItems = async (req, res) => {
  try {
    const { orderId } = req.query;
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
    ON p.pid = i.product_id
LEFT JOIN hr_users d
    ON o.delivery_id = d.id
LEFT JOIN hr_addresses a
    ON a.user_id = o.user_id AND a.is_active = 1
LEFT JOIN hr_users v
    ON v.id = o.vendor_id
WHERE o.oid = ? `;

    const [results] = await con.query(sql, [orderId]);

    if (!results || results.length === 0) {
      return res.status(404).json({ message: "Order not found" });
    }

    const firstRow = results[0];

    const OrderDetails = {
      status: true,
      orderId: firstRow.order_id,
      user_id: firstRow.user_id,
      vendor_id: firstRow.vendor_id,
      product_amount: Number(firstRow.product_amount),
      delivery_amount: Number(firstRow.delivery_amount),
      discount: Number(firstRow.order_discount),
      tax_amount: Number(firstRow.order_tax),
      total_amount: Number(firstRow.order_total),
      payment_method: firstRow.payment_method,
      full_name: firstRow.full_name,
      mobile: firstRow.mobile,
      shipping_address: firstRow.shipping_address,
      billing_address: firstRow.billing_address,
      deliverystatus: firstRow.order_status,
      notes: firstRow.notes,
      created_time: firstRow.created_time,

      deliveryPartner: firstRow.delivery_id
        ? {
            id: firstRow.delivery_id,
            name: firstRow.delivery_name,
            rating: firstRow.delivery_rating,
            phone: firstRow.delivery_mobile,
            image: await getImageUrl(firstRow.delivery_profile_picture),
          }
        : null,

      user_latitude: Number(firstRow.user_latitude),
      user_longitude: Number(firstRow.user_longitude),

      storeName: firstRow.business_name,
      vendor_company_name: firstRow.company_name,
      vendor_latitude: Number(firstRow.vendor_latitude),
      vendor_longitude: Number(firstRow.vendor_longitude),
      storeImage: await getImageUrl(firstRow.shop_logo),

      deliverystatus: "delivered", // demo only
      estimatedTime: "8 minutes",

      payment: {
        subtotal: Number(firstRow.product_amount),
        deliveryFee: Number(firstRow.delivery_amount),
        tax: Number(firstRow.order_tax),
        total: Number(firstRow.order_total),
      },

      items: await Promise.all(
        results
          .filter((row) => row.item_id)
          .map(async (row) => ({
            id: row.product_id,
            name: row.product_name,
            image: await getImageUrl(row.product_image),
            quantity: Number(row.quantity),
            price: Number(row.total_price),
          }))
      ),
    };

    res.json(OrderDetails);
  } catch (error) {
    console.error("❌ Unexpected Error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};

//=== Reorder by customer===
export const reorderItems = async (req, res) => {
  const { orderId } = req.query;

  if (!orderId) {
    return res.status(400).json({ status: false, message: "order_id is required in query" });
  }

  try {
    // 1️⃣ Fetch order items
    const sqlFetch = `
      SELECT 
        oi.product_id, 
        oi.quantity, 
        oi.vendor_id, 
        p.product_cat AS parent_category_id, 
        o.user_id 
      FROM hr_order_item oi
      LEFT JOIN hr_product p ON p.pid = oi.product_id
      LEFT JOIN hr_order o ON o.oid = oi.order_id
      WHERE oi.order_id = ?;
    `;

    const [rows] = await con.query(sqlFetch, [orderId]);

    if (!rows.length) {
      return res.status(404).json({ status: false, message: "No items found for this order" });
    }

    // 2️⃣ Insert into hr_cart_order_item
    const insertPromises = rows.map(item => {
      const sqlInsert = `
        INSERT INTO hr_cart_order_item
        (user_id, parent_categor_id, product_id, quantity, vendor_id)
        VALUES (?, ?, ?, ?, ?)
      `;
      return con.query(sqlInsert, [
        item.user_id,
        item.parent_category_id,
        item.product_id,
        item.quantity,
        item.vendor_id
      ]);
    });

    await Promise.all(insertPromises);

    // 3️⃣ Respond success
    res.json({
      status: true,
      message: "Items reordered successfully",
      data: rows
    });

  } catch (error) {
    console.error("Error reordering items:", error);
    res.status(500).json({ status: false, message: "Database error", error: error.message });
  }
};


//=== addonnotes ====
export const addOrderNote = async (req, res) => {
  const { orderId } = req.query;
  const { note } = req.body;

  if (!orderId || !note) {
    return res.status(400).json({ success: false, message: "orderId and note are required" });
  }

  try {
    const sql = "UPDATE hr_order SET notes = ? WHERE oid = ?";
    const [result] = await con.query(sql, [note, orderId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Note added successfully"
    });
  } catch (error) {
    console.error("Error inserting note:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};