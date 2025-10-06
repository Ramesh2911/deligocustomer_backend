import Stripe from "stripe";
import con from "../db/db.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-08-27.basil", // ✅ set a fixed API version globally
});

export const paymentSheet = async (req, res) => {
  try {
    const { categoryId, vendorId, userid } = req.body;

    // ✅ 1. Fetch active address for user
    const [addressRows] = await con.execute(
      "SELECT * FROM hr_addresses WHERE user_id = ? AND is_active = 1",
      [userid]
    );
    if (addressRows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "No active address found for user",
      });
    }
    const address = addressRows[0];

    // ✅ 2. Calculate product total from cart
    const [cartSumRows] = await con.execute(
      `SELECT SUM(hcoi.quantity * hp.price) AS ptval
       FROM hr_cart_order_item hcoi
       LEFT JOIN hr_product hp ON hp.pid = hcoi.product_id
       WHERE hcoi.parent_categor_id = ? 
         AND hcoi.vendor_id = ? 
         AND hcoi.user_id = ?`,
      [categoryId, vendorId, userid]
    );

    if (!cartSumRows[0] || cartSumRows[0].ptval === null) {
      return res.status(400).json({
        status: "error",
        message: "No items found in cart",
      });
    }


const [vendorRows] = await con.execute(
      'SELECT u.id AS vendor_id, u.latitude AS vendor_lat, u.longitude AS vendor_lng, a.lat AS user_lat, a.lng AS user_lng, ( 6371 * ACOS( COS(RADIANS(a.lat)) * COS(RADIANS(u.latitude)) * COS(RADIANS(u.longitude) - RADIANS(a.lng)) + SIN(RADIANS(a.lat)) * SIN(RADIANS(u.latitude)) ) ) AS distance_km FROM hr_users u JOIN hr_addresses a ON a.user_id = ? AND a.is_active = 1 WHERE u.id = ?',
      [userid,vendorId]
    );
if (!vendorRows.length) {
  return res.status(404).json({ status: 'error', message: 'Vendor or user not found' });
}
const [setrows] = await con.execute(
      `SELECT delivery_rider_charges, 
              delivery_rider_per_km_price, 
              delivery_distance_limit_km, 
              rider_speed 
       FROM hr_settings`
    );

  const settings = setrows[0];
const vendorLocation = vendorRows[0];
const todistance = Number(vendorLocation.distance_km.toFixed(2)); // ensure numeric






    const ptval = cartSumRows[0].ptval;
  const deliveryfee = settings.delivery_rider_charges + (todistance * settings.delivery_rider_per_km_price);
    const totalAmount = ptval + deliveryfee;






    // ✅ 3. Insert order (pending)
    const [orderResult] = await con.execute(
      `INSERT INTO hr_order (
        user_id, vendor_id, product_amount, delivery_amount, discount, tax_amount, total_amount,
        payment_method, full_name, mobile, latitude, longitude, shipping_address, billing_address,
        payment_status,vendor_customer_distance
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?)`,
      [
        userid,
        vendorId,
        ptval.toFixed(2),
        deliveryfee.toFixed(2),
        "0.00",
        "0.00",
        totalAmount.toFixed(2),
        1, // Stripe
        address.full_name,
        address.mobile,
        address.lat,
        address.lng,
        address.house,
        address.house,
        "pending",
        todistance
      ]
    );

    const orderId = orderResult.insertId;

    // ✅ 4. Insert order items
    const [cartItems] = await con.execute(
      `SELECT hcoi.vendor_id, hcoi.product_id, hp.product_name, hp.sku, hp.tax_percentage,
              hcoi.quantity, hp.price, hp.tax_price
       FROM hr_cart_order_item hcoi
       LEFT JOIN hr_product hp ON hp.pid = hcoi.product_id
       WHERE hcoi.parent_categor_id = ? 
         AND hcoi.vendor_id = ? 
         AND hcoi.user_id = ?`,
      [categoryId, vendorId, userid]
    );

    for (const item of cartItems) {
      const unitPrice = Number(item.price) || 0;
      const discount = 0;
      const taxRate = Number(item.tax_price) || 0;
      const taxPercatage = Number(item.tax_percentage) || 0;
      const totalPrice = item.quantity * unitPrice;
      const taxAmount = item.quantity * taxRate;
      const totalAmountItem = totalPrice + taxAmount - discount;

      await con.execute(
        `INSERT INTO hr_order_item (
          order_id, product_id, product_name, sku, quantity, unit_price, discount, 
          total_price, tax_amount, total_amount, vendor_id, tax_percentage
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
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
          taxPercatage,
        ]
      );
    }

    // ✅ 5. Create Stripe customer
    const customer = await stripe.customers.create({
      metadata: {
        userId: userid.toString(),
        orderId: orderId.toString(),
      },
    });

    // ✅ 6. Create ephemeral key (must pass apiVersion)
    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customer.id },
      { apiVersion: "2025-08-27.basil" } // ✅ must match Stripe React Native SDK version
    );

    // ✅ 7. Create PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100), // in cents
      currency: "eur",
      customer: customer.id,
      automatic_payment_methods: { enabled: true },
      metadata: { orderId: orderId.toString() },
    });

    // ✅ 8. Update order with Stripe IDs
    await con.execute(
      `UPDATE hr_order 
       SET stripe_customer_id = ?, stripe_payment_id = ?, stripe_payment_method = ?, payment_status = ?
       WHERE oid = ?`,
      [
        customer.id,
        paymentIntent.id,
        paymentIntent.payment_method ?? null,
        'completed',//paymentIntent.status,
        orderId,
      ]
    );

    // ✅ 9. Clear cart
    await con.execute(
      `DELETE FROM hr_cart_order_item 
       WHERE parent_categor_id = ? AND vendor_id = ? AND user_id = ?`,
      [categoryId, vendorId, userid]
    );

    // ✅ 10. Return response
    res.json({
      paymentIntent: paymentIntent.client_secret,
      ephemeralKey: ephemeralKey.secret,
      customer: customer.id,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      orderId,
    });
  } catch (err) {
    console.error("PaymentSheet error:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
};
