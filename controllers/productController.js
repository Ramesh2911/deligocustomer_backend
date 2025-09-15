import con from '../db/db.js';



export const getProduct = async (req, res) => {
  try {
    const { categoryId, vendorId,userId } = req.query;

    if (!categoryId || !vendorId || !userId) {
      return res.status(400).json({
        status: false,
        message: 'category_id and vendor_id are required'
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
        id: 'all',
        parent_id: categoryId,
        name: 'All',
        icon: '' // or a default image URL
      }
    ];

    const totalCategories = [...categorylst, ...subcategories];

    // Step 2: Get products with subcategory names
    const [products] = await con.query(
      `SELECT 
    p.*,
    c.cid,
    c.category_name,
    CASE WHEN w.product_id IS NOT NULL THEN 1 ELSE 0 END AS is_wishlist
FROM 
    hr_product p
JOIN 
    hr_category c 
    ON p.product_sub_cat = c.cid
LEFT JOIN 
    hr_wishlist_product w
    ON w.product_id = p.pid AND w.user_id = ?
WHERE 
    p.is_active = 1
    AND p.product_cat = ?
    AND p.vendor_id = ?`,
      [userId,categoryId, vendorId]
    );

    // Step 3: Group products by category_name
    const groupedProducts = {};
    products.forEach(row => {
      const category = row.category_name || 'others';
      const product = {
        id: row.pid,
        name: row.product_name,
        price: parseFloat(row.price),
        mrp: parseFloat(row.mrp_price),
        image: row.product_image,
        discount: Math.round(((parseFloat(row.mrp_price) - parseFloat(row.price)) / parseFloat(row.mrp_price)) * 100),
        rating: row.rating,
        reviews: row.reviews,
        is_wishlist: row.is_wishlist,
        category:row.category_name,
        subcategoryid:row.cid
      };

      if (!groupedProducts[category]) {
        groupedProducts[category] = [];
      }
      groupedProducts[category].push(product);
    });

    // Final Response
    return res.status(200).json({
      status: true,
      categories: totalCategories,
      productsData: groupedProducts
    });

  } catch (error) {
    console.error('Get Product Error:', error);
    return res.status(500).json({
      status: false,
      message: 'Server error while fetching products'
    });
  }
};



export const postProductOrder = async (req, res) => {
  let connection;
  try {
    const { productid, categoryid, quantity, userid } = req.body; // ✅ Changed from req.query to req.body

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
    const { userid,categoryId,vendorId } = req.query; // or req.params depending on your route
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

    // Get recent images (last 2 added)
    const recentImages = cartItems
      .slice(-2) // last 2 items
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


