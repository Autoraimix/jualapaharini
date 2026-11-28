import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { filterCategoriesSmart } from '../utils/autoTags';

export function CategoryDropdown({ categories = [], value, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  const allCategories = categories.filter((c) => c.slug !== 'all');
  const selectedCategory = allCategories.find((c) => c.slug === value) || allCategories[0];
  const filtered = filterCategoriesSmart(categories, query);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => searchInputRef.current?.focus(), 10);

    const handleOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Select category"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 rounded-xl bg-[#FAF7F2] px-3 py-2 text-left text-sm font-semibold text-[#1D1C1A] transition hover:bg-[#EFE9E0] focus:outline-none focus:ring-2 focus:ring-[#F58C56]"
      >
        <span className="truncate">{selectedCategory?.name || 'Select category'}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#8C837A] transition-transform ${
            open ? 'rotate-180 text-[#F58C56]' : ''
          }`}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-40 mt-1.5 rounded-2xl border border-[#EFE9E0] bg-white p-2.5 shadow-xl">
          <div className="mb-2 flex items-center gap-1.5 rounded-xl bg-[#FAF7F2] px-2.5 py-2 focus-within:ring-2 focus-within:ring-[#F58C56]">
            <Search className="h-3.5 w-3.5 shrink-0 text-[#8C837A]" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Smart search category..."
              className="w-full bg-transparent text-xs font-semibold text-[#1D1C1A] placeholder:text-[#A39A91] focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear category search"
                className="text-[#8C837A] hover:text-[#1D1C1A]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div
            role="listbox"
            aria-label="Category options"
            className="max-h-56 space-y-1 overflow-y-auto pr-1"
          >
            {filtered.length === 0 ? (
              <div className="rounded-xl bg-[#FAF7F2] px-3 py-3 text-center text-xs font-semibold text-[#8C837A]">
                No matching category found.
              </div>
            ) : (
              filtered.map((c) => {
                const isSelected = c.slug === value;
                return (
                  <button
                    key={c.slug}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange?.(c.slug);
                      setOpen(false);
                      setQuery('');
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-bold transition ${
                      isSelected
                        ? 'bg-[#1E1D1B] text-white'
                        : 'bg-white text-[#1D1C1A] hover:bg-[#FFF0E6]'
                    }`}
                  >
                    <span>{c.name}</span>
                    {isSelected && <Check className="h-3.5 w-3.5 text-[#F58C56]" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
