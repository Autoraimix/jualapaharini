import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Download,
  Home,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  TrendingUp,
  X,
} from 'lucide-react';
import { fetchProducts, fetchStoreInfo } from './api';
import { ProductCard } from './components/ProductCard';
import { ProductModal } from './components/ProductModal';
import { SmartSearchModal } from './components/SmartSearchModal';
import { TopPicksView } from './components/TopPicksView';
import { AdminDashboard } from './components/AdminDashboard';

const FAVORITES_KEY = 'hja_favorites';

const CATEGORY_IMAGES = {
  all: '/categories/all.jpg',
  tech: '/categories/tech.jpg',
  home: '/categories/home.jpg',
  kitchen: '/categories/kitchen.svg',
  beauty: '/categories/beauty.svg',
  fashion: '/categories/fashion.svg',
  fitness: '/categories/fitness.svg',
};

const SORT_OPTIONS = [
  { id: 'latest', label: 'Latest' },
  { id: 'price_asc', label: 'Price: Low → High' },
  { id: 'price_desc', label: 'Price: High → Low' },
  { id: 'top_purchase', label: 'Top Purchase' },
  { id: 'most_reliable', label: 'Most Reliable' },
];

function isAdminUrl() {
  const path = window.location.pathname.replace(/\/+$/, '').toLowerCase();
  const hash = window.location.hash.toLowerCase();
  return path === '/admin' || hash === '#/admin';
}

export default function App() {
  const [activeTab, setActiveTab] = useState(() => (isAdminUrl() ? 'admin' : 'home')); // 'home' | 'top' | 'saved' | 'admin'
  const [storeSettings, setStoreSettings] = useState({
    store_name: 'HariniJualApa',
    store_handle: '@harinijualapa',
    store_tagline: 'Curated daily finds — compare Shopee & TikTok prices.',
  });
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [allProductsCache, setAllProductsCache] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Search & filter states
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('latest');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [platformFilter, setPlatformFilter] = useState('all');
  const [appliedInfo, setAppliedInfo] = useState(null);

  // Modals & notifications
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showSmartModal, setShowSmartModal] = useState(false);
  const [showDropsToast, setShowDropsToast] = useState(false);

  // PWA install prompt
  const [installPrompt, setInstallPrompt] = useState(null);

  // Favorites
  const [favorites, setFavorites] = useState(() => {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    const onRouteChange = () => {
      setActiveTab(isAdminUrl() ? 'admin' : 'home');
    };
    window.addEventListener('popstate', onRouteChange);
    window.addEventListener('hashchange', onRouteChange);
    return () => {
      window.removeEventListener('popstate', onRouteChange);
      window.removeEventListener('hashchange', onRouteChange);
    };
  }, []);

  function navigateTab(tab) {
    setActiveTab(tab);
    const targetPath = tab === 'admin' ? '/admin' : '/';
    if (window.location.pathname !== targetPath || window.location.hash) {
      window.history.pushState(null, '', targetPath);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
    }, 220);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadStoreMeta = useCallback(async () => {
    try {
      const info = await fetchStoreInfo();
      if (info.settings) setStoreSettings((prev) => ({ ...prev, ...info.settings }));
      if (info.categories) setCategories(info.categories);
    } catch {
      // Fallback gracefully if offline
    }
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchProducts({
        q: debouncedQuery,
        category: selectedCategory,
        sort: sortBy,
        minPrice,
        maxPrice,
        platform: platformFilter,
        verifiedOnly,
      });
      setProducts(res.products || []);
      setAppliedInfo(res.appliedFilters || null);
    } catch (err) {
      setError(err.message || 'Could not load products.');
    } finally {
      setLoading(false);
    }
  }, [
    debouncedQuery,
    selectedCategory,
    sortBy,
    minPrice,
    maxPrice,
    platformFilter,
    verifiedOnly,
  ]);

  const loadFullCatalog = useCallback(async () => {
    try {
      const res = await fetchProducts({ sort: 'latest' });
      setAllProductsCache(res.products || []);
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    loadStoreMeta();
    loadFullCatalog();
  }, [loadStoreMeta, loadFullCatalog]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  function toggleFavorite(id) {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      return next;
    });
  }

  function handleProductUpdated(updated) {
    setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setAllProductsCache((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  async function handleInstallPwa() {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  function clearAllFilters() {
    setSearchInput('');
    setDebouncedQuery('');
    setSelectedCategory('all');
    setSortBy('latest');
    setMinPrice('');
    setMaxPrice('');
    setVerifiedOnly(false);
    setPlatformFilter('all');
  }

  const savedProducts = useMemo(() => {
    const source = allProductsCache.length ? allProductsCache : products;
    return source.filter((p) => favorites.includes(p.id));
  }, [allProductsCache, products, favorites]);

  const hasActiveFilters = Boolean(
    debouncedQuery ||
      selectedCategory !== 'all' ||
      minPrice ||
      maxPrice ||
      verifiedOnly ||
      platformFilter !== 'all'
  );

  const desktopPageTitle = {
    home: 'Explore Deals',
    top: 'Top Picks & Reliability',
    saved: 'Saved Wishlist',
    admin: 'Admin Portal',
  }[activeTab];

  return (
    <div className="min-h-screen bg-[#F7F3EE] pb-28 text-[#1D1C1A] md:pb-10">
      <div className="w-full px-4 pt-4 sm:px-6 md:flex md:items-start md:gap-6 md:px-6 md:pt-5">
        {/* Desktop Sidebar Navigation (normal browser >= 768px) */}
        <aside
          aria-label="Sidebar navigation"
          className="hidden md:sticky md:top-5 md:flex md:h-[calc(100vh-40px)] md:w-60 md:shrink-0 md:flex-col md:justify-between md:rounded-[28px] md:bg-[#1E1D1B] md:p-5 md:text-white md:shadow-[0_14px_38px_rgba(18,16,14,0.18)]"
        >
          <div className="space-y-5">
            {/* Brand */}
            <div className="flex items-center gap-2.5 px-1">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#F58C56] text-sm font-black text-white shadow-sm">
                H
              </span>
              <span className="text-lg font-extrabold tracking-tight text-white">
                {storeSettings.store_name}
              </span>
            </div>

            {/* Sidebar Nav Items (Admin accessed directly via /admin URL) */}
            <nav className="space-y-1.5">
              {[
                { id: 'home', label: 'Home', icon: Home },
                { id: 'top', label: 'Top Picks', icon: TrendingUp },
                {
                  id: 'saved',
                  label: 'Saved',
                  icon: Star,
                  badge: favorites.length > 0 ? favorites.length : null,
                },
              ].map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigateTab(item.id)}
                    className={`flex w-full items-center justify-between rounded-2xl px-3.5 py-3 text-sm font-bold transition ${
                      isActive
                        ? 'bg-[#2E2C29] text-[#F58C56]'
                        : 'text-[#B5AEA6] hover:bg-[#2A2825] hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </span>
                    {item.badge ? (
                      <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#F58C56] px-1.5 text-[11px] font-extrabold text-[#1E1D1B]">
                        {item.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="space-y-2.5 border-t border-white/10 pt-4">
            {installPrompt && (
              <button
                type="button"
                onClick={handleInstallPwa}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white/10 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-white/15"
              >
                <Download className="h-3.5 w-3.5 text-[#F58C56]" />
                Install PWA App
              </button>
            )}
            <div className="rounded-2xl bg-white/5 px-3.5 py-3 text-[11px] leading-relaxed text-[#A69F98]">
              <div className="font-bold text-white">Shopee &amp; TikTok Sync</div>
              Compare live MYR prices across verified affiliate picks.
            </div>
          </div>
        </aside>

        {/* Main Content Column */}
        <div className="min-w-0 flex-1">
          {/* Top Bar */}
          <header className="mb-4 flex items-center justify-between gap-3">
            {/* Mobile Brand */}
            <div className="flex items-center gap-2.5 md:hidden">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#F58C56] text-sm font-black text-white shadow-sm">
                H
              </span>
              <h1 className="text-lg font-extrabold tracking-tight text-[#1D1C1A]">
                {storeSettings.store_name}
              </h1>
            </div>

            {/* Desktop Page Heading */}
            <h1 className="hidden text-xl font-extrabold tracking-tight text-[#1D1C1A] md:block">
              {desktopPageTitle}
            </h1>

            <div className="flex items-center gap-2">
              {installPrompt && (
                <button
                  type="button"
                  onClick={handleInstallPwa}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#1E1D1B] px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-black md:hidden"
                >
                  <Download className="h-3.5 w-3.5 text-[#F58C56]" />
                  Install App
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowDropsToast((v) => !v)}
                aria-label="Latest drops"
                className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#1D1C1A] shadow-[0_6px_18px_rgba(32,24,16,0.06)] transition hover:bg-[#FAF7F2]"
              >
                <Bell className="h-4 w-4" />
                <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-[#F58C56]" />
              </button>
            </div>
          </header>

        {/* Latest Drop Banner */}
        {showDropsToast && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-[22px] bg-[#1E1D1B] px-4 py-3 text-xs text-white shadow-md">
            <div>
              <span className="font-bold text-[#F58C56]">Fresh Picks Ready!</span> Click any item to
              auto-check & compare Shopee vs TikTok Shop prices.
            </div>
            <button
              type="button"
              onClick={() => setShowDropsToast(false)}
              className="shrink-0 text-[#A39A91] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* HOME STOREFRONT TAB */}
        {activeTab === 'home' && (
          <main className="space-y-4">
            {/* Search Pill Bar (matching screenshot top search bar) */}
            <div className="flex items-center gap-2">
              <div className="flex flex-1 items-center gap-2.5 rounded-full bg-white px-4 py-3 shadow-[0_6px_20px_rgba(32,24,16,0.05)]">
                <Search className="h-4 w-4 shrink-0 text-[#8C837A]" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder='Smart search: "earbuds under 80", "kipas", "#001"...'
                  className="w-full bg-transparent text-sm font-medium text-[#1D1C1A] placeholder:text-[#A39A91] focus:outline-none"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => setSearchInput('')}
                    className="rounded-full bg-[#F7F3EE] p-1 text-[#78716C]"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowSmartModal(true)}
                aria-label="Open smart filters"
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-[0_6px_20px_rgba(32,24,16,0.06)] transition ${
                  minPrice || maxPrice || verifiedOnly || platformFilter !== 'all'
                    ? 'bg-[#F58C56] text-white'
                    : 'bg-white text-[#1D1C1A]'
                }`}
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
            </div>

            {/* Category Icon Carousel (matching screenshot top category tiles) */}
            <div className="no-scrollbar -mx-1.5 flex gap-3 overflow-x-auto px-1.5 py-1.5">
              {categories.map((cat) => {
                const active = selectedCategory === cat.slug;
                const iconSrc = CATEGORY_IMAGES[cat.slug];
                return (
                  <button
                    key={cat.slug}
                    type="button"
                    onClick={() => setSelectedCategory(cat.slug)}
                    className="flex shrink-0 flex-col items-center gap-1.5"
                  >
                    <div
                      className={`flex h-15 w-15 items-center justify-center overflow-hidden rounded-[20px] bg-white p-1.5 transition ${
                        active
                          ? 'border-2 border-[#F58C56] shadow-[0_6px_16px_rgba(245,140,86,0.22)]'
                          : 'border-2 border-transparent shadow-[0_4px_14px_rgba(32,24,16,0.05)] hover:bg-[#FAF7F2]'
                      }`}
                    >
                      {iconSrc ? (
                        <img
                          src={iconSrc}
                          alt={cat.name}
                          className="h-full w-full rounded-[14px] object-contain"
                        />
                      ) : (
                        <span className="text-2xl">{cat.emoji}</span>
                      )}
                    </div>
                    <span
                      className={`text-[11px] font-bold ${
                        active ? 'text-[#E26D32]' : 'text-[#6E655D]'
                      }`}
                    >
                      {cat.name}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Section Title + Orange Count Pill + See All (matching "Trending Recipes [8] See All") */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-[#1D1C1A]">
                  {debouncedQuery ? 'Smart Results' : 'Trending Finds'}
                </h2>
                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#F58C56] px-1.5 text-[11px] font-extrabold text-white">
                  {products.length}
                </span>
              </div>

              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="text-xs font-bold text-[#F58C56] hover:underline"
                >
                  Clear Filters
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveTab('top')}
                  className="text-xs font-semibold text-[#8C837A] hover:text-[#1D1C1A]"
                >
                  See Leaderboard
                </button>
              )}
            </div>

            {/* Active Smart Search Hint Pill */}
            {(appliedInfo?.inferredMaxPrice || appliedInfo?.inferredMinPrice) && (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF0E6] px-3 py-1 text-xs font-bold text-[#C85A21]">
                <Sparkles className="h-3.5 w-3.5" />
                Smart price filter active:
                {appliedInfo.inferredMinPrice ? ` ≥ RM ${appliedInfo.inferredMinPrice}` : ''}
                {appliedInfo.inferredMaxPrice ? ` ≤ RM ${appliedInfo.inferredMaxPrice}` : ''}
              </div>
            )}

            {/* Sorting Selector Pills (Low->High, High->Low, Top Purchase, Most Reliable, Latest) */}
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {SORT_OPTIONS.map((opt) => {
                const active = sortBy === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSortBy(opt.id)}
                    className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-bold transition ${
                      active
                        ? 'bg-[#1E1D1B] text-white shadow-sm'
                        : 'bg-white text-[#6E655D] shadow-[0_3px_10px_rgba(32,24,16,0.03)] hover:bg-[#FAF7F2]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {/* Product Grid */}
            {error ? (
              <div className="rounded-[24px] bg-white p-6 text-center text-sm font-semibold text-rose-600 shadow-sm">
                {error}
              </div>
            ) : loading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <div
                    key={n}
                    className="h-80 animate-pulse rounded-[26px] bg-white/70 p-4"
                  />
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="rounded-[28px] bg-white p-8 text-center shadow-sm">
                <div className="text-3xl">🔍</div>
                <h3 className="mt-2 text-base font-extrabold text-[#1D1C1A]">
                  No matching products found
                </h3>
                <p className="mt-1 text-xs text-[#8C837A]">
                  Try another keyword, remove a price cap, or switch back to All categories.
                </p>
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="mt-4 rounded-2xl bg-[#1E1D1B] px-5 py-2.5 text-xs font-bold text-white"
                >
                  Show All Products
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    isFavorite={favorites.includes(product.id)}
                    onToggleFavorite={toggleFavorite}
                    onSelect={setSelectedProduct}
                  />
                ))}
              </div>
            )}
          </main>
        )}

        {/* TOP PICKS / GAUGE LEADERBOARD TAB */}
        {activeTab === 'top' && (
          <TopPicksView
            products={allProductsCache.length ? allProductsCache : products}
            onSelectProduct={setSelectedProduct}
          />
        )}

        {/* SAVED FAVORITES TAB */}
        {activeTab === 'saved' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold text-[#1D1C1A]">
                Saved Wishlist ({savedProducts.length})
              </h2>
            </div>

            {savedProducts.length === 0 ? (
              <div className="rounded-[28px] bg-white p-8 text-center shadow-sm">
                <Star className="mx-auto h-8 w-8 text-[#F58C56]" />
                <h3 className="mt-2 text-base font-extrabold text-[#1D1C1A]">No saved items yet</h3>
                <p className="mt-1 text-xs text-[#8C837A]">
                  Tap the star icon on any product to bookmark it for quick price checks later.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('home')}
                  className="mt-4 rounded-2xl bg-[#1E1D1B] px-5 py-2.5 text-xs font-bold text-white"
                >
                  Explore Finds
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {savedProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    isFavorite={true}
                    onToggleFavorite={toggleFavorite}
                    onSelect={setSelectedProduct}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* ADMIN TAB */}
        {activeTab === 'admin' && (
          <AdminDashboard
            categories={categories}
            products={allProductsCache.length ? allProductsCache : products}
            onCatalogChanged={async () => {
              await loadProducts();
              await loadFullCatalog();
              await loadStoreMeta();
            }}
          />
        )}
        </div>
      </div>

      {/* Dark Floating Bottom Navigation Bar (Mobile / PWA only — Admin accessed via /admin) */}
      <nav
        aria-label="Primary navigation"
        className="fixed bottom-3 left-1/2 z-40 w-[calc(100%-24px)] max-w-md -translate-x-1/2 rounded-[28px] bg-[#1E1D1B] px-5 py-2.5 shadow-[0_14px_38px_rgba(18,16,14,0.32)] md:hidden"
      >
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigateTab('home')}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 transition ${
              activeTab === 'home' ? 'text-[#F58C56]' : 'text-[#A69F98] hover:text-white'
            }`}
          >
            <Home className="h-5 w-5" />
            <span className="text-[10px] font-bold">Home</span>
          </button>

          <button
            type="button"
            onClick={() => navigateTab('top')}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 transition ${
              activeTab === 'top' ? 'text-[#F58C56]' : 'text-[#A69F98] hover:text-white'
            }`}
          >
            <TrendingUp className="h-5 w-5" />
            <span className="text-[10px] font-bold">Top Picks</span>
          </button>

          {/* Center Highlighted Orange Rounded Square Button */}
          <button
            type="button"
            onClick={() => setShowSmartModal(true)}
            aria-label="Open smart search"
            className="-mt-3 flex h-13 w-13 items-center justify-center rounded-2xl bg-[#F58C56] text-[#1E1D1B] shadow-[0_8px_20px_rgba(245,140,86,0.45)] transition hover:scale-105 active:scale-95"
          >
            <Sparkles className="h-6 w-6" />
          </button>

          <button
            type="button"
            onClick={() => navigateTab('saved')}
            className={`relative flex flex-col items-center gap-0.5 px-3 py-1 transition ${
              activeTab === 'saved' ? 'text-[#F58C56]' : 'text-[#A69F98] hover:text-white'
            }`}
          >
            <Star className="h-5 w-5" />
            <span className="text-[10px] font-bold">Saved</span>
            {favorites.length > 0 && (
              <span className="absolute right-1.5 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#F58C56] px-1 text-[9px] font-extrabold text-[#1E1D1B]">
                {favorites.length}
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* Product Detail Modal with Image + Shopee & TikTok Links + Automatic Price Sync */}
      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          isFavorite={favorites.includes(selectedProduct.id)}
          onToggleFavorite={toggleFavorite}
          onClose={() => setSelectedProduct(null)}
          onProductUpdated={handleProductUpdated}
        />
      )}

      {/* Smart Search & Filters Modal */}
      {showSmartModal && (
        <SmartSearchModal
          query={searchInput}
          minPrice={minPrice}
          maxPrice={maxPrice}
          verifiedOnly={verifiedOnly}
          platform={platformFilter}
          onApply={(next) => {
            setSearchInput(next.query);
            setDebouncedQuery(next.query.trim());
            setMinPrice(next.minPrice);
            setMaxPrice(next.maxPrice);
            setVerifiedOnly(next.verifiedOnly);
            setPlatformFilter(next.platform);
            setActiveTab('home');
          }}
          onClose={() => setShowSmartModal(false)}
        />
      )}
    </div>
  );
}
