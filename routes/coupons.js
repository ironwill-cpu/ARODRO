const express = require('express');
const router = express.Router();
const db = require('../database');

// Apply coupon (AJAX)
router.post('/apply', async (req, res) => {
  try {
    const { code, subtotal } = req.body;
    if (!code) return res.json({ success: false, message: 'Enter a coupon code' });
    
    const coupon = await db.getCouponByCode(code);
    if (!coupon) return res.json({ success: false, message: 'Invalid or expired coupon code' });
    
    if (coupon.uses >= coupon.max_uses) {
      return res.json({ success: false, message: 'This coupon has reached maximum uses' });
    }
    
    if (subtotal < coupon.min_order) {
      return res.json({ success: false, message: `Minimum order ৳${coupon.min_order} required` });
    }
    
    let discount = 0;
    if (coupon.type === 'percentage') {
      discount = Math.round(subtotal * coupon.value / 100);
    } else if (coupon.type === 'fixed') {
      discount = Math.min(coupon.value, subtotal);
    } else if (coupon.type === 'free_shipping') {
      discount = 60; // Standard shipping fee
    }
    
    // Store in session
    req.session.coupon = { id: coupon.id, code: coupon.code, discount, type: coupon.type };
    
    res.json({
      success: true,
      code: coupon.code,
      discount,
      message: `Coupon applied! You saved ৳${discount}`
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error applying coupon' });
  }
});

// Remove coupon
router.post('/remove', (req, res) => {
  delete req.session.coupon;
  res.json({ success: true, message: 'Coupon removed' });
});

// Admin: Get all coupons
router.get('/admin', async (req, res) => {
  try {
    if (!req.session.admin) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const coupons = await db.getAllCoupons();
    res.json({ success: true, coupons });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
