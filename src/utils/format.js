export const PLATFORM_LIST = [
  {
    id: 'shopee',
    name: 'Shopee',
    shortName: 'Shopee',
    badgeCode: 'SP',
    textClass: 'text-[#EE4D2D]',
    pillBgClass: 'bg-[#FFF0EA]',
    buttonClass: 'bg-[#EE4D2D] hover:bg-[#d94122] text-white',
    cardBgTint: 'bg-[#FFF6F2]',
    urlPlaceholder: 'https://shopee.com.my/...',
  },
  {
    id: 'tiktok',
    name: 'TikTok Shop',
    shortName: 'TikTok',
    badgeCode: 'TT',
    textClass: 'text-[#1D1C1A]',
    pillBgClass: 'bg-[#1E1D1B] text-white',
    buttonClass: 'bg-[#1E1D1B] hover:bg-black text-white',
    cardBgTint: 'bg-[#F5F3F0]',
    urlPlaceholder: 'https://vt.tiktok.com/... or tiktok.com/...',
  },
  {
    id: 'lazada',
    name: 'Lazada',
    shortName: 'Lazada',
    badgeCode: 'LZ',
    textClass: 'text-[#1E40AF]',
    pillBgClass: 'bg-[#EBF2FF] text-[#1E40AF]',
    buttonClass: 'bg-[#1E40AF] hover:bg-[#1E3A8A] text-white',
    cardBgTint: 'bg-[#F3F7FF]',
    urlPlaceholder: 'https://www.lazada.com.my/...',
  },
  {
    id: 'pinduoduo',
    name: 'Pinduoduo',
    shortName: 'Pinduoduo',
    badgeCode: 'PDD',
    textClass: 'text-[#D9261C]',
    pillBgClass: 'bg-[#FFEAEA] text-[#D9261C]',
    buttonClass: 'bg-[#D9261C] hover:bg-[#b81d14] text-white',
    cardBgTint: 'bg-[#FFF4F4]',
    urlPlaceholder: 'https://mobile.yangkeduo.com/... or pinduoduo.com/...',
  },
];

export const PLATFORM_MAP = Object.fromEntries(PLATFORM_LIST.map((p) => [p.id, p]));

export function formatMYR(price) {
  if (price === null || price === undefined || Number.isNaN(Number(price))) {
    return 'Check link';
  }
  return `RM ${Number(price).toFixed(2)}`;
}

export function formatCompactSold(count) {
  const n = Number(count || 0);
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k sold`;
  }
  return `${n} sold`;
}

export function getActivePlatforms(product) {
  if (!product) return [];
  return PLATFORM_LIST.filter((pl) => String(product[`${pl.id}_url`] || '').trim().length > 0).map(
    (pl) => ({
      ...pl,
      url: product[`${pl.id}_url`],
      price: typeof product[`${pl.id}_price`] === 'number' ? product[`${pl.id}_price`] : null,
      status: product[`${pl.id}_price_status`] || 'manual',
      rating:
        product[`${pl.id}_rating`] !== null && product[`${pl.id}_rating`] !== undefined
          ? Number(product[`${pl.id}_rating`])
          : null,
      clicks: Number(product[`${pl.id}_clicks`] || 0),
    })
  );
}

export function getPriceComparison(product) {
  const active = getActivePlatforms(product).filter(
    (pl) => typeof pl.price === 'number' && Number.isFinite(pl.price) && pl.price > 0
  );

  if (active.length === 0) {
    return { cheapest: null, cheapestName: null, lowestPrice: null, highestPrice: null, savings: 0 };
  }

  const sorted = [...active].sort((a, b) => a.price - b.price);
  const lowest = sorted[0];
  const highest = sorted[sorted.length - 1];
  const savings = Math.max(0, highest.price - lowest.price);

  if (active.length === 1 || savings < 0.01) {
    return {
      cheapest: active.length > 1 ? 'same' : lowest.id,
      cheapestName: lowest.shortName,
      lowestPrice: lowest.price,
      highestPrice: highest.price,
      savings: 0,
    };
  }

  return {
    cheapest: lowest.id,
    cheapestName: lowest.shortName,
    lowestPrice: lowest.price,
    highestPrice: highest.price,
    savings,
  };
}

export function getReliabilitySegments(score) {
  const s = Number(score || 0);
  if (s >= 4.85) return 5;
  if (s >= 4.5) return 4;
  if (s >= 4.0) return 3;
  if (s >= 3.0) return 2;
  return 1;
}

export function getPriceStatusLabel(status) {
  switch (status) {
    case 'synced':
      return { label: 'Live synced', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'cached':
      return { label: 'Auto-cached', tone: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'blocked':
      return { label: 'Stored price', tone: 'bg-[#F3EDE4] text-[#6E655D] border-[#E4DDD3]' };
    default:
      return { label: 'Verified price', tone: 'bg-[#F3EDE4] text-[#6E655D] border-[#E4DDD3]' };
  }
}
