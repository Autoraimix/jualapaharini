import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Lock,
  Plus,
  Pencil,
  Trash2,
  Upload,
  Download,
  RefreshCw,
  LogOut,
  Check,
  Sparkles,
  KeyRound,
  User,
  Eye,
  EyeOff,
  ImagePlus,
  FileSpreadsheet,
  ClipboardPaste,
  Bookmark,
  Copy,
  X,
} from 'lucide-react';
import {
  adminLogin,
  adminLogout,
  bulkImportProducts,
  changeAdminCredentials,
  createProduct,
  deleteProduct,
  exportProductsCsv,
  exportProductsJson,
  fetchAdminAnalytics,
  fetchUrlMetadata,
  getStoredToken,
  setStoredToken,
  updateProduct,
  uploadProductImage,
  verifyAdminSession,
} from '../api';
import {
  formatCompactSold,
  formatMYR,
  getActivePlatforms,
  PLATFORM_LIST,
} from '../utils/format';
import { computeMultiPlatformReliability } from './ReliabilityMeter';
import { buildSyncBookmarkletHref, parseCopiedProductText } from '../utils/smartExtract';

const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

const EMPTY_FORM = {
  code: '',
  title: '',
  description: '',
  category_slug: 'tech',
  tags: '',
  image_url: '',
  shopee_url: '',
  shopee_price: '',
  shopee_rating: '4.8',
  tiktok_url: '',
  tiktok_price: '',
  tiktok_rating: '4.8',
  lazada_url: '',
  lazada_price: '',
  lazada_rating: '4.8',
  pinduoduo_url: '',
  pinduoduo_price: '',
  pinduoduo_rating: '4.8',
  purchase_count: '0',
  reliability_verified: true,
  is_featured: false,
};

function StatusBanner({ banner, onDismiss }) {
  if (!banner?.text) return null;
  const isSuccess = banner.type === 'success';
  return (
    <div
      role="status"
      className={`flex items-center justify-between gap-2 rounded-2xl border px-3.5 py-2.5 text-xs font-semibold ${
        isSuccess
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-rose-200 bg-rose-50 text-rose-700'
      }`}
    >
      <span>{banner.text}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="shrink-0 opacity-70 hover:opacity-100">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function AdminDashboard({ categories, products, onCatalogChanged }) {
  const [authed, setAuthed] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [adminMenu, setAdminMenu] = useState('catalog'); // 'catalog' | 'password'

  // Login form
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [adminUsername, setAdminUsername] = useState('admin');
  const [authError, setAuthError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // Dashboard & CRUD
  const [analytics, setAnalytics] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [enabledPlatforms, setEnabledPlatforms] = useState(['shopee', 'tiktok']);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [fetchingMeta, setFetchingMeta] = useState('');
  const [platformMetaStatus, setPlatformMetaStatus] = useState({});
  const [quickPasteOpen, setQuickPasteOpen] = useState({});
  const [quickPasteText, setQuickPasteText] = useState({});
  const [showBookmarklet, setShowBookmarklet] = useState(false);
  const [statusBanner, setStatusBanner] = useState(null);

  // Import / Export
  const [showImport, setShowImport] = useState(false);
  const [importFormat, setImportFormat] = useState('csv');
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);

  // Change Password menu fields (Username -> Current -> New -> Confirm)
  const [cpUsername, setCpUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPass, setChangingPass] = useState(false);

  const idleTimerRef = useRef(null);

  const handleSessionExpired = useCallback((msg) => {
    setStoredToken('');
    setAuthed(false);
    setAnalytics(null);
    setAuthError(
      msg || 'Session expired after 10 minutes of inactivity. Please sign in again.'
    );
  }, []);

  const handleApiError = useCallback(
    (err, fallbackSetter = setStatusBanner) => {
      if (err?.status === 401) {
        if (err.code === 'SESSION_EXPIRED') {
          handleSessionExpired(err.message);
        } else {
          setStoredToken('');
          setAuthed(false);
          setAnalytics(null);
        }
        return;
      }
      fallbackSetter({ type: 'error', text: err.message || 'An error occurred.' });
    },
    [handleSessionExpired]
  );

  // Verify existing stored token silently on mount (only show "Session expired" if server explicitly says SESSION_EXPIRED)
  useEffect(() => {
    async function check() {
      const token = getStoredToken();
      if (!token) {
        setCheckingAuth(false);
        return;
      }
      try {
        const res = await verifyAdminSession();
        setAuthed(true);
        if (res.username) {
          setAdminUsername(res.username);
          setCpUsername(res.username);
        }
        loadAnalytics();
      } catch (err) {
        setStoredToken('');
        setAuthed(false);
        if (err?.code === 'SESSION_EXPIRED') {
          setAuthError(err.message);
        }
      } finally {
        setCheckingAuth(false);
      }
    }
    check();
  }, []);

  // 10-minute AFK inactivity watcher while signed in
  useEffect(() => {
    if (!authed) {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      return;
    }

    const resetIdleTimer = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(async () => {
        try {
          await adminLogout();
        } catch {
          // Ignore
        }
        handleSessionExpired(
          'Session expired after 10 minutes of inactivity. Please sign in again.'
        );
      }, IDLE_TIMEOUT_MS);
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, resetIdleTimer, { passive: true }));
    resetIdleTimer();

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      events.forEach((ev) => window.removeEventListener(ev, resetIdleTimer));
    };
  }, [authed, handleSessionExpired]);

  async function loadAnalytics() {
    try {
      const data = await fetchAdminAnalytics();
      setAnalytics(data);
    } catch (err) {
      if (err?.status === 401 && err?.code === 'SESSION_EXPIRED') {
        handleSessionExpired(err.message);
      }
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setAuthError('');
    setLoggingIn(true);
    try {
      const res = await adminLogin(username, password);
      setStoredToken(res.token);
      setAuthed(true);
      setAdminUsername(res.username || username);
      setCpUsername(res.username || username);
      setPassword('');
      setStatusBanner(null);
      loadAnalytics();
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleLogout() {
    try {
      await adminLogout();
    } catch {
      // Ignore
    }
    setStoredToken('');
    setAuthed(false);
    setAnalytics(null);
    setAuthError('');
    setStatusBanner(null);
  }

  function openNewForm() {
    setEditingProduct(null);
    setForm(EMPTY_FORM);
    setEnabledPlatforms(['shopee', 'tiktok']);
    setPlatformMetaStatus({});
    setStatusBanner(null);
    setShowForm(true);
  }

  function openEditForm(prod) {
    setEditingProduct(prod);
    const activeIds = PLATFORM_LIST.filter(
      (pl) => String(prod[`${pl.id}_url`] || '').trim().length > 0
    ).map((pl) => pl.id);
    setEnabledPlatforms(activeIds.length > 0 ? activeIds : ['shopee']);
    setPlatformMetaStatus({});
    setStatusBanner(null);

    setForm({
      code: prod.code || '',
      title: prod.title || '',
      description: prod.description || '',
      category_slug: prod.category_slug || 'tech',
      tags: prod.tags || '',
      image_url: prod.image_url || '',
      shopee_url: prod.shopee_url || '',
      shopee_price: prod.shopee_price ?? '',
      shopee_rating: String(prod.shopee_rating ?? prod.reliability_score ?? 4.8),
      tiktok_url: prod.tiktok_url || '',
      tiktok_price: prod.tiktok_price ?? '',
      tiktok_rating: String(prod.tiktok_rating ?? prod.reliability_score ?? 4.8),
      lazada_url: prod.lazada_url || '',
      lazada_price: prod.lazada_price ?? '',
      lazada_rating: String(prod.lazada_rating ?? prod.reliability_score ?? 4.8),
      pinduoduo_url: prod.pinduoduo_url || '',
      pinduoduo_price: prod.pinduoduo_price ?? '',
      pinduoduo_rating: String(prod.pinduoduo_rating ?? prod.reliability_score ?? 4.8),
      purchase_count: String(prod.purchase_count ?? 0),
      reliability_verified: Boolean(prod.reliability_verified),
      is_featured: Boolean(prod.is_featured),
    });
    setShowForm(true);
  }

  function togglePlatformInForm(platformId) {
    setEnabledPlatforms((prev) => {
      if (prev.includes(platformId)) {
        if (prev.length <= 1) {
          setStatusBanner({ type: 'error', text: 'At least 1 platform link is required.' });
          return prev;
        }
        setForm((f) => ({
          ...f,
          [`${platformId}_url`]: '',
          [`${platformId}_price`]: '',
        }));
        return prev.filter((id) => id !== platformId);
      }
      return [...prev, platformId];
    });
  }

  function applyExtractedToPlatform(platform, rawText) {
    const res = parseCopiedProductText(rawText);
    if (!res.ok) {
      setPlatformMetaStatus((prev) => ({
        ...prev,
        [platform]: { type: 'error', text: res.error },
      }));
      return;
    }

    setForm((prev) => ({
      ...prev,
      title: prev.title || res.title || '',
      purchase_count:
        res.sold !== null && (!prev.purchase_count || prev.purchase_count === '0')
          ? String(res.sold)
          : prev.purchase_count,
      ...(res.url && !prev[`${platform}_url`] ? { [`${platform}_url`]: res.url } : {}),
      ...(res.price !== null ? { [`${platform}_price`]: String(res.price) } : {}),
      ...(res.rating !== null ? { [`${platform}_rating`]: String(res.rating) } : {}),
    }));

    const parts = [];
    if (res.price !== null) parts.push(`RM ${res.price.toFixed(2)}`);
    if (res.rating !== null) parts.push(`★ ${res.rating.toFixed(1)}`);
    if (res.sold !== null) parts.push(`${res.sold.toLocaleString()} sold`);

    setPlatformMetaStatus((prev) => ({
      ...prev,
      [platform]: {
        type: 'success',
        text: `Synced from ${res.source === 'bookmarklet' ? 'Bookmarklet' : 'Quick Paste'}: ${parts.join(' • ')}`,
      },
    }));
    setQuickPasteOpen((prev) => ({ ...prev, [platform]: false }));
    setQuickPasteText((prev) => ({ ...prev, [platform]: '' }));
  }

  async function handleClipboardPasteSync(platform) {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const clip = await navigator.clipboard.readText();
        if (clip && clip.trim()) {
          applyExtractedToPlatform(platform, clip);
          return;
        }
      }
      // Fallback: open inline paste box if clipboard permission denied or empty
      setQuickPasteOpen((prev) => ({ ...prev, [platform]: true }));
      setPlatformMetaStatus((prev) => ({
        ...prev,
        [platform]: {
          type: 'error',
          text: 'Clipboard empty or blocked — paste copied text into the box below.',
        },
      }));
    } catch {
      setQuickPasteOpen((prev) => ({ ...prev, [platform]: true }));
    }
  }

  async function handleCopyBookmarklet() {
    try {
      await navigator.clipboard.writeText(buildSyncBookmarkletHref());
      setStatusBanner({
        type: 'success',
        text: 'Bookmarklet code copied! Create a browser bookmark and paste it as the URL.',
      });
    } catch {
      setStatusBanner({
        type: 'error',
        text: 'Could not copy automatically — drag the "⚡ HJA Sync" button to your bookmarks bar.',
      });
    }
  }

  async function handleAutoFetch(platform) {
    const url = form[`${platform}_url`];
    if (!url) {
      setPlatformMetaStatus((prev) => ({
        ...prev,
        [platform]: { type: 'error', text: `Please enter a ${platform} URL first.` },
      }));
      return;
    }
    setFetchingMeta(platform);
    setPlatformMetaStatus((prev) => ({ ...prev, [platform]: null }));
    try {
      const meta = await fetchUrlMetadata(url);
      setForm((prev) => ({
        ...prev,
        title: prev.title || meta.title || '',
        ...(meta.price !== null ? { [`${platform}_price`]: String(meta.price) } : {}),
        ...(meta.rating !== null ? { [`${platform}_rating`]: String(meta.rating) } : {}),
      }));
      const gotAnything = meta.price !== null || meta.rating !== null;
      setPlatformMetaStatus((prev) => ({
        ...prev,
        [platform]: {
          type: gotAnything ? 'success' : 'error',
          text:
            meta.reason ||
            (gotAnything
              ? 'Price/rating fetched successfully.'
              : 'Could not auto-fetch price/rating; please enter manually.'),
        },
      }));
    } catch (err) {
      if (err?.status === 401) {
        handleApiError(err);
      } else {
        setPlatformMetaStatus((prev) => ({
          ...prev,
          [platform]: { type: 'error', text: err.message },
        }));
      }
    } finally {
      setFetchingMeta('');
    }
  }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    setStatusBanner(null);
    try {
      const res = await uploadProductImage(file);
      setForm((prev) => ({ ...prev, image_url: res.url }));
      setStatusBanner({ type: 'success', text: `Image "${file.name}" uploaded successfully.` });
    } catch (err) {
      handleApiError(err);
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleSaveProduct(e) {
    e.preventDefault();
    if (!form.image_url) {
      setStatusBanner({ type: 'error', text: 'Please select and upload a product image file.' });
      return;
    }
    const activeWithUrls = enabledPlatforms.filter(
      (id) => String(form[`${id}_url`] || '').trim().length > 0
    );
    if (activeWithUrls.length === 0) {
      setStatusBanner({ type: 'error', text: 'Please attach at least 1 store link.' });
      return;
    }

    setSaving(true);
    setStatusBanner(null);
    try {
      const payload = {
        ...form,
        purchase_count: Number(form.purchase_count || 0),
      };
      const ratings = [];

      for (const pl of PLATFORM_LIST) {
        const isOn = enabledPlatforms.includes(pl.id) && String(form[`${pl.id}_url`] || '').trim();
        if (isOn) {
          payload[`${pl.id}_url`] = String(form[`${pl.id}_url`]).trim();
          payload[`${pl.id}_price`] =
            form[`${pl.id}_price`] === '' ? null : Number(form[`${pl.id}_price`]);
          const r = form[`${pl.id}_rating`] === '' ? 4.8 : Number(form[`${pl.id}_rating`]);
          payload[`${pl.id}_rating`] = r;
          ratings.push(r);
        } else {
          payload[`${pl.id}_url`] = '';
          payload[`${pl.id}_price`] = null;
          payload[`${pl.id}_rating`] = null;
        }
      }

      payload.reliability_score = computeMultiPlatformReliability(ratings, 4.8);

      if (editingProduct) {
        await updateProduct(editingProduct.id, payload);
        setStatusBanner({ type: 'success', text: 'Product updated in SQLite.' });
      } else {
        await createProduct(payload);
        setStatusBanner({ type: 'success', text: 'Product added to SQLite.' });
      }
      setShowForm(false);
      await onCatalogChanged();
      loadAnalytics();
    } catch (err) {
      handleApiError(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(prod) {
    if (!window.confirm(`Delete ${prod.code} — ${prod.title}?`)) return;
    try {
      await deleteProduct(prod.id);
      setStatusBanner({ type: 'success', text: `${prod.code} removed from catalog.` });
      await onCatalogChanged();
      loadAnalytics();
    } catch (err) {
      handleApiError(err);
    }
  }

  function handleImportFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isJson = file.name.toLowerCase().endsWith('.json');
    setImportFormat(isJson ? 'json' : 'csv');
    const reader = new FileReader();
    reader.onload = () => {
      setImportText(String(reader.result || ''));
      setStatusBanner({
        type: 'success',
        text: `Loaded "${file.name}" (${isJson ? 'JSON' : 'CSV'}). Click Run Import to save.`,
      });
    };
    reader.onerror = () => {
      setStatusBanner({ type: 'error', text: 'Could not read selected file.' });
    };
    reader.readAsText(file);
  }

  function triggerDownload(content, mimeType, filename) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function handleBulkImport(e) {
    e.preventDefault();
    if (!importText.trim()) {
      setStatusBanner({
        type: 'error',
        text: 'Please upload a CSV/JSON file or paste import data first.',
      });
      return;
    }
    setImporting(true);
    setStatusBanner(null);
    try {
      const res = await bulkImportProducts(importFormat, importText);
      if (res.importedCount === 0 && res.skipped?.length > 0) {
        setStatusBanner({
          type: 'error',
          text: `Import skipped all rows (${res.skipped[0].reason}).`,
        });
      } else {
        setStatusBanner({
          type: res.skipped?.length ? 'error' : 'success',
          text: `Imported ${res.importedCount} product(s)${
            res.skipped?.length
              ? `, ${res.skipped.length} skipped (${res.skipped[0].reason})`
              : ' successfully!'
          }`,
        });
        setImportText('');
        setShowImport(false);
        await onCatalogChanged();
        loadAnalytics();
      }
    } catch (err) {
      handleApiError(err);
    } finally {
      setImporting(false);
    }
  }

  async function handleExportJson() {
    setStatusBanner(null);
    try {
      const data = await exportProductsJson();
      const count = data.products?.length || 0;
      triggerDownload(
        JSON.stringify(data.products || [], null, 2),
        'application/json;charset=utf-8',
        `harinijualapa-export-${new Date().toISOString().slice(0, 10)}.json`
      );
      setStatusBanner({ type: 'success', text: `Exported ${count} products to JSON.` });
    } catch (err) {
      handleApiError(err);
    }
  }

  async function handleExportCsv() {
    setStatusBanner(null);
    try {
      const csvText = await exportProductsCsv();
      triggerDownload(
        csvText,
        'text/csv;charset=utf-8',
        `harinijualapa-export-${new Date().toISOString().slice(0, 10)}.csv`
      );
      setStatusBanner({ type: 'success', text: 'Exported catalog to CSV.' });
    } catch (err) {
      handleApiError(err);
    }
  }

  function handleDownloadSampleCsv() {
    const sample = [
      'code,title,description,category_slug,tags,image_url,shopee_url,shopee_price,shopee_rating,tiktok_url,tiktok_price,tiktok_rating,lazada_url,lazada_price,lazada_rating,pinduoduo_url,pinduoduo_price,pinduoduo_rating,purchase_count',
      ',Sample Powerbank 10000mAh,Fast charging slim powerbank,tech,"powerbank,charger",/icons/icon-512.svg,https://shopee.com.my/sample,49.90,4.9,https://www.tiktok.com/sample,45.00,4.8,https://www.lazada.com.my/sample,47.50,4.8,,,350',
    ].join('\n');
    triggerDownload(sample, 'text/csv;charset=utf-8', 'harinijualapa-sample-template.csv');
    setStatusBanner({ type: 'success', text: 'Sample CSV template downloaded.' });
  }

  async function handleCredentialsChange(e) {
    e.preventDefault();
    setStatusBanner(null);
    if (newPassword && newPassword !== confirmPassword) {
      setStatusBanner({
        type: 'error',
        text: 'New password and confirmation password do not match.',
      });
      return;
    }
    setChangingPass(true);
    try {
      const res = await changeAdminCredentials({
        username: cpUsername,
        currentPassword,
        newPassword,
        confirmPassword,
      });
      setAdminUsername(res.username || cpUsername);
      setCpUsername(res.username || cpUsername);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setStatusBanner({ type: 'success', text: 'Password and account updated successfully.' });
    } catch (err) {
      handleApiError(err);
    } finally {
      setChangingPass(false);
    }
  }

  if (checkingAuth) {
    return (
      <div className="rounded-[28px] bg-white p-8 text-center text-sm font-semibold text-[#78716C] shadow-sm">
        Checking admin session...
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="mx-auto max-w-sm rounded-[28px] bg-white p-6 shadow-[0_8px_28px_rgba(32,24,16,0.06)]">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFF0E6] text-[#F58C56]">
          <Lock className="h-6 w-6" />
        </div>
        <h2 className="text-center text-xl font-extrabold text-[#1D1C1A]">Admin Sign In</h2>
        <p className="mt-1 text-center text-xs leading-relaxed text-[#8C837A]">
          Sign in with your administrator account to manage products, store links, and imports.
        </p>

        <form onSubmit={handleLogin} className="mt-5 space-y-3.5">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-[#6E655D]">Username</label>
            <div className="flex items-center gap-2.5 rounded-2xl bg-[#FAF7F2] px-3.5 py-3 focus-within:ring-2 focus-within:ring-[#F58C56]">
              <User className="h-4 w-4 shrink-0 text-[#8C837A]" />
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                className="w-full bg-transparent text-sm font-semibold text-[#1D1C1A] placeholder:text-[#A39A91] focus:outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-[#6E655D]">Password</label>
            <div className="flex items-center gap-2.5 rounded-2xl bg-[#FAF7F2] px-3.5 py-3 focus-within:ring-2 focus-within:ring-[#F58C56]">
              <KeyRound className="h-4 w-4 shrink-0 text-[#8C837A]" />
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full bg-transparent text-sm font-semibold text-[#1D1C1A] placeholder:text-[#A39A91] focus:outline-none"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="text-[#8C837A] hover:text-[#1D1C1A]"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {authError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-center text-xs font-semibold text-rose-700">
              {authError}
            </div>
          )}

          <button
            type="submit"
            disabled={loggingIn}
            className="w-full rounded-2xl bg-[#1E1D1B] py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-black disabled:opacity-60"
          >
            {loggingIn ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Admin Top Header + Sub-menu + Log Out */}
      <section className="rounded-[28px] bg-white p-5 shadow-[0_8px_28px_rgba(32,24,16,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-[#1D1C1A]">Admin &amp; SQLite Manager</h2>
            <p className="text-xs text-[#8C837A]">
              Signed in as <span className="font-bold text-[#1D1C1A]">{adminUsername}</span> •
              Auto-locks after 10 mins idle
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-full bg-[#FAF7F2] p-1">
              <button
                type="button"
                onClick={() => {
                  setAdminMenu('catalog');
                  setStatusBanner(null);
                }}
                className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                  adminMenu === 'catalog'
                    ? 'bg-[#1E1D1B] text-white'
                    : 'text-[#6E655D] hover:text-[#1D1C1A]'
                }`}
              >
                Catalog
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdminMenu('password');
                  setStatusBanner(null);
                }}
                className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                  adminMenu === 'password'
                    ? 'bg-[#1E1D1B] text-white'
                    : 'text-[#6E655D] hover:text-[#1D1C1A]'
                }`}
              >
                Change Password
              </button>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3.5 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100"
            >
              <LogOut className="h-3.5 w-3.5" /> Log Out
            </button>
          </div>
        </div>

        {statusBanner && (
          <div className="mt-3">
            <StatusBanner banner={statusBanner} onDismiss={() => setStatusBanner(null)} />
          </div>
        )}

        {adminMenu === 'catalog' && analytics?.summary && (
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-2xl bg-[#FAF7F2] p-3">
              <div className="text-[11px] font-semibold text-[#8C837A]">Products</div>
              <div className="text-lg font-extrabold text-[#1D1C1A]">
                {analytics.summary.totalProducts}
              </div>
            </div>
            <div className="rounded-2xl bg-[#FFF0EA] p-3">
              <div className="text-[11px] font-semibold text-[#EE4D2D]">Shopee Clicks</div>
              <div className="text-lg font-extrabold text-[#EE4D2D]">
                {analytics.summary.totalShopeeClicks}
              </div>
            </div>
            <div className="rounded-2xl bg-[#FAF7F2] p-3">
              <div className="text-[11px] font-semibold text-[#8C837A]">TikTok Clicks</div>
              <div className="text-lg font-extrabold text-[#1D1C1A]">
                {analytics.summary.totalTiktokClicks}
              </div>
            </div>
            <div className="rounded-2xl bg-[#F3F7FF] p-3">
              <div className="text-[11px] font-semibold text-[#1E40AF]">Lazada Clicks</div>
              <div className="text-lg font-extrabold text-[#1E40AF]">
                {analytics.summary.totalLazadaClicks ?? 0}
              </div>
            </div>
            <div className="rounded-2xl bg-[#FFF4F4] p-3">
              <div className="text-[11px] font-semibold text-[#D9261C]">Pinduoduo Clicks</div>
              <div className="text-lg font-extrabold text-[#D9261C]">
                {analytics.summary.totalPinduoduoClicks ?? 0}
              </div>
            </div>
            <div className="rounded-2xl bg-[#FAF7F2] p-3">
              <div className="text-[11px] font-semibold text-[#8C837A]">Avg Trust</div>
              <div className="text-lg font-extrabold text-[#F58C56]">
                ★ {analytics.summary.avgReliability || '0.0'}
              </div>
            </div>
          </div>
        )}

        {adminMenu === 'catalog' && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openNewForm}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-[#F58C56] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#e57c45]"
            >
              <Plus className="h-4 w-4" /> Add Product
            </button>
            <button
              type="button"
              onClick={() => setShowImport((s) => !s)}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-[#1E1D1B] px-4 py-2.5 text-xs font-bold text-white"
            >
              <Upload className="h-3.5 w-3.5" /> CSV / JSON Import
            </button>
            <button
              type="button"
              onClick={handleExportJson}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-[#FAF7F2] px-4 py-2.5 text-xs font-bold text-[#1D1C1A] hover:bg-[#EFE9E0]"
            >
              <Download className="h-3.5 w-3.5" /> Export JSON
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-[#FAF7F2] px-4 py-2.5 text-xs font-bold text-[#1D1C1A] hover:bg-[#EFE9E0]"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> Export CSV
            </button>
          </div>
        )}
      </section>

      {/* CHANGE PASSWORD MENU */}
      {adminMenu === 'password' && (
        <section className="mx-auto max-w-xl rounded-[28px] bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-1 flex items-center gap-2 text-base font-extrabold text-[#1D1C1A]">
            <KeyRound className="h-5 w-5 text-[#F58C56]" />
            Change Password
          </div>
          <p className="mb-4 text-xs text-[#8C837A]">
            Update your administrator username and password. Leave new password empty if you only
            want to change your username.
          </p>

          <form onSubmit={handleCredentialsChange} className="space-y-3.5">
            <div>
              <label className="mb-1 block text-xs font-bold text-[#6E655D]">Username *</label>
              <input
                type="text"
                required
                minLength={3}
                value={cpUsername}
                onChange={(e) => setCpUsername(e.target.value)}
                placeholder="Username"
                className="w-full rounded-xl bg-[#FAF7F2] px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#F58C56]"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-[#6E655D]">
                Current Password *
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="w-full rounded-xl bg-[#FAF7F2] px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#F58C56]"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-[#6E655D]">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (min 6 characters)"
                className="w-full rounded-xl bg-[#FAF7F2] px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#F58C56]"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-[#6E655D]">
                Confirmation Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full rounded-xl bg-[#FAF7F2] px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#F58C56]"
              />
            </div>

            <button
              type="submit"
              disabled={changingPass}
              className="w-full rounded-2xl bg-[#1E1D1B] py-3 text-xs font-bold text-white transition hover:bg-black disabled:opacity-60"
            >
              {changingPass ? 'Updating...' : 'Save Password & Account'}
            </button>
          </form>
        </section>
      )}

      {/* CATALOG MENU CONTENT */}
      {adminMenu === 'catalog' && (
        <>
          {/* Bulk CSV / JSON Import Drawer */}
          {showImport && (
            <section className="rounded-[28px] bg-white p-5 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-extrabold text-[#1D1C1A]">
                  Bulk Import (CSV or JSON)
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadSampleCsv}
                    className="rounded-full bg-[#FAF7F2] px-3 py-1 text-[11px] font-bold text-[#1D1C1A] hover:bg-[#EFE9E0]"
                  >
                    Download Sample CSV
                  </button>
                  <button type="button" onClick={() => setShowImport(false)}>
                    <X className="h-4 w-4 text-[#8C837A]" />
                  </button>
                </div>
              </div>

              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2">
                  {['csv', 'json'].map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setImportFormat(fmt)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-bold uppercase ${
                        importFormat === fmt
                          ? 'bg-[#1E1D1B] text-white'
                          : 'bg-[#FAF7F2] text-[#6E655D]'
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>

                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#FFF0E6] px-3.5 py-2 text-xs font-bold text-[#C85A21] hover:bg-[#ffe4d3]">
                  <Upload className="h-3.5 w-3.5" />
                  Select .CSV / .JSON File
                  <input
                    type="file"
                    accept=".csv,.json,text/csv,application/json"
                    onChange={handleImportFileSelected}
                    className="hidden"
                  />
                </label>
              </div>

              <p className="mb-2 text-[11px] text-[#8C837A]">
                CSV headers:{' '}
                <code className="break-all">
                  code,title,description,category_slug,tags,image_url,shopee_url,shopee_price,shopee_rating,tiktok_url,tiktok_price,tiktok_rating,lazada_url,lazada_price,lazada_rating,pinduoduo_url,pinduoduo_price,pinduoduo_rating,purchase_count
                </code>
              </p>

              <form onSubmit={handleBulkImport} className="space-y-3">
                <textarea
                  rows={5}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder={
                    importFormat === 'csv'
                      ? 'Select a .csv file above or paste CSV rows here...'
                      : 'Select a .json file above or paste JSON array / exported JSON here...'
                  }
                  className="w-full rounded-2xl bg-[#FAF7F2] p-3 font-mono text-xs text-[#1D1C1A] focus:outline-none focus:ring-2 focus:ring-[#F58C56]"
                />
                <button
                  type="submit"
                  disabled={importing}
                  className="rounded-2xl bg-[#F58C56] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-60"
                >
                  {importing ? 'Importing...' : 'Run Import to SQLite'}
                </button>
              </form>
            </section>
          )}

          {/* Product Add / Edit Form */}
          {showForm && (
            <section className="rounded-[28px] bg-white p-5 shadow-md">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-extrabold text-[#1D1C1A]">
                  {editingProduct ? `Edit ${editingProduct.code}` : 'Add New Product'}
                </h3>
                <button type="button" onClick={() => setShowForm(false)}>
                  <X className="h-5 w-5 text-[#8C837A]" />
                </button>
              </div>

              <form onSubmit={handleSaveProduct} className="space-y-3.5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-[#78716C]">
                      Item Code (auto if blank)
                    </label>
                    <input
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value })}
                      placeholder="#011"
                      className="w-full rounded-xl bg-[#FAF7F2] px-3 py-2 text-sm font-semibold"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-[11px] font-bold text-[#78716C]">
                      Product Title *
                    </label>
                    <input
                      required
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="e.g. Baseus MagSafe Powerbank 10000mAh"
                      className="w-full rounded-xl bg-[#FAF7F2] px-3 py-2 text-sm font-semibold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-[#78716C]">
                      Category
                    </label>
                    <select
                      value={form.category_slug}
                      onChange={(e) => setForm({ ...form, category_slug: e.target.value })}
                      className="w-full rounded-xl bg-[#FAF7F2] px-3 py-2 text-sm font-semibold"
                    >
                      {categories
                        .filter((c) => c.slug !== 'all')
                        .map((c) => (
                          <option key={c.slug} value={c.slug}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-[#78716C]">
                      Smart Search Tags (comma-separated)
                    </label>
                    <input
                      value={form.tags}
                      onChange={(e) => setForm({ ...form, tags: e.target.value })}
                      placeholder="powerbank,magsafe,murah,travel"
                      className="w-full rounded-xl bg-[#FAF7F2] px-3 py-2 text-sm font-semibold"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-bold text-[#78716C]">
                    Description
                  </label>
                  <textarea
                    rows={2}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full rounded-xl bg-[#FAF7F2] px-3 py-2 text-sm"
                  />
                </div>

                {/* File Upload ONLY for Product Image */}
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold text-[#78716C]">
                    Product Image * (Select image file to upload)
                  </label>
                  <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-[#D6CEC3] bg-[#FAF7F2] p-3">
                    {form.image_url ? (
                      <img
                        src={form.image_url}
                        alt="Uploaded preview"
                        className="h-16 w-16 shrink-0 rounded-xl object-cover shadow-sm"
                      />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-white text-[#A39A91]">
                        <ImagePlus className="h-6 w-6" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-[#1D1C1A]">
                        {form.image_url ? 'Image uploaded and ready' : 'No image file selected'}
                      </div>
                      <div className="truncate text-[11px] text-[#8C837A]">
                        PNG, JPG, WEBP or GIF (max 5MB)
                      </div>
                    </div>

                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#1E1D1B] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-black">
                      <Upload className="h-3.5 w-3.5" />
                      {uploadingImage
                        ? 'Uploading...'
                        : form.image_url
                          ? 'Change File'
                          : 'Select Image File'}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                {/* Dynamic 1 to 4 Store Links */}
                <div className="space-y-3 rounded-2xl bg-[#FAF7F2] p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-extrabold text-[#1D1C1A]">
                        Store Links &amp; Pricing ({enabledPlatforms.length}/4 attached)
                      </div>
                      <div className="text-[11px] text-[#8C837A]">
                        Attach at least 1 link (up to 4: Shopee, TikTok, Lazada, Pinduoduo).
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShowBookmarklet((s) => !s)}
                        className="inline-flex items-center gap-1 rounded-full bg-[#FFF0E6] px-2.5 py-1 text-[11px] font-bold text-[#C85A21] hover:bg-[#ffe4d3]"
                      >
                        <Bookmark className="h-3 w-3" />
                        Bookmarklet Sync
                      </button>
                      {PLATFORM_LIST.map((pl) => {
                        const active = enabledPlatforms.includes(pl.id);
                        return (
                          <button
                            key={pl.id}
                            type="button"
                            onClick={() => togglePlatformInForm(pl.id)}
                            className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                              active
                                ? 'bg-[#1E1D1B] text-white'
                                : 'bg-white text-[#6E655D] shadow-sm hover:bg-[#FFF0E6]'
                            }`}
                          >
                            {active ? `✓ ${pl.shortName}` : `+ ${pl.shortName}`}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {showBookmarklet && (
                    <div className="rounded-2xl border border-[#F58C56]/40 bg-white p-3.5 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-extrabold text-[#1D1C1A]">
                            1-Click Browser Bookmarklet (Instant Shopee / TikTok / Lazada Sync)
                          </div>
                          <p className="mt-0.5 text-[11px] text-[#6E655D]">
                            1. Drag <strong>⚡ HJA Sync</strong> to your browser bookmarks bar (or
                            click Copy Code). 2. Open any product tab in Chrome. 3. Click the
                            bookmark, then click <strong>Paste Sync</strong> below.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <a
                            href={buildSyncBookmarkletHref()}
                            onClick={(e) => {
                              e.preventDefault();
                              setStatusBanner({
                                type: 'error',
                                text: 'Do not click here — drag "⚡ HJA Sync" onto your browser Bookmarks Bar (press Ctrl+Shift+B to show it), or click Copy Code.',
                              });
                            }}
                            draggable
                            title="Drag this button to your browser bookmarks bar"
                            className="inline-flex cursor-grab items-center gap-1 rounded-full bg-[#F58C56] px-3 py-1.5 text-[11px] font-extrabold text-white shadow-sm"
                          >
                            ⚡ HJA Sync
                          </a>
                          <button
                            type="button"
                            onClick={handleCopyBookmarklet}
                            className="inline-flex items-center gap-1 rounded-full bg-[#FAF7F2] px-3 py-1.5 text-[11px] font-bold text-[#1D1C1A] hover:bg-[#EFE9E0]"
                          >
                            <Copy className="h-3 w-3" /> Copy Code
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2.5">
                    {PLATFORM_LIST.filter((pl) => enabledPlatforms.includes(pl.id)).map((pl) => (
                      <div key={pl.id} className={`rounded-2xl p-3 ${pl.cardBgTint}`}>
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <span className={`text-xs font-extrabold ${pl.textClass}`}>
                            {pl.name} Link, Price &amp; Rating
                          </span>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleClipboardPasteSync(pl.id)}
                              className="inline-flex items-center gap-1 rounded-full bg-[#1E1D1B] px-2.5 py-1 text-[11px] font-bold text-white shadow-sm hover:bg-black"
                            >
                              <ClipboardPaste className="h-3 w-3 text-[#F58C56]" />
                              Paste Sync
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setQuickPasteOpen((prev) => ({
                                  ...prev,
                                  [pl.id]: !prev[pl.id],
                                }))
                              }
                              className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-[#6E655D] shadow-sm hover:text-[#1D1C1A]"
                            >
                              Quick Paste
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAutoFetch(pl.id)}
                              disabled={fetchingMeta === pl.id}
                              className={`inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold shadow-sm ${pl.textClass}`}
                            >
                              <Sparkles className="h-3 w-3" />
                              {fetchingMeta === pl.id ? 'Fetching...' : 'Auto-Fetch'}
                            </button>
                            {enabledPlatforms.length > 1 && (
                              <button
                                type="button"
                                onClick={() => togglePlatformInForm(pl.id)}
                                className="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-[#78716C] shadow-sm hover:text-rose-600"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </div>

                        {quickPasteOpen[pl.id] && (
                          <div className="mb-2.5 rounded-xl bg-white p-2.5 shadow-sm">
                            <textarea
                              rows={2}
                              value={quickPasteText[pl.id] || ''}
                              onChange={(e) =>
                                setQuickPasteText((prev) => ({
                                  ...prev,
                                  [pl.id]: e.target.value,
                                }))
                              }
                              placeholder="Paste copied product text from Shopee/TikTok app (e.g. 'Anker Earbuds RM79.90 ★ 4.9 14.8k sold') or Bookmarklet code..."
                              className="w-full rounded-lg bg-[#FAF7F2] p-2 text-xs text-[#1D1C1A] focus:outline-none focus:ring-2 focus:ring-[#F58C56]"
                            />
                            <div className="mt-1.5 flex justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setQuickPasteOpen((prev) => ({ ...prev, [pl.id]: false }))
                                }
                                className="rounded-lg bg-[#FAF7F2] px-2.5 py-1 text-[11px] font-bold text-[#6E655D]"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  applyExtractedToPlatform(pl.id, quickPasteText[pl.id] || '')
                                }
                                className="rounded-lg bg-[#F58C56] px-3 py-1 text-[11px] font-bold text-white"
                              >
                                Extract Price &amp; Rating
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                          <input
                            required
                            value={form[`${pl.id}_url`]}
                            onChange={(e) =>
                              setForm({ ...form, [`${pl.id}_url`]: e.target.value })
                            }
                            placeholder={pl.urlPlaceholder}
                            className="sm:col-span-2 rounded-xl bg-white px-3 py-2 text-sm"
                          />
                          <input
                            type="number"
                            step="0.01"
                            value={form[`${pl.id}_price`]}
                            onChange={(e) =>
                              setForm({ ...form, [`${pl.id}_price`]: e.target.value })
                            }
                            placeholder="Price (RM)"
                            className="rounded-xl bg-white px-3 py-2 text-sm font-bold"
                          />
                          <input
                            type="number"
                            min="1"
                            max="5"
                            step="0.1"
                            value={form[`${pl.id}_rating`]}
                            onChange={(e) =>
                              setForm({ ...form, [`${pl.id}_rating`]: e.target.value })
                            }
                            placeholder="Rate (1-5)"
                            className="rounded-xl bg-white px-3 py-2 text-sm font-bold"
                          />
                        </div>

                        {platformMetaStatus[pl.id] && (
                          <div className="mt-2">
                            <StatusBanner banner={platformMetaStatus[pl.id]} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Purchase Count, Combined Reliable Preview, Flags */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-[#78716C]">
                      Total Purchased
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={form.purchase_count}
                      onChange={(e) => setForm({ ...form, purchase_count: e.target.value })}
                      className="w-full rounded-xl bg-[#FAF7F2] px-3 py-2 text-sm font-bold"
                    />
                  </div>
                  <div className="flex flex-col justify-center rounded-xl bg-[#FFF0E6] px-3 py-2 text-xs font-bold text-[#C85A21]">
                    <span className="text-[10px] uppercase">Combined Reliable</span>
                    <span className="text-sm font-extrabold">
                      ★{' '}
                      {computeMultiPlatformReliability(
                        enabledPlatforms.map((id) => form[`${id}_rating`])
                      ).toFixed(1)}
                    </span>
                  </div>
                  <label className="flex items-center gap-2 rounded-xl bg-[#FAF7F2] px-3 py-2 text-xs font-bold">
                    <input
                      type="checkbox"
                      checked={form.reliability_verified}
                      onChange={(e) =>
                        setForm({ ...form, reliability_verified: e.target.checked })
                      }
                      className="accent-[#F58C56]"
                    />
                    Verified Trusted
                  </label>
                  <label className="flex items-center gap-2 rounded-xl bg-[#FAF7F2] px-3 py-2 text-xs font-bold">
                    <input
                      type="checkbox"
                      checked={form.is_featured}
                      onChange={(e) => setForm({ ...form, is_featured: e.target.checked })}
                      className="accent-[#F58C56]"
                    />
                    Viral / Featured
                  </label>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="rounded-2xl bg-[#EFE9E0] px-4 py-2.5 text-xs font-bold text-[#6E655D]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || uploadingImage}
                    className="inline-flex items-center gap-1.5 rounded-2xl bg-[#1E1D1B] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-60"
                  >
                    <Check className="h-4 w-4" />
                    {saving ? 'Saving...' : 'Save Product'}
                  </button>
                </div>
              </form>
            </section>
          )}

          {/* Products Table / List */}
          <section className="rounded-[28px] bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-[#1D1C1A]">
                SQLite Catalog ({products.length})
              </h3>
              <button
                type="button"
                onClick={onCatalogChanged}
                className="inline-flex items-center gap-1 text-xs font-bold text-[#F58C56]"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
              {products.map((prod) => (
                <div
                  key={prod.id}
                  className="flex items-center gap-3 rounded-2xl bg-[#FAF7F2] p-3"
                >
                  <img
                    src={prod.image_url}
                    alt={prod.title}
                    className="h-12 w-12 shrink-0 rounded-xl object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-[#8C837A]">{prod.code}</span>
                      <span className="truncate text-sm font-bold text-[#1D1C1A]">
                        {prod.title}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-[#6E655D]">
                      {getActivePlatforms(prod).map((pl) => (
                        <span key={pl.id}>
                          {pl.shortName}: {formatMYR(pl.price)}
                        </span>
                      ))}
                      <span>{formatCompactSold(prod.purchase_count)}</span>
                      <span>★ {prod.reliability_score}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEditForm(prod)}
                      className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-[#1D1C1A] shadow-sm hover:bg-[#FFF0E6]"
                      aria-label="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(prod)}
                      className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-rose-600 shadow-sm hover:bg-rose-50"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
