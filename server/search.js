const SYNONYMS = {
  earphone: ['earbuds', 'audio', 'bluetooth', 'headphone'],
  earbuds: ['earphone', 'audio', 'bluetooth', 'anc'],
  headphone: ['earbuds', 'audio', 'earphone'],
  kipas: ['fan', 'jisulife', 'cooling'],
  fan: ['kipas', 'jisulife', 'cooling'],
  baju: ['shirt', 'tee', 'oversized', 'fashion'],
  shirt: ['baju', 'tee', 'fashion'],
  kopi: ['coffee', 'espresso'],
  coffee: ['kopi', 'espresso'],
  botol: ['tumbler', 'bottle', 'flask'],
  bottle: ['tumbler', 'botol', 'flask'],
  tumbler: ['bottle', 'botol', 'flask'],
  lampu: ['lamp', 'led', 'desk'],
  lamp: ['lampu', 'led'],
  skincare: ['ceramide', 'moisturizer', 'beauty'],
  charger: ['gan', 'usb-c', 'fast', 'ugreen'],
  gym: ['fitness', 'yoga', 'workout', 'earbuds'],
  murah: ['budget', 'affordable'],
};

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

const PLATFORMS = ['shopee', 'tiktok', 'lazada', 'pinduoduo'];

export function getEffectiveMinPrice(product) {
  const prices = PLATFORMS.filter((pl) => product[`${pl}_url`])
    .map((pl) => product[`${pl}_price`])
    .filter((p) => typeof p === 'number' && Number.isFinite(p) && p > 0);
  if (prices.length > 0) return Math.min(...prices);
  const fallback = PLATFORMS.map((pl) => product[`${pl}_price`]).filter(
    (p) => typeof p === 'number' && Number.isFinite(p) && p > 0
  );
  return fallback.length > 0 ? Math.min(...fallback) : null;
}

export function getEffectiveMaxPrice(product) {
  const prices = PLATFORMS.filter((pl) => product[`${pl}_url`])
    .map((pl) => product[`${pl}_price`])
    .filter((p) => typeof p === 'number' && Number.isFinite(p) && p > 0);
  if (prices.length > 0) return Math.max(...prices);
  const fallback = PLATFORMS.map((pl) => product[`${pl}_price`]).filter(
    (p) => typeof p === 'number' && Number.isFinite(p) && p > 0
  );
  return fallback.length > 0 ? Math.max(...fallback) : null;
}

export function parseSmartQuery(rawQuery = '') {
  let text = String(rawQuery || '').trim().toLowerCase();
  let inferredMaxPrice = null;
  let inferredMinPrice = null;
  let cheapIntent = false;

  const underMatch = text.match(/(?:under|below|bawah|<=|<)\s*(?:rm|myr)?\s*(\d+(?:\.\d{1,2})?)/i);
  if (underMatch) {
    inferredMaxPrice = Number.parseFloat(underMatch[1]);
    text = text.replace(underMatch[0], ' ');
  }

  const aboveMatch = text.match(/(?:above|over|atas|>=|>)\s*(?:rm|myr)?\s*(\d+(?:\.\d{1,2})?)/i);
  if (aboveMatch) {
    inferredMinPrice = Number.parseFloat(aboveMatch[1]);
    text = text.replace(aboveMatch[0], ' ');
  }

  if (/\bmurah\b|\bcheap\b|\bbudget\b/.test(text)) {
    cheapIntent = true;
  }

  const tokens = text
    .replace(/[^a-z0-9#\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  return { tokens, inferredMaxPrice, inferredMinPrice, cheapIntent };
}

function scoreProduct(product, tokens) {
  if (tokens.length === 0) return 1;

  const code = (product.code || '').toLowerCase();
  const title = (product.title || '').toLowerCase();
  const tags = (product.tags || '').toLowerCase();
  const cat = (product.category_slug || '').toLowerCase();
  const desc = (product.description || '').toLowerCase();
  const searchableWords = `${title} ${tags} ${cat} ${desc}`
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  let totalScore = 0;
  let matchedTokens = 0;

  for (const token of tokens) {
    let tokenScore = 0;
    const cleanToken = token.replace(/^#/, '');

    if (code === token || code === `#${cleanToken}`) {
      tokenScore += 100;
    } else if (title.includes(token)) {
      tokenScore += title.startsWith(token) ? 45 : 32;
    } else if (tags.includes(token)) {
      tokenScore += 24;
    } else if (cat.includes(token)) {
      tokenScore += 20;
    } else if (desc.includes(token)) {
      tokenScore += 12;
    } else {
      // Synonym check
      const syns = SYNONYMS[token] || [];
      for (const syn of syns) {
        if (title.includes(syn) || tags.includes(syn) || cat.includes(syn)) {
          tokenScore += 16;
          break;
        }
      }

      // Typo-tolerant fuzzy check for words >= 4 chars
      if (tokenScore === 0 && cleanToken.length >= 4) {
        const maxDist = cleanToken.length >= 7 ? 2 : 1;
        for (const word of searchableWords) {
          if (Math.abs(word.length - cleanToken.length) > maxDist) continue;
          if (levenshtein(cleanToken, word) <= maxDist) {
            tokenScore += 10;
            break;
          }
        }
      }
    }

    if (tokenScore > 0) {
      matchedTokens += 1;
      totalScore += tokenScore;
    }
  }

  // Require all tokens to match if <= 2 tokens, or at least half for longer queries
  const requiredMatches = tokens.length <= 2 ? tokens.length : Math.ceil(tokens.length * 0.6);
  if (matchedTokens < requiredMatches) return 0;

  return totalScore + matchedTokens * 5;
}

export function queryProducts(allProducts, options = {}) {
  const {
    q = '',
    category = 'all',
    sort = 'latest',
    minPrice = null,
    maxPrice = null,
    platform = 'all',
    verifiedOnly = false,
  } = options;

  const { tokens, inferredMaxPrice, inferredMinPrice, cheapIntent } = parseSmartQuery(q);
  const effectiveMin = minPrice !== null && minPrice !== '' ? Number(minPrice) : inferredMinPrice;
  const effectiveMax = maxPrice !== null && maxPrice !== '' ? Number(maxPrice) : inferredMaxPrice;

  let filtered = allProducts.filter((p) => {
    if (category && category !== 'all' && p.category_slug !== category) {
      return false;
    }
    if (verifiedOnly && !p.reliability_verified) {
      return false;
    }
    if (platform !== 'all' && PLATFORMS.includes(platform)) {
      if (!p[`${platform}_url`]) return false;
    }

    const pMin = getEffectiveMinPrice(p);
    if (effectiveMin !== null && Number.isFinite(effectiveMin)) {
      if (pMin === null || pMin < effectiveMin) return false;
    }
    if (effectiveMax !== null && Number.isFinite(effectiveMax)) {
      if (pMin === null || pMin > effectiveMax) return false;
    }
    return true;
  });

  if (tokens.length > 0) {
    filtered = filtered
      .map((p) => ({ product: p, relevance: scoreProduct(p, tokens) }))
      .filter((entry) => entry.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance)
      .map((entry) => ({ ...entry.product, _relevance: entry.relevance }));
  }

  const effectiveSort = sort === 'smart' && cheapIntent ? 'price_asc' : sort;

  const sorted = [...filtered].sort((a, b) => {
    // If searching and sort is 'relevance' or 'smart', preserve relevance primary order
    if (tokens.length > 0 && (effectiveSort === 'relevance' || effectiveSort === 'smart')) {
      return (b._relevance || 0) - (a._relevance || 0);
    }

    switch (effectiveSort) {
      case 'price_asc': {
        const pa = getEffectiveMinPrice(a) ?? Number.POSITIVE_INFINITY;
        const pb = getEffectiveMinPrice(b) ?? Number.POSITIVE_INFINITY;
        return pa - pb || b.purchase_count - a.purchase_count;
      }
      case 'price_desc': {
        const pa = getEffectiveMaxPrice(a) ?? -1;
        const pb = getEffectiveMaxPrice(b) ?? -1;
        return pb - pa || b.purchase_count - a.purchase_count;
      }
      case 'top_purchase':
        return b.purchase_count - a.purchase_count || b.reliability_score - a.reliability_score;
      case 'most_reliable':
        return (
          b.reliability_verified - a.reliability_verified ||
          b.reliability_score - a.reliability_score ||
          b.purchase_count - a.purchase_count
        );
      case 'latest':
      default:
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime() || b.id - a.id
        );
    }
  });

  return {
    items: sorted,
    appliedFilters: {
      tokens,
      inferredMaxPrice: effectiveMax,
      inferredMinPrice: effectiveMin,
    },
  };
}
