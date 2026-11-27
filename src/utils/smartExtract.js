/**
 * Parses either a Bookmarklet JSON payload ({"__hja":1,...}) or raw copied text
 * from Shopee / TikTok Shop / Lazada / Pinduoduo product pages.
 */
export function parseCopiedProductText(rawInput) {
  const raw = String(rawInput || '').trim();
  if (!raw) {
    return { ok: false, error: 'Clipboard or pasted text is empty.' };
  }

  // 1. Check Bookmarklet JSON payload
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.__hja) {
        const price =
          typeof parsed.price === 'number' && Number.isFinite(parsed.price) ? parsed.price : null;
        const rating =
          typeof parsed.rating === 'number' && parsed.rating >= 1 && parsed.rating <= 5
            ? Math.round(parsed.rating * 10) / 10
            : null;
        const sold =
          typeof parsed.sold === 'number' && Number.isFinite(parsed.sold)
            ? Math.max(0, Math.round(parsed.sold))
            : null;
        const title = parsed.title ? String(parsed.title).trim() : null;
        const url = parsed.url ? String(parsed.url).trim() : null;

        if (price === null && rating === null && sold === null && !title) {
          return {
            ok: false,
            error: 'Bookmarklet could not detect price or rating on that page.',
          };
        }
        return { ok: true, source: 'bookmarklet', price, rating, sold, title, url };
      }
    } catch {
      // Fall through to raw text parsing
    }
  }

  // 2. Parse raw copied product text
  // Ignore obvious voucher/off lines like "RM15 Off" / "Min. Spend RM0" when other RM prices exist
  const filteredLines = raw
    .split(/\r?\n/)
    .filter((l) => !/(?:min\.?\s*spend|voucher|cashback|off\b|diskaun)/i.test(l))
    .join('\n');

  let price = null;
  const searchSource = filteredLines.trim() ? filteredLines : raw;
  const priceMatches = [
    ...searchSource.matchAll(/(?:RM|MYR)\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/gi),
  ];
  if (priceMatches.length > 0) {
    const candidates = priceMatches
      .map((m) => Number.parseFloat(m[1].replace(/,/g, '')))
      .filter((n) => Number.isFinite(n) && n >= 0.5 && n <= 50000);
    if (candidates.length > 0) {
      price = Math.round(candidates[0] * 100) / 100;
    }
  }

  // Rating: "4.9 / 5", "★ 4.9", "4.9 Ratings", "4.9 Penilaian", "4.9 (1.2k)"
  let rating = null;
  const ratingPatterns = [
    /(?:★|⭐)\s*([1-5](?:\.\d)?)/,
    /([1-5]\.\d)\s*(?:\/\s*5|out of 5|stars?)/i,
    /([1-5]\.\d)\s*(?:\r?\n|\s)*(?:[\d.,]+[kK]?\s*)?(?:ratings?|ulasan|penilaian|reviews?)/i,
    /([1-5]\.\d)\s*(?:\(\s*[\d.,]+[kK]?\s*(?:ratings?|ulasan|penilaian|reviews?)?\s*\))/i,
    /(?:rating|penilaian|score)\s*[:\-]?\s*([1-5](?:\.\d)?)/i,
    /(?:^|\s)([1-5]\.\d)(?=\s|$)/m,
  ];
  for (const pat of ratingPatterns) {
    const m = raw.match(pat);
    if (m) {
      const val = Number.parseFloat(m[1]);
      if (Number.isFinite(val) && val >= 1 && val <= 5) {
        rating = Math.round(val * 10) / 10;
        break;
      }
    }
  }

  // Sold count: "14.8k sold", "1.2rb terjual", "500+ sold", "12,340 terjual"
  let sold = null;
  const soldMatch = raw.match(
    /(\d+(?:[.,]\d+)?)\s*([kK]|rb|ribu)?\+?\s*(?:sold|terjual|monthly sales|purchases)/i
  );
  if (soldMatch) {
    const numStr = soldMatch[1].replace(/,/g, '');
    let val = Number.parseFloat(numStr);
    if (Number.isFinite(val)) {
      if (soldMatch[2]) val *= 1000;
      sold = Math.max(0, Math.round(val));
    }
  }

  // Title: first clean descriptive line without RM/sold/rating noise
  let title = null;
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 10 && l.length <= 180);
  for (const line of lines) {
    if (/^(?:RM|MYR)\s?\d/i.test(line)) continue;
    if (/^\d+(?:\.\d+)?\s*[kK]?\+?\s*(?:sold|terjual|ratings?|penilaian)/i.test(line)) continue;
    if (/^(?:Shopee|TikTok|Lazada|Pinduoduo|Free Shipping|Mall|Preferred)/i.test(line)) continue;
    title = line;
    break;
  }

  if (price === null && rating === null && sold === null) {
    return {
      ok: false,
      error: 'Could not find a valid RM price, rating (1-5), or sold count in the pasted text.',
    };
  }

  return { ok: true, source: 'text', price, rating, sold, title, url: null };
}

/**
 * Generates a self-contained browser Bookmarklet URI that reads visible price,
 * rating, sold count, and title from the currently open store tab and copies
 * structured JSON to the clipboard for 1-click pasting in Admin.
 */
export function buildSyncBookmarkletHref() {
  const code = `(() => {
    try {
      let price = null, rating = null, sold = null, title = null;
      const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const s of ldScripts) {
        try {
          const obj = JSON.parse(s.textContent || '{}');
          const arr = Array.isArray(obj) ? obj : [obj];
          for (const it of arr) {
            if (!title && it && it.name) title = String(it.name).trim();
            if (rating === null && it && it.aggregateRating && it.aggregateRating.ratingValue) {
              const rv = parseFloat(it.aggregateRating.ratingValue);
              if (rv >= 1 && rv <= 5) rating = Math.round(rv * 10) / 10;
            }
            const off = it && it.offers ? (Array.isArray(it.offers) ? it.offers[0] : it.offers) : null;
            if (price === null && off) {
              const pv = parseFloat(off.price || off.lowPrice || '');
              if (isFinite(pv) && pv >= 0.5 && pv <= 50000) price = Math.round(pv * 100) / 100;
            }
          }
        } catch {}
      }
      const h1 = document.querySelector('h1');
      let scopeEl = h1 ? (h1.closest('section, main, div[class*="product"], div[class*="detail"]') || document.body) : document.body;
      let txt = (scopeEl.innerText || document.body.innerText || '').slice(0, 8000);
      if (txt.length < 40) txt = (document.body.innerText || '').slice(0, 8000);
      if (price === null) {
        const cleanLines = txt.split(/\\r?\\n/).filter(l => !/(?:min\\.?\\s*spend|voucher|cashback|off\\b|diskaun)/i.test(l)).join('\\n');
        const pm = [...(cleanLines || txt).matchAll(/(?:RM|MYR)\\s?(\\d{1,3}(?:,\\d{3})*(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)/gi)]
          .map(m => parseFloat(m[1].replace(/,/g, '')))
          .filter(n => isFinite(n) && n >= 0.5 && n <= 50000);
        if (pm.length) price = Math.round(pm[0] * 100) / 100;
      }
      if (rating === null) {
        const rPats = [
          /(?:★|⭐)\\s*([1-5](?:\\.\\d)?)/,
          /([1-5]\\.\\d)\\s*(?:\\/\\s*5|out of 5)/i,
          /([1-5]\\.\\d)\\s*(?:\\r?\\n|\\s)*(?:[\\d.,]+[kK]?\\s*)?(?:ratings?|ulasan|penilaian|reviews?)/i,
          /([1-5]\\.\\d)\\s*(?:\\([\\d.,]+[kK]?)/,
          /(?:^|\\n)([1-5]\\.\\d)(?:\\n|\\s)/
        ];
        for (const p of rPats) {
          const m = txt.match(p);
          if (m) { const v = parseFloat(m[1]); if (v >= 1 && v <= 5) { rating = Math.round(v * 10) / 10; break; } }
        }
      }
      const sm = txt.match(/(\\d+(?:[.,]\\d+)?)\\s*([kK]|rb|ribu)?\\+?\\s*(?:sold|terjual)/i);
      if (sm) { sold = Math.round(parseFloat(sm[1].replace(/,/g, '')) * (sm[2] ? 1000 : 1)); }
      if (!title) {
        title = ((h1 && h1.innerText) || document.title || '').replace(/\\s*\\|\\s*Shopee.*$/i, '').trim();
      }
      const payload = JSON.stringify({ __hja: 1, title, price, rating, sold, url: location.href });
      const toast = (msg, ok) => {
        const d = document.createElement('div');
        d.textContent = msg;
        d.style.cssText = 'position:fixed;top:18px;right:18px;z-index:2147483647;padding:12px 18px;border-radius:14px;font:700 13px sans-serif;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.25);background:' + (ok ? '#059669' : '#e11d48');
        document.body.appendChild(d);
        setTimeout(() => d.remove(), 4000);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(payload).then(
          () => toast('Copied! RM ' + (price ?? '?') + ' | ★ ' + (rating ?? '?') + ' — Now click Paste Sync in Admin', true),
          () => { prompt('Copy this sync code and paste in Admin Quick Paste:', payload); }
        );
      } else {
        prompt('Copy this sync code and paste in Admin Quick Paste:', payload);
      }
    } catch (e) {
      alert('HJA Sync error: ' + e.message);
    }
  })();`;

  return `javascript:${encodeURIComponent(code.trim())}`;
}
