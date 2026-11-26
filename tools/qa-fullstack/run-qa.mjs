#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');
const QA_DB = path.join(ROOT, 'data', 'qa-test.db');
const QA_PORT = '3098';
const BASE_URL = `http://localhost:${QA_PORT}`;

let passed = 0;
let failed = 0;

function assert(cond, label, detail = '') {
  if (cond) {
    passed++;
    console.log(`  [PASS] ${label}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${label}${detail ? ` -> ${detail}` : ''}`);
  }
}

function cleanupQaDb() {
  for (const suffix of ['', '-wal', '-shm']) {
    const f = QA_DB + suffix;
    if (fs.existsSync(f)) {
      try {
        fs.unlinkSync(f);
      } catch {
        // Ignore locked file during exit
      }
    }
  }
}

async function waitForServer(url, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${url}/api/health`);
      if (r.ok) return true;
    } catch {
      // Retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function run() {
  console.log('\n=== HariniJualApa Full-Stack QA Suite ===\n');

  // 1. Production Build & PWA Check
  console.log('1. Checking Vite Production Build & PWA assets...');
  const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const build = spawnSync(npmBin, ['run', 'build'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  assert(build.status === 0, 'npm run build exits with code 0', build.stderr);
  assert(fs.existsSync(path.join(ROOT, 'dist', 'index.html')), 'dist/index.html generated');
  assert(
    fs.existsSync(path.join(ROOT, 'dist', 'manifest.webmanifest')),
    'dist/manifest.webmanifest generated'
  );
  assert(fs.existsSync(path.join(ROOT, 'dist', 'sw.js')), 'dist/sw.js generated');

  // 2. Backend API & SQLite Integration Checks
  console.log('\n2. Running Express + SQLite API Integration Tests...');
  cleanupQaDb();

  const srv = spawn('node', ['server/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: QA_PORT,
      DB_PATH: QA_DB,
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: 'qa_password_123',
    },
    stdio: 'pipe',
  });

  try {
    const ready = await waitForServer(BASE_URL);
    assert(ready, 'QA Express server started cleanly');

    // Public endpoints & /admin SPA route
    const storeInfo = await fetch(`${BASE_URL}/api/store-info`).then((r) => r.json());
    assert(storeInfo.categories?.length >= 7, 'Store info returns categories');

    const adminHtml = await fetch(`${BASE_URL}/admin`).then((r) => r.text());
    assert(adminHtml.includes('<div id="root"></div>'), 'GET /admin serves SPA HTML');

    // Smart Search & Sorts
    const smart = await fetch(`${BASE_URL}/api/products?q=earbuds+under+80`).then((r) => r.json());
    assert(
      smart.products.some((p) => p.code === '#001'),
      'Smart search "earbuds under 80" matches #001'
    );
    const syn = await fetch(`${BASE_URL}/api/products?q=kipas`).then((r) => r.json());
    assert(syn.products.some((p) => p.code === '#009'), 'Synonym search "kipas" matches #009');
    const pdd = await fetch(`${BASE_URL}/api/products?platform=pinduoduo`).then((r) => r.json());
    assert(pdd.products.some((p) => p.code === '#001'), 'Platform filter pinduoduo matches #001');

    // Auth checks: unauthenticated must return AUTH_REQUIRED (never SESSION_EXPIRED)
    const unauthRes = await fetch(`${BASE_URL}/api/admin/verify`);
    const unauthJson = await unauthRes.json();
    assert(
      unauthRes.status === 401 && unauthJson.code === 'AUTH_REQUIRED',
      'Missing token returns AUTH_REQUIRED (not SESSION_EXPIRED)'
    );

    // Login
    const badLogin = await fetch(`${BASE_URL}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrong' }),
    });
    assert(badLogin.status === 401, 'Invalid password rejected with 401');

    const loginJson = await fetch(`${BASE_URL}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'qa_password_123' }),
    }).then((r) => r.json());
    assert(Boolean(loginJson.token), 'Valid login returns session token');

    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${loginJson.token}`,
    };

    // Change Password confirmation mismatch check
    const mismatchRes = await fetch(`${BASE_URL}/api/admin/change-password`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        username: 'admin',
        currentPassword: 'qa_password_123',
        newPassword: 'newpassword1',
        confirmPassword: 'newpassword2',
      }),
    });
    assert(mismatchRes.status === 400, 'Change Password rejects mismatched confirmation');

    // 1-4 link constraints
    const zeroLink = await fetch(`${BASE_URL}/api/admin/products`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ title: 'Zero Link Item', image_url: '/icons/icon-512.svg' }),
    });
    assert(zeroLink.status === 400, '0-link product rejected with 400');

    const oneLinkRes = await fetch(`${BASE_URL}/api/admin/products`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        title: 'Lazada Only Test Item',
        image_url: '/icons/icon-512.svg',
        lazada_url: 'https://www.lazada.com.my/qa-test',
        lazada_price: 55.5,
        lazada_rating: 4.6,
      }),
    });
    const oneLinkJson = await oneLinkRes.json();
    assert(oneLinkRes.status === 201, '1-link Lazada product created (201)');

    // Update to 4 links and verify combined reliability score
    const fourLinkJson = await fetch(`${BASE_URL}/api/admin/products/${oneLinkJson.product.id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        title: 'Four Link Test Item',
        image_url: '/icons/icon-512.svg',
        shopee_url: 'https://shopee.com.my/qa',
        shopee_price: 60,
        shopee_rating: 4.8,
        tiktok_url: 'https://www.tiktok.com/qa',
        tiktok_price: 58,
        tiktok_rating: 4.6,
        lazada_url: 'https://www.lazada.com.my/qa',
        lazada_price: 55,
        lazada_rating: 5.0,
        pinduoduo_url: 'https://mobile.yangkeduo.com/qa',
        pinduoduo_price: 50,
        pinduoduo_rating: 4.4,
      }),
    }).then((r) => r.json());
    assert(
      fourLinkJson.product.reliability_score === 4.7,
      '4-link combined reliability averages (4.8+4.6+5.0+4.4)/4 = 4.7',
      `got ${fourLinkJson.product.reliability_score}`
    );

    // Click tracking for Lazada & Pinduoduo
    const clickPdd = await fetch(
      `${BASE_URL}/api/products/${oneLinkJson.product.id}/click`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'pinduoduo' }),
      }
    ).then((r) => r.json());
    assert(clickPdd.product.pinduoduo_clicks === 1, 'Pinduoduo click tracked');

    // CSV bulk import (including RM price & blank codes) + JSON export roundtrip
    const csvSample = [
      'code,title,category_slug,image_url,shopee_url,shopee_price,shopee_rating',
      ',QA CSV Item One,tech,/icons/icon-512.svg,https://shopee.com.my/csv1,RM 29.90,4.9',
      ',QA CSV Item Two,home,/icons/icon-512.svg,https://shopee.com.my/csv2,RM 39.90,4.7',
    ].join('\n');
    const csvImport = await fetch(`${BASE_URL}/api/admin/import`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ format: 'csv', content: csvSample }),
    }).then((r) => r.json());
    assert(
      csvImport.importedCount === 2,
      'CSV import with RM prices and blank codes imports both rows cleanly',
      JSON.stringify(csvImport)
    );

    const exportedJson = await fetch(`${BASE_URL}/api/admin/export`, { headers: authHeaders }).then(
      (r) => r.json()
    );
    assert(
      exportedJson.products?.length >= 12,
      'Export JSON returns all products including imported CSV items'
    );

    const exportedCsv = await fetch(`${BASE_URL}/api/admin/export?format=csv`, {
      headers: authHeaders,
    }).then((r) => r.text());
    assert(exportedCsv.includes('QA CSV Item One'), 'Export CSV includes imported rows');

    // Re-import exported object format { products: [...] }
    const reimportRes = await fetch(`${BASE_URL}/api/admin/import`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ format: 'json', content: JSON.stringify(exportedJson) }),
    }).then((r) => r.json());
    assert(reimportRes.importedCount >= 12, 'JSON import accepts exported { products } format');

    // Logout test
    const logoutRes = await fetch(`${BASE_URL}/api/admin/logout`, {
      method: 'POST',
      headers: authHeaders,
    });
    assert(logoutRes.ok, 'Admin logout revokes token');
    const postLogoutVerify = await fetch(`${BASE_URL}/api/admin/verify`, { headers: authHeaders });
    assert(postLogoutVerify.status === 401, 'Revoked token rejected after logout');

    // 3. Headless Browser E2E UI & Layout Audit
    console.log('\n3. Running Headless Browser E2E UI Audit (PC + Mobile)...');
    const pyScript = `
import json
from playwright.sync_api import sync_playwright

errors = []
with sync_playwright() as p:
    try:
        b = p.chromium.launch(executable_path=r"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless=True)
    except Exception:
        b = p.chromium.launch(headless=True)

    # PC Viewport (1440x860)
    ctx = b.new_context(viewport={"width": 1440, "height": 860})
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
    page.on("console", lambda m: errors.append("console.error: " + m.text) if m.type == "error" else None)

    page.goto("${BASE_URL}/", wait_until="networkidle")
    page.wait_for_timeout(600)

    admin_btn_count = page.locator("aside").get_by_text("Admin").count()
    assert admin_btn_count == 0, f"Admin button should be hidden on PC sidebar, found {admin_btn_count}"

    cols = page.eval_on_selector("main .grid", "el => getComputedStyle(el).gridTemplateColumns.split(' ').length")
    assert cols == 5, f"PC Home should have 5 products per row, got {cols}"

    broken_imgs = page.evaluate("Array.from(document.querySelectorAll('img')).filter(i => i.complete && i.naturalWidth === 0).length")
    assert broken_imgs == 0, f"Found {broken_imgs} broken images on PC Home"

    # Navigate directly to /admin
    page.goto("${BASE_URL}/admin", wait_until="networkidle")
    page.wait_for_timeout(400)
    assert page.get_by_role("heading", name="Admin Sign In").is_visible(), "Admin Sign In should show at /admin"
    assert page.get_by_text("Session expired").count() == 0, "Fresh /admin visit must not show Session expired"

    page.get_by_placeholder("Enter username").fill("admin")
    page.get_by_placeholder("Enter password").fill("qa_password_123")
    page.get_by_role("button", name="Sign In", exact=True).click()
    page.wait_for_timeout(600)

    assert page.get_by_role("button", name="Log Out").is_visible(), "Log Out button must be visible"

    # Check Change Password menu field order
    page.get_by_role("button", name="Change Password").click()
    page.wait_for_timeout(200)
    labels = page.locator("form label").all_inner_texts()
    assert labels == ["Username *", "Current Password *", "New Password", "Confirmation Password"], f"Unexpected Change Password labels: {labels}"

    # Check Add Product form: Category has no emoji, Image uses file upload only (no URL input)
    page.get_by_role("button", name="Catalog").click()
    page.get_by_role("button", name="Add Product").click()
    page.wait_for_timeout(200)
    cat_opts = page.locator("select option").all_inner_texts()
    assert all(opt.isascii() for opt in cat_opts), f"Category dropdown still contains icons/emojis: {cat_opts}"
    assert page.get_by_placeholder("https://... or /uploads/...").count() == 0, "Image URL input should be removed"
    assert page.locator("input[type='file'][accept='image/*']").count() == 1, "Image file upload input must exist"

    # Log out cleanly
    page.get_by_role("button", name="Log Out").click()
    page.wait_for_timeout(300)
    assert page.get_by_role("heading", name="Admin Sign In").is_visible(), "Should return to Admin Sign In on Log Out"

    # Mobile PWA Viewport (420x860)
    mctx = b.new_context(viewport={"width": 420, "height": 860})
    mpage = mctx.new_page()
    mpage.goto("${BASE_URL}/", wait_until="networkidle")
    mpage.wait_for_timeout(500)
    m_admin = mpage.locator("nav").get_by_text("Admin").count()
    assert m_admin == 0, f"Admin button should be hidden on Mobile nav, found {m_admin}"
    mcols = mpage.eval_on_selector("main .grid", "el => getComputedStyle(el).gridTemplateColumns.split(' ').length")
    assert mcols == 1, f"Mobile Home should have 1 product per row, got {mcols}"

    b.close()
assert len(errors) == 0, f"Console/Page errors: {errors}"
print("PLAYWRIGHT_QA_OK")
`;
    const py = spawnSync('python', ['-c', pyScript], { encoding: 'utf8' });
    assert(
      py.status === 0 && py.stdout.includes('PLAYWRIGHT_QA_OK'),
      'Headless Playwright E2E UI & layout checks pass',
      py.stderr || py.stdout
    );

    // 4. Dedicated 10-minute idle timeout check (using short timeout env var)
    const idleSrv = spawn('node', ['server/index.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: '3097',
        DB_PATH: QA_DB,
        ADMIN_IDLE_TIMEOUT_MINUTES: '0.01', // 0.6s for deterministic QA test
      },
      stdio: 'pipe',
    });
    try {
      const idleReady = await waitForServer('http://localhost:3097');
      assert(idleReady, 'Idle timeout test server started');
      const ilogin = await fetch('http://localhost:3097/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'qa_password_123' }),
      }).then((r) => r.json());
      await new Promise((r) => setTimeout(r, 900));
      const expiredRes = await fetch('http://localhost:3097/api/admin/verify', {
        headers: { Authorization: `Bearer ${ilogin.token}` },
      });
      const expiredJson = await expiredRes.json();
      assert(
        expiredRes.status === 401 && expiredJson.code === 'SESSION_EXPIRED',
        'Idle timeout triggers SESSION_EXPIRED after inactivity threshold'
      );
    } finally {
      idleSrv.kill();
    }
  } finally {
    srv.kill();
    await new Promise((r) => setTimeout(r, 400));
    cleanupQaDb();
  }

  console.log(`\n=== QA Summary: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  cleanupQaDb();
  process.exit(1);
});
