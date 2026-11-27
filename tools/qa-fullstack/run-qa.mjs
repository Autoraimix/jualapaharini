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

    // Bulk Sync All Prices endpoint (requires auth)
    const unauthSyncAll = await fetch(`${BASE_URL}/api/admin/sync-all`, { method: 'POST' });
    assert(unauthSyncAll.status === 401, 'Sync All Prices rejects unauthenticated requests');
    const syncAllRes = await fetch(`${BASE_URL}/api/admin/sync-all`, {
      method: 'POST',
      headers: authHeaders,
    });
    const syncAllJson = await syncAllRes.json();
    assert(
      syncAllRes.ok && typeof syncAllJson.total === 'number' && syncAllJson.total >= 12,
      'Sync All Prices endpoint processes catalog cleanly',
      JSON.stringify(syncAllJson)
    );

    // Real Chrome Bulk Sync API & gallery_images persistence checks
    const unauthChrome = await fetch(`${BASE_URL}/api/admin/chrome/status`);
    assert(unauthChrome.status === 401, 'Chrome status endpoint requires admin auth');
    const chromeStatus = await fetch(`${BASE_URL}/api/admin/chrome/status`, {
      headers: authHeaders,
    }).then((r) => r.json());
    assert(
      typeof chromeStatus.connected === 'boolean' && chromeStatus.cdpPort === 9222,
      'Chrome status endpoint returns CDP status cleanly'
    );

    const syncClearRes = await fetch(`${BASE_URL}/api/admin/chrome/sync-clear`, {
      method: 'POST',
      headers: authHeaders,
    }).then((r) => r.json());
    const syncStateCheck = await fetch(`${BASE_URL}/api/admin/chrome/sync-status`, {
      headers: authHeaders,
    }).then((r) => r.json());
    assert(
      syncClearRes.ok === true && Array.isArray(syncStateCheck.remainingUrls),
      'Chrome sync-status and sync-clear endpoints work cleanly'
    );

    const galleryCreate = await fetch(`${BASE_URL}/api/admin/products`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        title: 'PS5 Gallery QA Item',
        image_url: '/icons/icon-512.svg',
        gallery_images: ['/icons/icon-512.svg', '/icons/icon-192.svg'],
        shopee_url: 'https://s.shopee.com.my/2LaBxwfjZT',
        shopee_price: 3666,
        shopee_rating: 4.9,
        purchase_count: 10000,
      }),
    }).then((r) => r.json());
    assert(
      galleryCreate.product?.gallery_images?.includes('/icons/icon-192.svg'),
      'gallery_images persists in SQLite across creates'
    );

    // Test chrome_sync.py DOM extractor against exact Shopee PDP HTML (.nt0EaI, .Ocv3B8, .C21rQm, .product-rating-overview__rating-score)
    const sampleHtmlPath = path.join(ROOT, 'data', 'qa_shopee_sample.html');
    fs.writeFileSync(
      sampleHtmlPath,
      `<!doctype html><html><head><title>PS5 Pro | Shopee Malaysia</title></head><body>
      <h1>Mall 【11.11 SALE】 PS5 Playstation 5</h1>
      <div><div class="Ocv3B8"><span class="PfWbfd">10k+</span> Sold</div></div>
      <div class="nt0EaI"><div class="pyzxvq pw3J3G">RM3,666.00</div><p class="RKwYtD">After Voucher</p></div>
      <div>Installment 12x RM305.50</div>
      <section class="C21rQm">
        <div class="VmNEQ6"><img class="e3bgiU" src="https://down-my.img.susercontent.com/file/my-11134207-820li-mvojwrl9o5q9d0_tn"></div>
        <div class="qIctnQ"><picture><img class="P39yUt" src="https://down-my.img.susercontent.com/file/my-11110105-6v6x7-mfdt94c9e9e16f_cover"></picture><img class="emXGWZ" src="https://deo.shopeemobile.com/shopee/421d93895226dfa2.svg"></div>
        <div class="qIctnQ"><picture><img class="P39yUt" src="https://down-my.img.susercontent.com/file/my-11134207-820li-mvojwrl9o5q9d0"></picture></div>
        <div class="qIctnQ"><picture><img class="P39yUt" src="https://down-my.img.susercontent.com/file/my-11134207-820lc-mfdt3srigqhaf1"></picture></div>
        <div class="qIctnQ"><picture><img class="P39yUt" src="https://down-my.img.susercontent.com/file/my-11134207-7rash-m29ek9d67ifz59"></picture></div>
      </section>
      <div class="product-rating-overview__briefing"><div class="product-rating-overview__score-wrapper"><span class="product-rating-overview__rating-score">4.9</span><span class="product-rating-overview__rating-score-out-of"> out of 5 </span></div></div>
      </body></html>`,
      'utf8'
    );
    const chromeExtractRun = spawnSync(
      'python',
      ['tools/chrome_sync.py', '--test-html', sampleHtmlPath],
      { cwd: ROOT, encoding: 'utf8' }
    );
    try {
      fs.unlinkSync(sampleHtmlPath);
    } catch {}
    const extractedSample = JSON.parse((chromeExtractRun.stdout || '{}').trim() || '{}');
    assert(
      chromeExtractRun.status === 0 &&
        extractedSample.price === 3666 &&
        extractedSample.soldCount === 10000 &&
        extractedSample.rating === 4.9 &&
        Array.isArray(extractedSample.images) &&
        extractedSample.images[0] === 'https://down-my.img.susercontent.com/file/my-11134207-820li-mvojwrl9o5q9d0' &&
        extractedSample.images.length >= 4,
      'chrome_sync.py extracts RM3,666.00 (ignoring 12x RM305.50), 10k+ sold, 4.9 rating, and C21rQm gallery images',
      chromeExtractRun.stdout + chromeExtractRun.stderr
    );

    // Test chrome_sync.py DOM extractor against exact Lazada v2 PDP HTML
    const lazadaSamplePath = path.join(ROOT, 'data', 'qa_lazada_sample.html');
    fs.writeFileSync(
      lazadaSamplePath,
      `<!doctype html><html><head><title>UGREEN 65W | Lazada</title></head><body>
      <h1 class="pdp-mod-product-badge-title-v2"><img src="https://img.lazcdn.com/g/tps/imgextra/i4/O1CN01YxEyp41Pm0TSbDFdc_!!6000000001882-2-tps-130-40.png" class="pdp-mod-product-badge" alt="LazMall">【SIRIM Certificate】UGREEN 3 Ports 65W GaN Charger</h1>
      <div class="pdp-review-summary-v2"><span class="container-star-v2-score">5</span><span class="container-star-v2-count">(1396)</span></div>
      <div class="pdp-v2-product-price-content"><div class="pdp-v2-product-price-content-salePrice"><span class="pdp-v2-product-price-content-salePrice-amount">RM60.03</span></div><div class="pdp-v2-product-price-content-originalPrice"><span class="pdp-v2-product-price-content-originalPrice-amount">RM159.00</span></div></div>
      <div id="module_item_gallery_1"><div class="item-gallery-v2">
        <div class="gallery-preview-panel-v2"><img class="gallery-preview-panel-v2__image" src="https://img.lazcdn.com/g/p/f5aecef1b2f751ce38b5ec8670031c28.jpg_720x720q80.jpg_.webp"></div>
        <div class="item-gallery-v2__thumbnail"><img class="item-gallery-v2__thumbnail-image" src="https://img.lazcdn.com/g/p/f5aecef1b2f751ce38b5ec8670031c28.jpg_80x80q80.jpg_.webp"></div>
        <div class="item-gallery-v2__thumbnail"><img class="item-gallery-v2__thumbnail-image" src="https://img.lazcdn.com/g/p/6032ab2b113df1f7e0986df0fc0a3b69.jpg_80x80q80.jpg_.webp"></div>
        <div class="item-gallery-v2__thumbnail"><img class="item-gallery-v2__thumbnail-image" src="https://img.lazcdn.com/g/p/71ecad0e80ebb84402c047ab232dcc38.jpg_80x80q80.jpg_.webp"></div>
      </div></div>
      </body></html>`,
      'utf8'
    );
    const lazadaExtractRun = spawnSync(
      'python',
      ['tools/chrome_sync.py', '--test-html', lazadaSamplePath],
      { cwd: ROOT, encoding: 'utf8' }
    );
    try {
      fs.unlinkSync(lazadaSamplePath);
    } catch {}
    const extractedLazada = JSON.parse((lazadaExtractRun.stdout || '{}').trim() || '{}');
    assert(
      lazadaExtractRun.status === 0 &&
        extractedLazada.title?.includes('UGREEN 3 Ports 65W GaN Charger') &&
        extractedLazada.price === 60.03 &&
        extractedLazada.rating === 5 &&
        Array.isArray(extractedLazada.images) &&
        extractedLazada.images.length === 3 &&
        extractedLazada.images[0] === 'https://img.lazcdn.com/g/p/f5aecef1b2f751ce38b5ec8670031c28.jpg',
      'chrome_sync.py extracts Lazada v2 sale price (RM60.03, not RM159), rating 5.0, title, and deduplicated full-res lazcdn gallery images',
      lazadaExtractRun.stdout + lazadaExtractRun.stderr
    );

    // Test Headless mode + safe_evaluate surviving mid-load client JS redirect
    const http = await import('node:http');
    const redirectSrv = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      if (req.url === '/short') {
        res.end('<html><body>Redirecting...<script>setTimeout(()=>location.replace("/pdp"), 120)</script></body></html>');
      } else {
        res.end('<html><head><title>【11.11 SALE】 QA Redirect Product | Shopee Malaysia</title></head><body><h1>Mall 【11.11 SALE】 QA Redirect Product</h1><div class="nt0EaI"><div class="pyzxvq">RM199.00</div></div><div class="Ocv3B8"><span class="PfWbfd">2.5k+</span> Sold</div><span class="product-rating-overview__rating-score">4.8</span></body></html>');
      }
    });
    await new Promise((r) => redirectSrv.listen(3098, '127.0.0.1', r));
    const headlessJobPath = path.join(ROOT, 'data', 'qa_headless_job.json');
    const qaHeadlessProfile = path.join(ROOT, 'data', 'qa_chrome_profile');
    fs.writeFileSync(
      headlessJobPath,
      JSON.stringify({
        urls: ['http://127.0.0.1:3098/short'],
        delaySeconds: 0,
        headless: true,
        profileDir: qaHeadlessProfile,
      }),
      'utf8'
    );
    const headlessRun = await new Promise((resolve) => {
      const child = spawn('python', ['tools/chrome_sync.py', '--input-json', headlessJobPath], {
        cwd: ROOT,
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.stderr.on('data', (d) => (stderr += d.toString()));
      child.on('close', (status) => resolve({ status, stdout, stderr }));
    });
    redirectSrv.close();
    try {
      fs.unlinkSync(headlessJobPath);
      fs.rmSync(qaHeadlessProfile, { recursive: true, force: true });
    } catch {}
    const headlessLines = (headlessRun.stdout || '')
      .trim()
      .split(/\r?\n/)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    const headlessResult = headlessLines.find((e) => e.event === 'result');
    assert(
      headlessRun.status === 0 &&
        headlessResult?.ok === true &&
        headlessResult.data?.price === 199 &&
        headlessResult.data?.soldCount === 2500 &&
        headlessResult.data?.rating === 4.8,
      'chrome_sync.py Headless mode survives client JS redirect without "Execution context was destroyed"',
      headlessRun.stdout + headlessRun.stderr
    );

    // Logout test
    const logoutRes = await fetch(`${BASE_URL}/api/admin/logout`, {
      method: 'POST',
      headers: authHeaders,
    });
    assert(logoutRes.ok, 'Admin logout revokes token');
    const postLogoutVerify = await fetch(`${BASE_URL}/api/admin/verify`, { headers: authHeaders });
    assert(postLogoutVerify.status === 401, 'Revoked token rejected after logout');

    // Smart Extract & Bookmarklet unit tests
    const { parseCopiedProductText, buildSyncBookmarkletHref } = await import(
      '../../src/utils/smartExtract.js'
    );
    const parsedRaw = parseCopiedProductText(
      'Anker Soundcore Earbuds\nRM79.90\n★ 4.9\n14.8k sold'
    );
    assert(
      parsedRaw.ok && parsedRaw.price === 79.9 && parsedRaw.rating === 4.9 && parsedRaw.sold === 14800,
      'Smart Quick-Paste extracts RM price, rating, and k-sold count'
    );
    const parsedBm = parseCopiedProductText(
      JSON.stringify({ __hja: 1, title: 'BM Item', price: 35.5, rating: 4.8, sold: 920 })
    );
    assert(
      parsedBm.ok && parsedBm.source === 'bookmarklet' && parsedBm.price === 35.5 && parsedBm.rating === 4.8,
      'Bookmarklet JSON payload parses accurately'
    );
    assert(
      buildSyncBookmarkletHref().startsWith('javascript:'),
      'Bookmarklet href generates valid javascript: URI'
    );

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

    page.goto("${BASE_URL}/", wait_until="domcontentloaded", timeout=15000)
    page.locator("article").first.wait_for(timeout=10000)
    page.wait_for_timeout(400)

    admin_btn_count = page.locator("aside").get_by_text("Admin").count()
    assert admin_btn_count == 0, f"Admin button should be hidden on PC sidebar, found {admin_btn_count}"

    cols = page.eval_on_selector("main .grid", "el => getComputedStyle(el).gridTemplateColumns.split(' ').length")
    assert cols == 5, f"PC Home should have 5 products per row, got {cols}"

    broken_imgs = page.evaluate("Array.from(document.querySelectorAll('img')).filter(i => i.complete && i.naturalWidth === 0).length")
    assert broken_imgs == 0, f"Found {broken_imgs} broken images on PC Home"

    # Open first product modal, verify Full view zoom lightbox covers true full viewport & Refresh Prices
    page.locator("article").first.click()
    page.get_by_role("button", name="View full product picture").click()
    assert page.get_by_role("button", name="Close full image").is_visible(), "Full image lightbox must open on click"
    dlg_box = page.get_by_role("dialog", name="Full product image").bounding_box()
    assert dlg_box and dlg_box["width"] >= 1400, f"Full image lightbox must span full viewport, got {dlg_box}"
    page.get_by_role("button", name="Close full image").click()
    page.get_by_role("button", name="Refresh Prices").wait_for(timeout=10000)
    page.get_by_role("button", name="Refresh Prices").click()
    page.get_by_text("Verified catalog prices are up to date.").or_(page.get_by_text("Live price metadata refreshed.")).wait_for(timeout=10000)
    assert page.get_by_text("Storefront blocked").count() == 0, "Public modal must not show alarming Storefront blocked error when SQLite prices exist"
    page.get_by_role("button", name="Close product details").click()

    # Also verify Next/Previous gallery arrows on multi-image product ("PS5 Gallery QA Item")
    page.locator("article", has_text="PS5 Gallery QA Item").first.click()
    page.get_by_role("button", name="View full product picture").click()
    assert page.get_by_role("button", name="Next image").is_visible(), "Next image arrow must appear for multi-image products"
    assert page.get_by_role("button", name="Previous image").is_visible(), "Previous image arrow must appear for multi-image products"
    assert page.get_by_text("1 / 2").is_visible(), "Gallery counter 1 / 2 must show in lightbox"
    page.get_by_role("button", name="Next image").click()
    assert page.get_by_text("2 / 2").is_visible(), "Next image arrow must advance to 2 / 2"
    page.get_by_role("button", name="Previous image").click()
    assert page.get_by_text("1 / 2").is_visible(), "Previous image arrow must return to 1 / 2"
    page.get_by_role("button", name="Close full image").click()
    page.get_by_role("button", name="Close product details").click()
    page.wait_for_timeout(200)

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
    assert page.get_by_role("button", name="Sync All Prices").is_visible(), "Sync All Prices button must be visible"
    assert page.get_by_role("button", name="Real Chrome Bulk Sync").is_visible(), "Real Chrome Bulk Sync button must be visible"

    # Open Real Chrome Bulk Sync panel
    page.get_by_role("button", name="Real Chrome Bulk Sync").click()
    page.wait_for_timeout(200)
    assert page.get_by_role("button", name="Open Real Chrome").is_visible(), "Open Real Chrome button must be visible"
    assert page.get_by_role("button", name="Start Bulk Chrome Sync").is_visible(), "Start Bulk Chrome Sync button must be visible"
    assert page.get_by_text("Run in Headless Chrome").is_visible(), "Headless Chrome toggle option must be visible"
    assert page.get_by_text("Auto-close Shopee Chrome").is_visible(), "Auto-close Shopee Chrome toggle option must be visible"

    # Verify SQLite Catalog 10/page pagination, Next/Previous, See All Products & Smart Search
    row_count_p1 = page.locator("[data-testid='admin-catalog-row']").count()
    assert row_count_p1 == 10, f"SQLite Catalog Page 1 must show 10 products, got {row_count_p1}"
    assert page.get_by_role("button", name="Next", exact=False).is_enabled(), "Next button must be enabled when > 10 products"
    page.get_by_role("button", name="Next", exact=False).click()
    page.wait_for_timeout(150)
    assert page.get_by_text("Page 2 /").is_visible(), "Clicking Next should go to Page 2"
    page.get_by_role("button", name="Previous", exact=False).click()
    page.wait_for_timeout(150)
    assert page.get_by_text("Page 1 /").is_visible(), "Clicking Previous should return to Page 1"
    page.get_by_role("button", name="See All Products", exact=False).click()
    page.wait_for_timeout(150)
    assert page.locator("[data-testid='admin-catalog-row']").count() > 10, "See All Products must display all catalog items"
    page.get_by_role("button", name="Show 10 / Page").click()
    page.wait_for_timeout(150)
    page.get_by_placeholder("Smart search (e.g. ps5, under 80, kipas, #011)").fill("earbuds under 80")
    page.get_by_role("button", name="Smart Search").click()
    page.wait_for_timeout(400)
    assert page.locator("[data-testid='admin-catalog-row']").count() >= 1 and page.get_by_text("Anker Soundcore").is_visible(), "Admin Smart Search must filter matching products"
    page.get_by_role("button", name="Clear catalog search").click()
    page.wait_for_timeout(150)

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

    # Test Bookmarklet toggle and Quick Paste extraction in UI
    page.get_by_role("button", name="Bookmarklet Sync").click()
    assert page.get_by_role("link", name="⚡ HJA Sync").is_visible(), "Bookmarklet drag pill should appear"
    page.get_by_role("button", name="Quick Paste").first.click()
    page.locator("textarea[placeholder*='Paste copied product text']").fill("Test Gadget RM65.50 ★ 4.9 2.5k sold")
    page.get_by_role("button", name="Extract Price & Rating").click()
    page.wait_for_timeout(200)
    assert page.get_by_text("Synced from Quick Paste: RM 65.50 • ★ 4.9 • 2,500 sold").is_visible(), "Quick Paste should show green success banner"

    # Log out cleanly
    page.get_by_role("button", name="Log Out").click()
    page.wait_for_timeout(300)
    assert page.get_by_role("heading", name="Admin Sign In").is_visible(), "Should return to Admin Sign In on Log Out"

    # Mobile PWA Viewport (420x860)
    mctx = b.new_context(viewport={"width": 420, "height": 860})
    mpage = mctx.new_page()
    mpage.goto("${BASE_URL}/", wait_until="domcontentloaded", timeout=15000)
    mpage.locator("article").first.wait_for(timeout=10000)
    mpage.wait_for_timeout(300)
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
      await new Promise((r) => setTimeout(r, 350));
      const keepRes = await fetch('http://localhost:3097/api/admin/keepalive', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ilogin.token}` },
      });
      assert(keepRes.ok, 'Admin keepalive refreshes active session');
      await new Promise((r) => setTimeout(r, 250));
      const passiveRes = await fetch('http://localhost:3097/api/admin/verify?passive=1', {
        headers: { Authorization: `Bearer ${ilogin.token}` },
      });
      assert(passiveRes.ok, 'Passive verify succeeds before timeout without inflating activity');
      await new Promise((r) => setTimeout(r, 650));
      const expiredRes = await fetch('http://localhost:3097/api/admin/verify?passive=1', {
        headers: { Authorization: `Bearer ${ilogin.token}` },
      });
      const expiredJson = await expiredRes.json();
      assert(
        expiredRes.status === 401 && expiredJson.code === 'SESSION_EXPIRED',
        'Idle timeout triggers SESSION_EXPIRED only after true inactivity threshold'
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
