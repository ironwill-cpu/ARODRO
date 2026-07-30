const express = require('express');
const router = express.Router();
const db = require('../database');
const storage = require('../storage');
const bcrypt = require('bcryptjs');

// Auth middleware
function requireAuth(req, res, next) {
  if (req.session.admin) return next();
  if (req.path === '/login') return next();
  res.redirect('/admin/login');
}

// Auto-set admin locals
router.use((req, res, next) => {
  res.locals.admin = req.session.admin || null;
  res.locals.hideNav = false;
  const p = req.path === '/' ? 'dashboard' : req.path.replace('/admin/', '').replace('/admin', '');
  res.locals.currentPage = p.split('/')[1] || p;
  next();
});

router.use(requireAuth);

// Login
router.get('/login', (req, res) => {
  if (req.session.admin) return res.redirect('/admin');
  res.render('admin/login', { 
    title: 'Admin Login — ARODRO', 
    error: null, 
    layout: 'admin/layout',
    hideNav: true 
  });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  console.log('LOGIN ATTEMPT:', username);
  
  // Support both SQLite and PostgreSQL
  let user = null;
  try {
    // Try PostgreSQL style first
    const r = await db.query('SELECT * FROM admin_users WHERE username = $1', [username]);
    user = r && r.rows ? r.rows[0] : null;
    console.log('PG query result:', user ? 'found' : 'not found');
  } catch (e) {
    console.log('PG query failed, trying SQLite:', e.message);
  }
  
  if (!user) {
    try {
      // Try SQLite style (only when using SQLite fallback)
      const { default: dbSqlite } = require('../database');
      if (dbSqlite.getDb) {
        const d = await dbSqlite.getDb();
        const stmt = d.prepare('SELECT * FROM admin_users WHERE username = ?');
        stmt.bind([username]);
        if (stmt.step()) {
          user = stmt.getAsObject();
        }
        stmt.free();
        console.log('SQLite result:', user ? 'found' : 'not found');
      }
    } catch (e2) {
      console.error('Login query failed:', e2.message);
    }
  }
  
  if (user) {
    console.log('Comparing password...');
    if (bcrypt.compareSync(password, user.password)) {
      console.log('Password match! Setting session...');
      req.session.admin = { id: user.id, username: user.username };
      console.log('Session set! Redirecting...');
      return res.redirect('/admin');
    } else {
      console.log('Password mismatch');
    }
  }
  
  console.log('Login failed, rendering form');
  res.render('admin/login', { 
    title: 'Admin Login — ARODRO', 
    error: 'Invalid credentials', 
    layout: 'admin/layout' 
  });
});

router.get('/logout', (req, res) => {
  req.session.admin = null;
  res.redirect('/admin/login');
});

// Dashboard
router.get('/', async (req, res) => {
  try {
    const stats = await db.getDashboardStats();
    const categories = await db.getCategories();
    res.render('admin/dashboard', { 
      title: 'Dashboard — ARODRO Admin',
      stats, categories,
      cartCount: 0,
      layout: 'admin/layout'
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// Products management
router.get('/products', async (req, res) => {
  const products = await db.getProducts();
  const categories = await db.getCategories();
  res.render('admin/products', { 
    title: 'Products — ARODRO Admin',
    products, categories,
    cartCount: 0,
    layout: 'admin/layout'
  });
});

router.get('/products/new', async (req, res) => {
  const categories = await db.getCategories();
  res.render('admin/product-form', { 
    title: 'New Product — ARODRO Admin',
    product: null, categories,
    cartCount: 0, error: null,
    layout: 'admin/layout'
  });
});

router.post('/products/new', async (req, res) => {
  try {
    // Auto-generate slug if not provided
    if (!req.body.slug || !req.body.slug.trim()) {
      req.body.slug = req.body.name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'product-' + Date.now();
    }
    await db.createProduct(req.body);
    res.redirect('/admin/products');
  } catch (err) {
    const categories = await db.getCategories();
    res.render('admin/product-form', { 
      title: 'New Product — ARODRO Admin',
      product: req.body, categories,
      cartCount: 0, error: err.message,
      layout: 'admin/layout'
    });
  }
});

router.get('/products/edit/:id', async (req, res) => {
  const [product, categories] = await Promise.all([
    db.getProductById(req.params.id),
    db.getCategories()
  ]);
  if (!product) return res.status(404).send('Product not found');
  res.render('admin/product-form', { 
    title: `Edit ${product.name} — ARODRO Admin`,
    product, categories,
    cartCount: 0, error: null,
    layout: 'admin/layout'
  });
});

router.post('/products/edit/:id', async (req, res) => {
  try {
    // Auto-generate slug if not provided
    if (!req.body.slug || !req.body.slug.trim()) {
      req.body.slug = req.body.name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'product-' + Date.now();
    }
    // Handle image removal: if image is empty string, explicitly set to null
    if (req.body.image === '') {
      req.body.image = null;
    }
    await db.updateProduct(req.params.id, req.body);
    res.redirect('/admin/products');
  } catch (err) {
    const [product, categories] = await Promise.all([
      db.getProductById(req.params.id),
      db.getCategories()
    ]);
    res.render('admin/product-form', { 
      title: 'Edit — ARODRO Admin',
      product: { ...product, ...req.body },
      categories,
      cartCount: 0,
      error: err.message,
      layout: 'admin/layout'
    });
  }
});

router.post('/products/delete/:id', async (req, res) => {
  try {
    await db.deleteProduct(req.params.id);
    res.redirect('/admin/products');
  } catch (err) {
    res.redirect('/admin/products');
  }
});

// Categories management
router.get('/categories', async (req, res) => {
  let categories;
  try {
    categories = await db.getCategoriesWithProductCount();
  } catch(e) {
    categories = await db.getCategories();
  }
  res.render('admin/categories', { 
    title: 'Categories — ARODRO Admin',
    categories, cartCount: 0,
    layout: 'admin/layout'
  });
});

router.post('/categories/create', async (req, res) => {
  try {
    // Auto-generate slug if not provided
    if (!req.body.slug || !req.body.slug.trim()) {
      req.body.slug = req.body.name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'category-' + Date.now();
    }
    await db.createCategory(req.body);
    res.redirect('/admin/categories');
  } catch (err) {
    console.error('Category create error:', err.message);
    res.redirect('/admin/categories');
  }
});

router.post('/categories/update/:id', async (req, res) => {
  try {
    await db.updateCategory(req.params.id, req.body);
    res.redirect('/admin/categories');
  } catch (err) {
    res.redirect('/admin/categories');
  }
});

router.post('/categories/delete/:id', async (req, res) => {
  try {
    await db.deleteCategory(req.params.id);
    res.redirect('/admin/categories');
  } catch (err) {
    console.error('Category delete error:', err.message);
    // Check if foreign key constraint prevents deletion
    if (err.message && err.message.includes('foreign key')) {
      // Products refer to this category - set them to null first
      try {
        await db.query('UPDATE products SET category_id = NULL WHERE category_id = $1', [req.params.id]);
        await db.deleteCategory(req.params.id);
        return res.redirect('/admin/categories');
      } catch(e2) {
        console.error('Force delete failed:', e2.message);
      }
    }
    res.redirect('/admin/categories');
  }
});

// Orders management
router.get('/orders', async (req, res) => {
  const status = req.query.status || null;
  const [orders, categories] = await Promise.all([
    db.getOrders(status),
    db.getCategories()
  ]);
  res.render('admin/orders', { 
    title: 'Orders — ARODRO Admin',
    orders, categories,
    currentStatus: status,
    cartCount: 0,
    layout: 'admin/layout'
  });
});

router.get('/orders/:orderId', async (req, res) => {
  const [order, categories] = await Promise.all([
    db.getOrder(req.params.orderId),
    db.getCategories()
  ]);
  if (!order) return res.status(404).send('Order not found');
  res.render('admin/order-detail', { 
    title: `Order ${order.order_id} — ARODRO Admin`,
    order, categories,
    cartCount: 0,
    layout: 'admin/layout'
  });
});

router.post('/orders/:orderId/status', async (req, res) => {
  try {
    await db.updateOrderStatus(req.params.orderId, req.body.status);
    res.redirect(`/admin/orders/${req.params.orderId}`);
  } catch (err) {
    res.redirect('/admin/orders');
  }
});

router.post('/orders/:orderId/payment', async (req, res) => {
  try {
    await db.updatePaymentStatus(req.params.orderId, req.body.status);
    res.redirect(`/admin/orders/${req.params.orderId}`);
  } catch (err) {
    res.redirect('/admin/orders');
  }
});

// Admin: Coupons
router.get('/coupons', async (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');
  const categories = await db.getCategories();
  res.render('admin/coupons', { title: 'Coupons — ARODRO Admin', categories, cartCount: 0, admin: req.session.admin });
});

router.post('/coupons/create', async (req, res) => {
  if (!req.session.admin) return res.status(401).json({ success: false });
  try {
    await db.createCoupon(req.body.code, req.body.type, parseFloat(req.body.value), parseFloat(req.body.min_order || 0), parseInt(req.body.max_uses || 100), req.body.expires_at || null);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

router.delete('/coupons/delete/:id', async (req, res) => {
  if (!req.session.admin) return res.status(401).json({ success: false });
  await db.deleteCoupon(req.params.id);
  res.json({ success: true });
});

// Admin: Settings
router.get('/settings', async (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');
  const settings = await db.getAllSettings();
  const categories = await db.getCategories();
  
  const groups = {};
  settings.forEach(s => {
    if (!groups[s.group_name]) groups[s.group_name] = [];
    groups[s.group_name].push(s);
  });
  
  res.render('admin/settings', {
    title: 'Settings — ARODRO Admin',
    groups, settings,
    categories,
    cartCount: 0,
    admin: req.session.admin,
    message: req.query.saved ? '✅ All settings saved! Changes are live on the website.' : null
  });
});

// Batch update settings
router.post('/settings/update', async (req, res) => {
  if (!req.session.admin) return res.status(401).json({ success: false });
  try {
    const entries = Object.entries(req.body).filter(([k]) => k.startsWith('setting_'));
    for (const [key, value] of entries) {
      await db.updateSetting(key.replace('setting_', ''), value);
    }
    res.redirect('/admin/settings?saved=1');
  } catch (err) {
    res.status(500).send('Error: ' + err.message);
  }
});

// Upload setting image (multer inline)
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const setStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../public/uploads/settings');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'setting_' + Date.now() + ext);
  }
});
const uploadSetting = multer({ storage: setStorage, limits: { fileSize: 2 * 1024 * 1024 } });

router.post('/settings/upload-image', uploadSetting.single('image'), async (req, res) => {
  if (!req.session.admin) return res.status(401).json({ success: false });
  if (!req.file) return res.status(400).json({ success: false, message: 'No file' });
  
  const key = req.body.setting_key || req.body.key || 'hero_image';
  const filePath = req.file.path;
  
  // Try Supabase Storage first
  try {
    const url = await storage.uploadSettingsImage(key, filePath);
    await db.updateSetting(key, url);
    return res.json({ success: true, url });
  } catch (e) {
    console.log('Storage upload failed, using local:', e.message);
  }
  
  // Local fallback
  const localUrl = '/uploads/settings/' + req.file.filename;
  await db.updateSetting(key, localUrl);
  res.json({ success: true, url: localUrl });
});

module.exports = router;
