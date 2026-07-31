const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

let pool = null;

function getPool() {
  if (!pool) {
    // Support both connection string and individual params
    const url = process.env.SUPABASE_DB_URL;
    const pgConfig = url ? { connectionString: url, ssl: { rejectUnauthorized: false } } 
      : {
          host: 'aws-0-ap-southeast-1.pooler.supabase.com',
          port: 6543,
          database: process.env.PGDATABASE || 'postgres',
          user: process.env.PGUSER || 'postgres.hzdvwkkjhikneqmgtedm',
          password: process.env.PGPASSWORD || 'Artcell@24@',
          ssl: { rejectUnauthorized: false },
          family: 4
        };
    pool = new Pool(pgConfig);
  }
  return pool;
}

async function initDb() {
  const p = getPool();
  
  // Create tables
  await p.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
      description TEXT, icon TEXT, image TEXT, created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
      short_description TEXT, description TEXT, price REAL NOT NULL,
      category_id INTEGER REFERENCES categories(id), image TEXT, images TEXT,
      stock INTEGER DEFAULT 10, featured INTEGER DEFAULT 0, active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY, customer_name TEXT NOT NULL, customer_email TEXT,
      customer_phone TEXT NOT NULL, customer_address TEXT NOT NULL, city TEXT NOT NULL,
      notes TEXT, subtotal REAL NOT NULL, shipping REAL DEFAULT 0, discount REAL DEFAULT 0,
      total REAL NOT NULL, payment_method TEXT DEFAULT 'cod',
      payment_status TEXT DEFAULT 'pending', status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER, product_name TEXT NOT NULL, price REAL NOT NULL,
      quantity INTEGER NOT NULL, total REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_users (
      id SERIAL PRIMARY KEY, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id SERIAL PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id),
      user_name TEXT NOT NULL, rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      comment TEXT, created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS wishlists (
      id SERIAL PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id),
      session_id TEXT NOT NULL, created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS coupons (
      id SERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE, type TEXT NOT NULL DEFAULT 'percentage',
      value REAL NOT NULL, min_order REAL DEFAULT 0, max_uses INTEGER DEFAULT 100,
      uses INTEGER DEFAULT 0, active INTEGER DEFAULT 1, expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS product_variants (
      id SERIAL PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id),
      name TEXT NOT NULL, value TEXT NOT NULL, price_adjust REAL DEFAULT 0, stock INTEGER DEFAULT 10
    );
    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY, value TEXT, type TEXT DEFAULT 'text', group_name TEXT DEFAULT 'general'
    );
  `);

  // Auto-migrate: add missing columns if they don't exist
  try {
    await p.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS compare_price DECIMAL(10,2) DEFAULT NULL');
    await p.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS ingredients TEXT DEFAULT NULL');
    await p.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS weight VARCHAR(50) DEFAULT NULL');
    await p.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()');
    await p.query('ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT NULL');
    await p.query('ALTER TABLE categories ADD COLUMN IF NOT EXISTS image TEXT DEFAULT NULL');
    console.log('✓ Schema migrations applied');
  } catch(e) {
    console.log('  Migration note:', e.message.substring(0,80));
  }

  // Auto-fix: sync SERIAL sequences so new rows never conflict with existing IDs
  try {
    const tables = ['products', 'categories', 'orders', 'coupons', 'reviews', 'wishlists', 'product_variants'];
    for (const t of tables) {
      try {
        await p.query(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), (SELECT MAX(id) FROM ${t})) WHERE (SELECT MAX(id) FROM ${t}) IS NOT NULL`);
      } catch(e) { /* table may not have a sequence or no rows */ }
    }
    console.log('✓ Sequences synced');
  } catch(e) {
    console.log('  Sequence note:', e.message.substring(0,80));
  }

  // Ensure admin exists
  const admins = await p.query("SELECT id FROM admin_users WHERE username = 'admin'");
  if (admins.rows.length === 0) {
    const hash = bcrypt.hashSync('Admin@123', 10);
    await p.query("INSERT INTO admin_users (username, password) VALUES ('admin', $1)", [hash]);
    console.log('✓ Admin user created');
  }
  
  console.log('✓ PostgreSQL database ready');
  return true;
}

async function query(text, params = []) {
  const p = getPool();
  return p.query(text, params);
}

// === PRODUCT QUERIES ===
async function getProducts(categorySlug = null, featured = null) {
  let sql = 'SELECT p.*, c.name as category_name, c.slug as category_slug FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.active = 1';
  const params = [];
  if (categorySlug) { sql += ' AND c.slug = $' + (params.length + 1); params.push(categorySlug); }
  if (featured) { sql += ' AND p.featured = 1'; }
  sql += ' ORDER BY p.created_at DESC';
  const r = await query(sql, params);
  return r.rows;
}

async function getProduct(slug) {
  const r = await query('SELECT p.*, c.name as category_name, c.slug as category_slug FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.slug = $1', [slug]);
  return r.rows[0] || null;
}

async function getProductById(id) {
  const r = await query('SELECT p.*, c.name as category_name, c.slug as category_slug FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = $1', [id]);
  return r.rows[0] || null;
}

async function createProduct(data) {
  const r = await query(
    'INSERT INTO products (name, slug, short_description, description, price, compare_price, category_id, image, images, stock, featured, active, ingredients, weight) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id',
    [data.name, data.slug, data.short_description, data.description, data.price, data.compare_price || null, data.category_id, data.image, data.images, data.stock || 10, data.featured || 0, data.active || 1, data.ingredients || null, data.weight || null]
  );
  return r.rows[0].id;
}

async function updateProduct(id, data) {
  // Only include fields that are actually provided AND in our allowed list
  const allowed = ['name','slug','short_description','description','price','compare_price','category_id','image','images','stock','featured','active','ingredients','weight'];
  const presentFields = allowed.filter(f => data[f] !== undefined);
  if (presentFields.length === 0) {
    console.log('updateProduct: no fields to update');
    return;
  }
  // Build SET clause with numbered params (starting at $2)
  const setClauses = presentFields.map((f, i) => `${f} = $${i + 2}`);
  const values = presentFields.map(f => data[f]);
  const sql = `UPDATE products SET ${setClauses.join(', ')} WHERE id = $1`;
  console.log('updateProduct SQL:', sql);
  console.log('updateProduct params:', [id, ...values.map(v => typeof v === 'string' ? v.substring(0,50) : v)]);
  await query(sql, [id, ...values]);
}

async function deleteProduct(id) {
  await query('DELETE FROM products WHERE id = $1', [id]);
}

async function searchProducts(q) {
  const r = await query(
    'SELECT p.*, c.name as category_name, c.slug as category_slug FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.active = 1 AND (p.name ILIKE $1 OR p.short_description ILIKE $1 OR p.description ILIKE $1) ORDER BY p.created_at DESC',
    [`%${q}%`]
  );
  return r.rows;
}

// === CATEGORY QUERIES ===
async function getCategories() {
  const r = await query('SELECT c.*, COUNT(p.id)::int as product_count FROM categories c LEFT JOIN products p ON c.id = p.category_id GROUP BY c.id ORDER BY c.name');
  return r.rows;
}

async function getCategory(slug) {
  const r = await query('SELECT * FROM categories WHERE slug = $1', [slug]);
  return r.rows[0] || null;
}

async function createCategory(data) {
  const r = await query('INSERT INTO categories (name, slug, description, icon) VALUES ($1,$2,$3,$4) RETURNING id',
    [data.name, data.slug, data.description, data.icon]);
  return r.rows[0].id;
}

async function updateCategory(id, data) {
  await query('UPDATE categories SET name=$1, slug=$2, description=$3, icon=$4 WHERE id=$5',
    [data.name, data.slug, data.description, data.icon, id]);
}

async function deleteCategory(id) {
  await query('DELETE FROM categories WHERE id = $1', [id]);
}

// === ORDER QUERIES ===
async function createOrder(data) {
  const r = await query(
    `INSERT INTO orders (customer_name, customer_email, customer_phone, customer_address, city, notes, subtotal, shipping, discount, total, payment_method, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [data.customer_name, data.customer_email, data.customer_phone, data.customer_address, data.city, data.notes, data.subtotal, data.shipping, data.discount || 0, data.total, data.payment_method, data.status || 'pending']
  );
  const orderId = r.rows[0].id;
  
  if (data.items) {
    for (const item of data.items) {
      await query(
        'INSERT INTO order_items (order_id, product_id, product_name, price, quantity, total) VALUES ($1,$2,$3,$4,$5,$6)',
        [orderId, item.product_id, item.product_name, item.price, item.quantity, item.total]
      );
    }
  }
  return orderId;
}

async function getOrder(id) {
  const r = await query('SELECT * FROM orders WHERE id = $1', [id]);
  if (r.rows.length === 0) return null;
  const order = r.rows[0];
  const items = await query('SELECT * FROM order_items WHERE order_id = $1', [id]);
  order.order_items = items.rows;
  return order;
}

async function getOrders() {
  const r = await query('SELECT * FROM orders ORDER BY created_at DESC');
  return r.rows;
}

async function getRecentOrders(limit = 5) {
  const r = await query('SELECT * FROM orders ORDER BY created_at DESC LIMIT $1', [limit]);
  return r.rows;
}

async function updateOrderStatus(id, status) {
  await query('UPDATE orders SET status = $1 WHERE id = $2', [status, id]);
}

async function updatePaymentStatus(id, status) {
  await query('UPDATE orders SET payment_status = $1 WHERE id = $2', [status, id]);
}

// === DASHBOARD ===
async function getDashboardStats() {
  const r1 = await query('SELECT COUNT(*) as c FROM products WHERE active=1');
  const r2 = await query('SELECT COUNT(*) as c FROM orders');
  const r3 = await query('SELECT COUNT(*) as c FROM reviews');
  const r4 = await query('SELECT COALESCE(SUM(total),0) as c FROM orders WHERE status!=\'cancelled\'');
  return { totalProducts: Number(r1.rows[0].c), totalOrders: Number(r2.rows[0].c), totalReviews: Number(r3.rows[0].c), totalRevenue: Number(r4.rows[0].c) };
}

// === REVIEWS ===
async function getProductReviews(productId) {
  const r = await query('SELECT * FROM reviews WHERE product_id = $1 ORDER BY created_at DESC', [productId]);
  return r.rows;
}

async function addReview(productId, userName, rating, comment) {
  await query('INSERT INTO reviews (product_id, user_name, rating, comment) VALUES ($1,$2,$3,$4)', [productId, userName, rating, comment]);
  return true;
}

async function getAverageRating(productId) {
  const r = await query('SELECT AVG(rating)::float as avg, COUNT(*) as count FROM reviews WHERE product_id = $1', [productId]);
  return { avg: r.rows[0].avg || 0, count: Number(r.rows[0].count) };
}

// === WISHLIST ===
async function getWishlist(sessionId) {
  const r = await query(
    'SELECT p.*, w.created_at as added_at FROM wishlists w JOIN products p ON w.product_id = p.id WHERE w.session_id = $1 ORDER BY w.created_at DESC',
    [sessionId]
  );
  return r.rows;
}

async function toggleWishlist(productId, sessionId) {
  const r = await query('SELECT id FROM wishlists WHERE product_id = $1 AND session_id = $2', [productId, sessionId]);
  if (r.rows.length > 0) {
    await query('DELETE FROM wishlists WHERE id = $1', [r.rows[0].id]);
    return { added: false };
  } else {
    await query('INSERT INTO wishlists (product_id, session_id) VALUES ($1, $2)', [productId, sessionId]);
    return { added: true };
  }
}

async function isInWishlist(productId, sessionId) {
  const r = await query('SELECT id FROM wishlists WHERE product_id = $1 AND session_id = $2', [productId, sessionId]);
  return r.rows.length > 0;
}

async function getWishlistCount(sessionId) {
  const r = await query('SELECT COUNT(*) as c FROM wishlists WHERE session_id = $1', [sessionId]);
  return Number(r.rows[0].c);
}

// === COUPONS ===
async function getCouponByCode(code) {
  const r = await query("SELECT * FROM coupons WHERE code = $1 AND active = 1 AND (expires_at IS NULL OR expires_at > NOW())", [code.toUpperCase()]);
  return r.rows[0] || null;
}

async function getAllCoupons() {
  const r = await query('SELECT * FROM coupons ORDER BY created_at DESC');
  return r.rows;
}

async function createCoupon(code, type, value, min_order, max_uses, expires_at) {
  await query('INSERT INTO coupons (code, type, value, min_order, max_uses, expires_at) VALUES ($1,$2,$3,$4,$5,$6)',
    [code.toUpperCase(), type, value, min_order || 0, max_uses || 100, expires_at || null]);
}

async function incrementCouponUse(id) {
  await query('UPDATE coupons SET uses = uses + 1 WHERE id = $1', [id]);
}

async function deleteCoupon(id) {
  await query('DELETE FROM coupons WHERE id = $1', [id]);
}

// === VARIANTS ===
async function getProductVariants(productId) {
  const r = await query('SELECT * FROM product_variants WHERE product_id = $1 ORDER BY name, id', [productId]);
  return r.rows;
}

async function addVariant(productId, name, value, price_adjust, stock) {
  await query('INSERT INTO product_variants (product_id, name, value, price_adjust, stock) VALUES ($1,$2,$3,$4,$5)',
    [productId, name, value, price_adjust || 0, stock || 10]);
}

async function deleteVariant(id) {
  await query('DELETE FROM product_variants WHERE id = $1', [id]);
}

async function updateVariantStock(id, stock) {
  await query('UPDATE product_variants SET stock = $1 WHERE id = $2', [stock, id]);
}

// === SETTINGS ===
async function getAllSettings() {
  const r = await query('SELECT * FROM site_settings ORDER BY group_name, key');
  return r.rows;
}

async function getSetting(key) {
  const r = await query('SELECT value FROM site_settings WHERE key = $1', [key]);
  return r.rows[0]?.value || null;
}

async function updateSetting(key, value) {
  await query('INSERT INTO site_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, value]);
}

// === EXTRA ===
async function getCategoryById(id) {
  const r = await query('SELECT * FROM categories WHERE id = $1', [id]);
  return r.rows[0] || null;
}

async function getCategoriesWithProductCount() {
  const r = await query('SELECT c.*, COUNT(p.id) as product_count FROM categories c LEFT JOIN products p ON p.category_id = c.id GROUP BY c.id ORDER BY c.name');
  return r.rows;
}

module.exports = {
  initDb, query,
  getProducts, getProduct, getProductById, createProduct, updateProduct, deleteProduct, searchProducts,
  getCategories, getCategory, getCategoriesWithProductCount, createCategory, updateCategory, deleteCategory,
  createOrder, getOrder, getOrders, getRecentOrders, updateOrderStatus, updatePaymentStatus,
  getDashboardStats,
  getProductReviews, addReview, getAverageRating,
  getWishlist, toggleWishlist, isInWishlist, getWishlistCount,
  getCouponByCode, getAllCoupons, createCoupon, incrementCouponUse, deleteCoupon,
  getProductVariants, addVariant, deleteVariant, updateVariantStock,
  getAllSettings, getSetting, updateSetting
};
