const express = require('express');
const router = express.Router();
const db = require('../database');

// Submit a review
router.post('/submit', async (req, res) => {
  try {
    const { product_id, user_name, rating, comment } = req.body;
    
    if (!product_id || !user_name || !rating) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    
    await db.addReview(product_id, user_name, parseInt(rating), comment || '');
    const reviews = await db.getProductReviews(product_id);
    const avgRating = await db.getAverageRating(product_id);
    
    res.json({ success: true, reviews, ...avgRating });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get reviews for a product (AJAX)
router.get('/:productId', async (req, res) => {
  try {
    const reviews = await db.getProductReviews(req.params.productId);
    const avgRating = await db.getAverageRating(req.params.productId);
    res.json({ success: true, reviews, ...avgRating });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
