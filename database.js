const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'arodro.db');

// Try PostgreSQL first if env vars exist, fallback to SQLite
let dbModule = null;
let usePg = false;

async function initSqliteInline() {
  try {
    const SQL = await initSqlJs();
    const DB_PATH = path.join(__dirname, 'arodro.db');
    const fs = require('fs');
    let db = null;
    if (fs.existsSync(DB_PATH)) {
      db = new SQL.Database(fs.readFileSync(DB_PATH));
    } else {
      db = new SQL.Database();
    }
    db.run('PRAGMA journal_mode=MEMORY');
    db.run('PRAGMA foreign_keys=ON');
    db.run(`CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, slug TEXT NOT NULL UNIQUE, description TEXT, image TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, description TEXT, short_description TEXT, price REAL NOT NULL, compare_price REAL, category_id INTEGER, image TEXT, images TEXT DEFAULT '[]', stock INTEGER DEFAULT 10, featured INTEGER DEFAULT 0, active INTEGER DEFAULT 1, ingredients TEXT, weight TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (category_id) REFERENCES categories(id))`);
    db.run(`CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL UNIQUE, customer_name TEXT NOT NULL, customer_email TEXT, customer_phone TEXT NOT NULL, customer_address TEXT NOT NULL, city TEXT NOT NULL, notes TEXT, subtotal REAL NOT NULL, shipping REAL DEFAULT 0, total REAL NOT NULL, payment_method TEXT DEFAULT 'cod', payment_status TEXT DEFAULT 'pending', order_status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, product_id INTEGER, product_name TEXT NOT NULL, price REAL NOT NULL, quantity INTEGER NOT NULL, total REAL NOT NULL, FOREIGN KEY (order_id) REFERENCES orders(id))`);
    db.run(`CREATE TABLE IF NOT EXISTS admin_users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, user_name TEXT NOT NULL, rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5), comment TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE)`);
    db.run(`CREATE TABLE IF NOT EXISTS wishlists (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, session_id TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE)`);
    db.run(`CREATE TABLE IF NOT EXISTS coupons (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, type TEXT NOT NULL DEFAULT 'percentage', value REAL NOT NULL, min_order REAL DEFAULT 0, max_uses INTEGER DEFAULT 100, uses INTEGER DEFAULT 0, active INTEGER DEFAULT 1, expires_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS product_variants (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, name TEXT NOT NULL, value TEXT NOT NULL, price_adjust REAL DEFAULT 0, stock INTEGER DEFAULT 10, FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE)`);
    db.run(`CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY, value TEXT, type TEXT DEFAULT 'text', group_name TEXT DEFAULT 'general')`);
    const bcrypt = require('bcryptjs');
    const adminUser = db.exec("SELECT id FROM admin_users WHERE username = 'admin'");
    if (adminUser.length === 0 || adminUser[0].values.length === 0) {
      db.run("INSERT INTO admin_users (username, password) VALUES (?, ?)", ['admin', bcrypt.hashSync('Admin@123', 10)]);
    }
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
    console.log('✓ SQLite database ready');
    return db;
  } catch (err) {
    console.error('SQLite init failed:', err.message);
    throw err;
  }
}

async function initDb() {
  if (!process.env.SUPABASE_DB_URL && !process.env.PGHOST) {
    return initSqliteInline();
  }

  try {
    const pgMod = require('./database-pg');
    await pgMod.query('SELECT 1');
    dbModule = pgMod;
    usePg = true;
    console.log('✓ Using PostgreSQL');
    return pgMod.initDb();
  } catch (err) {
    console.warn('⚠ PostgreSQL unavailable, falling back to SQLite:', err.message);
    dbModule = null;
    usePg = false;
    return initSqliteInline();
  }
}

async function initSqliteDb() {
  const SQL = await initSqlJs();
  let db = null;

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA journal_mode=MEMORY');
  db.run('PRAGMA foreign_keys=ON');

  db.run(`CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, slug TEXT NOT NULL UNIQUE, description TEXT, image TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, description TEXT, short_description TEXT, price REAL NOT NULL, compare_price REAL, category_id INTEGER, image TEXT, images TEXT DEFAULT '[]', stock INTEGER DEFAULT 10, featured INTEGER DEFAULT 0, active INTEGER DEFAULT 1, ingredients TEXT, weight TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (category_id) REFERENCES categories(id))`);
  db.run(`CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL UNIQUE, customer_name TEXT NOT NULL, customer_email TEXT, customer_phone TEXT NOT NULL, customer_address TEXT NOT NULL, city TEXT NOT NULL, notes TEXT, subtotal REAL NOT NULL, shipping REAL DEFAULT 0, total REAL NOT NULL, payment_method TEXT DEFAULT 'cod', payment_status TEXT DEFAULT 'pending', order_status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, product_id INTEGER, product_name TEXT NOT NULL, price REAL NOT NULL, quantity INTEGER NOT NULL, total REAL NOT NULL, FOREIGN KEY (order_id) REFERENCES orders(id))`);
  db.run(`CREATE TABLE IF NOT EXISTS admin_users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, user_name TEXT NOT NULL, rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5), comment TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE)`);
  db.run(`CREATE TABLE IF NOT EXISTS wishlists (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, session_id TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE)`);
  db.run(`CREATE TABLE IF NOT EXISTS coupons (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, type TEXT NOT NULL DEFAULT 'percentage', value REAL NOT NULL, min_order REAL DEFAULT 0, max_uses INTEGER DEFAULT 100, uses INTEGER DEFAULT 0, active INTEGER DEFAULT 1, expires_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS product_variants (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, name TEXT NOT NULL, value TEXT NOT NULL, price_adjust REAL DEFAULT 0, stock INTEGER DEFAULT 10, FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE)`);
  db.run(`CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY, value TEXT, type TEXT DEFAULT 'text', group_name TEXT DEFAULT 'general')`);

  const adminUser = db.exec("SELECT id FROM admin_users WHERE username = 'admin'");
  if (adminUser.length === 0 || adminUser[0].values.length === 0) {
    const hash = bcrypt.hashSync('Admin@123', 10);
    db.run("INSERT INTO admin_users (username, password) VALUES (?, ?)", ['admin', hash]);
  }

  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  console.log('✓ SQLite database ready');
}

// Proxy all DB calls to the active module
function proxy(name) {
  return async function(...args) {
    if (dbModule && dbModule[name]) {
      return dbModule[name](...args);
    }
    throw new Error('Database not initialized');
  };
}

module.exports = {
  initDb,
  query: async (...args) => {
    if (dbModule && dbModule.query) return dbModule.query(...args);
    throw new Error('Database not initialized');
  },
  getProducts: proxy('getProducts'),
  getProduct: proxy('getProduct'),
  getProductById: proxy('getProductById'),
  createProduct: proxy('createProduct'),
  updateProduct: proxy('updateProduct'),
  deleteProduct: proxy('deleteProduct'),
  getCategories: proxy('getCategories'),
  getCategory: proxy('getCategory'),
  createCategory: proxy('createCategory'),
  updateCategory: proxy('updateCategory'),
  deleteCategory: proxy('deleteCategory'),
  getOrders: proxy('getOrders'),
  getOrder: proxy('getOrder'),
  createOrder: proxy('createOrder'),
  updateOrderStatus: proxy('updateOrderStatus'),
  updatePaymentStatus: proxy('updatePaymentStatus'),
  getDashboardStats: proxy('getDashboardStats'),
  searchProducts: proxy('searchProducts'),
  getProductReviews: proxy('getProductReviews'),
  addReview: proxy('addReview'),
  getAverageRating: proxy('getAverageRating'),
  getWishlist: proxy('getWishlist'),
  toggleWishlist: proxy('toggleWishlist'),
  isInWishlist: proxy('isInWishlist'),
  getWishlistCount: proxy('getWishlistCount'),
  getCouponByCode: proxy('getCouponByCode'),
  getAllCoupons: proxy('getAllCoupons'),
  createCoupon: proxy('createCoupon'),
  incrementCouponUse: proxy('incrementCouponUse'),
  deleteCoupon: proxy('deleteCoupon'),
  getProductVariants: proxy('getProductVariants'),
  addVariant: proxy('addVariant'),
  deleteVariant: proxy('deleteVariant'),
  updateVariantStock: proxy('updateVariantStock'),
  getAllSettings: proxy('getAllSettings'),
  getSetting: proxy('getSetting'),
  updateSetting: proxy('updateSetting')
};
