import React from 'react';
import { ShieldCheck, Star, Flame } from 'lucide-react';
import {
  formatCompactSold,
  formatMYR,
  getActivePlatforms,
  getPriceComparison,
} from '../utils/format';
import { ReliabilityMeter } from './ReliabilityMeter';

export function ProductCard({ product, isFavorite, onToggleFavorite, onSelect }) {
  const activePlatforms = getActivePlatforms(product);
  const { cheapest, cheapestName, savings } = getPriceComparison(product);
  const linkCount = activePlatforms.length;

  return (
    <article
      onClick={() => onSelect(product)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(product);
        }
      }}
      className="group relative flex cursor-pointer flex-col rounded-[24px] bg-white p-3.5 shadow-[0_8px_28px_rgba(32,24,16,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(32,24,16,0.09)] active:scale-[0.99]"
    >
      {/* Top Row: Title + Code + Favorite */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-[#F5EFE6] px-2 py-0.5 text-[11px] font-bold text-[#786E65]">
              {product.code}
            </span>
            {product.is_featured ? (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-[#FFF0E6] px-2 py-0.5 text-[10px] font-bold text-[#E26D32]">
                <Flame className="h-3 w-3" /> Viral
              </span>
            ) : null}
            {product.reliability_verified ? (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                <ShieldCheck className="h-3 w-3" /> Trusted
              </span>
            ) : null}
          </div>
          <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-[#1D1C1A]">
            {product.title}
          </h3>
          <p className="mt-0.5 text-xs font-medium text-[#8C837A]">
            {formatCompactSold(product.purchase_count)} • {linkCount}{' '}
            {linkCount === 1 ? 'store' : 'stores'}
          </p>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(product.id);
          }}
          aria-label={isFavorite ? 'Remove from saved' : 'Save product'}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FAF7F2] text-[#1D1C1A] transition hover:bg-[#F3EDE4]"
        >
          <Star
            className={`h-4 w-4 transition ${
              isFavorite ? 'fill-[#F58C56] text-[#F58C56]' : 'text-[#78716C]'
            }`}
          />
        </button>
      </div>

      {/* Center Image */}
      <div className="relative mb-3 aspect-[4/3] w-full overflow-hidden rounded-[20px] bg-[#F7F3EE]">
        <img
          src={product.image_url}
          alt={product.title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        {savings >= 1 && cheapestName && (
          <div className="absolute bottom-2.5 left-2.5 rounded-full bg-[#1E1D1B]/85 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
            Save RM {savings.toFixed(2)} on {cheapestName}
          </div>
        )}
      </div>

      {/* Bottom Row: Reliability Gauge + Dynamic 1-4 Platform Prices */}
      <div className="mt-auto flex flex-col gap-2 border-t border-[#F3EDE4] pt-2.5">
        <div className="flex items-center justify-between gap-1.5">
          <ReliabilityMeter
            product={product}
            score={product.reliability_score}
            verified={Boolean(product.reliability_verified)}
          />
          <span className="hidden text-[11px] font-semibold text-[#8C837A] 2xl:inline">
            Links →
          </span>
        </div>

        <div
          className={`grid gap-1.5 ${
            linkCount === 1 ? 'grid-cols-1' : 'grid-cols-2'
          }`}
        >
          {activePlatforms.map((pl, idx) => {
            const isCheapest = cheapest === pl.id;
            const spanFullRow = linkCount === 1 || (linkCount === 3 && idx === 2);

            return (
              <div
                key={pl.id}
                className={`flex rounded-2xl px-2.5 py-1.5 text-[11px] ${
                  spanFullRow ? 'col-span-full flex-row items-center justify-between' : 'flex-col'
                } ${
                  isCheapest
                    ? 'bg-[#FFF1EA] ring-1 ring-[#F58C56]/60'
                    : 'bg-[#FAF7F2]'
                }`}
              >
                <span className={`text-[10px] font-bold ${pl.textClass}`}>
                  {pl.shortName}
                </span>
                <span className="whitespace-nowrap font-extrabold text-[#1D1C1A]">
                  {formatMYR(pl.price)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </article>
  );
}
