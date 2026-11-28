import React, { useMemo } from 'react';
import {
  ArrowUpRight,
  Bot,
  Globe,
  Package,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import { formatCompactSold, getActivePlatforms } from '../utils/format';

export function AdminOverviewBento({
  products,
  analytics,
  categories,
  chromeCdpState,
  syncingAll,
  onOpenNewProduct,
  onSyncAllPrices,
  onToggleChromeSync,
  onOpenEditProduct,
  onNavigateMenu,
  onScrollToCatalog,
}) {
  const stats = useMemo(() => {
    const totalProducts = analytics?.summary?.totalProducts ?? products.length;
    const shopeeClicks = analytics?.summary?.totalShopeeClicks ?? 0;
    const tiktokClicks = analytics?.summary?.totalTiktokClicks ?? 0;
    const lazadaClicks = analytics?.summary?.totalLazadaClicks ?? 0;
    const pddClicks = analytics?.summary?.totalPinduoduoClicks ?? 0;
    const totalClicks = shopeeClicks + tiktokClicks + lazadaClicks + pddClicks;
    const avgReliability = analytics?.summary?.avgReliability || '0.0';
    const totalPurchases =
      analytics?.summary?.totalPurchases ??
      products.reduce((sum, p) => sum + Number(p.purchase_count || 0), 0);

    let verifiedCount = 0;
    let featuredCount = 0;
    let totalLinks = 0;
    let multiLinkCount = 0;

    for (const p of products) {
      if (p.reliability_verified) verifiedCount++;
      if (p.is_featured) featuredCount++;
      const activeLinks = getActivePlatforms(p).length;
      totalLinks += activeLinks;
      if (activeLinks >= 2) multiLinkCount++;
    }

    const singleLinkCount = Math.max(0, products.length - multiLinkCount);
    const verifiedPct =
      products.length > 0 ? Math.round((verifiedCount / products.length) * 100) : 0;

    const categoryRows = categories
      .filter((c) => c.slug !== 'all')
      .map((cat) => {
        const items = products.filter((p) => p.category_slug === cat.slug);
        const avgScore =
          items.length > 0
            ? (
                items.reduce((acc, item) => acc + Number(item.reliability_score || 0), 0) /
                items.length
              ).toFixed(1)
            : '0.0';
        return {
          slug: cat.slug,
          name: cat.name,
          count: items.length,
          avgScore,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);

    const barItems = [
      { label: 'SHP', full: 'Shopee', value: shopeeClicks, tone: 'primary' },
      { label: 'TT', full: 'TikTok', value: tiktokClicks, tone: 'dark' },
      { label: 'LZD', full: 'Lazada', value: lazadaClicks, tone: 'soft' },
      { label: 'PDD', full: 'Pinduoduo', value: pddClicks, tone: 'striped' },
      { label: 'VER', full: 'Verified', value: verifiedCount, tone: 'primary' },
      { label: 'FEA', full: 'Featured', value: featuredCount, tone: 'dark' },
      { label: '2+L', full: 'Multi-Link', value: multiLinkCount, tone: 'striped' },
    ];
    const maxBarValue = Math.max(1, ...barItems.map((b) => b.value));
    const peakIndex = barItems.reduce(
      (best, item, idx, arr) => (item.value > arr[best].value ? idx : best),
      0
    );

    return {
      totalProducts,
      shopeeClicks,
      tiktokClicks,
      lazadaClicks,
      pddClicks,
      totalClicks,
      avgReliability,
      totalPurchases,
      verifiedCount,
      featuredCount,
      totalLinks,
      multiLinkCount,
      singleLinkCount,
      verifiedPct,
      categoryRows,
      barItems,
      maxBarValue,
      peakIndex,
    };
  }, [analytics, categories, products]);

  const topDeals = useMemo(() => {
    if (analytics?.topClicked?.length) {
      return analytics.topClicked.slice(0, 5).map((item) => {
        const full = products.find((p) => p.id === item.id);
        return {
          ...item,
          product: full || item,
        };
      });
    }
    return products.slice(0, 5).map((p) => ({
      id: p.id,
      code: p.code,
      title: p.title,
      total_clicks:
        Number(p.shopee_clicks || 0) +
        Number(p.tiktok_clicks || 0) +
        Number(p.lazada_clicks || 0) +
        Number(p.pinduoduo_clicks || 0),
      product: p,
    }));
  }, [analytics, products]);

  // Semi-circle gauge arc calculation (radius = 74, semi-circumference = pi * 74 ≈ 232.48)
  const gaugeRadius = 74;
  const semiCircumference = Math.PI * gaugeRadius;
  const filledArc = (stats.verifiedPct / 100) * semiCircumference;

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Row 1: 4 KPI Stat Cards (2x2 Bento on mobile, 4-col on desktop) */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 xl:grid-cols-4">
        {/* Hero Primary Card (Current System Orange Gradient) */}
        <div className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-[#F58C56] to-[#D9682E] p-3.5 text-white shadow-[0_10px_28px_rgba(245,140,86,0.28)] sm:rounded-[24px] sm:p-5">
          <div className="flex items-start justify-between gap-1.5">
            <span className="text-xs font-bold text-white/95 sm:text-sm">Total Products</span>
            <button
              type="button"
              onClick={onScrollToCatalog}
              aria-label="Jump to catalog"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[#1D1C1A] transition hover:scale-105 sm:h-8 sm:w-8"
            >
              <ArrowUpRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>
          </div>
          <div className="mt-1.5 text-2xl font-extrabold tracking-tight sm:mt-2 sm:text-4xl">
            {stats.totalProducts}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-1 text-[10px] font-semibold text-white/90 sm:mt-3 sm:gap-1.5 sm:text-[11px]">
            <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[10px] font-extrabold">
              {stats.verifiedPct}%
            </span>
            <span className="truncate">{stats.verifiedCount} verified</span>
          </div>
        </div>

        {/* Store Clicks */}
        <div className="rounded-[22px] border border-[#EFE9E0] bg-white p-3.5 shadow-[0_6px_22px_rgba(32,24,16,0.04)] sm:rounded-[24px] sm:p-5">
          <div className="flex items-start justify-between gap-1.5">
            <span className="text-xs font-bold text-[#1D1C1A] sm:text-sm">Store Clicks</span>
            <button
              type="button"
              onClick={onScrollToCatalog}
              aria-label="View clicked items"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#EFE9E0] bg-[#FAF7F2] text-[#1D1C1A] transition hover:bg-[#FFF0E6] hover:text-[#C85A21] sm:h-8 sm:w-8"
            >
              <ArrowUpRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>
          </div>
          <div className="mt-1.5 text-2xl font-extrabold tracking-tight text-[#1D1C1A] sm:mt-2 sm:text-4xl">
            {stats.totalClicks}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-1 text-[10px] font-semibold text-[#8C837A] sm:mt-3 sm:gap-1.5 sm:text-[11px]">
            <span className="rounded-md bg-[#FFF0EA] px-1.5 py-0.5 text-[10px] font-extrabold text-[#EE4D2D]">
              SHP {stats.shopeeClicks}
            </span>
            <span>TT {stats.tiktokClicks}</span>
          </div>
        </div>

        {/* Attached Platform Links */}
        <div className="rounded-[22px] border border-[#EFE9E0] bg-white p-3.5 shadow-[0_6px_22px_rgba(32,24,16,0.04)] sm:rounded-[24px] sm:p-5">
          <div className="flex items-start justify-between gap-1.5">
            <span className="text-xs font-bold text-[#1D1C1A] sm:text-sm">Active Links</span>
            <button
              type="button"
              onClick={onOpenNewProduct}
              aria-label="Quick add store link"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#EFE9E0] bg-[#FAF7F2] text-[#1D1C1A] transition hover:bg-[#FFF0E6] hover:text-[#C85A21] sm:h-8 sm:w-8"
            >
              <ArrowUpRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>
          </div>
          <div className="mt-1.5 text-2xl font-extrabold tracking-tight text-[#1D1C1A] sm:mt-2 sm:text-4xl">
            {stats.totalLinks}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-1 text-[10px] font-semibold text-[#8C837A] sm:mt-3 sm:gap-1.5 sm:text-[11px]">
            <span className="rounded-md bg-[#FAF7F2] px-1.5 py-0.5 text-[10px] font-extrabold text-[#1D1C1A]">
              LZD {stats.lazadaClicks}
            </span>
            <span>PDD {stats.pddClicks}</span>
          </div>
        </div>

        {/* Avg Reliability */}
        <div className="rounded-[22px] border border-[#EFE9E0] bg-white p-3.5 shadow-[0_6px_22px_rgba(32,24,16,0.04)] sm:rounded-[24px] sm:p-5">
          <div className="flex items-start justify-between gap-1.5">
            <span className="text-xs font-bold text-[#1D1C1A] sm:text-sm">Average Trust</span>
            <button
              type="button"
              onClick={onScrollToCatalog}
              aria-label="Inspect trust ratings"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#EFE9E0] bg-[#FAF7F2] text-[#1D1C1A] transition hover:bg-[#FFF0E6] hover:text-[#C85A21] sm:h-8 sm:w-8"
            >
              <ArrowUpRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>
          </div>
          <div className="mt-1.5 text-2xl font-extrabold tracking-tight text-[#1D1C1A] sm:mt-2 sm:text-4xl">
            ★ {stats.avgReliability}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-1 text-[10px] font-semibold text-[#8C837A] sm:mt-3 sm:gap-1.5 sm:text-[11px]">
            <span className="rounded-md bg-[#FFF0E6] px-1.5 py-0.5 text-[10px] font-extrabold text-[#C85A21]">
              {stats.featuredCount}
            </span>
            <span>Featured deals</span>
          </div>
        </div>
      </div>

      {/* Row 2: Analytics Bar Chart + Quick Sync Actions + Top Clicked Deals */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-12">
        {/* Platform & Catalog Analytics Capsule Bars */}
        <section className="rounded-[22px] border border-[#EFE9E0] bg-white p-4 shadow-[0_6px_22px_rgba(32,24,16,0.04)] sm:rounded-[24px] sm:p-5 lg:col-span-5">
          <div className="mb-3 flex items-center justify-between gap-2 sm:mb-4">
            <div>
              <h3 className="text-sm font-extrabold text-[#1D1C1A]">Catalog &amp; Click Analytics</h3>
              <p className="text-[11px] font-medium text-[#8C837A]">
                Live clicks &amp; quality signals across platforms
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-[#FAF7F2] px-2.5 py-1 text-[10px] font-bold text-[#6E655D] sm:text-[11px]">
              Live SQLite
            </span>
          </div>

          <div className="grid h-36 grid-cols-7 items-end gap-1.5 pt-6 sm:h-44 sm:gap-2.5">
            {stats.barItems.map((bar, idx) => {
              const pct = Math.max(22, Math.round((bar.value / stats.maxBarValue) * 100));
              const isPeak = idx === stats.peakIndex && bar.value > 0;
              return (
                <div
                  key={bar.label}
                  title={`${bar.full}: ${bar.value}`}
                  className="flex h-full flex-col items-center justify-end gap-2"
                >
                  <div className="relative flex w-full flex-1 items-end justify-center">
                    {isPeak && (
                      <span className="absolute -top-6 rounded-full bg-[#1E1D1B] px-1.5 py-0.5 text-[10px] font-extrabold text-white shadow-sm">
                        {bar.value}
                      </span>
                    )}
                    <div
                      className={`w-full max-w-[34px] rounded-full transition-all ${
                        bar.tone === 'primary'
                          ? 'bg-[#F58C56]'
                          : bar.tone === 'dark'
                            ? 'bg-[#1E1D1B]'
                            : bar.tone === 'soft'
                              ? 'bg-[#F9B48F]'
                              : ''
                      }`}
                      style={{
                        height: `${pct}%`,
                        ...(bar.tone === 'striped'
                          ? {
                              backgroundImage:
                                'repeating-linear-gradient(135deg, #EFE9E0 0px, #EFE9E0 4px, #D6CEC3 4px, #D6CEC3 6px)',
                            }
                          : {}),
                      }}
                    />
                  </div>
                  <span className="text-[11px] font-bold text-[#8C837A]">{bar.label}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Quick Sync & Chrome Reminders Card */}
        <section className="flex flex-col justify-between rounded-[24px] border border-[#EFE9E0] bg-white p-5 shadow-[0_6px_22px_rgba(32,24,16,0.04)] lg:col-span-3">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-[#1D1C1A]">Price &amp; Chrome Sync</h3>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  chromeCdpState.connected
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-[#FAF7F2] text-[#6E655D]'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    chromeCdpState.connected ? 'bg-emerald-500' : 'bg-[#A39A91]'
                  }`}
                />
                {chromeCdpState.connected ? 'CDP Ready' : 'Standby'}
              </span>
            </div>

            <div className="text-base font-extrabold leading-snug text-[#1D1C1A]">
              Keep storefront pricing &amp; stock fresh
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-[#8C837A]">
              Run bulk Real Chrome extraction or refresh API metadata across all attached links.
            </p>
          </div>

          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={onToggleChromeSync}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-[#F58C56] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#e57c45]"
            >
              <Globe className="h-3.5 w-3.5" /> Real Chrome Bulk Sync
            </button>
            <button
              type="button"
              onClick={onSyncAllPrices}
              disabled={syncingAll}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-[#FAF7F2] px-4 py-2.5 text-xs font-bold text-[#1D1C1A] transition hover:bg-[#EFE9E0] disabled:opacity-60"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${syncingAll ? 'animate-spin text-[#F58C56]' : ''}`}
              />
              {syncingAll ? 'Syncing All...' : 'Sync All Prices'}
            </button>
          </div>
        </section>

        {/* Top Clicked Deals List Card */}
        <section className="rounded-[24px] border border-[#EFE9E0] bg-white p-5 shadow-[0_6px_22px_rgba(32,24,16,0.04)] lg:col-span-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-extrabold text-[#1D1C1A]">Top Clicked</h3>
            <button
              type="button"
              onClick={onOpenNewProduct}
              aria-label="Create new item"
              className="inline-flex items-center gap-1 rounded-full border border-[#EFE9E0] bg-[#FAF7F2] px-2.5 py-1 text-[11px] font-bold text-[#1D1C1A] transition hover:bg-[#FFF0E6] hover:text-[#C85A21]"
            >
              <Plus className="h-3 w-3" /> New
            </button>
          </div>

          {topDeals.length === 0 ? (
            <div className="rounded-2xl bg-[#FAF7F2] p-4 text-center text-xs font-semibold text-[#8C837A]">
              No products in catalog yet.
            </div>
          ) : (
            <div className="space-y-2.5">
              {topDeals.map((item, idx) => (
                <button
                  key={item.id || idx}
                  type="button"
                  onClick={() => item.product?.id && onOpenEditProduct(item.product)}
                  className="flex w-full items-center gap-3 rounded-2xl p-1.5 text-left transition hover:bg-[#FAF7F2]"
                >
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-extrabold ${
                      idx === 0
                        ? 'bg-[#FFF0E6] text-[#C85A21]'
                        : idx === 1
                          ? 'bg-[#1E1D1B] text-white'
                          : 'bg-[#FAF7F2] text-[#6E655D]'
                    }`}
                  >
                    {item.code || `#${idx + 1}`}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-bold text-[#1D1C1A]">{item.title}</div>
                    <div className="text-[11px] text-[#8C837A]">
                      {item.total_clicks || 0} outbound click(s)
                    </div>
                  </div>
                  <TrendingUp className="h-3.5 w-3.5 shrink-0 text-[#F58C56]" />
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Row 3: Category Breakdown + Catalog Trust Gauge + Dark AI Hub Card */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Category Breakdown */}
        <section className="rounded-[24px] border border-[#EFE9E0] bg-white p-5 shadow-[0_6px_22px_rgba(32,24,16,0.04)] lg:col-span-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-extrabold text-[#1D1C1A]">Category Breakdown</h3>
            <button
              type="button"
              onClick={onScrollToCatalog}
              className="inline-flex items-center gap-1 rounded-full border border-[#EFE9E0] bg-[#FAF7F2] px-2.5 py-1 text-[11px] font-bold text-[#1D1C1A] hover:bg-[#EFE9E0]"
            >
              <Package className="h-3 w-3" /> Browse All
            </button>
          </div>

          <div className="space-y-2.5">
            {stats.categoryRows.map((cat, idx) => (
              <div
                key={cat.slug}
                className="flex items-center justify-between gap-3 rounded-2xl bg-[#FAF7F2] px-3.5 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
                      idx % 2 === 0
                        ? 'bg-[#FFF0E6] text-[#C85A21]'
                        : 'bg-[#1E1D1B] text-white'
                    }`}
                  >
                    {cat.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-bold text-[#1D1C1A]">{cat.name}</div>
                    <div className="text-[11px] text-[#8C837A]">
                      {cat.count} product(s) • ★ {cat.avgScore} avg
                    </div>
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                    cat.count > 0
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-white text-[#8C837A]'
                  }`}
                >
                  {cat.count > 0 ? 'Active' : 'Empty'}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Semi-Circular Verification & Link Coverage Gauge */}
        <section className="flex flex-col justify-between rounded-[24px] border border-[#EFE9E0] bg-white p-5 shadow-[0_6px_22px_rgba(32,24,16,0.04)] lg:col-span-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-[#1D1C1A]">Verification Coverage</h3>
            <ShieldCheck className="h-4 w-4 text-[#F58C56]" />
          </div>

          <div className="my-2 flex flex-col items-center justify-center">
            <svg viewBox="0 0 180 105" className="w-48 overflow-visible" aria-hidden="true">
              <defs>
                <pattern
                  id="hjaGaugeStripe"
                  width="6"
                  height="6"
                  patternTransform="rotate(45 0 0)"
                  patternUnits="userSpaceOnUse"
                >
                  <rect width="6" height="6" fill="#FAF7F2" />
                  <line x1="0" y1="0" x2="0" y2="6" stroke="#D6CEC3" strokeWidth="2.5" />
                </pattern>
              </defs>
              {/* Background Track */}
              <path
                d="M 16 90 A 74 74 0 0 1 164 90"
                fill="none"
                stroke="url(#hjaGaugeStripe)"
                strokeWidth="22"
                strokeLinecap="round"
              />
              {/* Active Orange Progress Arc */}
              <path
                d="M 16 90 A 74 74 0 0 1 164 90"
                fill="none"
                stroke="#F58C56"
                strokeWidth="22"
                strokeLinecap="round"
                strokeDasharray={`${filledArc} ${semiCircumference}`}
              />
              <text
                x="90"
                y="76"
                textAnchor="middle"
                className="fill-[#1D1C1A] text-[28px] font-extrabold"
              >
                {stats.verifiedPct}%
              </text>
              <text
                x="90"
                y="95"
                textAnchor="middle"
                className="fill-[#8C837A] text-[10px] font-semibold"
              >
                Catalog Verified
              </text>
            </svg>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] font-semibold text-[#6E655D]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#F58C56]" />
              Verified ({stats.verifiedCount})
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#1E1D1B]" />
              2+ Links ({stats.multiLinkCount})
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#D6CEC3]" />
              1 Link ({stats.singleLinkCount})
            </span>
          </div>
        </section>

        {/* Dark Contrast Card (Matching Donezo Bottom-Right Dark Card in System Charcoal + Orange) */}
        <section className="relative flex flex-col justify-between overflow-hidden rounded-[24px] bg-[#1E1D1B] p-5 text-white shadow-[0_14px_34px_rgba(18,16,14,0.22)] lg:col-span-3">
          <div
            className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full opacity-25 blur-2xl"
            style={{ background: 'radial-gradient(circle, #F58C56 0%, transparent 70%)' }}
          />
          <div className="relative">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#B5AEA6]">AI &amp; Social Reach</span>
              <Sparkles className="h-4 w-4 text-[#F58C56]" />
            </div>
            <div className="mt-3 text-3xl font-extrabold tracking-tight text-white">
              {formatCompactSold(stats.totalPurchases)}
            </div>
            <p className="mt-1 text-[11px] text-[#A69F98]">
              Combined tracked sales across catalog
            </p>
          </div>

          <div className="relative mt-5 flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => onNavigateMenu('posting')}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[#F58C56] px-3 py-2.5 text-xs font-bold text-white transition hover:bg-[#e57c45]"
            >
              <Bot className="h-3.5 w-3.5" /> AI Posting
            </button>
            <button
              type="button"
              onClick={() => onNavigateMenu('personas')}
              aria-label="Open Personas"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            >
              <Users className="h-4 w-4" />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
