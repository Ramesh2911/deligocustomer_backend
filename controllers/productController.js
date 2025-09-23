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

//==== All product base on vendor====
// export const getProduct = async (req, res) => {
//   try {
//     const { categoryId, vendorId,userId } = req.query;

//     if (!categoryId || !vendorId || !userId) {
//       return res.status(400).json({
//         status: false,
//         message: 'category_id and vendor_id are required'
//       });
//     }

//     // Step 1: Get subcategories
//     const [subcategories] = await con.query(
//       `SELECT category_name AS id, parent_id, category_name AS name, category_image ,icon
//        FROM hr_category 
//        WHERE parent_id = ? AND is_active = 1`,
//       [categoryId]
//     );

//     // Optional: Add "All" or static categories
//     const categorylst = [
//       {
//         id: 'all',
//         parent_id: categoryId,
//         name: 'All',
//         icon: '' // or a default image URL
//       }
//     ];

//     const totalCategories = [...categorylst, ...subcategories];

//     // Step 2: Get products with subcategory names
//     const [products] = await con.query(
//       `SELECT 
//     p.*,
//     c.cid,
//     c.category_name,
//     CASE WHEN w.product_id IS NOT NULL THEN 1 ELSE 0 END AS is_wishlist
// FROM 
//     hr_product p
// JOIN 
//     hr_category c 
//     ON p.product_sub_cat = c.cid
// LEFT JOIN 
//     hr_wishlist_product w
//     ON w.product_id = p.pid AND w.user_id = ?
// WHERE 
//     p.is_active = 1
//     AND p.product_cat = ?
//     AND p.vendor_id = ?`,
//       [userId,categoryId, vendorId]
//     );

//     // Step 3: Group products by category_name
//     const groupedProducts = {};

//     products.forEach(row => {
//       const category = row.category_name || 'others';
//       const product = {
//         id: row.pid,
//         name: row.product_name,
//         price: parseFloat(row.price),
//         mrp: parseFloat(row.mrp_price),
//         image: row.product_image,
//         discount: Math.round(((parseFloat(row.mrp_price) - parseFloat(row.price)) / parseFloat(row.mrp_price)) * 100),
//         rating: row.rating,
//         reviews: row.reviews,
//         is_wishlist: row.is_wishlist,
//         category:row.category_name,
//         subcategoryid:row.cid
//       };

//       if (!groupedProducts[category]) {
//         groupedProducts[category] = [];
//       }
//       groupedProducts[category].push(product);
//     });

//     // Final Response
//     return res.status(200).json({
//       status: true,
//       categories: totalCategories,
//       productsData: groupedProducts
//     });

//   } catch (error) {
//     console.error('Get Product Error:', error);
//     return res.status(500).json({
//       status: false,
//       message: 'Server error while fetching products'
//     });
//   }
// };

export const getProduct = async (req, res) => {
  try {
    const { categoryId, vendorId, userId } = req.query;

    if (!categoryId || !vendorId || !userId) {
      return res.status(400).json({
        status: false,
        message: "category_id and vendor_id are required",
      });
    }

    // Step 1: Get subcategories
    const [subcategories] = await con.query(
      `SELECT category_name AS id, parent_id, category_name AS name, category_image ,icon
       FROM hr_category 
       WHERE parent_id = ? AND is_active = 1`,
      [categoryId]
    );

    // Optional: Add "All" or static categories
    const categorylst = [
      {
        id: "all",
        parent_id: categoryId,
        name: "All",
        icon: "", // default image
      },
    ];

    const totalCategories = [...categorylst, ...subcategories];

    // Step 2: Get products with subcategory names
    const [products] = await con.query(
      `SELECT 
        p.*,
        c.cid,
        c.category_name,
        CASE WHEN w.product_id IS NOT NULL THEN 1 ELSE 0 END AS is_wishlist
      FROM hr_product p
      JOIN hr_category c ON p.product_sub_cat = c.cid
      LEFT JOIN hr_wishlist_product w
        ON w.product_id = p.pid AND w.user_id = ?
      WHERE 
        p.is_active = 1
        AND p.product_cat = ?
        AND p.vendor_id = ?`,
      [userId, categoryId, vendorId]
    );

    // Step 3: Group products by category_name
    const groupedProducts = {};

    // Use Promise.all so all images are signed in parallel
    await Promise.all(
      products.map(async (row) => {
        const signedImageUrl = await getImageUrl(row.product_image);

        const category = row.category_name || "others";
        const product = {
          id: row.pid,
          name: row.product_name,
          price: parseFloat(row.price),
          mrp: parseFloat(row.mrp_price),
          image: signedImageUrl, // ✅ send signed image
          discount: Math.round(
            ((parseFloat(row.mrp_price) - parseFloat(row.price)) /
              parseFloat(row.mrp_price)) *
              100
          ),
          rating: row.rating,
          reviews: row.reviews,
          is_wishlist: row.is_wishlist,
          category: row.category_name,
          subcategoryid: row.cid,
        };

        if (!groupedProducts[category]) {
          groupedProducts[category] = [];
        }
        groupedProducts[category].push(product);
      })
    );

    // Final Response
    return res.status(200).json({
      status: true,
      categories: totalCategories,
      productsData: groupedProducts,
    });
  } catch (error) {
    console.error("Get Product Error:", error);
    return res.status(500).json({
      status: false,
      message: "Server error while fetching products",
    });
  }
};

export const postProductOrder = async (req, res) => {
  let connection;
  try {
    const { productid, categoryid, quantity, userid } = req.body; 
    
    const qty = parseInt(quantity, 10);
    if (!productid || !categoryid || !userid || isNaN(qty)) {
      return res.status(400).json({ status: "error", message: "Invalid parameters" });
    }
   
    connection = await con.getConnection();
    
    const [cartRows] = await connection.query(
      "SELECT * FROM hr_cart_order_item WHERE parent_categor_id=? AND user_id=? AND product_id=?",
      [categoryid, userid, productid]
    );

    if (cartRows.length > 0) {
      const product = cartRows[0];
      const totalPrice = product.unit_price * qty;

      if (qty > 0) {
        // Update quantity
        await connection.query(
          "UPDATE hr_cart_order_item SET quantity=? WHERE coid=?",
          [qty, product.coid]
        );
      } else {
        // Remove item if quantity is 0
        await connection.query(
          "DELETE FROM hr_cart_order_item WHERE coid=?",
          [product.coid]
        );
      }
    } else {
      // 2️⃣ Product not in cart → fetch product details
      const [prodRows] = await connection.query(
        "SELECT * FROM hr_product WHERE pid=?",
        [productid]
      );

      if (prodRows.length > 0) {
        const prod = prodRows[0];
        const totalPrice = prod.price * qty;

        await connection.query(
          `INSERT INTO hr_cart_order_item 
          (user_id, parent_categor_id, product_id,  quantity,   vendor_id) 
          VALUES (?, ?, ?, ?, ?)`,
          [
            userid,
            categoryid,
            prod.pid,            
            qty,           
            prod.vendor_id,
          ]
        );
      }
    }

    // 3️⃣ Return updated cart count
    const [countRows] = await connection.query(
      "SELECT SUM(quantity) AS addcart FROM hr_cart_order_item WHERE parent_categor_id=? AND user_id=?",
      [categoryid, userid]
    );

    return res.json({
      status: "success",
      message: "Product saved successfully!",
      addcart: countRows[0].addcart || 0,
    });

  } catch (err) {
    console.error("Error updating cart:", err);
    return res.status(500).json({ status: "error", message: "Server error" });
  } finally {
    if (connection) connection.release();
  }
};

  // Get Cart Summary
export const getCartSummary = async (req, res) => {
  try {
    const { userid,categoryId,vendorId } = req.query; 
    if (!userid) {
      return res.status(400).json({
        status: false,
        message: "User ID is required",
      });
    }

    // Fetch all cart items for the user
    const [cartItems] = await con.query(
      `SELECT * FROM hr_cart_order_item WHERE user_id=? AND parent_categor_id=? AND vendor_id= ?`,
      [userid,categoryId,vendorId]
    );

    if (!cartItems.length) {
      return res.json({
        status: true,
        items: [],
        totalItems: 0,
        totalPrice: 0,
        recentImages: [],
      });
    }

    // Calculate totals
    const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
    const totalPrice = cartItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
   
    const recentImages = cartItems
      .slice(-2) 
      .map((item) => item.product_image || 'https://atscortex.com/deligo/client/uploads/product.png');

    return res.json({
      status: true,
      items: cartItems,
      totalItems,
      totalPrice,
      recentImages,
    });

  } catch (err) {
    console.error("Error fetching cart summary:", err);
    return res.status(500).json({
      status: false,
      message: "Server error",
    });
  }
};

// Get Product Details
export const getProductDetails = async (req, res) => {
  const { productId } = req.query;

  if (!productId) {
    return res.status(400).json({
      status: false,
      message: "productId is required",
    });
  }

  try {
    const sql = `
      SELECT pid, product_name, product_image, product_short, product_desc,
             mrp_price, price, sku, brand, rating, rating_user, reviews, is_active
      FROM hr_product
      WHERE pid = ?;
    `;

    const [rows] = await con.query(sql, [productId]);

    if (rows.length === 0) {
      return res.status(404).json({
        status: false,
        message: "Product not found",
      });
    }

    const product = rows[0];
    
    product.product_image = await getImageUrl(product.product_image);

    return res.status(200).json({
      status: true,
      message: "Product details fetched successfully",
      data: product,
    });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};
