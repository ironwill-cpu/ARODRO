const express = require('express');
const router = express.Router();
const db = require('../database');

// Wishlist page
router.get('/', async (req, res) => {
  try {
    const sessionId = req.sessionID;
    const [items, categories] = await Promise.all([
      db.getWishlist(sessionId),
      db.getCategories()
    ]);
    res.render('wishlist', {
      title: 'My Wishlist — ARODRO',
      items,
      categories,
      cartCount: req.session.cart ? req.session.cart.reduce((s, i) => s + i.quantity, 0) : 0
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading wishlist');
  }
});

// Toggle wishlist (AJAX)
router.post('/toggle', async (req, res) => {
  try {
    const { product_id } = req.body;
    const sessionId = req.sessionID;
    const result = await db.toggleWishlist(product_id, sessionId);
    const count = await db.getWishlistCount(sessionId);
    const inWishlist = await db.isInWishlist(product_id, sessionId);
    res.json({ success: true, ...result, count, inWishlist });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Check wishlist status (AJAX)
router.get('/check/:id', async (req, res) => {
  try {
    const exists = await db.isInWishlist(req.params.id, req.sessionID);
    res.json({ inWishlist: exists });
  } catch (err) {
    res.json({ inWishlist: false });
  }
});

module.exports = router;
