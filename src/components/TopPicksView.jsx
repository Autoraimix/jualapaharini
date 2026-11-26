import React, { useMemo, useState } from 'react';
import { ShieldCheck, TrendingUp, Tag, ArrowRight } from 'lucide-react';
import { SegmentedArchGauge } from './ReliabilityMeter';
import { formatCompactSold, formatMYR, getPriceComparison } from '../utils/format';

export function TopPicksView({ products, onSelectProduct }) {
  const [rankTab, setRankTab] = useState('top_purchase');

  const stats = useMemo(() => {
    if (!products.length) {
      return { avgScore: '0.0', filled: 0, totalSold: 0, verifiedPct: 0 };
    }
    const avg =
      products.reduce((acc, p) => acc + Number(p.reliability_score || 0), 0) / products.length;
    const totalSold = products.reduce((acc, p) => acc + Number(p.purchase_count || 0), 0);
    const verifiedCount = products.filter((p) => p.reliability_verified).length;
    return {
      avgScore: avg.toFixed(1),
      filled: Math.min(10, Math.max(1, Math.round((avg / 5) * 10))),
      totalSold,
      verifiedPct: Math.round((verifiedCount / products.length) * 100),
    };
  }, [products]);

  const ranked = useMemo(() => {
    const copy = [...products];
    if (rankTab === 'most_reliable') {
      return copy.sort(
        (a, b) =>
          b.reliability_verified - a.reliability_verified ||
          b.reliability_score - a.reliability_score ||
          b.purchase_count - a.purchase_count
      );
    }
    if (rankTab === 'best_savings') {
      return copy.sort(
        (a, b) => getPriceComparison(b).savings - getPriceComparison(a).savings
      );
    }
    return copy.sort((a, b) => b.purchase_count - a.purchase_count);
  }, [products, rankTab]);

  return (
    <div className="space-y-4">
      {/* Gauge Summary Card (Inspired by sample left dashboard) */}
      <section className="rounded-[28px] bg-white p-5 shadow-[0_8px_28px_rgba(32,24,16,0.05)]">
        <div className="mb-1 text-center text-xs font-bold uppercase tracking-wider text-[#8C837A]">
          Catalog Trust & Deals Overview
        </div>
        <SegmentedArchGauge
          totalSegments={10}
          filledSegments={stats.filled}
          centerValue={`${stats.avgScore} / 5`}
          centerLabel="Reliability"
          subLabel={`${stats.verifiedPct}% verified sellers • ${formatCompactSold(stats.totalSold)}`}
        />

        {/* Metric Switch Pills */}
        <div className="mt-5 grid grid-cols-3 gap-2 rounded-2xl bg-[#F7F3EE] p-1.5">
          {[
            { id: 'top_purchase', label: 'Top Purchase', icon: TrendingUp },
            { id: 'most_reliable', label: 'Most Reliable', icon: ShieldCheck },
            { id: 'best_savings', label: 'Best Savings', icon: Tag },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = rankTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRankTab(tab.id)}
                className={`flex items-center justify-center gap-1 rounded-xl px-2 py-2 text-[11px] font-bold transition ${
                  active ? 'bg-white text-[#1D1C1A] shadow-sm' : 'text-[#78716C]'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${active ? 'text-[#F58C56]' : ''}`} />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Ranked List Cards */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {ranked.map((product, index) => {
          const { cheapestName, lowestPrice, savings } = getPriceComparison(product);
          return (
            <button
              key={product.id}
              type="button"
              onClick={() => onSelectProduct(product)}
              className="flex w-full items-center gap-3.5 rounded-[24px] bg-white p-3.5 text-left shadow-[0_6px_20px_rgba(32,24,16,0.04)] transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
                  index < 3
                    ? 'bg-[#F58C56] text-white'
                    : 'bg-[#F3EDE4] text-[#6E655D]'
                }`}
              >
                {index + 1}
              </div>

              <img
                src={product.image_url}
                alt={product.title}
                className="h-14 w-14 shrink-0 rounded-2xl object-cover"
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-[#8C837A]">{product.code}</span>
                  <span className="text-[11px] font-bold text-[#F58C56]">
                    ★ {Number(product.reliability_score).toFixed(1)}
                  </span>
                </div>
                <div className="truncate text-sm font-bold text-[#1D1C1A]">{product.title}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[#78716C]">
                  <span>{formatCompactSold(product.purchase_count)}</span>
                  {savings >= 1 && cheapestName && (
                    <span className="font-semibold text-emerald-700">
                      Save RM {savings.toFixed(2)} ({cheapestName})
                    </span>
                  )}
                </div>
              </div>

              <div className="shrink-0 text-right">
                <div className="text-sm font-extrabold text-[#1D1C1A]">
                  {formatMYR(lowestPrice)}
                </div>
                <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-[#F58C56]">
                  Links <ArrowRight className="h-3 w-3" />
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
