const express = require('express');
const router = express.Router();
const db = require('../database');
const axios = require('axios');
const crypto = require('crypto');

// SSLCommerz configuration
const SSLCOMMERZ = {
  store_id: process.env.SSLCOMMERZ_STORE_ID || 'testbox',
  store_pass: process.env.SSLCOMMERZ_STORE_PASS || 'testbox123',
  is_sandbox: process.env.SSLCOMMERZ_SANDBOX !== 'false',
  get api_url() {
    return this.is_sandbox 
      ? 'https://sandbox.sslcommerz.com/gwprocess/v4/api.php'
      : 'https://secure.sslcommerz.com/gwprocess/v4/api.php';
  },
  get success_url() {
    return `http://localhost:${process.env.PORT || 3000}/payment/success`;
  },
  get fail_url() {
    return `http://localhost:${process.env.PORT || 3000}/payment/fail`;
  },
  get cancel_url() {
    return `http://localhost:${process.env.PORT || 3000}/payment/cancel`;
  }
};

// Initiate SSLCommerz payment
router.post('/initiate', async (req, res) => {
  try {
    const { order_id, payment_method } = req.body;
    const order = await db.getOrder(order_id);
    
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    
    if (payment_method === 'cod') {
      // Cash on delivery - no payment gateway needed
      return res.json({ success: true, redirect: `/checkout/confirm/${order_id}` });
    }
    
    if (payment_method === 'bkash' || payment_method === 'nagad') {
      // For bKash/Nagad, show merchant number
      return res.json({ 
        success: true, 
        redirect: `/payment/mobile?order=${order_id}&method=${payment_method}`,
        message: `Pay via ${payment_method.toUpperCase()} merchant number`
      });
    }
    
    // SSLCommerz
    const tran_id = 'ARODRO-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    
    const postData = {
      store_id: SSLCOMMERZ.store_id,
      store_passwd: SSLCOMMERZ.store_pass,
      total_amount: order.total,
      currency: 'BDT',
      tran_id: tran_id,
      success_url: SSLCOMMERZ.success_url + '?tran_id=' + tran_id,
      fail_url: SSLCOMMERZ.fail_url + '?tran_id=' + tran_id,
      cancel_url: SSLCOMMERZ.cancel_url + '?tran_id=' + tran_id,
      cus_name: order.customer_name,
      cus_phone: order.customer_phone,
      cus_email: order.customer_email || 'customer@arodro.com',
      cus_add1: order.customer_address,
      cus_city: order.city,
      cus_country: 'Bangladesh',
      shipping_method: 'Courier',
      product_name: order.items.map(i => i.product_name).join(', '),
      product_category: 'Cosmetics',
      product_profile: 'general',
      num_of_item: order.items.length
    };
    
    const response = await axios.post(SSLCOMMERZ.api_url, new URLSearchParams(postData), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    
    if (response.data && response.data.GatewayPageURL) {
      res.json({ success: true, redirect: response.data.GatewayPageURL });
    } else {
      res.json({ success: false, message: 'Payment gateway error', details: response.data });
    }
  } catch (err) {
    console.error('Payment initiate error:', err.message);
    res.status(500).json({ success: false, message: 'Payment initiation failed' });
  }
});

// SSLCommerz Success
router.post('/success', async (req, res) => {
  try {
    const { tran_id, val_id, status } = req.body;
    console.log('Payment success:', { tran_id, val_id, status });
    
    // Find order by tran_id (we'd need to store it, but for now just redirect)
    res.redirect('/payment/thankyou');
  } catch (err) {
    res.redirect('/payment/fail');
  }
});

// SSLCommerz Fail
router.post('/fail', (req, res) => {
  res.redirect('/payment/fail');
});

// SSLCommerz Cancel
router.post('/cancel', (req, res) => {
  res.redirect('/payment/fail');
});

// Mobile payment page (bKash/Nagad)
router.get('/mobile', async (req, res) => {
  const { order, method } = req.query;
  const categories = await db.getCategories();
  
  const merchants = {
    bkash: { name: 'bKash', number: '01XXX-XXXXXX', type: 'Merchant Account' },
    nagad: { name: 'Nagad', number: '01XXX-XXXXXX', type: 'Merchant Account' }
  };
  
  res.render('payment-mobile', {
    title: `${(method || '').toUpperCase()} Payment — ARODRO`,
    orderId: order,
    method: method || 'bkash',
    merchant: merchants[method] || merchants.bkash,
    categories,
    cartCount: 0
  });
});

// Thank you page
router.get('/thankyou', async (req, res) => {
  const categories = await db.getCategories();
  res.render('payment-success', {
    title: 'Payment Successful — ARODRO',
    categories,
    cartCount: 0
  });
});

// Fail page
router.get('/fail', async (req, res) => {
  const categories = await db.getCategories();
  res.render('payment-fail', {
    title: 'Payment Failed — ARODRO',
    categories,
    cartCount: 0
  });
});

module.exports = router;
