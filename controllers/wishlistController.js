import con from '../db/db.js';


export const toggleWishlist = async (req, res) => {
  try {
    const { user_id, store_id, wishlist } = req.body;

    if (!user_id || !store_id) {
      return res.status(400).json({ message: "Missing parameters" });
    }

    if (wishlist === 1) {
      // Add to wishlist
      await con.query(
        `INSERT INTO hr_wishlist_store (user_id, store_id) 
         VALUES (?, ?) 
         ON DUPLICATE KEY UPDATE store_id = store_id`,
        [user_id, store_id]
      );
      return res.json({ success: true, message: "Added to wishlist" });
    } else {
      // Remove from wishlist
      await con.query(
        `DELETE FROM hr_wishlist_store WHERE user_id = ? AND store_id = ?`,
        [user_id, store_id]
      );
      return res.json({ success: true, message: "Removed from wishlist" });
    }
  } catch (error) {
    console.error("Wishlist error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const toggleWishlistProduct = async (req, res) => {
  try {
    const { user_id, product_id, wishlist } = req.body;

    if (!user_id || !product_id) {
      return res.status(400).json({ message: "Missing parameters" });
    }

    if (wishlist === 1) {
      // Add to wishlist
      await con.query(
        `INSERT INTO hr_wishlist_product (user_id, product_id) 
         VALUES (?, ?) 
         ON DUPLICATE KEY UPDATE product_id = product_id`,
        [user_id, product_id]
      );
      return res.json({ success: true, message: "Added to wishlist" });
    } else {
      // Remove from wishlist
      await con.query(
        `DELETE FROM hr_wishlist_product 
         WHERE user_id = ? AND product_id = ?`,
        [user_id, product_id]
      );
      return res.json({ success: true, message: "Removed from wishlist" });
    }
  } catch (error) {
    console.error("Wishlist error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
