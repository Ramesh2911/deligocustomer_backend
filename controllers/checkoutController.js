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

export const getCheckout = async (req, res) => {
  try {
    const { userid, categoryId, vendorId } = req.query;

    if (!userid) {
      return res.status(400).json({
        status: "error",
        message: 'User ID is required in query parameter (?userid=)',
      });
    }

    const [rows] = await con.query(
      `SELECT 
         hr_product.pid, 
         hr_product.product_name, 
         hr_product.product_image, 
         hr_product.price, 
         hr_cart_order_item.coid,
         hr_cart_order_item.quantity, 
         hr_cart_order_item.unit_price, 
         hr_cart_order_item.total_amount
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
      (acc, item) => acc + parseFloat(item.total_amount || 0),
      0
    );

    // Static delivery fee for now (can make dynamic later)
    const deliveryfee = 2.0;

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
  let connection;
  try {
    const { productid, categoryid, quantity, userid,vendorId } = req.body; // ✅ Changed from req.query to req.body

    // Validate & convert quantity
    const qty = parseInt(quantity, 10);
    if (!productid || !categoryid || !userid || isNaN(qty)) {
      return res.status(400).json({ status: "error", message: "Invalid parameters" });
    }

    // Get DB connection
    connection = await con.getConnection();

    // 1️⃣ Check if product already exists in cart
    const [cartRows] = await connection.query(
      "SELECT * FROM `hr_cart_order_item` WHERE `parent_categor_id`=? AND `user_id`=? AND `product_id`=?",
      [categoryid, userid, productid]
    );

    if (cartRows.length > 0) {
      const product = cartRows[0];
      const totalPrice = product.unit_price * qty;

      if (qty > 0) {
        // Update quantity
        await connection.query(
          "UPDATE `hr_cart_order_item` SET `quantity`=?, `total_amount`=? WHERE `coid`=?",
          [qty, totalPrice, product.coid]
        );
      } else {
        // Remove item if quantity is 0
        await connection.query(
          "DELETE FROM `hr_cart_order_item` WHERE `coid`=?",
          [product.coid]
        );
      }
    } else {
      // 2️⃣ Product not in cart → fetch product details
      const [prodRows] = await connection.query(
        "SELECT * FROM `hr_product` WHERE `pid`=?",
        [productid]
      );

      if (prodRows.length > 0) {
        const prod = prodRows[0];
        const totalPrice = prod.price * qty;

        await connection.query(
          `INSERT INTO hr_cart_order_item 
          (user_id, parent_categor_id, product_id, product_name, sku, quantity, unit_price, total_price, tax_amount, total_amount, vendor_id) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userid,
            categoryid,
            prod.pid,
            prod.product_name,
            prod.sku,
            qty,
            prod.price,
            totalPrice, // total_price
            0,          // tax_amount
            totalPrice, // total_amount
            prod.vendor_id,
          ]
        );
      }
    }

    // 3️⃣ Return updated cart count
    const [rows] = await con.query(
      `SELECT 
         hr_product.pid, 
         hr_product.product_name, 
         hr_product.product_image, 
         hr_product.price, 
         hr_cart_order_item.coid,
         hr_cart_order_item.quantity, 
         hr_cart_order_item.unit_price, 
         hr_cart_order_item.total_amount
       FROM hr_cart_order_item
       JOIN hr_product 
         ON hr_product.pid = hr_cart_order_item.product_id
       WHERE hr_cart_order_item.user_id = ?
         AND hr_cart_order_item.parent_categor_id = ?
         AND hr_product.vendor_id = ?`,
      [userid, categoryid, vendorId]
    );

    // Process product images to get signed URLs
    const processedRows = await Promise.all(rows.map(async (row) => ({
      ...row,
      product_image: await getImageUrl(row.product_image)
    })));

    // Calculate subtotal
    const subtotal = rows.reduce(
      (acc, item) => acc + parseFloat(item.total_amount || 0),
      0
    );

    // Static delivery fee for now (can make dynamic later)
    const deliveryfee = 2.0;

    const totalamount = subtotal + deliveryfee;

    return res.status(200).json({
      status: "success",    
      subtotal: subtotal.toFixed(2),
      deliveryfee: deliveryfee.toFixed(2),
      totalamount: totalamount.toFixed(2),
    });

  } catch (err) {
    console.error("Error updating cart:", err);
    return res.status(500).json({ status: "error", message: "Server error" });
  } finally {
    if (connection) connection.release();
  }
};