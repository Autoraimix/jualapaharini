import 'dotenv/config';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import db, { hashPassword, verifyPassword } from './db.js';
import { seedIfEmpty } from './seed.js';
import { fetchProductMetadata } from './priceFetcher.js';
import { queryProducts } from './search.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const UPLOADS_DIR = path.join(ROOT_DIR, 'public', 'uploads');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Ensure initial categories & sample products exist if DB is empty
seedIfEmpty({ force: false });

const app = express();
const PORT = Number(process.env.PORT || 3001);
const PRICE_SYNC_TTL_MINUTES = Number(process.env.PRICE_SYNC_TTL_MINUTES || 360);
const ADMIN_IDLE_TIMEOUT_MS = Number(process.env.ADMIN_IDLE_TIMEOUT_MINUTES || 10) * 60 * 1000;

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '.png').toLowerCase();
      const safeExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext) ? ext : '.png';
      cb(null, `prod_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${safeExt}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function getWindowsPcIdleMs() {
  if (process.platform !== 'win32') return null;
  try {
    const py = [
      'import ctypes',
      'class LII(ctypes.Structure):',
      "    _fields_=[('cbSize',ctypes.c_uint),('dwTime',ctypes.c_uint)]",
      'lii=LII()',
      'lii.cbSize=ctypes.sizeof(LII)',
      'ok=ctypes.windll.user32.GetLastInputInfo(ctypes.byref(lii))',
      'tick=ctypes.windll.kernel32.GetTickCount64() & 0xFFFFFFFF',
      'print(((tick - lii.dwTime) & 0xFFFFFFFF) if ok else -1)',
    ].join('\n');
    const out = spawnSync('python', ['-c', py], { encoding: 'utf8', timeout: 2000 });
    if (out.status === 0) {
      const ms = Number.parseInt((out.stdout || '').trim(), 10);
      if (Number.isFinite(ms) && ms >= 0) return ms;
    }
  } catch {
    // Fallback to API-only activity tracking
  }
  return null;
}

function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({ error: 'Admin authentication required.', code: 'AUTH_REQUIRED' });
  }
  const session = db
    .prepare('SELECT token, username, last_activity_at FROM admin_sessions WHERE token = ?')
    .get(token);

  if (!session) {
    return res.status(401).json({ error: 'Admin authentication required.', code: 'AUTH_REQUIRED' });
  }

  const now = Date.now();
  const isPassiveCheck = req.path === '/api/admin/verify' && req.query?.passive === '1';

  if (now - session.last_activity_at > ADMIN_IDLE_TIMEOUT_MS) {
    // Keep session alive while Real Chrome Bulk Sync is running or Windows PC was touched within timeout
    let activeRecently = Boolean(chromeSyncJob?.running);
    let nextRecordedActivity = now;

    if (!activeRecently && ADMIN_IDLE_TIMEOUT_MS >= 15000) {
      const pcIdleMs = getWindowsPcIdleMs();
      if (pcIdleMs !== null && pcIdleMs < ADMIN_IDLE_TIMEOUT_MS) {
        activeRecently = true;
        nextRecordedActivity = now - pcIdleMs;
      }
    }

    if (activeRecently) {
      db.prepare('UPDATE admin_sessions SET last_activity_at = ? WHERE token = ?').run(
        nextRecordedActivity,
        token
      );
    } else {
      db.prepare('DELETE FROM admin_sessions WHERE token = ?').run(token);
      return res.status(401).json({
        error: 'Session expired after 10 minutes of inactivity. Please sign in again.',
        code: 'SESSION_EXPIRED',
      });
    }
  } else if (!isPassiveCheck) {
    db.prepare('UPDATE admin_sessions SET last_activity_at = ? WHERE token = ?').run(now, token);
  }

  req.adminUser = session.username;
  req.adminToken = token;
  next();
}

function getNextCodeNumber() {
  const rows = db.prepare("SELECT code FROM products WHERE code LIKE '#%'").all();
  let maxNum = 0;
  for (const r of rows) {
    const num = Number.parseInt(String(r.code).replace('#', ''), 10);
    if (Number.isFinite(num) && num > maxNum) maxNum = num;
  }
  return maxNum + 1;
}

function getNextProductCode() {
  return `#${String(getNextCodeNumber()).padStart(3, '0')}`;
}

function parseCsvRows(csvText) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    const next = csvText[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field.trim());
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && next === '\n') i++;
      row.push(field.trim());
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  row.push(field.trim());
  if (row.some((cell) => cell.length > 0)) {
    rows.push(row);
  }
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((cols) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cols[idx] ?? '';
    });
    return obj;
  });
}

const PLATFORMS = ['shopee', 'tiktok', 'lazada', 'pinduoduo'];

function computeCombinedReliabilityFromRatings(ratings, fallback = 4.8) {
  const valid = ratings
    .map((r) => (r === '' || r === null || r === undefined ? null : Number(r)))
    .filter((r) => Number.isFinite(r) && r >= 1 && r <= 5);
  if (valid.length === 0) {
    const fb = Number(fallback);
    return Number.isFinite(fb) ? Math.min(5, Math.max(1, Number(fb.toFixed(1)))) : 4.8;
  }
  const avg = valid.reduce((sum, r) => sum + r, 0) / valid.length;
  return Math.min(5, Math.max(1, Number(avg.toFixed(1))));
}

function hasAtLeastOnePlatformLink(product) {
  return PLATFORMS.some((pl) => String(product[`${pl}_url`] || '').trim().length > 0);
}

function sanitizeProductInput(body, existing = null, fallbackCode = null) {
  const toNum = (v, fallback = null) => {
    if (v === '' || v === null || v === undefined) return fallback;
    const cleaned = String(v).replace(/^(?:RM|MYR)\s*/i, '').replace(/,/g, '').trim();
    if (!cleaned) return fallback;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : fallback;
  };

  const clampRating = (v, fallback) => {
    const n = toNum(v, fallback);
    if (n === null) return null;
    return Math.min(5, Math.max(1, Number(n.toFixed(1))));
  };

  const platformFields = {};
  const activeRatings = [];

  for (const pl of PLATFORMS) {
    const url = String(body[`${pl}_url`] ?? existing?.[`${pl}_url`] ?? '').trim();
    const price = url ? toNum(body[`${pl}_price`], existing?.[`${pl}_price`] ?? null) : null;
    const status = String(
      body[`${pl}_price_status`] ?? existing?.[`${pl}_price_status`] ?? 'manual'
    );
    const rating = url
      ? clampRating(body[`${pl}_rating`], existing?.[`${pl}_rating`] ?? 4.8)
      : null;

    platformFields[`${pl}_url`] = url;
    platformFields[`${pl}_price`] = price;
    platformFields[`${pl}_price_status`] = status;
    platformFields[`${pl}_rating`] = rating;

    if (url && rating !== null) {
      activeRatings.push(rating);
    }
  }

  const reliability_score = computeCombinedReliabilityFromRatings(
    activeRatings,
    body.reliability_score ?? existing?.reliability_score ?? 4.8
  );

  return {
    code: String(body.code || existing?.code || fallbackCode || getNextProductCode()).trim(),
    title: String(body.title ?? existing?.title ?? '').trim(),
    description: String(body.description ?? existing?.description ?? '').trim(),
    category_slug: String(body.category_slug ?? existing?.category_slug ?? 'tech').trim() || 'tech',
    tags: String(body.tags ?? existing?.tags ?? '').trim(),
    image_url: String(body.image_url ?? existing?.image_url ?? '').trim(),
    gallery_images: (() => {
      const raw = body.gallery_images ?? existing?.gallery_images ?? '[]';
      if (Array.isArray(raw)) {
        return JSON.stringify(raw.map((u) => String(u || '').trim()).filter(Boolean).slice(0, 12));
      }
      if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            return JSON.stringify(parsed.map((u) => String(u || '').trim()).filter(Boolean).slice(0, 12));
          }
        } catch {
          return '[]';
        }
      }
      return '[]';
    })(),
    ...platformFields,
    purchase_count: Math.max(0, Math.round(toNum(body.purchase_count, existing?.purchase_count ?? 0))),
    reliability_score,
    reliability_verified:
      body.reliability_verified === undefined
        ? existing?.reliability_verified ?? 1
        : body.reliability_verified
          ? 1
          : 0,
    is_featured:
      body.is_featured === undefined
        ? existing?.is_featured ?? 0
        : body.is_featured
          ? 1
          : 0,
  };
}

// ---------- Public Endpoints ----------

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get('/api/store-info', (_req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings WHERE key != ?').all('admin_pin_hash');
  const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order ASC, id ASC').all();
  const stats = db
    .prepare(
      'SELECT COUNT(*) AS totalProducts, COALESCE(SUM(purchase_count), 0) AS totalPurchases, COALESCE(SUM(shopee_clicks + tiktok_clicks + lazada_clicks + pinduoduo_clicks), 0) AS totalClicks FROM products'
    )
    .get();
  res.json({ settings, categories, stats });
});

app.get('/api/products', (req, res) => {
  const allProducts = db.prepare('SELECT * FROM products').all();
  const { q, category, sort, minPrice, maxPrice, platform, verifiedOnly } = req.query;

  const result = queryProducts(allProducts, {
    q: q ? String(q) : '',
    category: category ? String(category) : 'all',
    sort: sort ? String(sort) : q ? 'relevance' : 'latest',
    minPrice: minPrice !== undefined && minPrice !== '' ? Number(minPrice) : null,
    maxPrice: maxPrice !== undefined && maxPrice !== '' ? Number(maxPrice) : null,
    platform: platform ? String(platform) : 'all',
    verifiedOnly: verifiedOnly === '1' || verifiedOnly === 'true',
  });

  res.json({
    products: result.items,
    total: result.items.length,
    appliedFilters: result.appliedFilters,
  });
});

app.get('/api/products/:id', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  res.json({ product });
});

// Track outbound affiliate click
app.post('/api/products/:id/click', (req, res) => {
  const { platform } = req.body || {};
  if (!PLATFORMS.includes(platform)) {
    return res.status(400).json({ error: 'Invalid platform.' });
  }
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  const col = `${platform}_clicks`;
  db.prepare(`UPDATE products SET ${col} = ${col} + 1 WHERE id = ?`).run(product.id);
  db.prepare('INSERT INTO click_events (product_id, platform) VALUES (?, ?)').run(
    product.id,
    platform
  );

  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(product.id);
  res.json({ product: updated });
});

// Best-effort auto price sync when viewing a product or clicking refresh
async function syncSingleProductPrices(product) {
  const fetchedEntries = await Promise.all(
    PLATFORMS.map(async (pl) => {
      const url = product[`${pl}_url`];
      if (!url) return [pl, null];
      return [pl, await fetchProductMetadata(url)];
    })
  );
  const fetchMap = Object.fromEntries(fetchedEntries);

  const updateValues = { id: product.id };
  const activeRatings = [];
  const syncReport = { cached: false };

  for (const pl of PLATFORMS) {
    const url = product[`${pl}_url`];
    const resMeta = fetchMap[pl];
    if (!url || !resMeta) {
      updateValues[`${pl}_price`] = product[`${pl}_price`];
      updateValues[`${pl}_price_status`] = product[`${pl}_price_status`];
      updateValues[`${pl}_rating`] = product[`${pl}_rating`];
      continue;
    }

    syncReport[pl] = resMeta;
    const prevPrice = product[`${pl}_price`];
    const prevStatus = product[`${pl}_price_status`];
    const nextPrice = resMeta.price !== null ? resMeta.price : prevPrice;
    const nextRating = resMeta.rating !== null ? resMeta.rating : product[`${pl}_rating`];
    const nextStatus =
      resMeta.price !== null
        ? 'synced'
        : prevPrice !== null
          ? prevStatus === 'synced'
            ? 'cached'
            : prevStatus
          : resMeta.status;

    updateValues[`${pl}_price`] = nextPrice;
    updateValues[`${pl}_price_status`] = nextStatus;
    updateValues[`${pl}_rating`] = nextRating;
    if (nextRating !== null) activeRatings.push(nextRating);
  }

  updateValues.reliability_score = computeCombinedReliabilityFromRatings(
    activeRatings,
    product.reliability_score
  );

  db.prepare(
    `UPDATE products
     SET shopee_price = @shopee_price, shopee_price_status = @shopee_price_status, shopee_rating = @shopee_rating,
         tiktok_price = @tiktok_price, tiktok_price_status = @tiktok_price_status, tiktok_rating = @tiktok_rating,
         lazada_price = @lazada_price, lazada_price_status = @lazada_price_status, lazada_rating = @lazada_rating,
         pinduoduo_price = @pinduoduo_price, pinduoduo_price_status = @pinduoduo_price_status, pinduoduo_rating = @pinduoduo_rating,
         reliability_score = @reliability_score,
         last_price_sync = datetime('now'),
         updated_at = datetime('now')
     WHERE id = @id`
  ).run(updateValues);

  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(product.id);
  return { product: updated, syncReport };
}

app.post('/api/products/:id/sync-prices', async (req, res) => {
  const force = Boolean(req.body?.force);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  if (!force && product.last_price_sync) {
    const lastSyncMs = new Date(product.last_price_sync + 'Z').getTime();
    const ageMinutes = (Date.now() - lastSyncMs) / 60000;
    if (Number.isFinite(ageMinutes) && ageMinutes < PRICE_SYNC_TTL_MINUTES) {
      const cachedReport = { cached: true };
      for (const pl of PLATFORMS) {
        if (product[`${pl}_url`]) {
          cachedReport[pl] = {
            status: product[`${pl}_price_status`],
            price: product[`${pl}_price`],
          };
        }
      }
      return res.json({ product, syncReport: cachedReport });
    }
  }

  const result = await syncSingleProductPrices(product);
  res.json(result);
});

app.post('/api/admin/sync-all', requireAdmin, async (_req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY id ASC').all();
  let syncedProducts = 0;
  let syncedPlatforms = 0;
  let blockedPlatforms = 0;
  let errorPlatforms = 0;

  const BATCH_SIZE = 5;
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((p) => syncSingleProductPrices(p)));
    for (const { syncReport } of results) {
      let productSynced = false;
      for (const pl of PLATFORMS) {
        const rep = syncReport[pl];
        if (!rep) continue;
        if (rep.status === 'synced') {
          syncedPlatforms++;
          productSynced = true;
        } else if (rep.status === 'blocked') {
          blockedPlatforms++;
        } else {
          errorPlatforms++;
        }
      }
      if (productSynced) syncedProducts++;
    }
  }

  res.json({
    total: products.length,
    syncedProducts,
    syncedPlatforms,
    blockedPlatforms,
    errorPlatforms,
  });
});

// ---------- Admin Auth & Management ----------

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const user = db
    .prepare('SELECT id, username, password_hash FROM admin_users WHERE username = ?')
    .get(String(username).trim());

  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  const token = crypto.randomBytes(24).toString('hex');
  db.prepare(
    'INSERT INTO admin_sessions (token, username, last_activity_at) VALUES (?, ?, ?)'
  ).run(token, user.username, Date.now());
  res.json({ token, username: user.username });
});

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM admin_sessions WHERE token = ?').run(req.adminToken);
  res.json({ ok: true });
});

app.get('/api/admin/verify', requireAdmin, (req, res) => {
  res.json({ ok: true, username: req.adminUser });
});

app.post('/api/admin/keepalive', requireAdmin, (req, res) => {
  res.json({ ok: true, username: req.adminUser });
});

app.post('/api/admin/change-password', requireAdmin, (req, res) => {
  const { username, newUsername, currentPassword, newPassword, confirmPassword } = req.body || {};
  if (!currentPassword) {
    return res.status(400).json({ error: 'Current password is required.' });
  }

  const user = db
    .prepare('SELECT id, username, password_hash FROM admin_users WHERE username = ?')
    .get(req.adminUser);

  if (!user || !verifyPassword(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }

  const nextUsername = String(username || newUsername || user.username).trim();
  if (nextUsername.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters.' });
  }

  let nextHash = user.password_hash;
  if (newPassword && String(newPassword).trim().length > 0) {
    if (String(newPassword) !== String(confirmPassword || '')) {
      return res.status(400).json({ error: 'New password and confirmation password do not match.' });
    }
    if (String(newPassword).trim().length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }
    nextHash = hashPassword(String(newPassword).trim());
  }

  try {
    db.prepare('UPDATE admin_users SET username = ?, password_hash = ? WHERE id = ?').run(
      nextUsername,
      nextHash,
      user.id
    );
    db.prepare('UPDATE admin_sessions SET username = ? WHERE username = ?').run(
      nextUsername,
      user.username
    );
    res.json({ ok: true, username: nextUsername });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/admin/analytics', requireAdmin, (_req, res) => {
  const summary = db
    .prepare(
      `SELECT
         COUNT(*) AS totalProducts,
         COALESCE(SUM(shopee_clicks), 0) AS totalShopeeClicks,
         COALESCE(SUM(tiktok_clicks), 0) AS totalTiktokClicks,
         COALESCE(SUM(lazada_clicks), 0) AS totalLazadaClicks,
         COALESCE(SUM(pinduoduo_clicks), 0) AS totalPinduoduoClicks,
         COALESCE(SUM(purchase_count), 0) AS totalPurchases,
         ROUND(AVG(reliability_score), 2) AS avgReliability
       FROM products`
    )
    .get();

  const topClicked = db
    .prepare(
      `SELECT id, code, title, shopee_clicks, tiktok_clicks, lazada_clicks, pinduoduo_clicks,
              (shopee_clicks + tiktok_clicks + lazada_clicks + pinduoduo_clicks) AS total_clicks
       FROM products ORDER BY total_clicks DESC LIMIT 5`
    )
    .all();

  res.json({ summary, topClicked });
});

// Best-effort metadata preview for a single URL before saving
app.post('/api/admin/fetch-meta', requireAdmin, async (req, res) => {
  const { url } = req.body || {};
  const result = await fetchProductMetadata(url);
  res.json(result);
});

app.post('/api/admin/upload', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded.' });
  }
  res.json({ url: `/uploads/${req.file.filename}` });
});

app.post('/api/admin/products', requireAdmin, (req, res) => {
  const data = sanitizeProductInput(req.body || {});
  if (!data.title || !data.image_url || !hasAtLeastOnePlatformLink(data)) {
    return res.status(400).json({
      error: 'Title, image URL, and at least one platform link (Shopee, TikTok, Lazada, or Pinduoduo) are required.',
    });
  }

  try {
    const info = db
      .prepare(
        `INSERT INTO products (
          code, title, description, category_slug, tags, image_url, gallery_images,
          shopee_url, shopee_price, shopee_price_status, shopee_rating,
          tiktok_url, tiktok_price, tiktok_price_status, tiktok_rating,
          lazada_url, lazada_price, lazada_price_status, lazada_rating,
          pinduoduo_url, pinduoduo_price, pinduoduo_price_status, pinduoduo_rating,
          purchase_count, reliability_score, reliability_verified,
          is_featured, last_price_sync
        ) VALUES (
          @code, @title, @description, @category_slug, @tags, @image_url, @gallery_images,
          @shopee_url, @shopee_price, @shopee_price_status, @shopee_rating,
          @tiktok_url, @tiktok_price, @tiktok_price_status, @tiktok_rating,
          @lazada_url, @lazada_price, @lazada_price_status, @lazada_rating,
          @pinduoduo_url, @pinduoduo_price, @pinduoduo_price_status, @pinduoduo_rating,
          @purchase_count, @reliability_score, @reliability_verified,
          @is_featured, datetime('now')
        )`
      )
      .run(data);
    const created = db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ product: created });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found.' });

  const data = sanitizeProductInput(req.body || {}, existing);
  if (!data.title || !data.image_url || !hasAtLeastOnePlatformLink(data)) {
    return res.status(400).json({
      error: 'Title, image URL, and at least one platform link (Shopee, TikTok, Lazada, or Pinduoduo) are required.',
    });
  }

  try {
    db.prepare(
      `UPDATE products SET
        code = @code,
        title = @title,
        description = @description,
        category_slug = @category_slug,
        tags = @tags,
        image_url = @image_url,
        gallery_images = @gallery_images,
        shopee_url = @shopee_url,
        shopee_price = @shopee_price,
        shopee_price_status = @shopee_price_status,
        shopee_rating = @shopee_rating,
        tiktok_url = @tiktok_url,
        tiktok_price = @tiktok_price,
        tiktok_price_status = @tiktok_price_status,
        tiktok_rating = @tiktok_rating,
        lazada_url = @lazada_url,
        lazada_price = @lazada_price,
        lazada_price_status = @lazada_price_status,
        lazada_rating = @lazada_rating,
        pinduoduo_url = @pinduoduo_url,
        pinduoduo_price = @pinduoduo_price,
        pinduoduo_price_status = @pinduoduo_price_status,
        pinduoduo_rating = @pinduoduo_rating,
        purchase_count = @purchase_count,
        reliability_score = @reliability_score,
        reliability_verified = @reliability_verified,
        is_featured = @is_featured,
        updated_at = datetime('now')
       WHERE id = @id`
    ).run({ ...data, id: existing.id });

    const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(existing.id);
    res.json({ product: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Product not found.' });
  res.json({ ok: true });
});

// Bulk CSV or JSON import
app.post('/api/admin/import', requireAdmin, (req, res) => {
  const { format, content } = req.body || {};
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'Import content is required.' });
  }

  let rawRows = [];
  try {
    const trimmed = content.trim();
    if (format === 'json' || trimmed.startsWith('[') || trimmed.startsWith('{')) {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        rawRows = parsed;
      } else if (parsed && Array.isArray(parsed.products)) {
        rawRows = parsed.products;
      } else {
        throw new Error('JSON must be an array of product objects or { "products": [...] }.');
      }
    } else {
      rawRows = parseCsvRows(trimmed);
    }
  } catch (err) {
    return res.status(400).json({ error: `Failed to parse import: ${err.message}` });
  }

  if (rawRows.length === 0) {
    return res.status(400).json({ error: 'No valid rows found in import. Ensure CSV has header + at least 1 data row.' });
  }

  const upsert = db.prepare(`
    INSERT INTO products (
      code, title, description, category_slug, tags, image_url, gallery_images,
      shopee_url, shopee_price, shopee_price_status, shopee_rating,
      tiktok_url, tiktok_price, tiktok_price_status, tiktok_rating,
      lazada_url, lazada_price, lazada_price_status, lazada_rating,
      pinduoduo_url, pinduoduo_price, pinduoduo_price_status, pinduoduo_rating,
      purchase_count, reliability_score, reliability_verified, is_featured, last_price_sync
    ) VALUES (
      @code, @title, @description, @category_slug, @tags, @image_url, @gallery_images,
      @shopee_url, @shopee_price, @shopee_price_status, @shopee_rating,
      @tiktok_url, @tiktok_price, @tiktok_price_status, @tiktok_rating,
      @lazada_url, @lazada_price, @lazada_price_status, @lazada_rating,
      @pinduoduo_url, @pinduoduo_price, @pinduoduo_price_status, @pinduoduo_rating,
      @purchase_count, @reliability_score, @reliability_verified, @is_featured, datetime('now')
    )
    ON CONFLICT(code) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      category_slug = excluded.category_slug,
      tags = excluded.tags,
      image_url = excluded.image_url,
      gallery_images = excluded.gallery_images,
      shopee_url = excluded.shopee_url,
      shopee_price = excluded.shopee_price,
      shopee_rating = excluded.shopee_rating,
      tiktok_url = excluded.tiktok_url,
      tiktok_price = excluded.tiktok_price,
      tiktok_rating = excluded.tiktok_rating,
      lazada_url = excluded.lazada_url,
      lazada_price = excluded.lazada_price,
      lazada_rating = excluded.lazada_rating,
      pinduoduo_url = excluded.pinduoduo_url,
      pinduoduo_price = excluded.pinduoduo_price,
      pinduoduo_rating = excluded.pinduoduo_rating,
      purchase_count = excluded.purchase_count,
      reliability_score = excluded.reliability_score,
      reliability_verified = excluded.reliability_verified,
      is_featured = excluded.is_featured,
      updated_at = datetime('now')
  `);

  let importedCount = 0;
  const skipped = [];
  let nextNum = getNextCodeNumber();

  const tx = db.transaction((rows) => {
    for (let i = 0; i < rows.length; i++) {
      const hasCode = String(rows[i]?.code || '').trim().length > 0;
      const fallbackCode = `#${String(nextNum).padStart(3, '0')}`;
      const item = sanitizeProductInput(rows[i], null, fallbackCode);
      if (!item.title || !hasAtLeastOnePlatformLink(item)) {
        skipped.push({
          row: i + 1,
          reason: 'Missing title or at least one store link (Shopee, TikTok, Lazada, or Pinduoduo)',
        });
        continue;
      }
      if (!item.image_url) {
        item.image_url = '/icons/icon-512.svg';
      }
      if (!hasCode) nextNum++;
      upsert.run(item);
      importedCount++;
    }
  });

  tx(rawRows);
  res.json({ importedCount, skipped });
});

function escapeCsvCell(val) {
  const s = val === null || val === undefined ? '' : String(val);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

app.get('/api/admin/export', requireAdmin, (req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY id ASC').all();
  if (req.query.format === 'csv') {
    const headers = [
      'code',
      'title',
      'description',
      'category_slug',
      'tags',
      'image_url',
      'shopee_url',
      'shopee_price',
      'shopee_rating',
      'tiktok_url',
      'tiktok_price',
      'tiktok_rating',
      'lazada_url',
      'lazada_price',
      'lazada_rating',
      'pinduoduo_url',
      'pinduoduo_price',
      'pinduoduo_rating',
      'purchase_count',
      'reliability_score',
      'reliability_verified',
      'is_featured',
    ];
    const lines = [
      headers.join(','),
      ...products.map((p) => headers.map((h) => escapeCsvCell(p[h])).join(',')),
    ];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="harinijualapa-export-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    return res.send(lines.join('\n'));
  }
  res.json({ exportedAt: new Date().toISOString(), products });
});

// ---------- Real Chrome CDP Bulk Sync ----------

const CHROME_CDP_PORT = Number(process.env.CHROME_CDP_PORT || 9222);
const CHROME_CDP_URL = `http://127.0.0.1:${CHROME_CDP_PORT}`;
const CHROME_PROFILE_DIR = path.join(ROOT_DIR, 'data', 'chrome-profile');
const CHROME_SYNC_SCRIPT = path.join(ROOT_DIR, 'tools', 'chrome_sync.py');

function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return '';
}

async function getChromeCdpInfo() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch(`${CHROME_CDP_URL}/json/version`, { signal: controller.signal });
    if (!res.ok) return { connected: false, browser: null };
    const json = await res.json();
    return { connected: true, browser: json.Browser || 'Google Chrome' };
  } catch {
    return { connected: false, browser: null };
  } finally {
    clearTimeout(timer);
  }
}

function normalizeUrlBase(raw) {
  try {
    const u = new URL(String(raw || '').trim());
    return `${u.origin}${u.pathname}`.replace(/\/+$/, '').toLowerCase();
  } catch {
    return String(raw || '').trim().toLowerCase();
  }
}

function upsertChromeExtractedProduct({ url, platform, data, categorySlug }) {
  const pl = PLATFORMS.includes(platform) ? platform : 'shopee';
  const finalUrl = data?.finalUrl || url;
  const targetClean = String(url || '').trim();
  const targetBase = normalizeUrlBase(targetClean);
  const finalBase = normalizeUrlBase(finalUrl);

  const allProducts = db.prepare('SELECT * FROM products').all();
  const existing = allProducts.find((prod) => {
    const stored = String(prod[`${pl}_url`] || '').trim();
    if (!stored) return false;
    const storedBase = normalizeUrlBase(stored);
    return (
      stored === targetClean ||
      storedBase === targetBase ||
      (finalBase && storedBase === finalBase)
    );
  });

  const localImages = Array.isArray(data?.localImages)
    ? data.localImages.filter(Boolean)
    : Array.isArray(data?.images)
      ? data.images.filter(Boolean)
      : [];
  const heroImage = localImages[0] || existing?.image_url || '/icons/icon-512.svg';
  const galleryJson = JSON.stringify(localImages.slice(0, 8));

  const parsedPrice =
    typeof data?.price === 'number' && Number.isFinite(data.price) && data.price > 0
      ? Number(data.price.toFixed(2))
      : null;
  const parsedRating =
    typeof data?.rating === 'number' && Number.isFinite(data.rating) && data.rating >= 1 && data.rating <= 5
      ? Number(data.rating.toFixed(1))
      : null;
  const parsedSold =
    typeof data?.soldCount === 'number' && Number.isFinite(data.soldCount) && data.soldCount >= 0
      ? Math.round(data.soldCount)
      : null;
  const extractedTitle = String(data?.title || '').trim();

  if (existing) {
    const nextPrice = parsedPrice !== null ? parsedPrice : existing[`${pl}_price`];
    const nextStatus = parsedPrice !== null ? 'synced' : existing[`${pl}_price_status`];
    const nextRating = parsedRating !== null ? parsedRating : existing[`${pl}_rating`];
    const nextSold =
      parsedSold !== null && parsedSold > 0 ? parsedSold : existing.purchase_count;
    const nextTitle = existing.title || extractedTitle || `Product ${existing.code}`;
    const nextImage = localImages[0] || existing.image_url;
    const nextGallery = localImages.length > 0 ? galleryJson : existing.gallery_images || '[]';

    const ratings = [];
    for (const p of PLATFORMS) {
      const hasUrl = p === pl || String(existing[`${p}_url`] || '').trim().length > 0;
      const r = p === pl ? nextRating : existing[`${p}_rating`];
      if (hasUrl && typeof r === 'number' && Number.isFinite(r)) {
        ratings.push(r);
      }
    }
    const nextReliability = computeCombinedReliabilityFromRatings(
      ratings,
      existing.reliability_score
    );

    db.prepare(
      `UPDATE products
       SET title = ?,
           image_url = ?,
           gallery_images = ?,
           ${pl}_price = ?,
           ${pl}_price_status = ?,
           ${pl}_rating = ?,
           purchase_count = ?,
           reliability_score = ?,
           last_price_sync = datetime('now'),
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      nextTitle,
      nextImage,
      nextGallery,
      nextPrice,
      nextStatus,
      nextRating,
      nextSold,
      nextReliability,
      existing.id
    );

    const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(existing.id);
    return { action: 'updated', product: updated };
  }

  const nextCode = getNextProductCode();
  const payload = sanitizeProductInput(
    {
      code: nextCode,
      title: extractedTitle || `Imported ${pl.toUpperCase()} Item ${nextCode}`,
      description: '',
      category_slug: categorySlug || 'tech',
      tags: pl,
      image_url: heroImage,
      gallery_images: localImages,
      [`${pl}_url`]: targetClean,
      [`${pl}_price`]: parsedPrice,
      [`${pl}_price_status`]: parsedPrice !== null ? 'synced' : 'manual',
      [`${pl}_rating`]: parsedRating ?? 4.8,
      purchase_count: parsedSold ?? 0,
      reliability_verified: 1,
    },
    null,
    nextCode
  );

  const info = db
    .prepare(
      `INSERT INTO products (
        code, title, description, category_slug, tags, image_url, gallery_images,
        shopee_url, shopee_price, shopee_price_status, shopee_rating,
        tiktok_url, tiktok_price, tiktok_price_status, tiktok_rating,
        lazada_url, lazada_price, lazada_price_status, lazada_rating,
        pinduoduo_url, pinduoduo_price, pinduoduo_price_status, pinduoduo_rating,
        purchase_count, reliability_score, reliability_verified,
        is_featured, last_price_sync
      ) VALUES (
        @code, @title, @description, @category_slug, @tags, @image_url, @gallery_images,
        @shopee_url, @shopee_price, @shopee_price_status, @shopee_rating,
        @tiktok_url, @tiktok_price, @tiktok_price_status, @tiktok_rating,
        @lazada_url, @lazada_price, @lazada_price_status, @lazada_rating,
        @pinduoduo_url, @pinduoduo_price, @pinduoduo_price_status, @pinduoduo_rating,
        @purchase_count, @reliability_score, @reliability_verified,
        @is_featured, datetime('now')
      )`
    )
    .run(payload);

  const created = db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid);
  return { action: 'created', product: created };
}

let chromeSyncJob = {
  running: false,
  paused: false,
  pauseReason: '',
  waitingUser: false,
  waitMessage: '',
  total: 0,
  completed: 0,
  succeeded: 0,
  failed: 0,
  currentUrl: '',
  remainingUrls: [],
  results: [],
  error: '',
  child: null,
};

function publicChromeJobSnapshot() {
  return {
    running: chromeSyncJob.running,
    paused: chromeSyncJob.paused,
    pauseReason: chromeSyncJob.pauseReason,
    waitingUser: chromeSyncJob.waitingUser,
    waitMessage: chromeSyncJob.waitMessage,
    total: chromeSyncJob.total,
    completed: chromeSyncJob.completed,
    succeeded: chromeSyncJob.succeeded,
    failed: chromeSyncJob.failed,
    currentUrl: chromeSyncJob.currentUrl,
    remainingUrls: chromeSyncJob.remainingUrls,
    results: chromeSyncJob.results.slice(-100),
    error: chromeSyncJob.error,
  };
}

function saveChromeJobState() {
  try {
    db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    ).run('chrome_sync_job', JSON.stringify(publicChromeJobSnapshot()));
  } catch {
    // Non-fatal persistence safeguard
  }
}

function loadChromeJobState() {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('chrome_sync_job');
    if (!row?.value) return;
    const saved = JSON.parse(row.value);
    if (!saved || typeof saved !== 'object') return;
    const wasRunning = Boolean(saved.running);
    const remaining = Array.isArray(saved.remainingUrls) ? saved.remainingUrls : [];
    chromeSyncJob = {
      ...chromeSyncJob,
      ...saved,
      running: false,
      waitingUser: false,
      waitMessage: '',
      child: null,
      paused: wasRunning && remaining.length > 0 ? true : Boolean(saved.paused),
      pauseReason:
        wasRunning && remaining.length > 0
          ? saved.pauseReason || 'Previous sync interrupted — click Resume Remaining to continue.'
          : saved.pauseReason || '',
    };
  } catch {
    // Ignore corrupt saved job JSON
  }
}

loadChromeJobState();

app.get('/api/admin/chrome/status', requireAdmin, async (_req, res) => {
  const cdp = await getChromeCdpInfo();
  res.json({
    ...cdp,
    cdpPort: CHROME_CDP_PORT,
    profileDir: CHROME_PROFILE_DIR,
    chromeInstalled: Boolean(findChromeExecutable()),
  });
});

app.post('/api/admin/chrome/launch', requireAdmin, async (_req, res) => {
  const current = await getChromeCdpInfo();
  if (current.connected) {
    return res.json({
      ok: true,
      connected: true,
      browser: current.browser,
      message: 'Real Chrome is already connected and ready.',
    });
  }

  const exe = findChromeExecutable();
  if (!exe) {
    return res.status(400).json({
      error: 'Google Chrome executable was not found automatically. Start Chrome manually with --remote-debugging-port=9222.',
    });
  }

  fs.mkdirSync(CHROME_PROFILE_DIR, { recursive: true });
  const chromeProc = spawn(
    exe,
    [
      `--remote-debugging-port=${CHROME_CDP_PORT}`,
      `--user-data-dir=${CHROME_PROFILE_DIR}`,
      '--no-first-run',
      'https://shopee.com.my',
    ],
    { detached: true, stdio: 'ignore' }
  );
  chromeProc.unref();

  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 400));
    const check = await getChromeCdpInfo();
    if (check.connected) {
      return res.json({
        ok: true,
        connected: true,
        browser: check.browser,
        message: 'Real Chrome opened! Sign in to Shopee/storefronts in that window if needed, then start sync.',
      });
    }
  }

  res.json({
    ok: true,
    connected: false,
    message: 'Chrome launch started. If port 9222 is not detected yet, click Check Chrome Status after Chrome finishes opening.',
  });
});

app.get('/api/admin/chrome/sync-status', requireAdmin, (_req, res) => {
  res.json(publicChromeJobSnapshot());
});

app.post('/api/admin/chrome/sync-stop', requireAdmin, (_req, res) => {
  if (chromeSyncJob.child && chromeSyncJob.running) {
    try {
      chromeSyncJob.child.kill();
    } catch {
      // Ignore
    }
  }
  chromeSyncJob.running = false;
  chromeSyncJob.waitingUser = false;
  chromeSyncJob.waitMessage = '';
  chromeSyncJob.currentUrl = '';
  if (chromeSyncJob.remainingUrls?.length > 0) {
    chromeSyncJob.paused = true;
    chromeSyncJob.pauseReason = 'Stopped by admin — click Resume Remaining to continue.';
  } else {
    chromeSyncJob.paused = false;
  }
  saveChromeJobState();
  res.json({ ok: true, ...publicChromeJobSnapshot() });
});

app.post('/api/admin/chrome/sync-clear', requireAdmin, (_req, res) => {
  if (chromeSyncJob.running) {
    return res.status(409).json({ error: 'Stop the running sync job before clearing.' });
  }
  chromeSyncJob = {
    running: false,
    paused: false,
    pauseReason: '',
    waitingUser: false,
    waitMessage: '',
    total: 0,
    completed: 0,
    succeeded: 0,
    failed: 0,
    currentUrl: '',
    remainingUrls: [],
    results: [],
    error: '',
    child: null,
  };
  saveChromeJobState();
  res.json({ ok: true, ...publicChromeJobSnapshot() });
});

app.post('/api/admin/chrome/sync-start', requireAdmin, async (req, res) => {
  if (chromeSyncJob.running) {
    return res.status(409).json({ error: 'A Real Chrome sync job is already running.' });
  }

  const rawUrls = req.body?.urls;
  const parsedUrls = (
    Array.isArray(rawUrls)
      ? rawUrls
      : String(rawUrls || '')
          .split(/\r?\n/)
  )
    .map((u) => String(u || '').trim())
    .filter((u) => /^https?:\/\//i.test(u));

  const uniqueUrls = [...new Set(parsedUrls)];
  if (uniqueUrls.length === 0) {
    return res.status(400).json({ error: 'Please paste at least 1 valid http/https product link.' });
  }

  const headless = Boolean(req.body?.headless);
  const cdp = await getChromeCdpInfo();

  if (headless) {
    if (cdp.connected) {
      return res.status(400).json({
        error:
          'Visible Real Chrome window is currently open on port 9222. Please close Chrome first to run in Headless mode, or switch off Headless mode to use your open Chrome window.',
      });
    }
  } else if (!cdp.connected) {
    return res.status(400).json({
      error:
        'Real Chrome is not connected on port 9222 yet. Click "Open Real Chrome" first (or enable Headless mode).',
    });
  }

  const categorySlug = String(req.body?.categorySlug || 'tech').trim() || 'tech';
  const delaySeconds = Math.min(60, Math.max(1.5, Number(req.body?.delaySeconds || 4.5)));

  const jobFile = path.join(os.tmpdir(), `hja_chrome_sync_${Date.now()}.json`);
  fs.writeFileSync(
    jobFile,
    JSON.stringify({
      urls: uniqueUrls,
      delaySeconds,
      uploadsDir: UPLOADS_DIR,
      headless,
      profileDir: CHROME_PROFILE_DIR,
    }),
    'utf8'
  );

  chromeSyncJob = {
    running: true,
    paused: false,
    pauseReason: '',
    waitingUser: false,
    waitMessage: '',
    total: uniqueUrls.length,
    completed: 0,
    succeeded: 0,
    failed: 0,
    currentUrl: uniqueUrls[0],
    remainingUrls: [...uniqueUrls],
    results: [],
    error: '',
    child: null,
  };
  saveChromeJobState();

  const child = spawn('python', [CHROME_SYNC_SCRIPT, '--cdp-url', CHROME_CDP_URL, '--input-json', jobFile], {
    cwd: ROOT_DIR,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  chromeSyncJob.child = child;

  const rl = readline.createInterface({ input: child.stdout });
  rl.on('line', (line) => {
    let msg = null;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.event === 'progress') {
      chromeSyncJob.currentUrl = msg.url || '';
      chromeSyncJob.waitingUser = false;
      chromeSyncJob.waitMessage = '';
    } else if (msg.event === 'waiting_user') {
      chromeSyncJob.waitingUser = true;
      chromeSyncJob.waitMessage = msg.reason || 'Waiting for verification in Chrome...';
      saveChromeJobState();
    } else if (msg.event === 'result') {
      chromeSyncJob.waitingUser = false;
      chromeSyncJob.waitMessage = '';
      chromeSyncJob.completed++;
      chromeSyncJob.remainingUrls = uniqueUrls.slice(msg.index + 1);
      if (msg.ok && msg.data) {
        try {
          const saved = upsertChromeExtractedProduct({
            url: msg.url,
            platform: msg.platform,
            data: msg.data,
            categorySlug,
          });
          chromeSyncJob.succeeded++;
          chromeSyncJob.results.push({
            url: msg.url,
            ok: true,
            action: saved.action,
            code: saved.product?.code,
            title: msg.data.title || saved.product?.title,
            price: msg.data.price,
            soldCount: msg.data.soldCount,
            rating: msg.data.rating,
            imageCount: (msg.data.localImages || msg.data.images || []).length,
            heroImage: saved.product?.image_url,
          });
        } catch (dbErr) {
          chromeSyncJob.failed++;
          chromeSyncJob.results.push({ url: msg.url, ok: false, error: dbErr.message });
        }
      } else {
        chromeSyncJob.failed++;
        chromeSyncJob.results.push({
          url: msg.url,
          ok: false,
          error: msg.error || 'Extraction failed',
        });
      }
      saveChromeJobState();
    } else if (msg.event === 'paused_verification') {
      chromeSyncJob.paused = true;
      chromeSyncJob.running = false;
      chromeSyncJob.waitingUser = false;
      chromeSyncJob.waitMessage = '';
      chromeSyncJob.pauseReason = msg.reason || 'Verification required in Chrome.';
      chromeSyncJob.remainingUrls = uniqueUrls.slice(msg.index || 0);
      chromeSyncJob.currentUrl = '';
      saveChromeJobState();
    } else if (msg.event === 'error') {
      chromeSyncJob.error = msg.error || 'Chrome sync error';
      chromeSyncJob.running = false;
      chromeSyncJob.waitingUser = false;
      chromeSyncJob.waitMessage = '';
      saveChromeJobState();
    }
  });

  let stderrBuf = '';
  child.stderr.on('data', (chunk) => {
    stderrBuf += chunk.toString();
  });

  child.on('close', (code) => {
    chromeSyncJob.running = false;
    chromeSyncJob.waitingUser = false;
    chromeSyncJob.waitMessage = '';
    chromeSyncJob.child = null;
    if (!chromeSyncJob.paused && code !== 0 && code !== 2 && !chromeSyncJob.error && stderrBuf) {
      chromeSyncJob.error = stderrBuf.trim().slice(0, 300);
    }
    saveChromeJobState();
    try {
      fs.unlinkSync(jobFile);
    } catch {
      // Ignore cleanup errors
    }
  });

  res.json({ ok: true, ...publicChromeJobSnapshot() });
});

// Serve built PWA frontend in production
if (fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  app.use(express.static(DIST_DIR));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`HariniJualApa API running on http://localhost:${PORT}`);
});
