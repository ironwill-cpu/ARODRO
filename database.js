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
    seedDemoData(db);
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
    const sqliteDb = await initSqliteInline();
    const sqliteWrapper = {
      initDb: async () => sqliteDb,
      query: async (sql, params) => {
        if (!sqliteDb) throw new Error('SQLite not initialized');
        return new Promise((resolve, reject) => {
          try {
            const stmt = sqliteDb.prepare(sql);
            if (params && params.length) {
              stmt.bind(params);
            }
            const rows = [];
            while (stmt.step()) {
              const row = stmt.getAsObject();
              rows.push(row);
            }
            stmt.free();
            resolve({ rows });
          } catch (e) {
            reject(e);
          }
        });
      },
      getProducts: () => proxySqliteQuery(sqliteDb, 'SELECT p.*, c.name as category_name, c.slug as category_slug FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.active = 1 ORDER BY p.created_at DESC'),
      getProduct: (slug) => proxySqliteQueryOne(sqliteDb, 'SELECT p.*, c.name as category_name, c.slug as category_slug FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.slug = ? LIMIT 1', [slug]),
      getProductById: (id) => proxySqliteQueryOne(sqliteDb, 'SELECT p.*, c.name as category_name, c.slug as category_slug FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ? LIMIT 1', [id]),
      getCategories: () => proxySqliteQuery(sqliteDb, 'SELECT c.*, COUNT(p.id) as product_count FROM categories c LEFT JOIN products p ON p.category_id = c.id GROUP BY c.id ORDER BY c.name'),
      getCategory: (slug) => proxySqliteQueryOne(sqliteDb, 'SELECT c.*, COUNT(p.id) as product_count FROM categories c LEFT JOIN products p ON p.category_id = c.id WHERE c.slug = ? GROUP BY c.id LIMIT 1', [slug]),
      getOrders: (status) => {
        let sql = 'SELECT * FROM orders';
        const params = [];
        if (status) { sql += ' WHERE order_status = ?'; params.push(status); }
        sql += ' ORDER BY created_at DESC';
        return proxySqliteQuery(sqliteDb, sql, params);
      },
      getOrder: (orderId) => proxySqliteQueryOne(sqliteDb, 'SELECT * FROM orders WHERE order_id = ? LIMIT 1', [orderId]),
      createOrder: (data) => proxySqliteInsert(sqliteDb, 'orders', data),
      updateOrderStatus: (orderId, status) => proxySqliteRun(sqliteDb, 'UPDATE orders SET order_status = ? WHERE order_id = ?', [status, orderId]),
      updatePaymentStatus: (orderId, status) => proxySqliteRun(sqliteDb, 'UPDATE orders SET payment_status = ? WHERE order_id = ?', [status, orderId]),
      getDashboardStats: async () => {
        const orders = await proxySqliteQuery(sqliteDb, "SELECT COUNT(*) as total_orders, SUM(total) as total_revenue, COUNT(CASE WHEN order_status='pending' THEN 1 END) as pending FROM orders");
        return orders[0] || { total_orders: 0, total_revenue: 0, pending: 0 };
      },
      searchProducts: (q) => proxySqliteQuery(sqliteDb, 'SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.active = 1 AND (p.name LIKE ? OR p.description LIKE ?) ORDER BY p.created_at DESC', [`%${q}%`, `%${q}%`]),
      getProductReviews: (productId) => proxySqliteQuery(sqliteDb, 'SELECT * FROM reviews WHERE product_id = ? ORDER BY created_at DESC', [productId]),
      addReview: (data) => proxySqliteInsert(sqliteDb, 'reviews', data),
      getAverageRating: (productId) => proxySqliteQueryOne(sqliteDb, 'SELECT AVG(rating) as avg FROM reviews WHERE product_id = ?', [productId]),
      getWishlist: (sessionId) => proxySqliteQuery(sqliteDb, 'SELECT p.* FROM wishlists w JOIN products p ON w.product_id = p.id WHERE w.session_id = ?', [sessionId]),
      toggleWishlist: (productId, sessionId) => {
        const existing = proxySqliteQueryOne(sqliteDb, 'SELECT id FROM wishlists WHERE product_id = ? AND session_id = ? LIMIT 1', [productId, sessionId]);
        if (existing) {
          proxySqliteRun(sqliteDb, 'DELETE FROM wishlists WHERE product_id = ? AND session_id = ?', [productId, sessionId]);
          return false;
        } else {
          proxySqliteInsert(sqliteDb, 'wishlists', { product_id: productId, session_id: sessionId });
          return true;
        }
      },
      isInWishlist: (productId, sessionId) => !!proxySqliteQueryOne(sqliteDb, 'SELECT id FROM wishlists WHERE product_id = ? AND session_id = ? LIMIT 1', [productId, sessionId]),
      getWishlistCount: (sessionId) => proxySqliteQueryOne(sqliteDb, 'SELECT COUNT(*) as count FROM wishlists WHERE session_id = ?', [sessionId]),
      getCouponByCode: (code) => proxySqliteQueryOne(sqliteDb, 'SELECT * FROM coupons WHERE code = ? AND active = 1', [code]),
      getAllCoupons: () => proxySqliteQuery(sqliteDb, 'SELECT * FROM coupons ORDER BY created_at DESC'),
      createCoupon: (data) => proxySqliteInsert(sqliteDb, 'coupons', data),
      incrementCouponUse: (id) => proxySqliteRun(sqliteDb, 'UPDATE coupons SET uses = uses + 1 WHERE id = ?', [id]),
      deleteCoupon: (id) => proxySqliteRun(sqliteDb, 'DELETE FROM coupons WHERE id = ?', [id]),
      getProductVariants: (productId) => proxySqliteQuery(sqliteDb, 'SELECT * FROM product_variants WHERE product_id = ?', [productId]),
      addVariant: (data) => proxySqliteInsert(sqliteDb, 'product_variants', data),
      deleteVariant: (id) => proxySqliteRun(sqliteDb, 'DELETE FROM product_variants WHERE id = ?', [id]),
      updateVariantStock: (id, stock) => proxySqliteRun(sqliteDb, 'UPDATE product_variants SET stock = ? WHERE id = ?', [stock, id]),
      getAllSettings: () => proxySqliteQuery(sqliteDb, 'SELECT * FROM site_settings'),
      getSetting: (key) => proxySqliteQueryOne(sqliteDb, 'SELECT * FROM site_settings WHERE key = ? LIMIT 1', [key]),
      updateSetting: (key, value) => proxySqliteRun(sqliteDb, 'UPDATE site_settings SET value = ? WHERE key = ?', [value, key]),
      createCategory: (data) => proxySqliteInsert(sqliteDb, 'categories', data),
      updateCategory: (id, data) => proxySqliteUpdate(sqliteDb, 'categories', id, data),
      deleteCategory: (id) => proxySqliteRun(sqliteDb, 'DELETE FROM categories WHERE id = ?', [id]),
      createProduct: (data) => proxySqliteInsert(sqliteDb, 'products', data),
      updateProduct: (id, data) => proxySqliteUpdate(sqliteDb, 'products', id, data),
      deleteProduct: (id) => proxySqliteRun(sqliteDb, 'DELETE FROM products WHERE id = ?', [id])
    };
    dbModule = sqliteWrapper;
    console.log('✓ Using SQLite fallback');
    return sqliteDb;
  }
}

function proxySqliteQuery(db, sql, params) {
  return new Promise((resolve, reject) => {
    try {
      const stmt = db.prepare(sql);
      if (params && params.length) stmt.bind(params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      resolve(rows);
    } catch (e) { reject(e); }
  });
}
function proxySqliteQueryOne(db, sql, params) {
  return proxySqliteQuery(db, sql, params).then(rows => rows[0] || null);
}
function proxySqliteInsert(db, table, data) {
  const keys = Object.keys(data);
  const vals = Object.values(data);
  const placeholders = keys.map(() => '?').join(',');
  const sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`;
  return new Promise((resolve, reject) => {
    try {
      const stmt = db.prepare(sql);
      stmt.bind(vals);
      stmt.step();
      const info = db.exec("SELECT last_insert_rowid() as id");
      const id = info[0] && info[0].values[0] ? info[0].values[0][0] : null;
      stmt.free();
      resolve({ id });
    } catch (e) { reject(e); }
  });
}
function proxySqliteUpdate(db, table, id, data) {
  const keys = Object.keys(data);
  const vals = Object.values(data);
  const setClause = keys.map(k => `${k} = ?`).join(', ');
  const sql = `UPDATE ${table} SET ${setClause} WHERE id = ?`;
  return proxySqliteRun(db, sql, [...vals, id]);
}
function proxySqliteRun(db, sql, params) {
  return new Promise((resolve, reject) => {
    try {
      const stmt = db.prepare(sql);
      if (params && params.length) stmt.bind(params);
      stmt.step();
      stmt.free();
      resolve({});
    } catch (e) { reject(e); }
  });
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
function seedDemoData(db) {
  try {
    const cats = db.exec("SELECT COUNT(*) as cnt FROM categories");
    const cnt = cats[0] && cats[0].values && cats[0].values[0] ? cats[0].values[0][0] : 0;
    if (cnt > 0) return;
    db.run("INSERT INTO categories (name, slug, description) VALUES (?, ?, ?)", ['Skincare', 'skincare', 'Premium skincare products']);
    db.run("INSERT INTO categories (name, slug, description) VALUES (?, ?, ?)", ['Makeup', 'makeup', 'Beauty makeup essentials']);
    db.run("INSERT INTO categories (name, slug, description) VALUES (?, ?, ?)", ['Haircare', 'haircare', 'Hair care solutions']);
    db.run("INSERT INTO categories (name, slug, description) VALUES (?, ?, ?)", ['Fragrance', 'fragrance', 'Luxury perfumes']);
    const cids = db.exec("SELECT id FROM categories ORDER BY id");
    const cid1 = cids[0].values[0][0];
    const cid2 = cids[0].values[1][0];
    const cid3 = cids[0].values[2][0];
    const cid4 = cids[0].values[3][0];
    const now = new Date().toISOString();
    db.run("INSERT INTO products (name, slug, description, short_description, price, compare_price, category_id, image, stock, featured, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", ['Radiance Glow Serum', 'radiance-glow-serum', 'Brightening vitamin C serum for radiant skin.', 'Vitamin C brightening serum', 1250, 1500, cid1, 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iODAwIj48cmVjdCB3aWR0aD0iODAwIiBoZWlnaHQ9IjgwMCIgZmlsbD0iI2Y4ZThlOCIvPjxyZWN0IHg9IjYwIiB5PSI2MCIgd2lkdGg9IjY4MCIgaGVpZ2h0PSI2ODAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2E2MzczNyIgc3Ryb2tlLXdpZHRoPSI0Ii8+PHRleHQgeD0iNDAwIiB5PSIzNDAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJHZW9yZ2lhIiBmb250LXNpemU9IjU2IiBmaWxsPSIjYTYzNzM3Ij5SYWRpYW5jZTwvdGV4dD48dGV4dCB4PSI0MDAiIHk9IjQyMCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9Ikdlb3JnaWEiIGZvbnQtc2l6ZT0iNTYiIGZpbGw9IiNhNjM3MzciPkdsb3cgU2VydW08L3RleHQ+PHRleHQgeD0iNDAwIiB5PSI1MDAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJHZW9yZ2lhIiBmb250LXNpemU9IjI4IiBmaWxsPSIjYTYzNzM3IiBvcGFjaXR5PSIwLjgiPlNraW5jYXJlPC90ZXh0PjxjaXJjbGUgY3g9IjM0MCIgY3k9IjY4MCIgcj0iMTAiIGZpbGw9IiNhNjM3MzciLz48Y2lyY2xlIGN4PSI0MDAiIGN5PSI2ODAiIHI9IjEwIiBmaWxsPSIjYTYzNzM3Ii8+PGNpcmNsZSBjeD0iNDYwIiBjeT0iNjgwIiByPSIxMCIgZmlsbD0iI2E2MzczNyIvPjwvc3ZnPg==', 15, 1, 1, now, now]);
    db.run("INSERT INTO products (name, slug, description, short_description, price, compare_price, category_id, image, stock, featured, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", ['Hydra Moisture Cream', 'hydra-moisture-cream', 'Deep hydration cream with hyaluronic acid.', 'Hyaluronic acid hydration cream', 890, 1100, cid1, 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iODAwIj48cmVjdCB3aWR0aD0iODAwIiBoZWlnaHQ9IjgwMCIgZmlsbD0iI2YwZThmNCIvPjxyZWN0IHg9IjYwIiB5PSI2MCIgd2lkdGg9IjY4MCIgaGVpZ2h0PSI2ODAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzdhNGE4YSIgc3Ryb2tlLXdpZHRoPSI0Ii8+PHRleHQgeD0iNDAwIiB5PSIzNDAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJHZW9yZ2lhIiBmb250LXNpemU9IjU2IiBmaWxsPSIjN2E0YThhIj5IeWRyYTwvdGV4dD48dGV4dCB4PSI0MDAiIHk9IjQyMCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9Ikdlb3JnaWEiIGZvbnQtc2l6ZT0iNTYiIGZpbGw9IiM3YTRhOGEiPk1vaXN0dXJlIENyZWFtPC90ZXh0Pjx0ZXh0IHg9IjQwMCIgeT0iNTAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0iR2VvcmdpYSIgZm9udC1zaXplPSIyOCIgZmlsbD0iIzdhNGE4YSIgb3BhY2l0eT0iMC44Ij5Ta2luY2FyZTwvdGV4dD48Y2lyY2xlIGN4PSIzNDAiIGN5PSI2ODAiIHI9IjEwIiBmaWxsPSIjN2E0YThhIi8+PGNpcmNsZSBjeD0iNDAwIiBjeT0iNjgwIiByPSIxMCIgZmlsbD0iIzdhNGE4YSIvPjxjaXJjbGUgY3g9IjQ2MCIgY3k9IjY4MCIgcj0iMTAiIGZpbGw9IiM3YTRhOGEiLz48L3N2Zz4=', 20, 1, 1, now, now]);
    db.run("INSERT INTO products (name, slug, description, short_description, price, compare_price, category_id, image, stock, featured, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", ['Velvet Matte Lipstick', 'velvet-matte-lipstick', 'Long-lasting matte lipstick in red shade.', 'Long-lasting matte lipstick', 650, 800, cid2, 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iODAwIj48cmVjdCB3aWR0aD0iODAwIiBoZWlnaHQ9IjgwMCIgZmlsbD0iI2ZmZjVmNSIvPjxyZWN0IHg9IjYwIiB5PSI2MCIgd2lkdGg9IjY4MCIgaGVpZ2h0PSI2ODAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2MwMzkyYiIgc3Ryb2tlLXdpZHRoPSI0Ii8+PHRleHQgeD0iNDAwIiB5PSIzNDAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJHZW9yZ2lhIiBmb250LXNpemU9IjU2IiBmaWxsPSIjYzAzOTJiIj5WZWx2ZXQ8L3RleHQ+PHRleHQgeD0iNDAwIiB5PSI0MjAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJHZW9yZ2lhIiBmb250LXNpemU9IjU2IiBmaWxsPSIjYzAzOTJiIj5NYXR0ZSBMaXBzdGljazwvdGV4dD48dGV4dCB4PSI0MDAiIHk9IjUwMCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9Ikdlb3JnaWEiIGZvbnQtc2l6ZT0iMjgiIGZpbGw9IiNjMDM5MmIiIG9wYWNpdHk9IjAuOCI+TWFrZXVwPC90ZXh0PjxjaXJjbGUgY3g9IjM0MCIgY3k9IjY4MCIgcj0iMTAiIGZpbGw9IiNjMDM5MmIiLz48Y2lyY2xlIGN4PSI0MDAiIGN5PSI2ODAiIHI9IjEwIiBmaWxsPSIjYzAzOTJiIi8+PGNpcmNsZSBjeD0iNDYwIiBjeT0iNjgwIiByPSIxMCIgZmlsbD0iI2MwMzkyYiIvPjwvc3ZnPg==', 25, 1, 1, now, now]);
    db.run("INSERT INTO products (name, slug, description, short_description, price, compare_price, category_id, image, stock, featured, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", ['Golden Foundation', 'golden-foundation', 'Full coverage foundation with golden undertone.', 'Full coverage foundation', 1200, 1450, cid2, 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iODAwIj48cmVjdCB3aWR0aD0iODAwIiBoZWlnaHQ9IjgwMCIgZmlsbD0iI2ZkZjZlMyIvPjxyZWN0IHg9IjYwIiB5PSI2MCIgd2lkdGg9IjY4MCIgaGVpZ2h0PSI2ODAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2IwOGQ1NyIgc3Ryb2tlLXdpZHRoPSI0Ii8+PHRleHQgeD0iNDAwIiB5PSIzNDAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJHZW9yZ2lhIiBmb250LXNpemU9IjU2IiBmaWxsPSIjYjA4ZDU3Ij5Hb2xkZW48L3RleHQ+PHRleHQgeD0iNDAwIiB5PSI0MjAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJHZW9yZ2lhIiBmb250LXNpemU9IjU2IiBmaWxsPSIjYjA4ZDU3Ij5Gb3VuZGF0aW9uPC90ZXh0Pjx0ZXh0IHg9IjQwMCIgeT0iNTAwIiB0ZXh0LWF5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJHZW9yZ2lhIiBmb250LXNpemU9IjI4IiBmaWxsPSIjYjA4ZDU3IiBvcGFjaXR5PSIwLjgiPk1ha2V1cDwvdGV4dD48Y2lyY2xlIGN4PSIzNDAiIGN5PSI2ODAiIHI9IjEwIiBmaWxsPSIjYjA4ZDU3Ii8+PGNpcmNsZSBjeD0iNDAwIiBjeT0iNjgwIiByPSIxMCIgZmlsbD0iI2IwOGQ1NyIvPjxjaXJjbGUgY3g9IjQ2MCIgY3k9IjY4MCIgcj0iMTAiIGZpbGw9IiNiMDhkNTciLz48L3N2Zz4=', 12, 1, 1, now, now]);
    db.run("INSERT INTO products (name, slug, description, short_description, price, compare_price, category_id, image, stock, featured, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", ['Argan Hair Elixir', 'argan-hair-elixir', 'Nourishing hair oil with pure argan oil.', 'Pure argan hair oil', 980, 1250, cid3, 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iODAwIj48cmVjdCB3aWR0aD0iODAwIiBoZWlnaHQ9IjgwMCIgZmlsbD0iI2VlZjZmMyIvPjxyZWN0IHg9IjYwIiB5PSI2MCIgd2lkdGg9IjY4MCIgaGVpZ2h0PSI2ODAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzJlN2QzMiIgc3Ryb2tlLXdpZHRoPSI0Ii8+PHRleHQgeD0iNDAwIiB5PSIzNDAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJHZW9yZ2lhIiBmb250LXNpemU9IjU2IiBmaWxsPSIjMmU3ZDMyIj5BcmdhbjwvdGV4dD48dGV4dCB4PSI0MDAiIHk9IjQyMCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9Ikdlb3JnaWEiIGZvbnQtc2l6ZT0iNTYiIGZpbGw9IiMyZTdkMzIiPkhhaXIgRWxpeGlyPC90ZXh0Pjx0ZXh0IHg9IjQwMCIgeT0iNTAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0iR2VvcmdpYSIgZm9udC1zaXplPSIyOCIgZmlsbD0iIzJlN2QzMiIgb3BhY2l0eT0iMC44Ij5IYWlyY2FyZTwvdGV4dD48Y2lyY2xlIGN4PSIzNDAiIGN5PSI2ODAiIHI9IjEwIiBmaWxsPSIjMmU3ZDMyIi8+PGNpcmNsZSBjeD0iNDAwIiBjeT0iNjgwIiByPSIxMCIgZmlsbD0iIzJlN2QzMiIvPjxjaXJjbGUgY3g9IjQ2MCIgY3k9IjY4MCIgcj0iMTAiIGZpbGw9IiMyZTdkMzIiLz48L3N2Zz4=', 18, 1, 1, now, now]);
    db.run("INSERT INTO products (name, slug, description, short_description, price, compare_price, category_id, image, stock, featured, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", ['Rose Garden Perfume', 'rose-garden-perfume', 'Floral perfume with rose and jasmine notes.', 'Floral rose perfume', 1850, 2200, cid4, 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iODAwIj48cmVjdCB3aWR0aD0iODAwIiBoZWlnaHQ9IjgwMCIgZmlsbD0iI2Y1ZjBmZiIvPjxyZWN0IHg9IjYwIiB5PSI2MCIgd2lkdGg9IjY4MCIgaGVpZ2h0PSI2ODAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzVhM2Q5YSIgc3Ryb2tlLXdpZHRoPSI0Ii8+PHRleHQgeD0iNDAwIiB5PSIzNDAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJHZW9yZ2lhIiBmb250LXNpemU9IjU2IiBmaWxsPSIjNWEzZDlhIj5Sb3NlPC90ZXh0Pjx0ZXh0IHg9IjQwMCIgeT0iNDIwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0iR2VvcmdpYSIgZm9udC1zaXplPSI1NiIgZmlsbD0iIzVhM2Q5YSI+R2FyZGVuIFBlcmZ1bWU8L3RleHQ+PHRleHQgeD0iNDAwIiB5PSI1MDAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJHZW9yZ2lhIiBmb250LXNpemU9IjI4IiBmaWxsPSIjNWEzZDlhIiBvcGFjaXR5PSIwLjgiPkZyYWdyYW5jZTwvdGV4dD48Y2lyY2xlIGN4PSIzNDAiIGN5PSI2ODAiIHI9IjEwIiBmaWxsPSIjNWEzZDlhIi8+PGNpcmNsZSBjeD0iNDAwIiBjeT0iNjgwIiByPSIxMCIgZmlsbD0iIzVhM2Q5YSIvPjxjaXJjbGUgY3g9IjQ2MCIgY3k9IjY4MCIgcj0iMTAiIGZpbGw9IiM1YTNkOWEiLz48L3N2Zz4=', 8, 1, 1, now, now]);
  } catch (e) {
    console.error('seedDemoData failed:', e.message);
  }
}
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
