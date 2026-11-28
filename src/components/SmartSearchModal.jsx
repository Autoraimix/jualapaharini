import React, { useState } from 'react';
import { LayoutGrid, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { CategoryDropdown } from './CategoryDropdown';

const SMART_PRESETS = [
  'earbuds under 80',
  'under 50',
  'kipas',
  'skincare',
  'coffee',
  'charger',
  '#001',
];

export function SmartSearchModal({
  query,
  category = 'all',
  categories = [],
  minPrice,
  maxPrice,
  verifiedOnly,
  platform,
  onApply,
  onClose,
}) {
  const [draftQuery, setDraftQuery] = useState(query);
  const [draftCategory, setDraftCategory] = useState(category || 'all');
  const [draftMin, setDraftMin] = useState(minPrice);
  const [draftMax, setDraftMax] = useState(maxPrice);
  const [draftVerified, setDraftVerified] = useState(verifiedOnly);
  const [draftPlatform, setDraftPlatform] = useState(platform);

  function handleSubmit(e) {
    e.preventDefault();
    onApply({
      query: draftQuery,
      category: draftCategory,
      minPrice: draftMin,
      maxPrice: draftMax,
      verifiedOnly: draftVerified,
      platform: draftPlatform,
    });
    onClose();
  }

  function handleReset() {
    setDraftQuery('');
    setDraftCategory('all');
    setDraftMin('');
    setDraftMax('');
    setDraftVerified(false);
    setDraftPlatform('all');
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="animate-sheet-up max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-[32px] bg-[#FAF7F2] p-5 pb-7 shadow-2xl sm:rounded-[32px] sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#F58C56] text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-[#1D1C1A]">Smart Search & Filters</h2>
              <p className="text-xs text-[#8C837A]">
                Try natural queries like &ldquo;earbuds under 80&rdquo; or item code &ldquo;#003&rdquo;
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#1D1C1A] shadow-sm"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Search Input */}
          <div className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-sm">
            <Search className="h-4 w-4 shrink-0 text-[#8C837A]" />
            <input
              type="text"
              value={draftQuery}
              onChange={(e) => setDraftQuery(e.target.value)}
              placeholder="Search products, synonyms (kipas, baju), or under RM50..."
              className="w-full bg-transparent text-sm font-medium text-[#1D1C1A] placeholder:text-[#A39A91] focus:outline-none"
              autoFocus
            />
            {draftQuery && (
              <button
                type="button"
                onClick={() => setDraftQuery('')}
                className="text-xs font-bold text-[#8C837A]"
              >
                Clear
              </button>
            )}
          </div>

          {/* Quick Smart Chips */}
          <div>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#78716C]">
              Quick Smart Searches
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SMART_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setDraftQuery(preset)}
                  className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#1D1C1A] shadow-sm transition hover:bg-[#FFF0E6] hover:text-[#E26D32]"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Category Filter (Searchable & Scrollable) */}
          {categories.length > 0 && (
            <div className="rounded-[24px] bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-[#1D1C1A]">
                <LayoutGrid className="h-3.5 w-3.5 text-[#F58C56]" />
                Category
              </div>
              <CategoryDropdown
                categories={categories}
                value={draftCategory}
                onChange={setDraftCategory}
                includeAll={true}
                allLabel="All Categories"
              />
            </div>
          )}

          {/* Price Range */}
          <div className="rounded-[24px] bg-white p-4 shadow-sm">
            <div className="mb-2.5 flex items-center gap-1.5 text-xs font-bold text-[#1D1C1A]">
              <SlidersHorizontal className="h-3.5 w-3.5 text-[#F58C56]" />
              Price Range (RM)
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-[#8C837A]">
                  Min (RM)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={draftMin}
                  onChange={(e) => setDraftMin(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-xl bg-[#FAF7F2] px-3 py-2 text-sm font-bold text-[#1D1C1A] focus:outline-none focus:ring-2 focus:ring-[#F58C56]"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-[#8C837A]">
                  Max (RM)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={draftMax}
                  onChange={(e) => setDraftMax(e.target.value)}
                  placeholder="500"
                  className="w-full rounded-xl bg-[#FAF7F2] px-3 py-2 text-sm font-bold text-[#1D1C1A] focus:outline-none focus:ring-2 focus:ring-[#F58C56]"
                />
              </div>
            </div>
          </div>

          {/* Platform & Reliability Toggle */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-[22px] bg-white p-3.5 shadow-sm">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#78716C]">
                Platform
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'shopee', label: 'Shopee' },
                  { id: 'tiktok', label: 'TikTok' },
                  { id: 'lazada', label: 'Lazada' },
                  { id: 'pinduoduo', label: 'Pinduoduo' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setDraftPlatform(opt.id)}
                    className={`rounded-xl px-2.5 py-1.5 text-xs font-bold transition ${
                      draftPlatform === opt.id
                        ? 'bg-[#1E1D1B] text-white'
                        : 'bg-[#FAF7F2] text-[#6E655D]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setDraftVerified((v) => !v)}
              className={`flex items-center justify-between rounded-[22px] p-3.5 text-left shadow-sm transition ${
                draftVerified ? 'bg-[#FFF0E6] ring-2 ring-[#F58C56]' : 'bg-white'
              }`}
            >
              <div>
                <div className="text-xs font-extrabold text-[#1D1C1A]">Verified Reliable</div>
                <div className="text-[11px] text-[#8C837A]">Only trusted high-rated items</div>
              </div>
              <div
                className={`flex h-6 w-10 items-center rounded-full p-0.5 transition ${
                  draftVerified ? 'bg-[#F58C56] justify-end' : 'bg-[#E2DBD1] justify-start'
                }`}
              >
                <span className="h-5 w-5 rounded-full bg-white shadow-sm" />
              </div>
            </button>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleReset}
              className="rounded-2xl bg-[#EFE9E0] px-4 py-3 text-sm font-bold text-[#6E655D] transition hover:bg-[#E5DDD1]"
            >
              Reset
            </button>
            <button
              type="submit"
              className="flex-1 rounded-2xl bg-[#1E1D1B] py-3 text-sm font-bold text-white shadow-md transition hover:bg-black"
            >
              Apply Smart Search
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
