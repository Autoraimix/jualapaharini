import React, { useEffect, useState } from 'react';
import {
  X,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Star,
  TrendingUp,
} from 'lucide-react';
import { syncProductPrices, trackPlatformClick } from '../api';
import {
  formatCompactSold,
  formatMYR,
  getActivePlatforms,
  getPriceComparison,
  getPriceStatusLabel,
} from '../utils/format';
import { ReliabilityMeter } from './ReliabilityMeter';

export function ProductModal({
  product: initialProduct,
  isFavorite,
  onToggleFavorite,
  onClose,
  onProductUpdated,
}) {
  const [product, setProduct] = useState(initialProduct);
  const [selectedImage, setSelectedImage] = useState(initialProduct?.image_url || '');
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState(null); // { type: 'success' | 'error', text: string }

  useEffect(() => {
    setProduct(initialProduct);
    setSelectedImage(initialProduct?.image_url || '');
  }, [initialProduct]);

  useEffect(() => {
    let active = true;
    async function autoSync() {
      setSyncing(true);
      try {
        const res = await syncProductPrices(initialProduct.id, false);
        if (!active) return;
        if (res.product) {
          setProduct(res.product);
          onProductUpdated?.(res.product);
        }
        if (res.syncReport && !res.syncReport.cached) {
          const updatedNames = ['shopee', 'tiktok', 'lazada', 'pinduoduo']
            .filter((k) => res.syncReport[k]?.status === 'synced')
            .map((k) => k.charAt(0).toUpperCase() + k.slice(1));
          if (updatedNames.length > 0) {
            setSyncNote({ type: 'success', text: `${updatedNames.join(' & ')} price updated` });
          }
        }
      } catch {
        // Fallback silently to stored SQLite price
      } finally {
        if (active) setSyncing(false);
      }
    }
    autoSync();
    return () => {
      active = false;
    };
  }, [initialProduct.id]);

  async function handleManualRefresh() {
    setSyncing(true);
    setSyncNote(null);
    try {
      const res = await syncProductPrices(product.id, true);
      const nextProd = res.product || product;
      if (res.product) {
        setProduct(res.product);
        onProductUpdated?.(res.product);
      }
      const platforms = ['shopee', 'tiktok', 'lazada', 'pinduoduo'];
      const anySynced = platforms.some((k) => res.syncReport?.[k]?.status === 'synced');
      const hasStoredPrices = platforms.some(
        (k) => typeof nextProd?.[`${k}_price`] === 'number' && nextProd[`${k}_price`] > 0
      );
      if (anySynced) {
        setSyncNote({ type: 'success', text: 'Live price metadata refreshed.' });
      } else if (hasStoredPrices) {
        setSyncNote({ type: 'success', text: 'Verified catalog prices are up to date.' });
      } else {
        setSyncNote({
          type: 'error',
          text: 'Live price unavailable automatically — click Buy to view store price.',
        });
      }
    } catch (err) {
      setSyncNote({ type: 'error', text: err.message });
    } finally {
      setSyncing(false);
    }
  }

  async function handlePlatformClick(platform, url) {
    try {
      const res = await trackPlatformClick(product.id, platform);
      if (res.product) {
        setProduct(res.product);
        onProductUpdated?.(res.product);
      }
    } catch {
      // Non-blocking analytics
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  const activePlatforms = getActivePlatforms(product);
  const { cheapest, cheapestName, savings } = getPriceComparison(product);
  const ratingBreakdown = activePlatforms
    .filter((pl) => pl.rating !== null)
    .map((pl) => `${pl.shortName} (★ ${pl.rating.toFixed(1)})`)
    .join(' • ');

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="animate-sheet-up relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[32px] bg-[#FAF7F2] p-5 pb-8 shadow-2xl sm:rounded-[32px] sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Controls */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold text-[#1D1C1A] shadow-sm">
              {product.code}
            </span>
            <span className="rounded-full bg-[#EFE9E0] px-3 py-1 text-xs font-semibold capitalize text-[#6E655D]">
              {product.category_slug}
            </span>
            <span className="rounded-full bg-[#FFF0E6] px-2.5 py-1 text-[11px] font-bold text-[#C85A21]">
              {activePlatforms.length} {activePlatforms.length === 1 ? 'link' : 'links'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onToggleFavorite(product.id)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm transition hover:bg-[#F3EDE4]"
              aria-label="Toggle favorite"
            >
              <Star
                className={`h-4 w-4 ${
                  isFavorite ? 'fill-[#F58C56] text-[#F58C56]' : 'text-[#78716C]'
                }`}
              />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#1D1C1A] shadow-sm transition hover:bg-[#F3EDE4]"
              aria-label="Close product details"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Product Hero Image + Extracted Gallery Thumbnails */}
        {(() => {
          let parsedGallery = [];
          try {
            const raw = product.gallery_images;
            parsedGallery = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
          } catch {
            parsedGallery = [];
          }
          const gallery = [...new Set([product.image_url, ...parsedGallery].filter(Boolean))];
          const activeSrc = selectedImage || product.image_url;
          return (
            <div className="mb-4">
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[24px] bg-white shadow-sm">
                <img
                  src={activeSrc}
                  alt={product.title}
                  className="h-full w-full object-cover"
                />
                {savings >= 1 && cheapestName && (
                  <div className="absolute bottom-3 left-3 rounded-full bg-[#1E1D1B]/90 px-3.5 py-1.5 text-xs font-bold text-white backdrop-blur-sm">
                    Best deal: {cheapestName} saves RM {savings.toFixed(2)}
                  </div>
                )}
              </div>
              {gallery.length > 1 && (
                <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1">
                  {gallery.map((imgUrl, idx) => (
                    <button
                      key={imgUrl + idx}
                      type="button"
                      onClick={() => setSelectedImage(imgUrl)}
                      className={`h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 bg-white transition ${
                        activeSrc === imgUrl
                          ? 'border-[#F58C56] ring-2 ring-[#F58C56]/25'
                          : 'border-transparent opacity-75 hover:opacity-100'
                      }`}
                    >
                      <img src={imgUrl} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Title & Trust Metrics */}
        <div className="mb-4 rounded-[24px] bg-white p-4 shadow-[0_6px_20px_rgba(32,24,16,0.04)]">
          <h2 className="text-lg font-extrabold leading-snug text-[#1D1C1A]">{product.title}</h2>
          {product.description ? (
            <p className="mt-2 text-sm leading-relaxed text-[#6E655D]">{product.description}</p>
          ) : null}

          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-[#F3EDE4] pt-3">
            <div>
              <ReliabilityMeter
                product={product}
                score={product.reliability_score}
                verified={Boolean(product.reliability_verified)}
              />
              {ratingBreakdown && (
                <div className="mt-0.5 text-[11px] text-[#8C837A]">
                  Avg from {ratingBreakdown}
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs font-semibold text-[#6E655D]">
              <span className="inline-flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5 text-[#F58C56]" />
                {formatCompactSold(product.purchase_count)}
              </span>
              {product.reliability_verified ? (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Verified
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Price Sync Bar */}
        <div className="mb-3 flex items-center justify-between px-1">
          <span className="text-xs font-bold uppercase tracking-wider text-[#78716C]">
            Available Store Links ({activePlatforms.length})
          </span>
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-bold text-[#1D1C1A] shadow-sm transition hover:bg-[#F3EDE4] disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin text-[#F58C56]' : ''}`} />
            {syncing ? 'Checking prices...' : 'Refresh Prices'}
          </button>
        </div>

        {syncNote ? (
          <div
            className={`mb-3 rounded-2xl border px-3.5 py-2 text-xs font-semibold ${
              syncNote.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-rose-200 bg-rose-50 text-rose-700'
            }`}
          >
            {syncNote.text}
          </div>
        ) : null}

        {/* Dynamic Platform Cards (1 to 4 links) */}
        <div className="space-y-2.5">
          {activePlatforms.map((pl) => {
            const badge = getPriceStatusLabel(pl.status);
            const isCheapest = cheapest === pl.id;

            return (
              <div
                key={pl.id}
                className={`rounded-[24px] bg-white p-4 shadow-[0_6px_20px_rgba(32,24,16,0.04)] ${
                  isCheapest ? 'ring-2 ring-[#F58C56]' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${pl.pillBgClass}`}
                    >
                      {pl.id === 'shopee' ? (
                        <ShoppingBag className="h-5 w-5 text-[#EE4D2D]" />
                      ) : (
                        <span className="text-xs font-black tracking-tight">{pl.badgeCode}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-extrabold text-[#1D1C1A]">{pl.name}</span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.tone}`}
                        >
                          {badge.label}
                        </span>
                        {isCheapest && (
                          <span className="rounded-full bg-[#F58C56] px-2 py-0.5 text-[10px] font-bold text-white">
                            Best Price
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className={`whitespace-nowrap text-xl font-extrabold ${pl.textClass}`}>
                          {formatMYR(pl.price)}
                        </span>
                        {pl.rating !== null && (
                          <span className="whitespace-nowrap text-xs font-bold text-[#78716C]">
                            ★ {pl.rating.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handlePlatformClick(pl.id, pl.url)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-2xl px-3.5 py-2.5 text-xs font-bold shadow-sm transition active:scale-95 ${pl.buttonClass}`}
                  >
                    Buy on {pl.shortName}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
