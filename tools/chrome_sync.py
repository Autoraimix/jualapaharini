#!/usr/bin/env python3
"""
Real Chrome CDP Product Extractor for BeliApaHarini.

Connects to an existing desktop Google Chrome instance started with
--remote-debugging-port=9222 (non-incognito persistent profile where the admin
is already signed in), opens product links sequentially with gentle scrolling
and polite delays, extracts price, sold count, rating, title, and gallery
images, and pauses cleanly if login or verification is required.
"""

import argparse
import hashlib
import json
import os
import random
import re
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

EXTRACT_JS = r"""
() => {
  const cleanText = (s) => (s || '').replace(/\s+/g, ' ').trim();

  const isVisible = (el) => {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  // Detect verification / login screen so caller can pause safely for human action
  const hrefLower = (window.location.href || '').toLowerCase();
  const bodyText = cleanText(document.body?.innerText || '').slice(0, 3000);
  const bodyLower = bodyText.toLowerCase();
  const verificationPatterns = [
    'verify to continue',
    'slide to verify',
    'security verification',
    'log in to shopee',
    'login to continue',
    'traffic limit',
    'please complete the security check',
    'are you a human',
  ];
  const isLoginUrl = /\/buyer\/login|\/verify\/|captcha|challenge/.test(hrefLower);

  // 1. Parse JSON-LD if available
  let ldProduct = null;
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(script.textContent || '{}');
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (item && (item['@type'] === 'Product' || String(item['@type'] || '').includes('Product'))) {
          ldProduct = item;
          break;
        }
      }
    } catch {}
    if (ldProduct) break;
  }

  // 2. Price Extraction (Shopee .nt0EaI / .pyzxvq first, then resilient PDP heuristics)
  const parsePriceNumber = (text) => {
    if (!text) return null;
    // Ignore installment snippets like "12x RM305.50"
    const scrubbed = text.replace(/\d+\s*x\s*(?:RM|MYR|¥|￥)?\s*[\d,]+(?:\.\d{1,2})?/gi, ' ');
    const m = scrubbed.match(/(?:RM|MYR|¥|￥)\s*([\d,]+(?:\.\d{1,2})?)/i);
    if (!m) return null;
    const num = Number(m[1].replace(/,/g, ''));
    return Number.isFinite(num) && num > 0 && num < 500000 ? Number(num.toFixed(2)) : null;
  };

  let price = null;
  const priceSelectors = [
    '.nt0EaI .pyzxvq',
    '.pyzxvq.pw3J3G',
    '.nt0EaI',
    '[class*="product-briefing"] .pyzxvq',
    '.pqTWkA',
    '.pdp-v2-product-price-content-salePrice-amount',
    '.pdp-v2-product-price-content-salePrice',
    '.pdp-price_color_orange',
    '.pdp-price',
  ];

  for (const sel of priceSelectors) {
    for (const el of document.querySelectorAll(sel)) {
      const txt = cleanText(el.innerText || el.textContent);
      const val = parsePriceNumber(txt);
      if (val !== null) {
        price = val;
        break;
      }
    }
    if (price !== null) break;
  }

  // Fallback: scan visible elements in upper PDP area ranked by fontSize & "After Voucher" context
  if (price === null) {
    const candidates = [];
    for (const el of document.querySelectorAll('div, span, p, strong')) {
      if (el.children.length > 3) continue;
      const txt = cleanText(el.innerText || '');
      if (!txt || txt.length > 48) continue;
      if (!/(?:RM|MYR|¥|￥)\s*\d/.test(txt)) continue;
      if (/\d+\s*x\s*(?:RM|MYR)/i.test(txt) || /installment/i.test(txt)) continue;
      const style = window.getComputedStyle(el);
      if ((style.textDecorationLine || '').includes('line-through') || el.closest('del, s')) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || rect.top > 950) continue;
      const val = parsePriceNumber(txt);
      if (val !== null) {
        const fs = parseFloat(style.fontSize) || 14;
        candidates.push({ val, fs, top: rect.top });
      }
    }
    candidates.sort((a, b) => b.fs - a.fs || a.top - b.top);
    if (candidates.length > 0) {
      price = candidates[0].val;
    }
  }

  if (price === null && ldProduct?.offers) {
    const offer = Array.isArray(ldProduct.offers) ? ldProduct.offers[0] : ldProduct.offers;
    const raw = Number(offer?.price ?? offer?.lowPrice);
    if (Number.isFinite(raw) && raw > 0) price = Number(raw.toFixed(2));
  }

  // 3. Sold Count Extraction (Shopee .Ocv3B8 / .PfWbfd first, then visible "10k+ Sold" regex)
  const parseCompactCount = (raw) => {
    if (!raw) return null;
    const m = String(raw).replace(/,/g, '').match(/([\d.]+)\s*([kKmM])?/);
    if (!m) return null;
    let num = Number(m[1]);
    if (!Number.isFinite(num)) return null;
    const unit = (m[2] || '').toLowerCase();
    if (unit === 'k') num *= 1000;
    else if (unit === 'm') num *= 1000000;
    return Math.max(0, Math.round(num));
  };

  let soldCount = null;
  let soldRaw = '';
  for (const sel of ['.Ocv3B8 .PfWbfd', '.Ocv3B8']) {
    for (const el of document.querySelectorAll(sel)) {
      const txt = cleanText(el.innerText || el.textContent);
      const m = txt.match(/([\d.,]+\s*[kKmM]?\+?)/);
      if (m) {
        const parsed = parseCompactCount(m[1]);
        if (parsed !== null) {
          soldCount = parsed;
          soldRaw = txt;
          break;
        }
      }
    }
    if (soldCount !== null) break;
  }

  if (soldCount === null) {
    for (const el of document.querySelectorAll('div, span')) {
      const txt = cleanText(el.innerText || '');
      if (!txt || txt.length > 32) continue;
      const m = txt.match(/^([\d.,]+\s*[kKmM]?\+?)\s*(?:sold|terjual)$/i);
      if (m) {
        const rect = el.getBoundingClientRect();
        if (rect.top >= 0 && rect.top < 900) {
          soldCount = parseCompactCount(m[1]);
          soldRaw = txt;
          break;
        }
      }
    }
  }

  // Fallback for Lazada v2 (.container-star-v2-count e.g. "(1396)") when explicit sold text is absent
  if (soldCount === null) {
    for (const el of document.querySelectorAll('.container-star-v2-count, .pdp-review-summary__link')) {
      const txt = cleanText(el.innerText || el.textContent);
      const m = txt.match(/([\d.,]+\s*[kKmM]?\+?)/);
      if (m) {
        const parsed = parseCompactCount(m[1]);
        if (parsed !== null) {
          soldCount = parsed;
          soldRaw = txt;
          break;
        }
      }
    }
  }

  // 4. Rating Extraction (Shopee .product-rating-overview__rating-score + Lazada v2 + PDP fallback)
  let rating = null;
  const ratingSelectors = [
    '.product-rating-overview__rating-score',
    '.product-rating-overview__score-wrapper',
    '.shopee-product-rating__rating',
    '[class*="rating-score"]',
    '.container-star-v2-score',
    '.summary .score-average',
  ];
  for (const sel of ratingSelectors) {
    for (const el of document.querySelectorAll(sel)) {
      const txt = cleanText(el.innerText || el.textContent);
      const m = txt.match(/([1-5](?:\.\d+)?)/);
      if (m) {
        const val = Number(m[1]);
        if (Number.isFinite(val) && val >= 1 && val <= 5) {
          rating = Number(val.toFixed(1));
          break;
        }
      }
    }
    if (rating !== null) break;
  }
  if (rating === null && ldProduct?.aggregateRating?.ratingValue) {
    const r = Number(ldProduct.aggregateRating.ratingValue);
    if (Number.isFinite(r) && r >= 1 && r <= 5) rating = Number(r.toFixed(1));
  }
  if (rating === null) {
    for (const el of document.querySelectorAll('div, span, button')) {
      const txt = cleanText(el.innerText || '');
      if (/^[1-5]\.\d$/.test(txt)) {
        const grandTxt = cleanText(el.parentElement?.parentElement?.innerText || '');
        if (/ratings?|sold|reviews?|★|out of 5/i.test(grandTxt) || el.parentElement?.querySelector('svg')) {
          const rect = el.getBoundingClientRect();
          if (rect.top >= 0 && rect.top < 1200) {
            rating = Number(Number(txt).toFixed(1));
            break;
          }
        }
      }
    }
  }

  // 5. Title Extraction
  let title = '';
  const heading = document.querySelector(
    'h1.pdp-mod-product-badge-title-v2, h1, [class*="product-briefing"] span, [data-testid="pdp-product-title"]'
  );
  if (heading) {
    title = cleanText(heading.innerText || heading.textContent).replace(/^(?:Mall|Preferred\+?)\s+/i, '');
  }
  if (!title || title.length < 3) {
    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
    title = cleanText(ogTitle) || cleanText(document.title);
  }
  title = title
    .replace(/\s*\|\s*Shopee Malaysia.*$/i, '')
    .replace(/\s*\|\s*Lazada.*$/i, '')
    .replace(/\s*-\s*Shopee Malaysia.*$/i, '')
    .trim();

  // 6. Gallery Images Extraction (section.C21rQm + susercontent / product media)
  const normalizeImageUrl = (rawUrl) => {
    if (!rawUrl || typeof rawUrl !== 'string') return '';
    let u = rawUrl.trim();
    if (u.startsWith('//')) u = 'https:' + u;
    if (!/^https?:\/\//i.test(u)) return '';
    const lower = u.toLowerCase();
    if (
      lower.includes('deo.shopeemobile.com') ||
      lower.includes('.svg') ||
      lower.includes('badge') ||
      lower.includes('icon') ||
      lower.includes('/tps/')
    ) {
      return '';
    }
    if (lower.includes('susercontent.com/file/')) {
      // Convert resize/thumbnail URLs to full high-res image URL
      u = u.replace(/@resize_w\d+_nl(?:\.webp)?$/i, '');
      u = u.replace(/_tn$/i, '');
    } else if (lower.includes('lazcdn.com/g/p/')) {
      // Convert Lazada _720x720q80.jpg_.webp / _80x80q80.jpg_.webp thumbnails to full original photo
      u = u.replace(/_\d+x\d+q\d+\.(?:jpg|jpeg|png)(?:_\.webp)?$/i, '');
    }
    return u;
  };

  const primaryImages = [];
  const secondaryImages = [];
  const seen = new Set();

  const pushImg = (rawUrl, isSecondary = false) => {
    const norm = normalizeImageUrl(rawUrl);
    if (!norm || seen.has(norm)) return;
    seen.add(norm);
    if (isSecondary) secondaryImages.push(norm);
    else primaryImages.push(norm);
  };

  // Hero main image inside section.C21rQm (.e3bgiU / .VmNEQ6 img)
  for (const el of document.querySelectorAll('section.C21rQm .VmNEQ6 img, section.C21rQm img.e3bgiU')) {
    pushImg(el.getAttribute('src') || el.currentSrc || '', false);
  }

  // Gallery thumbnails inside section.C21rQm (.qIctnQ)
  for (const thumb of document.querySelectorAll('section.C21rQm .qIctnQ')) {
    const hasVideoOverlay = Boolean(thumb.querySelector('.emXGWZ, img[alt*="video"]'));
    const imgEl = thumb.querySelector('picture img, img.P39yUt, img');
    const src = imgEl?.getAttribute('src') || imgEl?.currentSrc || '';
    if (src) {
      // Put video cover thumbnails after actual product photos so hero image is clean
      pushImg(src, hasVideoOverlay || /_cover(?:@|$)/i.test(src));
    }
  }

  // Lazada v2 PDP gallery (.gallery-preview-panel-v2__image + .item-gallery-v2__thumbnail-image)
  for (const el of document.querySelectorAll(
    '.gallery-preview-panel-v2__image, #module_item_gallery_1 .gallery-preview-panel-v2 img'
  )) {
    pushImg(el.getAttribute('src') || el.currentSrc || '', false);
  }
  for (const el of document.querySelectorAll(
    '.item-gallery-v2__thumbnail-image, #module_item_gallery_1 .item-gallery-v2__thumbnail img'
  )) {
    pushImg(el.getAttribute('src') || el.currentSrc || '', false);
  }

  // Fallback for generic Shopee or TikTok/Lazada/Pinduoduo pages
  if (primaryImages.length === 0 && secondaryImages.length === 0) {
    for (const el of document.querySelectorAll('img')) {
      const src = el.getAttribute('src') || el.currentSrc || '';
      if (!src) continue;
      if (src.includes('susercontent.com/file/')) {
        const isCover = /_cover(?:@|$)/i.test(src);
        pushImg(src, isCover);
        continue;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width >= 150 && rect.height >= 150 && rect.top < 950) {
        pushImg(src, false);
      }
    }
  }

  const images = [...primaryImages, ...secondaryImages].slice(0, 8);

  const blockedByGate =
    price === null &&
    (isLoginUrl || verificationPatterns.some((pat) => bodyLower.includes(pat)));

  return {
    finalUrl: window.location.href,
    title,
    price,
    soldCount,
    soldRaw,
    rating,
    images,
    blockedByGate,
  };
}
"""


def detect_platform(url: str) -> str:
    lower = (url or "").lower()
    if "tiktok.com" in lower:
        return "tiktok"
    if "lazada." in lower:
        return "lazada"
    if "pinduoduo.com" in lower or "yangkeduo.com" in lower:
        return "pinduoduo"
    return "shopee"


def emit(payload: dict) -> None:
    # ensure_ascii=True keeps stdout 100% safe on any Windows console/pipe encoding
    print(json.dumps(payload, ensure_ascii=True), flush=True)


def download_images_via_context(context, image_urls, uploads_dir: Path, limit: int = 6):
    if not uploads_dir:
        return list(image_urls[:limit])
    uploads_dir.mkdir(parents=True, exist_ok=True)
    saved_paths = []
    for raw_url in image_urls[:limit]:
        try:
            digest = hashlib.sha1(raw_url.encode("utf-8")).hexdigest()[:12]
            existing = list(uploads_dir.glob(f"chrome_{digest}.*"))
            if existing:
                saved_paths.append(f"/uploads/{existing[0].name}")
                continue
            resp = context.request.get(raw_url, timeout=15000)
            if resp.ok:
                ctype = (resp.headers.get("content-type") or "").lower()
                ext = ".webp" if "webp" in ctype else ".png" if "png" in ctype else ".jpg"
                filename = f"chrome_{digest}{ext}"
                target = uploads_dir / filename
                target.write_bytes(resp.body())
                saved_paths.append(f"/uploads/{filename}")
                continue
        except Exception:
            pass
        # Keep original URL if local download fails
        saved_paths.append(raw_url)
    return saved_paths


def safe_evaluate(page, script: str, retries: int = 6):
    last_err = None
    for _ in range(retries):
        try:
            return page.evaluate(script)
        except Exception as exc:
            msg = str(exc).lower()
            if (
                "execution context was destroyed" in msg
                or "cannot find context" in msg
                or "most likely because of a navigation" in msg
            ):
                last_err = exc
                try:
                    page.wait_for_load_state("domcontentloaded", timeout=8000)
                except Exception:
                    pass
                time.sleep(0.6)
                continue
            raise
    raise last_err


def extract_from_page(page, context, uploads_dir: Path | None):
    data = safe_evaluate(page, EXTRACT_JS)
    if data.get("blockedByGate"):
        return data
    raw_images = data.get("images") or []
    if uploads_dir and raw_images:
        data["localImages"] = download_images_via_context(context, raw_images, uploads_dir, limit=6)
    else:
        data["localImages"] = raw_images[:6]
    return data


def run_test_html(html_path: str):
    html_content = Path(html_path).read_text(encoding="utf-8")
    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(
                executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                headless=True,
            )
        except Exception:
            browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.set_content(html_content, wait_until="domcontentloaded")
        result = extract_from_page(page, page.context, None)
        browser.close()
        print(json.dumps(result, ensure_ascii=True))


def format_gate_reason(headless: bool, final_url: str) -> str:
    short_dest = (final_url or "")[:90]
    if headless:
        return (
            f"Headless Chrome ran invisibly in the background and storefront requested login/verification ({short_dest}). "
            "Uncheck 'Run in Headless Chrome', click 'Open Real Chrome' to sign in visibly, then try again."
        )
    return (
        f"Shopee/storefront showed a login or verification check in the Real Chrome window ({short_dest}). "
        "Complete the check or sign in inside that Real Chrome tab, then click Resume Remaining."
    )


def process_url_queue(
    page, context, urls, delay_seconds: float, uploads_dir: Path | None, headless: bool = False
):
    for idx, url in enumerate(urls):
        emit(
            {
                "event": "progress",
                "index": idx,
                "total": len(urls),
                "url": url,
                "stage": "opening",
            }
        )
        try:
            if not headless:
                try:
                    page.bring_to_front()
                except Exception:
                    pass

            page.goto(url, wait_until="domcontentloaded", timeout=45000)

            # Wait across client-side shortlink / affiliate redirects (Shopee, Lazada, TikTok)
            hop_deadline = time.time() + 12.0
            while time.time() < hop_deadline:
                cur = (page.url or "").lower()
                if (
                    "s.shopee." not in cur
                    and "s.lazada." not in cur
                    and "vt.tiktok." not in cur
                    and "/opaanlp/" not in cur
                    and "universal-link" not in cur
                ):
                    break
                time.sleep(0.4)

            try:
                page.wait_for_load_state("domcontentloaded", timeout=12000)
            except Exception:
                pass
            time.sleep(1.2)

            # Wait naturally for SPA price or sold text to render (up to ~30s), surviving extra redirects
            start_wait = time.time()
            deadline = start_wait + 30.0
            snapshot = None
            while time.time() < deadline:
                snapshot = safe_evaluate(page, EXTRACT_JS)
                if snapshot.get("price") is not None and (
                    snapshot.get("images") or snapshot.get("soldCount") is not None
                ):
                    break
                # Give SPA hydration at least 3.0s before treating a banner/login check as final
                if snapshot.get("blockedByGate") and (time.time() - start_wait) >= 3.0:
                    break
                time.sleep(0.7)

            # In visible Chrome mode, give the user up to 3 minutes directly in Chrome to complete login/verification
            if snapshot and snapshot.get("blockedByGate") and not headless:
                try:
                    page.bring_to_front()
                except Exception:
                    pass
                emit(
                    {
                        "event": "waiting_user",
                        "index": idx,
                        "total": len(urls),
                        "url": url,
                        "reason": (
                            f"Verification or login open in Real Chrome ({(snapshot.get('finalUrl') or page.url)[:85]}). "
                            "Take your time to complete it inside that Chrome tab — sync will continue automatically (waiting up to 3 mins)."
                        ),
                    }
                )
                wait_user_deadline = time.time() + 180.0
                while time.time() < wait_user_deadline:
                    time.sleep(1.2)
                    try:
                        snapshot = safe_evaluate(page, EXTRACT_JS)
                    except Exception:
                        continue
                    cur_lower = (snapshot.get("finalUrl") or page.url or "").lower()
                    still_gated_url = bool(re.search(r"/buyer/login|/verify/|captcha|challenge", cur_lower))
                    if not snapshot.get("blockedByGate") and not still_gated_url:
                        # Give newly unlocked product page a moment to render price/gallery
                        time.sleep(2.0)
                        hyd_end = time.time() + 15.0
                        while time.time() < hyd_end:
                            snapshot = safe_evaluate(page, EXTRACT_JS)
                            if snapshot.get("price") is not None:
                                break
                            time.sleep(0.7)
                        break

            if snapshot and snapshot.get("blockedByGate"):
                if not headless:
                    try:
                        page.bring_to_front()
                    except Exception:
                        pass
                emit(
                    {
                        "event": "paused_verification",
                        "index": idx,
                        "total": len(urls),
                        "url": url,
                        "reason": format_gate_reason(headless, snapshot.get("finalUrl") or page.url),
                    }
                )
                sys.exit(2)

            # Smooth human-like scroll so lazy gallery images & ratings render cleanly
            safe_evaluate(page, "() => window.scrollBy({ top: 240, behavior: 'smooth' })")
            time.sleep(0.45)
            safe_evaluate(page, "() => window.scrollBy({ top: 240, behavior: 'smooth' })")
            time.sleep(0.45)
            safe_evaluate(page, "() => window.scrollTo({ top: 0, behavior: 'smooth' })")
            time.sleep(0.4)

            extracted = extract_from_page(page, context, uploads_dir)
            if extracted.get("blockedByGate"):
                if not headless:
                    try:
                        page.bring_to_front()
                    except Exception:
                        pass
                emit(
                    {
                        "event": "paused_verification",
                        "index": idx,
                        "total": len(urls),
                        "url": url,
                        "reason": format_gate_reason(headless, extracted.get("finalUrl") or page.url),
                    }
                )
                sys.exit(2)

            emit(
                {
                    "event": "result",
                    "index": idx,
                    "total": len(urls),
                    "url": url,
                    "platform": detect_platform(extracted.get("finalUrl") or url),
                    "ok": True,
                    "data": extracted,
                }
            )
        except Exception as exc:
            emit(
                {
                    "event": "result",
                    "index": idx,
                    "total": len(urls),
                    "url": url,
                    "platform": detect_platform(url),
                    "ok": False,
                    "error": str(exc),
                }
            )

        # Polite human-paced pause before opening the next link
        if idx < len(urls) - 1 and delay_seconds > 0:
            jitter = delay_seconds * random.uniform(0.85, 1.25)
            time.sleep(jitter)

    emit({"event": "done", "processed": len(urls)})


def run_cdp_batch(cdp_url: str, input_json_path: str):
    cfg = json.loads(Path(input_json_path).read_text(encoding="utf-8"))
    urls = [str(u).strip() for u in (cfg.get("urls") or []) if str(u).strip()]
    delay_seconds = float(cfg.get("delaySeconds", 5.0))
    uploads_dir = Path(cfg["uploadsDir"]) if cfg.get("uploadsDir") else None
    headless = bool(cfg.get("headless", False))
    close_on_complete = bool(cfg.get("closeOnComplete", True))
    skip_images = bool(cfg.get("skipImages", False))
    if skip_images:
        uploads_dir = None
    profile_dir = cfg.get("profileDir")

    if not urls:
        emit({"event": "done", "processed": 0})
        return

    with sync_playwright() as p:
        if headless:
            if not profile_dir:
                emit({"event": "error", "error": "Missing Chrome profileDir for headless mode."})
                sys.exit(1)
            Path(profile_dir).mkdir(parents=True, exist_ok=True)
            chrome_exe = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
            launch_kwargs = {
                "headless": True,
                "viewport": {"width": 1440, "height": 900},
                "args": ["--no-first-run"],
            }
            if Path(chrome_exe).exists():
                launch_kwargs["executable_path"] = chrome_exe
            try:
                context = p.chromium.launch_persistent_context(profile_dir, **launch_kwargs)
            except Exception as exc:
                emit(
                    {
                        "event": "error",
                        "error": f"Could not start Headless Chrome with saved profile (make sure visible Real Chrome window is closed first): {exc}",
                    }
                )
                sys.exit(1)
            try:
                page = context.pages[0] if context.pages else context.new_page()
                process_url_queue(page, context, urls, delay_seconds, uploads_dir, headless=True)
            finally:
                context.close()
            return

        try:
            browser = p.chromium.connect_over_cdp(cdp_url)
        except Exception as exc:
            emit(
                {
                    "event": "error",
                    "error": f"Could not connect to real Chrome at {cdp_url}. Click 'Open Real Chrome' first ({exc}).",
                }
            )
            sys.exit(1)

        if not browser.contexts:
            emit({"event": "error", "error": "No open browser context found in Chrome."})
            sys.exit(1)

        # Reuse the single existing non-localhost tab in the Real Chrome window so all links run
        # sequentially in 1 tab without spawning duplicate tabs
        context = browser.contexts[0]
        sync_tabs = []
        for pg in context.pages:
            u = (pg.url or "").lower()
            if (
                u.startswith(("http://", "https://", "about:blank"))
                and "localhost" not in u
                and "127.0.0.1" not in u
            ):
                sync_tabs.append(pg)
        page = sync_tabs[0] if sync_tabs else context.new_page()
        try:
            page.bring_to_front()
        except Exception:
            pass
        process_url_queue(page, context, urls, delay_seconds, uploads_dir, headless=False)

        if close_on_complete:
            has_local_admin_tab = any(
                "localhost" in (pg.url or "").lower() or "127.0.0.1" in (pg.url or "").lower()
                for pg in context.pages
            )
            try:
                if has_local_admin_tab:
                    page.close()
                else:
                    cdp = browser.new_browser_cdp_session()
                    cdp.send("Browser.close")
            except Exception:
                pass


def main():
    parser = argparse.ArgumentParser(description="Real Chrome CDP product sync worker")
    parser.add_argument("--cdp-url", default="http://127.0.0.1:9222")
    parser.add_argument("--input-json", help="Path to JSON batch specification")
    parser.add_argument("--test-html", help="Run DOM extractor test against local HTML file")
    args = parser.parse_args()

    if args.test_html:
        run_test_html(args.test_html)
    elif args.input_json:
        run_cdp_batch(args.cdp_url, args.input_json)
    else:
        parser.error("Provide either --input-json or --test-html")


if __name__ == "__main__":
    main()
