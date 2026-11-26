import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const dbPath = path.resolve(process.env.DB_PATH || './data/harinijualapa.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function hashPin(pin) {
  return crypto.createHash('sha256').update(String(pin)).digest('hex');
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, expectedHex] = storedHash.split(':');
  const actualBuf = crypto.scryptSync(String(password), salt, 64);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (actualBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT '✨',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category_slug TEXT NOT NULL DEFAULT 'tech',
      tags TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL,
      shopee_url TEXT NOT NULL DEFAULT '',
      shopee_price REAL,
      shopee_price_status TEXT NOT NULL DEFAULT 'manual',
      tiktok_url TEXT NOT NULL DEFAULT '',
      tiktok_price REAL,
      tiktok_price_status TEXT NOT NULL DEFAULT 'manual',
      lazada_url TEXT NOT NULL DEFAULT '',
      lazada_price REAL,
      lazada_price_status TEXT NOT NULL DEFAULT 'manual',
      lazada_rating REAL,
      lazada_clicks INTEGER NOT NULL DEFAULT 0,
      pinduoduo_url TEXT NOT NULL DEFAULT '',
      pinduoduo_price REAL,
      pinduoduo_price_status TEXT NOT NULL DEFAULT 'manual',
      pinduoduo_rating REAL,
      pinduoduo_clicks INTEGER NOT NULL DEFAULT 0,
      purchase_count INTEGER NOT NULL DEFAULT 0,
      shopee_rating REAL DEFAULT 4.8,
      tiktok_rating REAL DEFAULT 4.8,
      reliability_score REAL NOT NULL DEFAULT 4.8,
      reliability_verified INTEGER NOT NULL DEFAULT 1,
      is_featured INTEGER NOT NULL DEFAULT 0,
      shopee_clicks INTEGER NOT NULL DEFAULT 0,
      tiktok_clicks INTEGER NOT NULL DEFAULT 0,
      last_price_sync TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_slug);
    CREATE INDEX IF NOT EXISTS idx_products_created ON products(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_products_purchases ON products(purchase_count DESC);
    CREATE INDEX IF NOT EXISTS idx_products_reliability ON products(reliability_score DESC);
  `);

  // Safe migration for existing SQLite databases created before shopee_rating/tiktok_rating
  const cols = db.prepare('PRAGMA table_info(products)').all().map((c) => c.name);
  if (!cols.includes('shopee_rating')) {
    db.exec('ALTER TABLE products ADD COLUMN shopee_rating REAL');
    db.exec('UPDATE products SET shopee_rating = reliability_score');
  }
  if (!cols.includes('tiktok_rating')) {
    db.exec('ALTER TABLE products ADD COLUMN tiktok_rating REAL');
    db.exec('UPDATE products SET tiktok_rating = reliability_score');
  }
  db.exec(
    'UPDATE products SET shopee_rating = reliability_score, tiktok_rating = reliability_score WHERE shopee_rating = 4.8 AND tiktok_rating = 4.8 AND reliability_score != 4.8'
  );

  const extraCols = [
    ['lazada_url', "TEXT NOT NULL DEFAULT ''"],
    ['lazada_price', 'REAL'],
    ['lazada_price_status', "TEXT NOT NULL DEFAULT 'manual'"],
    ['lazada_rating', 'REAL'],
    ['lazada_clicks', 'INTEGER NOT NULL DEFAULT 0'],
    ['pinduoduo_url', "TEXT NOT NULL DEFAULT ''"],
    ['pinduoduo_price', 'REAL'],
    ['pinduoduo_price_status', "TEXT NOT NULL DEFAULT 'manual'"],
    ['pinduoduo_rating', 'REAL'],
    ['pinduoduo_clicks', 'INTEGER NOT NULL DEFAULT 0'],
  ];
  let addedMultiPlatform = false;
  for (const [colName, colDef] of extraCols) {
    if (!cols.includes(colName)) {
      db.exec(`ALTER TABLE products ADD COLUMN ${colName} ${colDef}`);
      addedMultiPlatform = true;
    }
  }

  if (addedMultiPlatform) {
    // Showcase a 4-link product (#001) and 3-link product (#003) on first migration
    db.prepare(
      `UPDATE products SET
        lazada_url = 'https://www.lazada.com.my/catalog/?q=Anker%20Soundcore%20R50i%20NC',
        lazada_price = 76.50,
        lazada_price_status = 'synced',
        lazada_rating = 4.9,
        pinduoduo_url = 'https://mobile.yangkeduo.com/search_result.html?search_key=Anker%20Soundcore%20R50i',
        pinduoduo_price = 69.90,
        pinduoduo_price_status = 'synced',
        pinduoduo_rating = 4.8
       WHERE code = '#001' AND lazada_url = ''`
    ).run();

    db.prepare(
      `UPDATE products SET
        lazada_url = 'https://www.lazada.com.my/catalog/?q=UGREEN%2065W%20Nexode%20GaN',
        lazada_price = 86.00,
        lazada_price_status = 'synced',
        lazada_rating = 4.9
       WHERE code = '#003' AND lazada_url = ''`
    ).run();
  }

  // Ensure click_events allows all 4 platforms
  const clickTableSql = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'click_events'")
    .get()?.sql;
  if (clickTableSql && !clickTableSql.includes("'lazada'")) {
    db.exec(`
      ALTER TABLE click_events RENAME TO click_events_old;
      CREATE TABLE click_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        platform TEXT NOT NULL CHECK(platform IN ('shopee', 'tiktok', 'lazada', 'pinduoduo')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      );
      INSERT INTO click_events (id, product_id, platform, created_at)
      SELECT id, product_id, platform, created_at FROM click_events_old;
      DROP TABLE click_events_old;
    `);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      token TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      last_activity_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS click_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      platform TEXT NOT NULL CHECK(platform IN ('shopee', 'tiktok', 'lazada', 'pinduoduo')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
  `);

  const adminCount = db.prepare('SELECT COUNT(*) AS count FROM admin_users').get().count;
  if (adminCount === 0) {
    const defaultUser = process.env.ADMIN_USERNAME || 'admin';
    const defaultPass = process.env.ADMIN_PASSWORD || 'hariniadmin';
    db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run(
      defaultUser,
      hashPassword(defaultPass)
    );
  }

  const defaults = [
    ['store_name', 'HariniJualApa'],
    ['store_handle', '@harinijualapa'],
    [
      'store_tagline',
      'Curated daily viral finds — compare Shopee & TikTok Shop prices in one tap.',
    ],
  ];

  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );
  for (const [k, v] of defaults) {
    insertSetting.run(k, v);
  }
}

initDatabase();

export default db;
