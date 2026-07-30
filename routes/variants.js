const express = require('express');
const router = express.Router();
const db = require('../database');

// Get variants for a product (AJAX)
router.get('/:productId', async (req, res) => {
  try {
    const variants = await db.getProductVariants(req.params.productId);
    res.json({ success: true, variants });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: Add variant
router.post('/add', async (req, res) => {
  try {
    const { product_id, name, value, price_adjust, stock } = req.body;
    await db.addVariant(product_id, name, value, parseFloat(price_adjust || 0), parseInt(stock || 10));
    const variants = await db.getProductVariants(product_id);
    res.json({ success: true, variants });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: Delete variant
router.delete('/:id', async (req, res) => {
  try {
    await db.deleteVariant(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

module.exports = router;
