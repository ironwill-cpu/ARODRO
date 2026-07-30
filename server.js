require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const db = require('./database');
const storage = require('./storage');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'arodro-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: false,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// Set EJS as template engine with layouts
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

// Make cart count + site settings available in all views
app.use(async (req, res, next) => {
  res.locals.cartCount = req.session.cart ? req.session.cart.reduce((sum, item) => sum + item.quantity, 0) : 0;
  try {
    const settings = await db.getAllSettings();
    const site = {};
    settings.forEach(s => { site[s.key] = s.value; });
    res.locals.site = site;
  } catch (e) {
    res.locals.site = {};
  }
  next();
});

// Routes
app.use('/', require('./routes/index'));
app.use('/products', require('./routes/products'));
app.use('/cart', require('./routes/cart'));
app.use('/checkout', require('./routes/checkout'));
app.use('/admin', require('./routes/admin'));
app.use('/upload', require('./routes/uploads'));
app.use('/payment', require('./routes/payment'));
app.use('/wishlist', require('./routes/wishlist'));
app.use('/reviews', require('./routes/reviews'));
app.use('/coupons', require('./routes/coupons'));
app.use('/variants', require('./routes/variants'));

// 404 handler
app.use((req, res) => {
  res.status(404).render('404', { 
    title: 'Page Not Found — ARODRO',
    categories: [],
    cartCount: 0
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('500', { 
    title: 'Server Error — ARODRO',
    categories: [],
    cartCount: 0 
  });
});

// Start server
async function start() {
  try {
    await db.initDb();
    await storage.ensureBucket();
    console.log('✓ Database ready');
  } catch (err) {
    console.error('⚠ Database init failed:', err.message);
    console.log('⚠ Server will start with limited functionality');
  }
  
  try {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n✨ ARODRO Cosmetics E-Commerce Platform`);
      console.log(`   ───────────────────────────────────`);
      console.log(`   🌐 Site:      http://localhost:${PORT}`);
      console.log(`   🔧 Admin:     http://localhost:${PORT}/admin`);
      console.log(`   👤 Login:     admin / Admin@123`);
      console.log(`   ───────────────────────────────────\n`);
    });
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

start();
