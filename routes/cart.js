const express = require('express');
const router = express.Router();
const db = require('../database');

// View cart
router.get('/', async (req, res) => {
  const categories = await db.getCategories();
  const cart = req.session.cart || [];
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const shipping = subtotal >= 1500 ? 0 : 100;
  const total = subtotal + shipping;
  
  res.render('cart', {
    title: 'Shopping Cart — ARODRO',
    cart,
    subtotal,
    shipping,
    total,
    categories,
    cartCount: cart.reduce((sum, item) => sum + item.quantity, 0)
  });
});

// Add to cart
router.post('/add', async (req, res) => {
  try {
    const { product_id, quantity } = req.body;
    const product = await db.getProductById(product_id);
    
    if (!product) return res.json({ success: false, message: 'Product not found' });
    
    if (!req.session.cart) req.session.cart = [];
    
    const existingIndex = req.session.cart.findIndex(item => item.product_id == product_id);
    
    if (existingIndex >= 0) {
      req.session.cart[existingIndex].quantity += parseInt(quantity) || 1;
    } else {
      req.session.cart.push({
        product_id: product.id,
        name: product.name,
        slug: product.slug,
        price: product.price,
        image: product.image,
        quantity: parseInt(quantity) || 1
      });
    }
    
    const cartCount = req.session.cart.reduce((sum, item) => sum + item.quantity, 0);
    
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      res.json({ success: true, cartCount, message: 'Product added to cart!' });
    } else {
      res.redirect('/cart');
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update cart quantity
router.post('/update', async (req, res) => {
  const { product_id, quantity } = req.body;
  if (!req.session.cart) req.session.cart = [];
  
  const index = req.session.cart.findIndex(item => item.product_id == product_id);
  if (index >= 0) {
    if (quantity > 0) {
      req.session.cart[index].quantity = parseInt(quantity);
    } else {
      req.session.cart.splice(index, 1);
    }
  }
  
  res.redirect('/cart');
});

// Remove from cart
router.post('/remove', async (req, res) => {
  const { product_id } = req.body;
  if (req.session.cart) {
    req.session.cart = req.session.cart.filter(item => item.product_id != product_id);
  }
  res.redirect('/cart');
});

// Clear cart
router.post('/clear', (req, res) => {
  req.session.cart = [];
  res.redirect('/cart');
});

module.exports = router;
