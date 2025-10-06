import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "../config/awsConfig.js";
import con from '../db/db.js';

async function getImageUrl(key) {
  if (!key) return null;
  const cleanedKey = key.replace(/^https?:\/\/[^/]+\/[^/]+\//, "");

  const command = new GetObjectCommand({
    Bucket: "deligo.image",
    Key: cleanedKey, 
  });

  return await getSignedUrl(s3, command, { expiresIn: 3600 });
}

export const getCheckout = async (req, res) => {
  try {
    const { userid, categoryId, vendorId } = req.query;

    if (!userid) {
      return res.status(400).json({
        status: "error",
        message: 'User ID is required in query parameter (?userid=)',
      });
    }

   const [vendorRows] = await con.execute(
      'SELECT u.id AS vendor_id, u.latitude AS vendor_lat, u.longitude AS vendor_lng, a.lat AS user_lat, a.lng AS user_lng, ( 6371 * ACOS( COS(RADIANS(a.lat)) * COS(RADIANS(u.latitude)) * COS(RADIANS(u.longitude) - RADIANS(a.lng)) + SIN(RADIANS(a.lat)) * SIN(RADIANS(u.latitude)) ) ) AS distance_km FROM hr_users u JOIN hr_addresses a ON a.user_id = ? AND a.is_active = 1 WHERE u.id = ?',
      [userid,vendorId]
    );
if (!vendorRows.length) {
  return res.status(404).json({ status: 'error', message: 'Vendor or user not found' });
}

const vendorLocation = vendorRows[0];
const todistance = Number(vendorLocation.distance_km.toFixed(2)); // ensure numeric
    
const [setrows] = await con.execute(
      `SELECT delivery_rider_charges, 
              delivery_rider_per_km_price, 
              delivery_distance_limit_km, 
              rider_speed 
       FROM hr_settings`
    );

  const settings = setrows[0];

    const [rows] = await con.query(
      `SELECT 
         hr_product.pid, 
         hr_product.product_name, 
         hr_product.product_image, 
         hr_product.price, 
         hr_cart_order_item.coid,
         hr_cart_order_item.quantity, 
           hr_product.price,
          hr_product.tax_percentage,
           hr_product.tax_price
       FROM hr_cart_order_item
       JOIN hr_product 
         ON hr_product.pid = hr_cart_order_item.product_id
       WHERE hr_cart_order_item.user_id = ?
         AND hr_cart_order_item.parent_categor_id = ?
         AND hr_product.vendor_id = ?`,
      [userid, categoryId, vendorId]
    );

    // Process product images to get signed URLs
    const processedRows = await Promise.all(rows.map(async (row) => ({
      ...row,
      product_image: await getImageUrl(row.product_image)
    })));

    // Calculate subtotal
    const subtotal = rows.reduce(
      (acc, item) => acc + parseFloat(item.price*item.quantity),
      0
    );


    
    // Static delivery fee for now (can make dynamic later)
    //const deliveryfee = 2.0;
 const deliveryfee = settings.delivery_rider_charges + (todistance * settings.delivery_rider_per_km_price);
    const totalamount = subtotal + deliveryfee;

    return res.status(200).json({
      status: "success",
      poductlist: processedRows,
      subtotal: subtotal.toFixed(2),
      deliveryfee: deliveryfee.toFixed(2),
      totalamount: totalamount.toFixed(2),
    });

  } catch (error) {
    console.error('Get Checkout Error:', error.message);
    return res.status(500).json({
      status: "error",
      message: 'Server error while fetching checkout items',
    });
  }
};

export const getCheckoutUpdate = async (req, res) => {
  try {
    const { productid, categoryid, quantity, userid, vendorId } = req.body; 
    const qty = parseInt(quantity, 10);

    if (!productid || !categoryid || !userid || isNaN(qty)) {
      return res.status(400).json({ status: "error", message: "Invalid parameters" });
    }

    const [cartRows] = await con.query(
      "SELECT * FROM hr_cart_order_item WHERE parent_categor_id=? AND user_id=? AND product_id=?",
      [categoryid, userid, productid]
    );

    if (cartRows.length > 0) {
      const product = cartRows[0];
      if (qty > 0) {
        await con.query(
          "UPDATE hr_cart_order_item SET quantity=?, modified_time=NOW() WHERE coid=?",
          [qty, product.coid]
        );
      } else {
        await con.query(
          "DELETE FROM hr_cart_order_item WHERE coid=?",
          [product.coid]
        );
      }
    } else {
      if (qty > 0) {
        await con.query(
          `INSERT INTO hr_cart_order_item 
            (user_id, parent_categor_id, product_id, quantity, vendor_id, created_time, modified_time) 
           VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
          [userid, categoryid, productid, qty, vendorId]
        );
      }
    }
    
    const [rows] = await con.query(
      `SELECT 
         p.pid, 
         p.product_name, 
         p.product_image, 
         p.price, 
         c.coid,
         c.quantity
       FROM hr_cart_order_item AS c
       JOIN hr_product AS p ON p.pid = c.product_id
       WHERE c.user_id=? AND c.parent_categor_id=? AND p.vendor_id=?`,
      [userid, categoryid, vendorId]
    );
   
    const processedRows = await Promise.all(rows.map(async (row) => ({
      ...row,
      product_image: await getImageUrl(row.product_image),
      total_amount: (row.price * row.quantity).toFixed(2)
    })));

    const subtotal = processedRows.reduce(
      (acc, item) => acc + parseFloat(item.total_amount || 0),
      0
    );

    const deliveryfee = 2.0;
    const totalamount = subtotal + deliveryfee;

    return res.status(200).json({
      status: "success",    
      items: processedRows,
      subtotal: subtotal.toFixed(2),
      deliveryfee: deliveryfee.toFixed(2),
      totalamount: totalamount.toFixed(2),
    });

  } catch (err) {
    console.error("Error updating cart:", err);
    return res.status(500).json({ status: "error", message: "Server error" });
  } finally {
    if (con) con.release();
  }
};