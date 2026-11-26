import crypto from 'node:crypto';
import * as cheerio from 'cheerio';

const BLOCK_SIGNALS = [
  'captcha',
  'verify you are human',
  'security check',
  'robot check',
  'access denied',
  'cf-turnstile',
  'g-recaptcha',
  'hcaptcha',
  'verify-slider',
  'traffic verification',
];

function parsePriceNumber(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw >= 0.5 && raw <= 50000 ? Math.round(raw * 100) / 100 : null;
  }
  const str = String(raw).replace(/,/g, '');
  const match = str.match(/(\d+(?:\.\d{1,2})?)/);
  if (!match) return null;
  const val = Number.parseFloat(match[1]);
  if (!Number.isFinite(val) || val < 0.5 || val > 50000) return null;
  return Math.round(val * 100) / 100;
}

function extractShopeeIdsFromUrl(urlStr) {
  if (!urlStr) return null;
  // Matches /opaanlp/<shopId>/<itemId>, /product/<shopId>/<itemId>, or -i.<shopId>.<itemId>
  const opaaMatch = urlStr.match(/\/(?:opaanlp|product)\/(\d+)\/(\d+)/i);
  if (opaaMatch) return { shopId: opaaMatch[1], itemId: opaaMatch[2] };
  const slugMatch = urlStr.match(/-i\.(\d+)\.(\d+)/i);
  if (slugMatch) return { shopId: slugMatch[1], itemId: slugMatch[2] };
  return null;
}

/**
 * Official Shopee Affiliate OpenAPI lookup (when SHOPEE_APP_ID and SHOPEE_APP_SECRET are set).
 */
async function fetchViaShopeeAffiliateApi(itemId) {
  const appId = process.env.SHOPEE_APP_ID;
  const secret = process.env.SHOPEE_APP_SECRET;
  if (!appId || !secret || !itemId) return null;

  const query = `query { productOfferV2(itemId: ${itemId}, limit: 1) { nodes { productName priceMin priceMax ratingStar imageUrl offerLink } } }`;
  const payload = JSON.stringify({ query });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHash('sha256')
    .update(`${appId}${timestamp}${payload}${secret}`)
    .digest('hex');

  try {
    const res = await fetch('https://open-api.affiliate.shopee.com.my/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`,
      },
      body: payload,
    });
    if (!res.ok) return null;
    const json = await res.json();
    const node = json?.data?.productOfferV2?.nodes?.[0];
    if (!node) return null;
    const price = parsePriceNumber(node.priceMin ?? node.priceMax);
    const ratingVal = Number.parseFloat(node.ratingStar);
    const rating =
      Number.isFinite(ratingVal) && ratingVal >= 1 && ratingVal <= 5
        ? Math.round(ratingVal * 10) / 10
        : null;
    return {
      status: price !== null ? 'synced' : 'blocked',
      price,
      rating,
      title: node.productName || null,
      image: node.imageUrl || null,
      reason: 'Synced via Shopee Affiliate OpenAPI.',
    };
  } catch {
    return null;
  }
}

function extractFromJsonLd($) {
  const results = { price: null, title: null, image: null, rating: null };
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).text());
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        if (!results.title && item.name) results.title = String(item.name).trim();
        if (!results.image && item.image) {
          results.image = Array.isArray(item.image) ? item.image[0] : item.image;
        }
        if (item.aggregateRating && results.rating === null) {
          const rVal = Number.parseFloat(item.aggregateRating.ratingValue);
          if (Number.isFinite(rVal) && rVal >= 1 && rVal <= 5) {
            results.rating = Math.round(rVal * 10) / 10;
          }
        }
        const offers = item.offers;
        if (offers) {
          const offerList = Array.isArray(offers) ? offers : [offers];
          for (const offer of offerList) {
            const p =
              parsePriceNumber(offer?.price) ??
              parsePriceNumber(offer?.lowPrice) ??
              parsePriceNumber(offer?.highPrice);
            if (p !== null && results.price === null) {
              results.price = p;
            }
          }
        }
      }
    } catch {
      // Ignore malformed JSON-LD blocks
    }
  });
  return results;
}

/**
 * Best-effort HTTP metadata, price, and rating fetcher.
 * Respects anti-bot gates: if a platform returns 403/429 or an unauthenticated SPA gate,
 * it reports status='blocked' clearly without bypassing protections.
 */
export async function fetchProductMetadata(url) {
  if (!url || typeof url !== 'string') {
    return {
      status: 'unavailable',
      price: null,
      rating: null,
      title: null,
      image: null,
      reason: 'No URL provided.',
    };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url.trim());
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return {
        status: 'unavailable',
        price: null,
        rating: null,
        title: null,
        image: null,
        reason: 'Invalid URL scheme (must start with http:// or https://).',
      };
    }
  } catch {
    return {
      status: 'unavailable',
      price: null,
      rating: null,
      title: null,
      image: null,
      reason: 'Malformed URL.',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(parsedUrl.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-MY,en;q=0.9,ms;q=0.8',
      },
    });

    const finalUrl = response.url || parsedUrl.toString();

    // Check official Shopee Affiliate OpenAPI first if credentials exist
    const shopeeIds = extractShopeeIdsFromUrl(finalUrl);
    if (shopeeIds) {
      const apiRes = await fetchViaShopeeAffiliateApi(shopeeIds.itemId);
      if (apiRes && (apiRes.price !== null || apiRes.rating !== null)) {
        return { ...apiRes, finalUrl };
      }
    }

    if (response.status === 403 || response.status === 429) {
      return {
        status: 'blocked',
        price: null,
        rating: null,
        title: null,
        image: null,
        finalUrl,
        reason: `Target site blocked automated fetch (HTTP ${response.status}). Please enter Price & Rating manually.`,
      };
    }

    if (!response.ok) {
      return {
        status: 'unavailable',
        price: null,
        rating: null,
        title: null,
        image: null,
        finalUrl,
        reason: `Target URL returned HTTP ${response.status}.`,
      };
    }

    const html = await response.text();
    const lowerHtml = html.slice(0, 20000).toLowerCase();

    if (BLOCK_SIGNALS.some((sig) => lowerHtml.includes(sig)) && !lowerHtml.includes('og:title')) {
      return {
        status: 'blocked',
        price: null,
        rating: null,
        title: null,
        image: null,
        finalUrl,
        reason: 'Platform requires interactive verification. Please enter Price & Rating manually.',
      };
    }

    const $ = cheerio.load(html);
    const jsonLd = extractFromJsonLd($);

    const ogTitle =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').text() ||
      null;

    const ogImage =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      null;

    const metaPrice =
      parsePriceNumber($('meta[property="product:price:amount"]').attr('content')) ??
      parsePriceNumber($('meta[property="og:price:amount"]').attr('content')) ??
      parsePriceNumber($('meta[name="twitter:data1"]').attr('content'));

    let textPrice = null;
    const descText =
      ($('meta[property="og:description"]').attr('content') || '') +
      ' ' +
      ($('meta[name="description"]').attr('content') || '');
    const rmMatch = descText.match(/(?:RM|MYR)\s?(\d+(?:,\d{3})*(?:\.\d{1,2})?)/i);
    if (rmMatch) {
      textPrice = parsePriceNumber(rmMatch[1]);
    }

    const price = jsonLd.price ?? metaPrice ?? textPrice ?? null;
    const rating = jsonLd.rating ?? null;
    const title = (jsonLd.title || ogTitle || '').trim() || null;
    const image = (jsonLd.image || ogImage || '').trim() || null;

    if (price === null && rating === null) {
      const isShopeeSpa = finalUrl.includes('shopee.');
      return {
        status: 'blocked',
        price: null,
        rating: null,
        title,
        image,
        finalUrl,
        reason: isShopeeSpa
          ? `Resolved Shopee link (ID ${shopeeIds?.itemId || 'detected'}), but Shopee hides live price & rating without login/Affiliate API keys. Please enter Price & Rating manually.`
          : 'Page loaded without public price or rating metadata. Please enter Price & Rating manually.',
      };
    }

    return {
      status: price !== null ? 'synced' : 'blocked',
      price,
      rating,
      title,
      image,
      finalUrl,
      reason:
        price !== null && rating !== null
          ? 'Price and rating extracted automatically.'
          : price !== null
            ? 'Price extracted automatically (rating unavailable on page).'
            : 'Rating extracted automatically (price unavailable on page).',
    };
  } catch (err) {
    return {
      status: 'unavailable',
      price: null,
      rating: null,
      title: null,
      image: null,
      reason: err.name === 'AbortError' ? 'Request timed out (7s).' : 'Could not reach target URL.',
    };
  } finally {
    clearTimeout(timeout);
  }
}
