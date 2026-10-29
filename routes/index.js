const express = require('express');
const router = express.Router();
const db = require('../database');

// Home page
router.get('/', async (req, res) => {
  try {
    const [products, categories] = await Promise.all([
      db.getProducts(),
      db.getCategories()
    ]);
    const featured = products.filter(p => p.featured);

    // Group products by category for the homepage
    const categoryProducts = {};
    for (const cat of categories) {
      categoryProducts[cat.slug] = products.filter(p => p.category_slug === cat.slug).slice(0, 4);
    }

    res.render('index', {
      title: 'ARODRO — Premium Cosmetics',
      categories,
      featured,
      categoryProducts,
      cartCount: req.session.cart ? req.session.cart.reduce((sum, item) => sum + item.quantity, 0) : 0
    });
  } catch (err) {
    console.error('Homepage DB error:', err.message);
    try {
      res.render('index', {
        title: 'ARODRO — Premium Cosmetics',
        categories: [],
        featured: [],
        categoryProducts: {},
        cartCount: req.session.cart ? req.session.cart.reduce((sum, item) => sum + item.quantity, 0) : 0,
        dbError: true
      });
    } catch (renderErr) {
      console.error('Homepage render error:', renderErr.message);
      res.status(500).send('Server Error');
    }
  }
});

// Category page
router.get('/category/:slug', async (req, res) => {
  try {
    const [category, products, categories] = await Promise.all([
      db.getCategory(req.params.slug),
      db.getProducts(req.params.slug),
      db.getCategories()
    ]);
    
    if (!category) return res.status(404).render('404', { title: 'Page Not Found', cartCount: 0 });
    
    res.render('category', {
      title: `${category.name} — ARODRO`,
      category,
      products,
      categories,
      cartCount: req.session.cart ? req.session.cart.reduce((sum, item) => sum + item.quantity, 0) : 0
    });
  } catch (err) {
    console.error('Category page error:', err.message);
    res.status(500).render('500', { title: 'Server Error — ARODRO', categories: [], cartCount: 0 });
  }
});

// Search
router.get('/search', async (req, res) => {
  try {
    const query = req.query.q || '';
    let products = [];
    if (query.trim()) {
      products = await db.searchProducts(query);
    }
    const categories = await db.getCategories();
    
    res.render('search', {
      title: `Search: "${query}" — ARODRO`,
      query,
      products,
      categories,
      cartCount: req.session.cart ? req.session.cart.reduce((sum, item) => sum + item.quantity, 0) : 0
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// About page
router.get('/about', async (req, res) => {
  try {
    const categories = await db.getCategories();
    res.render('about', {
      title: 'About Us — ARODRO',
      categories,
      cartCount: req.session.cart ? req.session.cart.reduce((sum, item) => sum + item.quantity, 0) : 0
    });
  } catch (err) {
    console.error('About page error:', err.message);
    res.status(500).render('500', { title: 'Server Error — ARODRO', categories: [], cartCount: 0 });
  }
});

// Contact page
router.get('/contact', async (req, res) => {
  try {
    const categories = await db.getCategories();
    res.render('contact', {
      title: 'Contact Us — ARODRO',
      categories,
      cartCount: req.session.cart ? req.session.cart.reduce((sum, item) => sum + item.quantity, 0) : 0
    });
  } catch (err) {
    console.error('Contact page error:', err.message);
    res.status(500).render('500', { title: 'Server Error — ARODRO', categories: [], cartCount: 0 });
  }
});

module.exports = router;
