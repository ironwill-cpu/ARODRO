const express = require('express');
const router = express.Router();
const db = require('../database');

// Checkout page
router.get('/', async (req, res) => {
  const categories = await db.getCategories();
  const cart = req.session.cart || [];
  
  if (cart.length === 0) return res.redirect('/cart');
  
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const shipping = subtotal >= 1500 ? 0 : 60;
  const discount = req.session.coupon ? req.session.coupon.discount : 0;
  const total = Math.max(0, subtotal + shipping - discount);
  
  res.render('checkout', {
    title: 'Checkout — ARODRO',
    cart,
    subtotal,
    shipping,
    discount,
    total,
    coupon: req.session.coupon || null,
    categories,
    cartCount: cart.reduce((sum, item) => sum + item.quantity, 0)
  });
});

// Place order
router.post('/place', async (req, res) => {
  try {
    const cart = req.session.cart || [];
    if (cart.length === 0) return res.redirect('/cart');
    
    const { customer_name, customer_email, customer_phone, customer_address, city, notes, payment_method } = req.body;
    
    // Validate
    if (!customer_name || !customer_phone || !customer_address || !city) {
      return res.render('checkout', {
        title: 'Checkout — ARODRO',
        cart,
        subtotal: cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
        shipping: cart.reduce((sum, item) => sum + (item.price * item.quantity), 0) >= 1500 ? 0 : 100,
        total: 0,
        categories: await db.getCategories(),
        cartCount: cart.reduce((sum, item) => sum + item.quantity, 0),
        error: 'Please fill in all required fields'
      });
    }
    
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const shipping = subtotal >= 1500 ? 0 : 60;
    const discount = req.session.coupon ? req.session.coupon.discount : 0;
    const total = Math.max(0, subtotal + shipping - discount);
    
    // Record coupon usage
    if (req.session.coupon) {
      await db.incrementCouponUse(req.session.coupon.id).catch(() => {});
    }
    
    const orderItems = cart.map(item => ({
      product_id: item.product_id,
      product_name: item.name,
      price: item.price,
      quantity: item.quantity,
      total: item.price * item.quantity
    }));
    
    const orderId = await db.createOrder({
      customer_name,
      customer_email,
      customer_phone,
      customer_address,
      city,
      notes,
      subtotal,
      shipping,
      total,
      payment_method: payment_method || 'cod',
      items: orderItems
    });
    
    // Clear cart & coupon
    req.session.cart = [];
    delete req.session.coupon;
    
    // Handle different payment methods
    if (payment_method === 'cod') {
      res.redirect(`/checkout/confirm/${orderId}`);
    } else {
      res.redirect(`/payment/mobile?order=${orderId}&method=${payment_method}`);
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Error placing order');
  }
});

// Order confirmation
router.get('/confirm/:orderId', async (req, res) => {
  try {
    const categories = await db.getCategories();
    const order = await db.getOrder(req.params.orderId);
    
    if (!order) return res.status(404).send('Order not found');
    
    res.render('confirm', {
      title: 'Order Confirmed — ARODRO',
      order,
      categories,
      cartCount: 0
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
