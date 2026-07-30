const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// Auto-switch to PostgreSQL when env is set
if (process.env.SUPABASE_DB_URL) {
  module.exports = require('./database-pg');
} else {

const DB_PATH = path.join(__dirname, 'arodro.db');

let db = null;

async function getDb() {
  if (db) return db;
  
  const SQL = await initSqlJs();
  
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  
  // Enable WAL-like persistence
  db.run('PRAGMA journal_mode=MEMORY');
  db.run('PRAGMA foreign_keys=ON');
  
  return db;
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

async function initDb() {
  const db = await getDb();
  
  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      image TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      short_description TEXT,
      price REAL NOT NULL,
      compare_price REAL,
      category_id INTEGER,
      image TEXT,
      images TEXT DEFAULT '[]',
      stock INTEGER DEFAULT 10,
      featured INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      ingredients TEXT,
      weight TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL,
      customer_email TEXT,
      customer_phone TEXT NOT NULL,
      customer_address TEXT NOT NULL,
      city TEXT NOT NULL,
      notes TEXT,
      subtotal REAL NOT NULL,
      shipping REAL DEFAULT 0,
      total REAL NOT NULL,
      payment_method TEXT DEFAULT 'cod',
      payment_status TEXT DEFAULT 'pending',
      order_status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER,
      product_name TEXT NOT NULL,
      price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      total REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      user_name TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS wishlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      session_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )
  `);

  // Coupons table
  db.run(`
    CREATE TABLE IF NOT EXISTS coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL DEFAULT 'percentage',
      value REAL NOT NULL,
      min_order REAL DEFAULT 0,
      max_uses INTEGER DEFAULT 100,
      uses INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Product variants table
  db.run(`
    CREATE TABLE IF NOT EXISTS product_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      value TEXT NOT NULL,
      price_adjust REAL DEFAULT 0,
      stock INTEGER DEFAULT 10,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )
  `);

  // Site settings table
  db.run(`
    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      type TEXT DEFAULT 'text',
      group_name TEXT DEFAULT 'general'
    )
  `);

  // Create admin user if not exists
  const bcrypt = require('bcryptjs');
  const adminUser = db.exec("SELECT id FROM admin_users WHERE username = 'admin'");
  if (adminUser.length === 0 || adminUser[0].values.length === 0) {
    const hash = bcrypt.hashSync('Admin@123', 10);
    db.run("INSERT INTO admin_users (username, password) VALUES (?, ?)", ['admin', hash]);
  }

  saveDb();
  console.log('✓ Database initialized successfully');
}

// Product queries
async function getProducts(categorySlug = null, featured = null) {
  const d = await getDb();
  let query = `
    SELECT p.*, c.name as category_name, c.slug as category_slug
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.active = 1
  `;
  const params = [];
  
  if (categorySlug) {
    query += ' AND c.slug = ?';
    params.push(categorySlug);
  }
  if (featured) {
    query += ' AND p.featured = 1';
  }
  
  query += ' ORDER BY p.created_at DESC';
  
  const stmt = d.prepare(query);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

async function getProduct(slug) {
  const d = await getDb();
  const stmt = d.prepare(`
    SELECT p.*, c.name as category_name, c.slug as category_slug
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.slug = ? AND p.active = 1
  `);
  stmt.bind([slug]);
  if (stmt.step()) {
    const product = stmt.getAsObject();
    stmt.free();
    try {
      product.images = JSON.parse(product.images || '[]');
    } catch { product.images = []; }
    return product;
  }
  stmt.free();
  return null;
}

async function getProductById(id) {
  const d = await getDb();
  const stmt = d.prepare(`
    SELECT p.*, c.name as category_name, c.slug as category_slug
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.id = ?
  `);
  stmt.bind([id]);
  if (stmt.step()) {
    const product = stmt.getAsObject();
    stmt.free();
    return product;
  }
  stmt.free();
  return null;
}

async function createProduct(data) {
  const d = await getDb();
  const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  d.run(`
    INSERT INTO products (name, slug, description, short_description, price, compare_price, category_id, image, images, stock, featured, ingredients, weight)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [data.name, slug, data.description || '', data.short_description || '', data.price, data.compare_price || null, data.category_id || null, data.image || '', data.images || '[]', data.stock || 10, data.featured || 0, data.ingredients || '', data.weight || '']);
  saveDb();
  return slug;
}

async function updateProduct(id, data) {
  const d = await getDb();
  const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  d.run(`
    UPDATE products SET name=?, slug=?, description=?, short_description=?, price=?, compare_price=?, category_id=?, image=?, images=?, stock=?, featured=?, ingredients=?, weight=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `, [data.name, slug, data.description || '', data.short_description || '', data.price, data.compare_price || null, data.category_id || null, data.image || '', data.images || '[]', data.stock || 10, data.featured || 0, data.ingredients || '', data.weight || '', id]);
  saveDb();
  return slug;
}

async function deleteProduct(id) {
  const d = await getDb();
  d.run('DELETE FROM products WHERE id = ?', [id]);
  saveDb();
}

// Category queries
async function getCategories() {
  const d = await getDb();
  const stmt = d.prepare(`
    SELECT c.*, COUNT(p.id) as product_count
    FROM categories c
    LEFT JOIN products p ON c.id = p.category_id AND p.active = 1
    GROUP BY c.id
    ORDER BY c.name
  `);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

async function getCategory(slug) {
  const d = await getDb();
  const stmt = d.prepare('SELECT * FROM categories WHERE slug = ?');
  stmt.bind([slug]);
  if (stmt.step()) {
    const cat = stmt.getAsObject();
    stmt.free();
    return cat;
  }
  stmt.free();
  return null;
}

async function createCategory(data) {
  const d = await getDb();
  const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  d.run('INSERT INTO categories (name, slug, description, image) VALUES (?, ?, ?, ?)', 
    [data.name, slug, data.description || '', data.image || '']);
  saveDb();
  return slug;
}

async function updateCategory(id, data) {
  const d = await getDb();
  const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  d.run('UPDATE categories SET name=?, slug=?, description=?, image=? WHERE id=?',
    [data.name, slug, data.description || '', data.image || '', id]);
  saveDb();
  return slug;
}

async function deleteCategory(id) {
  const d = await getDb();
  d.run('DELETE FROM categories WHERE id = ?', [id]);
  saveDb();
}

// Order queries
async function getOrders(status = null) {
  const d = await getDb();
  let query = 'SELECT * FROM orders';
  const params = [];
  if (status) {
    query += ' WHERE order_status = ?';
    params.push(status);
  }
  query += ' ORDER BY created_at DESC';
  
  const stmt = d.prepare(query);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

async function getOrder(orderId) {
  const d = await getDb();
  const stmt = d.prepare('SELECT * FROM orders WHERE order_id = ?');
  stmt.bind([orderId]);
  if (stmt.step()) {
    const order = stmt.getAsObject();
    stmt.free();
    
    // Get order items
    const itemStmt = d.prepare('SELECT * FROM order_items WHERE order_id = ?');
    itemStmt.bind([order.id]);
    order.items = [];
    while (itemStmt.step()) {
      order.items.push(itemStmt.getAsObject());
    }
    itemStmt.free();
    return order;
  }
  stmt.free();
  return null;
}

async function createOrder(orderData) {
  const d = await getDb();
  const { v4: uuidv4 } = require('uuid');
  const orderId = 'ARO-' + Date.now().toString(36).toUpperCase() + '-' + uuidv4().substring(0, 4).toUpperCase();
  
  d.run(`
    INSERT INTO orders (order_id, customer_name, customer_email, customer_phone, customer_address, city, notes, subtotal, shipping, total, payment_method, payment_status, order_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [orderId, orderData.customer_name, orderData.customer_email || '', orderData.customer_phone, orderData.customer_address, orderData.city, orderData.notes || '', orderData.subtotal, orderData.shipping || 0, orderData.total, orderData.payment_method || 'cod', orderData.payment_method === 'cod' ? 'pending' : 'pending', 'pending']);
  
  const orderRow = d.exec('SELECT last_insert_rowid() as id');
  const orderDbId = orderRow[0].values[0][0];
  
  for (const item of orderData.items) {
    d.run('INSERT INTO order_items (order_id, product_id, product_name, price, quantity, total) VALUES (?, ?, ?, ?, ?, ?)',
      [orderDbId, item.product_id, item.product_name, item.price, item.quantity, item.total]);
  }
  
  saveDb();
  return orderId;
}

async function updateOrderStatus(orderId, status) {
  const d = await getDb();
  d.run('UPDATE orders SET order_status = ? WHERE order_id = ?', [status, orderId]);
  saveDb();
}

async function updatePaymentStatus(orderId, status) {
  const d = await getDb();
  d.run('UPDATE orders SET payment_status = ? WHERE order_id = ?', [status, orderId]);
  saveDb();
}

// Dashboard stats
async function getDashboardStats() {
  const d = await getDb();
  const stats = {};
  
  const totalProducts = d.exec('SELECT COUNT(*) as count FROM products WHERE active = 1');
  stats.totalProducts = totalProducts[0].values[0][0];
  
  const totalOrders = d.exec('SELECT COUNT(*) as count FROM orders');
  stats.totalOrders = totalOrders[0].values[0][0];
  
  const pendingOrders = d.exec("SELECT COUNT(*) as count FROM orders WHERE order_status = 'pending'");
  stats.pendingOrders = pendingOrders[0].values[0][0];
  
  const revenue = d.exec("SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE payment_status != 'cancelled'");
  stats.totalRevenue = revenue[0].values[0][0];
  
  const recentOrders = d.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 5");
  stats.recentOrders = [];
  while (recentOrders.step()) {
    stats.recentOrders.push(recentOrders.getAsObject());
  }
  recentOrders.free();
  
  return stats;
}

// Search products
async function searchProducts(query) {
  const d = await getDb();
  const searchTerm = `%${query}%`;
  const stmt = d.prepare(`
    SELECT p.*, c.name as category_name, c.slug as category_slug
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.active = 1 AND (p.name LIKE ? OR p.description LIKE ? OR c.name LIKE ?)
    ORDER BY p.created_at DESC
    LIMIT 20
  `);
  stmt.bind([searchTerm, searchTerm, searchTerm]);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// Review functions
async function getProductReviews(productId) {
  const d = await getDb();
  const stmt = d.prepare("SELECT * FROM reviews WHERE product_id = ? ORDER BY created_at DESC");
  stmt.bind([productId]);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

async function addReview(productId, userName, rating, comment) {
  const d = await getDb();
  d.run("INSERT INTO reviews (product_id, user_name, rating, comment) VALUES (?, ?, ?, ?)",
    [productId, userName, rating, comment]);
  saveDb();
  return true;
}

async function getAverageRating(productId) {
  const d = await getDb();
  const stmt = d.prepare("SELECT AVG(rating) as avg_rating, COUNT(*) as count FROM reviews WHERE product_id = ?");
  stmt.bind([productId]);
  let result = { avg_rating: 0, count: 0 };
  if (stmt.step()) result = stmt.getAsObject();
  stmt.free();
  return { avg: Math.round(result.avg_rating * 10) / 10 || 0, count: result.count || 0 };
}

// Wishlist functions
async function getWishlist(sessionId) {
  const d = await getDb();
  const query = `
    SELECT p.*, c.name as category_name, c.slug as category_slug
    FROM wishlists w
    JOIN products p ON w.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE w.session_id = ? AND p.active = 1
    ORDER BY w.created_at DESC
  `;
  const stmt = d.prepare(query);
  stmt.bind([sessionId]);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

async function toggleWishlist(productId, sessionId) {
  const d = await getDb();
  const stmt = d.prepare("SELECT id FROM wishlists WHERE product_id = ? AND session_id = ?");
  stmt.bind([productId, sessionId]);
  if (stmt.step()) {
    const id = stmt.getAsObject().id;
    d.run("DELETE FROM wishlists WHERE id = ?", [id]);
    saveDb();
    stmt.free();
    return { added: false };
  }
  stmt.free();
  d.run("INSERT INTO wishlists (product_id, session_id) VALUES (?, ?)", [productId, sessionId]);
  saveDb();
  return { added: true };
}

async function isInWishlist(productId, sessionId) {
  const d = await getDb();
  const stmt = d.prepare("SELECT id FROM wishlists WHERE product_id = ? AND session_id = ?");
  stmt.bind([productId, sessionId]);
  const exists = stmt.step();
  stmt.free();
  return exists;
}

async function getWishlistCount(sessionId) {
  const d = await getDb();
  const stmt = d.prepare("SELECT COUNT(*) as count FROM wishlists WHERE session_id = ?");
  stmt.bind([sessionId]);
  let count = 0;
  if (stmt.step()) count = stmt.getAsObject().count;
  stmt.free();
  return count;
}

module.exports = {
  initDb,
  getDb,
  getProducts,
  getProduct,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  getOrders,
  getOrder,
  createOrder,
  updateOrderStatus,
  updatePaymentStatus,
  getDashboardStats,
  searchProducts,
  getProductReviews,
  addReview,
  getAverageRating,
  getWishlist,
  toggleWishlist,
  isInWishlist,
  getWishlistCount,
  getCouponByCode,
  getAllCoupons,
  createCoupon,
  incrementCouponUse,
  deleteCoupon,
  getProductVariants,
  addVariant,
  deleteVariant,
  updateVariantStock,
  
  // Settings functions
  getAllSettings,
  getSetting,
  updateSetting,
  saveDb
};

// Coupon functions
async function getCouponByCode(code) {
  const d = await getDb();
  const stmt = d.prepare("SELECT * FROM coupons WHERE code = ? AND active = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))");
  stmt.bind([code.toUpperCase()]);
  let coupon = null;
  if (stmt.step()) coupon = stmt.getAsObject();
  stmt.free();
  return coupon;
}

async function getAllCoupons() {
  const d = await getDb();
  const stmt = d.prepare("SELECT * FROM coupons ORDER BY created_at DESC");
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

async function createCoupon(code, type, value, min_order, max_uses, expires_at) {
  const d = await getDb();
  d.run("INSERT INTO coupons (code, type, value, min_order, max_uses, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
    [code.toUpperCase(), type, value, min_order || 0, max_uses || 100, expires_at || null]);
  saveDb();
  return true;
}

async function incrementCouponUse(id) {
  const d = await getDb();
  d.run("UPDATE coupons SET uses = uses + 1 WHERE id = ?", [id]);
  saveDb();
}

async function deleteCoupon(id) {
  const d = await getDb();
  d.run("DELETE FROM coupons WHERE id = ?", [id]);
  saveDb();
}

// Variant functions
async function getProductVariants(productId) {
  const d = await getDb();
  const stmt = d.prepare("SELECT * FROM product_variants WHERE product_id = ? ORDER BY name, id");
  stmt.bind([productId]);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

async function addVariant(productId, name, value, price_adjust, stock) {
  const d = await getDb();
  d.run("INSERT INTO product_variants (product_id, name, value, price_adjust, stock) VALUES (?, ?, ?, ?, ?)",
    [productId, name, value, price_adjust || 0, stock || 10]);
  saveDb();
  return true;
}

async function deleteVariant(id) {
  const d = await getDb();
  d.run("DELETE FROM product_variants WHERE id = ?", [id]);
  saveDb();
}

async function updateVariantStock(id, stock) {
  const d = await getDb();
  d.run("UPDATE product_variants SET stock = ? WHERE id = ?", [stock, id]);
  saveDb();
}

// Settings functions
async function getAllSettings() {
  const d = await getDb();
  const stmt = d.prepare("SELECT * FROM site_settings ORDER BY group_name, key");
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

async function getSetting(key) {
  const d = await getDb();
  const stmt = d.prepare("SELECT value FROM site_settings WHERE key = ?");
  stmt.bind([key]);
  let val = null;
  if (stmt.step()) val = stmt.getAsObject().value;
  stmt.free();
  return val;
}

async function updateSetting(key, value) {
  const d = await getDb();
  d.run("INSERT OR REPLACE INTO site_settings (key, value) VALUES (?, ?)", [key, value]);
  saveDb();
  return true;
}
}
