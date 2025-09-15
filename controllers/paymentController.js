import Stripe from 'stripe';
import con from '../db/db.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const paymentSheet = async (req, res) => {
  try {
    const { categoryId, vendorId, userid } = req.body;

    // ✅ Fetch active address for user
    const [addressRows] = await con.execute(
      'SELECT * FROM hr_addresses WHERE user_id = ? AND is_active = 1',
      [userid]
    );
    if (addressRows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'No active address found for user' });
    }
    const address = addressRows[0];

    // ✅ Sum total_amount from cart
    const [cartSumRows] = await con.execute(
      'SELECT SUM(total_amount) AS ptval, vendor_id FROM hr_cart_order_item WHERE parent_categor_id = ? AND vendor_id = ? AND user_id = ?',
      [categoryId, vendorId, userid]
    );

    const ptval = parseFloat(cartSumRows[0].ptval) || 0;
    const deliveryfee = 2.0;
    const totalAmount = ptval + deliveryfee;

    // ✅ Insert into hr_order (initially payment pending)
    const [orderResult] = await con.execute(
      `INSERT INTO hr_order (
        user_id, vendor_id, product_amount, delivery_amount, discount, tax_amount, total_amount,
        payment_method, full_name, mobile, latitude, longitude, shipping_address, billing_address,
        payment_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userid,
        vendorId,
        ptval.toFixed(2),
        deliveryfee.toFixed(2),
        '0.00',
        '0.00',
        totalAmount.toFixed(2),
        1, // payment_method = Stripe
        address.full_name,
        address.mobile,
        address.lat,
        address.lng,
        address.house,
        address.house,
        "pending", // initial state
      ]
    );

    const orderId = orderResult.insertId;

 // ✅ 4. Insert order items (convert PHP loop to Node.js)
    const [cartItems] = await con.execute(
      'SELECT * FROM hr_cart_order_item WHERE parent_categor_id = ? AND user_id = ?',
      [categoryId, userid]
    );

    for (const item of cartItems) {
      await con.execute(
        `INSERT INTO hr_order_item (
          order_id, product_id, product_name, sku, quantity, unit_price, discount,
          total_price, tax_amount, total_amount, vendor_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          item.product_id,
          item.product_name,
          item.sku,
          item.quantity,
          item.unit_price,
          item.discount ?? '0.00',
          item.total_price,
          item.tax_amount,
          item.total_amount,
          item.vendor_id,
        ]
      );
    }


    
    // ✅ Create Stripe customer
    const customer = await stripe.customers.create({
      metadata: { userId: userid.toString(), orderId: orderId.toString() }
    });

    // ✅ Create ephemeral key
    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customer.id },
      { apiVersion: '2025-07-30.basil' } // check Stripe docs for valid version
    );

    // ✅ Create PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100),
      currency: 'eur',
      customer: customer.id,
      automatic_payment_methods: { enabled: true },
      metadata: { orderId: orderId.toString() }
    });

    // ✅ Update hr_order with Stripe details
    await con.execute(
      `UPDATE hr_order 
       SET stripe_customer_id = ?, stripe_payment_id = ?, stripe_payment_method = ?, payment_status = ?
       WHERE oid = ?`,
      [
        customer.id,
        paymentIntent.id,
        paymentIntent.payment_method ?? null, // will be null until confirmation
        "pending",
        orderId
      ]
    );

    // ✅ Clear cart items after moving them to order
await con.execute(
  'DELETE FROM hr_cart_order_item WHERE parent_categor_id = ? AND user_id = ?',
  [categoryId, userid]
);

    // ✅ Return to client
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
