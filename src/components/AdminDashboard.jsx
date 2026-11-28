import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Bot,
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
  Users,
  Eye,
  EyeOff,
  ImagePlus,
  FileSpreadsheet,
  Globe,
  Play,
  Square,
  Search,
  Store,
  ChevronLeft,
  ChevronRight,
  Package,
  X,
} from 'lucide-react';
import {
  adminLogin,
  adminLogout,
  bulkImportProducts,
  changeAdminCredentials,
  clearChromeBulkSync,
  createProduct,
  deleteProduct,
  exportProductsCsv,
  exportProductsJson,
  extractOneViaChrome,
  fetchAdminAnalytics,
  fetchProducts,
  getChromeSyncStatus,
  getStoredToken,
  launchRealChrome,
  pollChromeBulkSync,
  setStoredToken,
  startChromeBulkSync,
  stopChromeBulkSync,
  syncAllProducts,
  updateProduct,
  uploadProductImage,
  verifyAdminSession,
} from '../api';
import { AdminThreadsPosting } from './AdminThreadsPosting';
import { AdminPersonas } from './AdminPersonas';
import { AdminOverviewBento } from './AdminOverviewBento';
import { ConfirmDialog, ResultDialog } from './ActionModals';
import { CategoryDropdown } from './CategoryDropdown';
import {
  formatCompactSold,
  formatMYR,
  getActivePlatforms,
  PLATFORM_LIST,
} from '../utils/format';
import { computeMultiPlatformReliability } from './ReliabilityMeter';
import { generateSmartSearchTags, parseTagList } from '../utils/autoTags';

const EMPTY_FORM = {
  code: '',
  title: '',
  description: '',
  category_slug: 'tech',
  tags: '',
  image_url: '',
  gallery_images: [],
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

export function AdminDashboard({
  categories,
  products,
  onCatalogChanged,
  storeName = 'BeliApaHarini',
  onNavigateStorefront,
}) {
  const [authed, setAuthed] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [adminMenu, setAdminMenu] = useState('catalog'); // 'catalog' | 'posting' | 'personas' | 'password'

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
  const [pendingSaveProduct, setPendingSaveProduct] = useState(null);
  const [pendingDeleteProduct, setPendingDeleteProduct] = useState(null);
  const [deletingProduct, setDeletingProduct] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutResultModal, setLogoutResultModal] = useState(null);
  const [productResultModal, setProductResultModal] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [syncingChromeOne, setSyncingChromeOne] = useState('');
  const [platformMetaStatus, setPlatformMetaStatus] = useState({});
  const [tagsManuallyEdited, setTagsManuallyEdited] = useState(false);
  const [statusBanner, setStatusBanner] = useState(null);

  // Import / Export
  const [showImport, setShowImport] = useState(false);
  const [importFormat, setImportFormat] = useState('csv');
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);

  // Real Chrome CDP Bulk Sync
  const [showChromeSync, setShowChromeSync] = useState(false);
  const [chromeCdpState, setChromeCdpState] = useState({
    connected: false,
    browser: null,
    chromeInstalled: true,
  });
  const [launchingChrome, setLaunchingChrome] = useState(false);
  const [chromeUrlsText, setChromeUrlsText] = useState('');
  const [chromeCategory, setChromeCategory] = useState('tech');
  const [chromeDelaySec, setChromeDelaySec] = useState('4.5');
  const [chromeHeadless, setChromeHeadless] = useState(false);
  const [chromeAutoClose, setChromeAutoClose] = useState(true);
  const [chromeJob, setChromeJob] = useState(null);

  // SQLite Catalog Pagination & Smart Search
  const CATALOG_PAGE_SIZE = 10;
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogSearchResults, setCatalogSearchResults] = useState(null);
  const [searchingCatalog, setSearchingCatalog] = useState(false);
  const [catalogPage, setCatalogPage] = useState(1);
  const [showAllCatalog, setShowAllCatalog] = useState(false);

  // Change Password menu fields (Username -> Current -> New -> Confirm)
  const [cpUsername, setCpUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPass, setChangingPass] = useState(false);

  const handleApiError = useCallback(
    (err, fallbackSetter = setStatusBanner) => {
      if (err?.status === 401) {
        setStoredToken('');
        setAuthed(false);
        setAnalytics(null);
        return;
      }
      fallbackSetter({ type: 'error', text: err.message || 'An error occurred.' });
    },
    []
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthStatus = params.get('oauth');
    if (oauthStatus) {
      setAdminMenu('posting');
      if (oauthStatus === 'success') {
        const user = params.get('username') || '';
        setStatusBanner({
          type: 'success',
          text: user ? `Connected Threads account @${user}.` : 'Connected Threads account.',
        });
      } else {
        const msg = params.get('message') || 'Threads OAuth authorization failed.';
        setStatusBanner({ type: 'error', text: msg });
      }
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Verify existing stored token silently on mount
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
      } catch {
        setStoredToken('');
        setAuthed(false);
      } finally {
        setCheckingAuth(false);
      }
    }
    check();
  }, []);

  async function loadAnalytics() {
    try {
      const data = await fetchAdminAnalytics();
      setAnalytics(data);
    } catch (err) {
      if (err?.status === 401) {
        setStoredToken('');
        setAuthed(false);
        setAnalytics(null);
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

  function handleLogout() {
    setShowLogoutConfirm(true);
  }

  async function confirmLogout() {
    setLoggingOut(true);
    try {
      await adminLogout();
      setShowLogoutConfirm(false);
      setStoredToken('');
      setAuthed(false);
      setAnalytics(null);
      setAuthError('');
      setStatusBanner(null);
      setLogoutResultModal({
        status: 'success',
        title: 'Signed Out Successfully',
        message: 'You have been safely signed out of the Admin Dashboard.',
      });
    } catch (err) {
      setShowLogoutConfirm(false);
      setStoredToken('');
      setAuthed(false);
      setAnalytics(null);
      setAuthError('');
      setStatusBanner(null);
      setLogoutResultModal({
        status: 'success',
        title: 'Signed Out Successfully',
        message:
          err?.message && err.status !== 401
            ? 'Your local session has been cleared and you are now signed out.'
            : 'You have been safely signed out of the Admin Dashboard.',
      });
    } finally {
      setLoggingOut(false);
    }
  }

  function autoTagsForForm(nextForm, forceRegen = false) {
    if (!forceRegen && tagsManuallyEdited) return nextForm.tags;
    const catName =
      categories.find((c) => c.slug === nextForm.category_slug)?.name || nextForm.category_slug;
    return generateSmartSearchTags({
      title: nextForm.title,
      description: nextForm.description,
      categorySlug: nextForm.category_slug,
      categoryName: catName,
      existingTags: forceRegen ? '' : '',
      minTags: 5,
    });
  }

  function openNewForm() {
    setEditingProduct(null);
    setTagsManuallyEdited(false);
    const initialTags = generateSmartSearchTags({
      categorySlug: EMPTY_FORM.category_slug,
      categoryName:
        categories.find((c) => c.slug === EMPTY_FORM.category_slug)?.name ||
        EMPTY_FORM.category_slug,
      minTags: 5,
    });
    setForm({ ...EMPTY_FORM, tags: initialTags });
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

    const existingTagCount = parseTagList(prod.tags || '').length;
    setTagsManuallyEdited(existingTagCount >= 5);
    const catSlug = prod.category_slug || 'tech';
    const catName = categories.find((c) => c.slug === catSlug)?.name || catSlug;
    const resolvedTags =
      existingTagCount >= 5
        ? prod.tags
        : generateSmartSearchTags({
            title: prod.title || '',
            description: prod.description || '',
            categorySlug: catSlug,
            categoryName: catName,
            existingTags: prod.tags || '',
            minTags: 5,
          });

    setForm({
      code: prod.code || '',
      title: prod.title || '',
      description: prod.description || '',
      category_slug: catSlug,
      tags: resolvedTags,
      image_url: prod.image_url || '',
      gallery_images: (() => {
        try {
          const parsed = Array.isArray(prod.gallery_images)
            ? prod.gallery_images
            : JSON.parse(prod.gallery_images || '[]');
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })(),
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

  async function handleChromeSyncOne(platform) {
    const url = String(form[`${platform}_url`] || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      setPlatformMetaStatus((prev) => ({
        ...prev,
        [platform]: { type: 'error', text: `Please enter a valid ${platform} URL first.` },
      }));
      return;
    }

    const hasExistingImage =
      Boolean(String(form.image_url || '').trim()) && form.image_url !== '/icons/icon-512.svg';

    setSyncingChromeOne(platform);
    setPlatformMetaStatus((prev) => ({ ...prev, [platform]: null }));
    try {
      const res = await extractOneViaChrome({
        url,
        skipImages: hasExistingImage,
        headless: chromeHeadless,
      });
      const meta = res.data || {};
      setForm((prev) => {
        const stillHasImg =
          Boolean(String(prev.image_url || '').trim()) && prev.image_url !== '/icons/icon-512.svg';
        const nextPurchaseCount =
          meta.soldCount !== null &&
          meta.soldCount > 0 &&
          (!prev.purchase_count || prev.purchase_count === '0')
            ? String(meta.soldCount)
            : prev.purchase_count;

        const nextTitle = prev.title || meta.title || '';
        const catName =
          categories.find((c) => c.slug === prev.category_slug)?.name || prev.category_slug;
        const nextTags =
          !tagsManuallyEdited || parseTagList(prev.tags).length < 5
            ? generateSmartSearchTags({
                title: nextTitle,
                description: prev.description,
                categorySlug: prev.category_slug,
                categoryName: catName,
                existingTags: tagsManuallyEdited ? prev.tags : '',
                minTags: 5,
              })
            : prev.tags;

        return {
          ...prev,
          title: nextTitle,
          tags: nextTags,
          purchase_count: nextPurchaseCount,
          ...(!stillHasImg && meta.imageUrl ? { image_url: meta.imageUrl } : {}),
          ...(!stillHasImg && Array.isArray(meta.galleryImages) && meta.galleryImages.length > 0
            ? { gallery_images: meta.galleryImages }
            : {}),
          ...(meta.price !== null
            ? {
                [`${platform}_price`]: String(meta.price),
                [`${platform}_price_status`]: 'synced',
              }
            : {}),
          ...(meta.rating !== null ? { [`${platform}_rating`]: String(meta.rating) } : {}),
        };
      });

      const parts = [];
      if (meta.price !== null) parts.push(`RM ${Number(meta.price).toFixed(2)}`);
      if (meta.rating !== null) parts.push(`★ ${Number(meta.rating).toFixed(1)}`);
      if (meta.soldCount) parts.push(`${Number(meta.soldCount).toLocaleString()} sold`);
      if (hasExistingImage) {
        parts.push('existing image kept');
      } else if (meta.imageUrl) {
        parts.push(`${meta.galleryImages?.length || 1} image(s) added`);
      }

      if (meta.price === null) {
        setPlatformMetaStatus((prev) => ({
          ...prev,
          [platform]: {
            type: 'error',
            text: `Chrome Sync extracted ${parts.join(' • ') || 'link details'}, but price was not detected on the page — please enter Price (RM) manually or retry Chrome Sync once the page finishes loading.`,
          },
        }));
      } else {
        setPlatformMetaStatus((prev) => ({
          ...prev,
          [platform]: {
            type: 'success',
            text: `Chrome Synced: ${parts.join(' • ')}`,
          },
        }));
      }
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
      setSyncingChromeOne('');
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

  function handleSaveProduct(e) {
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

    setStatusBanner(null);
    const payload = {
      ...form,
      purchase_count: Number(form.purchase_count || 0),
    };
    const ratings = [];
    const attachedPlatformNames = [];

    for (const pl of PLATFORM_LIST) {
      const isOn = enabledPlatforms.includes(pl.id) && String(form[`${pl.id}_url`] || '').trim();
      if (isOn) {
        payload[`${pl.id}_url`] = String(form[`${pl.id}_url`]).trim();
        payload[`${pl.id}_price`] =
          form[`${pl.id}_price`] === '' ? null : Number(form[`${pl.id}_price`]);
        const r = form[`${pl.id}_rating`] === '' ? 4.8 : Number(form[`${pl.id}_rating`]);
        payload[`${pl.id}_rating`] = r;
        ratings.push(r);
        attachedPlatformNames.push(pl.shortName);
      } else {
        payload[`${pl.id}_url`] = '';
        payload[`${pl.id}_price`] = null;
        payload[`${pl.id}_rating`] = null;
      }
    }

    payload.reliability_score = computeMultiPlatformReliability(ratings, 4.8);
    const categoryName =
      categories.find((c) => c.slug === payload.category_slug)?.name || payload.category_slug;

    if (parseTagList(payload.tags).length < 5) {
      payload.tags = generateSmartSearchTags({
        title: payload.title,
        description: payload.description,
        categorySlug: payload.category_slug,
        categoryName,
        existingTags: payload.tags,
        minTags: 5,
      });
    }

    setPendingSaveProduct({
      payload,
      isEdit: Boolean(editingProduct),
      productId: editingProduct?.id,
      productCode: editingProduct?.code,
      details: [
        { label: 'Product Title', value: payload.title },
        { label: 'Category', value: categoryName },
        { label: 'Smart Tags', value: `${parseTagList(payload.tags).length} tag(s)` },
        {
          label: 'Store Links',
          value: `${attachedPlatformNames.length} (${attachedPlatformNames.join(', ')})`,
        },
        { label: 'Trust Score', value: `★ ${payload.reliability_score.toFixed(1)}` },
      ],
    });
  }

  async function confirmSaveProduct() {
    if (!pendingSaveProduct) return;
    const { payload, isEdit, productId, productCode, details } = pendingSaveProduct;
    setSaving(true);
    try {
      if (isEdit) {
        await updateProduct(productId, payload);
        setStatusBanner({ type: 'success', text: 'Product updated in SQLite.' });
      } else {
        await createProduct(payload);
        setStatusBanner({ type: 'success', text: 'Product added to SQLite.' });
      }
      setPendingSaveProduct(null);
      setShowForm(false);
      await onCatalogChanged();
      loadAnalytics();
      setProductResultModal({
        status: 'success',
        title: isEdit ? 'Product Updated Successfully' : 'Product Added Successfully',
        message: isEdit
          ? `"${payload.title}" (${productCode}) has been updated and synced across your catalog.`
          : `"${payload.title}" has been added to your catalog and is now live on the storefront.`,
        details,
      });
    } catch (err) {
      setPendingSaveProduct(null);
      if (err?.status === 401) {
        handleApiError(err);
      } else {
        const errMsg =
          err?.message || 'An unexpected error occurred while saving the product.';
        setStatusBanner({ type: 'error', text: errMsg });
        setProductResultModal({
          status: 'error',
          title: isEdit ? 'Failed to Update Product' : 'Failed to Add Product',
          message: errMsg,
        });
      }
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(prod) {
    setPendingDeleteProduct(prod);
  }

  async function confirmDeleteProduct() {
    if (!pendingDeleteProduct) return;
    const prod = pendingDeleteProduct;
    setDeletingProduct(true);
    try {
      await deleteProduct(prod.id);
      setPendingDeleteProduct(null);
      setStatusBanner({ type: 'success', text: `${prod.code} removed from catalog.` });
      await onCatalogChanged();
      loadAnalytics();
      setProductResultModal({
        status: 'success',
        title: 'Product Deleted Successfully',
        message: `${prod.code} — "${prod.title}" has been permanently removed from your catalog.`,
      });
    } catch (err) {
      setPendingDeleteProduct(null);
      if (err?.status === 401) {
        handleApiError(err);
      } else {
        const errMsg =
          err?.message || 'An unexpected error occurred while deleting the product.';
        setStatusBanner({ type: 'error', text: errMsg });
        setProductResultModal({
          status: 'error',
          title: 'Failed to Delete Product',
          message: errMsg,
        });
      }
    } finally {
      setDeletingProduct(false);
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
        `beliapaharini-export-${new Date().toISOString().slice(0, 10)}.json`
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
        `beliapaharini-export-${new Date().toISOString().slice(0, 10)}.csv`
      );
      setStatusBanner({ type: 'success', text: 'Exported catalog to CSV.' });
    } catch (err) {
      handleApiError(err);
    }
  }

  async function handleSyncAllPrices() {
    setSyncingAll(true);
    setStatusBanner(null);
    try {
      const res = await syncAllProducts();
      await onCatalogChanged();
      loadAnalytics();
      if (res.syncedPlatforms > 0) {
        setStatusBanner({
          type: 'success',
          text: `Synced ${res.syncedPlatforms} live store price(s) across ${res.syncedProducts} of ${res.total} products.`,
        });
      } else {
        setStatusBanner({
          type: 'error',
          text: `0 live prices auto-synced (${res.blockedPlatforms} link(s) blocked by storefront without Shopee OpenAPI keys). Add SHOPEE_APP_ID / SHOPEE_APP_SECRET in .env or bulk-update via CSV Import.`,
        });
      }
    } catch (err) {
      handleApiError(err);
    } finally {
      setSyncingAll(false);
    }
  }

  const refreshChromeCdpStatus = useCallback(async () => {
    try {
      const info = await getChromeSyncStatus();
      setChromeCdpState(info);
    } catch {
      // Ignore silent status check errors
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    refreshChromeCdpStatus();
    pollChromeBulkSync()
      .then((job) => {
        setChromeJob(job);
        if (job?.running || (job?.paused && job?.remainingUrls?.length > 0)) {
          setShowChromeSync(true);
        }
      })
      .catch(() => {});
  }, [authed, refreshChromeCdpStatus]);

  useEffect(() => {
    if (!authed || !showChromeSync) return;
    refreshChromeCdpStatus();
  }, [authed, showChromeSync, refreshChromeCdpStatus]);

  useEffect(() => {
    if (!authed || !chromeJob?.running) return;
    const timer = setInterval(async () => {
      try {
        const nextJob = await pollChromeBulkSync();
        setChromeJob(nextJob);
        if (!nextJob.running || nextJob.completed > (chromeJob?.completed || 0)) {
          await onCatalogChanged();
          loadAnalytics();
        }
        if (!nextJob.running) {
          refreshChromeCdpStatus();
          if (nextJob.paused) {
            setStatusBanner({
              type: 'error',
              text: nextJob.pauseReason || 'Chrome sync paused for manual verification.',
            });
          } else if (nextJob.error) {
            setStatusBanner({ type: 'error', text: nextJob.error });
          } else if (nextJob.total > 0) {
            setStatusBanner({
              type: nextJob.succeeded > 0 ? 'success' : 'error',
              text: `Real Chrome Sync finished: ${nextJob.succeeded} saved, ${nextJob.failed} failed out of ${nextJob.total} link(s).`,
            });
          }
        }
      } catch (err) {
        handleApiError(err);
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [authed, chromeJob?.running, chromeJob?.completed, handleApiError, onCatalogChanged]);

  async function handleLaunchRealChrome() {
    setLaunchingChrome(true);
    setStatusBanner(null);
    try {
      const res = await launchRealChrome();
      await refreshChromeCdpStatus();
      setStatusBanner({
        type: res.connected ? 'success' : 'error',
        text: res.message,
      });
    } catch (err) {
      handleApiError(err);
    } finally {
      setLaunchingChrome(false);
    }
  }

  async function handleStartChromeSync(overrideUrls = null) {
    const urlsPayload = overrideUrls || chromeUrlsText;
    setStatusBanner(null);
    try {
      const job = await startChromeBulkSync({
        urls: urlsPayload,
        categorySlug: chromeCategory,
        delaySeconds: Number(chromeDelaySec || 4.5),
        headless: chromeHeadless,
        closeOnComplete: chromeAutoClose,
      });
      setChromeJob(job);
      setStatusBanner({
        type: 'success',
        text: `Started Real Chrome Sync for ${job.total} link(s)...`,
      });
    } catch (err) {
      handleApiError(err);
    }
  }

  async function handleStopChromeSync() {
    try {
      const job = await stopChromeBulkSync();
      setChromeJob(job);
      setStatusBanner({ type: 'error', text: 'Real Chrome Sync stopped by admin.' });
    } catch (err) {
      handleApiError(err);
    }
  }

  async function handleClearChromeJob() {
    try {
      const job = await clearChromeBulkSync();
      setChromeJob(job);
      setStatusBanner(null);
    } catch (err) {
      handleApiError(err);
    }
  }

  async function handleCatalogSmartSearch(e) {
    e?.preventDefault();
    const trimmed = catalogQuery.trim();
    if (!trimmed) {
      setCatalogSearchResults(null);
      setCatalogPage(1);
      return;
    }
    setSearchingCatalog(true);
    try {
      const res = await fetchProducts({ q: trimmed, sort: 'latest' });
      setCatalogSearchResults(res.products || []);
      setCatalogPage(1);
    } catch (err) {
      handleApiError(err);
    } finally {
      setSearchingCatalog(false);
    }
  }

  function handleClearCatalogSearch() {
    setCatalogQuery('');
    setCatalogSearchResults(null);
    setCatalogPage(1);
  }

  // Keep filtered search results synced when catalog mutates (add/edit/delete/sync)
  useEffect(() => {
    if (catalogSearchResults === null) return;
    const trimmed = catalogQuery.trim();
    if (!trimmed) {
      setCatalogSearchResults(null);
      return;
    }
    let active = true;
    fetchProducts({ q: trimmed, sort: 'latest' })
      .then((res) => {
        if (active) setCatalogSearchResults(res.products || []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  function handleDownloadSampleCsv() {
    const sample = [
      'code,title,description,category_slug,tags,image_url,shopee_url,shopee_price,shopee_rating,tiktok_url,tiktok_price,tiktok_rating,lazada_url,lazada_price,lazada_rating,pinduoduo_url,pinduoduo_price,pinduoduo_rating,purchase_count',
      ',Sample Powerbank 10000mAh,Fast charging slim powerbank,tech,"powerbank,charger",/icons/icon-512.svg,https://shopee.com.my/sample,49.90,4.9,https://www.tiktok.com/sample,45.00,4.8,https://www.lazada.com.my/sample,47.50,4.8,,,350',
    ].join('\n');
    triggerDownload(sample, 'text/csv;charset=utf-8', 'beliapaharini-sample-template.csv');
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

  function scrollToCatalogSection() {
    setAdminMenu('catalog');
    setTimeout(() => {
      document.getElementById('admin-catalog-section')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 50);
  }

  if (checkingAuth) {
    return (
      <div className="mx-auto max-w-md rounded-[28px] bg-white p-8 text-center text-sm font-semibold text-[#78716C] shadow-sm">
        Checking admin session...
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="mx-auto max-w-sm space-y-3 py-6">
        {onNavigateStorefront && (
          <button
            type="button"
            onClick={onNavigateStorefront}
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-[#6E655D] shadow-sm transition hover:text-[#1D1C1A]"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Storefront
          </button>
        )}
        <div className="rounded-[28px] bg-white p-6 shadow-[0_8px_28px_rgba(32,24,16,0.06)]">
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

        <ResultDialog
          open={Boolean(logoutResultModal)}
          status={logoutResultModal?.status || 'success'}
          title={logoutResultModal?.title}
          message={logoutResultModal?.message}
          onClose={() => setLogoutResultModal(null)}
        />
      </div>
    );
  }

  const menuNavItems = [
    { id: 'catalog', label: 'Catalog', icon: Package, badge: products.length },
    { id: 'posting', label: 'AI Posting', icon: Bot },
    { id: 'personas', label: 'Personas', icon: Users },
  ];

  const generalNavItems = [
    { id: 'password', label: 'Change Password', icon: KeyRound },
  ];

  return (
    <div className="pb-24 md:flex md:items-start md:gap-5 md:pb-0">
      {/* Desktop Admin Sidebar (Donezo-inspired structure with current system colors) */}
      <aside
        aria-label="Admin sidebar"
        className="hidden md:sticky md:top-5 md:flex md:h-[calc(100vh-40px)] md:w-60 md:shrink-0 md:flex-col md:justify-between md:rounded-[28px] md:border md:border-[#EFE9E0] md:bg-white md:p-4 md:shadow-[0_8px_28px_rgba(32,24,16,0.05)]"
      >
        <div className="space-y-6">
          {/* Brand Header */}
          <div className="flex items-center justify-between gap-2 px-1.5 pt-1">
            <div className="flex items-center gap-2.5">
              <img
                src="/favicon.svg"
                alt={storeName}
                className="h-9 w-9 shrink-0 rounded-xl shadow-sm"
              />
              <div>
                <div className="text-sm font-extrabold tracking-tight text-[#1D1C1A]">
                  {storeName}
                </div>
                <div className="text-[10px] font-bold text-[#F58C56]">Admin Studio</div>
              </div>
            </div>
          </div>

          {/* MENU Section */}
          <div>
            <div className="mb-2 px-2.5 text-[10px] font-extrabold uppercase tracking-wider text-[#A39A91]">
              Menu
            </div>
            <nav className="space-y-1">
              {menuNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = adminMenu === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setAdminMenu(item.id);
                      setStatusBanner(null);
                    }}
                    className={`relative flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-xs font-bold transition ${
                      isActive
                        ? 'bg-[#FAF7F2] text-[#1D1C1A]'
                        : 'text-[#6E655D] hover:bg-[#FAF7F2] hover:text-[#1D1C1A]'
                    }`}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-[#F58C56]" />
                    )}
                    <span className="flex items-center gap-2.5">
                      <Icon
                        className={`h-4 w-4 ${isActive ? 'text-[#F58C56]' : 'text-[#8C837A]'}`}
                      />
                      {item.label}
                    </span>
                    {typeof item.badge === 'number' && (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${
                          isActive
                            ? 'bg-[#1E1D1B] text-white'
                            : 'bg-[#FAF7F2] text-[#6E655D]'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* GENERAL Section */}
          <div>
            <div className="mb-2 px-2.5 text-[10px] font-extrabold uppercase tracking-wider text-[#A39A91]">
              General
            </div>
            <nav className="space-y-1">
              {generalNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = adminMenu === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setAdminMenu(item.id);
                      setStatusBanner(null);
                    }}
                    className={`relative flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-xs font-bold transition ${
                      isActive
                        ? 'bg-[#FAF7F2] text-[#1D1C1A]'
                        : 'text-[#6E655D] hover:bg-[#FAF7F2] hover:text-[#1D1C1A]'
                    }`}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-[#F58C56]" />
                    )}
                    <Icon
                      className={`h-4 w-4 ${isActive ? 'text-[#F58C56]' : 'text-[#8C837A]'}`}
                    />
                    {item.label}
                  </button>
                );
              })}
              {onNavigateStorefront && (
                <button
                  type="button"
                  onClick={onNavigateStorefront}
                  className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-xs font-bold text-[#6E655D] transition hover:bg-[#FAF7F2] hover:text-[#1D1C1A]"
                >
                  <Store className="h-4 w-4 text-[#8C837A]" />
                  View Storefront
                </button>
              )}
            </nav>
          </div>
        </div>

        {/* Bottom Dark Workspace Card (Matching Donezo dark bottom widget in System Charcoal + Orange) */}
        <div className="relative overflow-hidden rounded-[22px] bg-[#1E1D1B] p-4 text-white">
          <div
            className="pointer-events-none absolute -bottom-8 -right-8 h-28 w-28 rounded-full opacity-30 blur-xl"
            style={{ background: 'radial-gradient(circle, #F58C56 0%, transparent 70%)' }}
          />
          <div className="relative">
            <div className="text-xs font-extrabold text-white">Quick Product Entry</div>
            <p className="mt-1 text-[11px] leading-relaxed text-[#A69F98]">
              Add affiliate deals or launch Chrome sync in one click.
            </p>
            <button
              type="button"
              onClick={openNewForm}
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-[#F58C56] px-3 py-2 text-[11px] font-extrabold text-white transition hover:bg-[#e57c45]"
            >
              <Plus className="h-3.5 w-3.5" /> New Deal
            </button>
          </div>
        </div>
      </aside>

      {/* Main Admin Workspace Column */}
      <div className="min-w-0 flex-1 space-y-3.5 sm:space-y-4">
        {/* Top Search & Profile Bar (Responsive mobile-first layout) */}
        <header className="flex flex-wrap items-center justify-between gap-2.5 rounded-[22px] border border-[#EFE9E0] bg-white px-3.5 py-3 shadow-[0_6px_22px_rgba(32,24,16,0.04)] sm:rounded-[24px] sm:px-4">
          <div className="flex items-center gap-2 md:hidden">
            <img src="/favicon.svg" alt={storeName} className="h-8 w-8 shrink-0 rounded-xl" />
            <div className="leading-tight">
              <div className="text-xs font-extrabold text-[#1D1C1A]">{storeName}</div>
              <div className="text-[10px] font-bold text-[#F58C56]">Admin Studio</div>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              setAdminMenu('catalog');
              handleCatalogSmartSearch(e);
              scrollToCatalogSection();
            }}
            className="order-3 flex w-full items-center gap-2 rounded-full bg-[#FAF7F2] px-3.5 py-2 focus-within:ring-2 focus-within:ring-[#F58C56] md:order-none md:max-w-sm md:flex-1"
          >
            <Search className="h-4 w-4 shrink-0 text-[#8C837A]" />
            <input
              type="text"
              value={catalogQuery}
              onChange={(e) => setCatalogQuery(e.target.value)}
              placeholder="Quick search catalog..."
              className="w-full bg-transparent text-xs font-semibold text-[#1D1C1A] placeholder:text-[#A39A91] focus:outline-none"
            />
            <span className="hidden rounded-md bg-white px-1.5 py-0.5 text-[10px] font-bold text-[#8C837A] shadow-sm sm:inline">
              ⌘F
            </span>
          </form>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCatalogChanged}
              aria-label="Sync workspace data"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FAF7F2] text-[#6E655D] transition hover:bg-[#EFE9E0] hover:text-[#1D1C1A] sm:h-9 sm:w-9"
            >
              <RefreshCw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>

            <div className="hidden items-center gap-2.5 rounded-full bg-[#FAF7F2] py-1 pl-1.5 pr-3 sm:flex">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#F58C56] text-xs font-extrabold text-white">
                {String(adminUsername || 'A')
                  .slice(0, 1)
                  .toUpperCase()}
              </div>
              <div className="leading-tight">
                <div className="text-xs font-extrabold text-[#1D1C1A]">{adminUsername}</div>
                <div className="text-[10px] font-semibold text-[#8C837A]">Administrator</div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100 sm:px-3.5 sm:py-2"
            >
              <LogOut className="h-3.5 w-3.5" /> Log Out
            </button>
          </div>
        </header>

        {/* Page Title & Action Row */}
        <section className="flex flex-col gap-3 px-0.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-[#1D1C1A] sm:text-2xl">
              Admin Dashboard
            </h2>
            <p className="mt-0.5 text-xs font-medium text-[#8C837A]">
              Plan, curate, and monitor your affiliate deals with ease.
            </p>
          </div>

          {adminMenu === 'catalog' && (
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <button
                type="button"
                onClick={openNewForm}
                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#F58C56] px-3.5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#e57c45] sm:px-4"
              >
                <Plus className="h-4 w-4" /> Add Product
              </button>
              <button
                type="button"
                onClick={() => setShowImport((s) => !s)}
                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#1E1D1B] px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-black sm:px-4"
              >
                <Upload className="h-3.5 w-3.5" /> CSV / JSON Import
              </button>
              <button
                type="button"
                onClick={handleExportJson}
                className="inline-flex items-center justify-center gap-1.5 rounded-full border border-[#EFE9E0] bg-white px-3.5 py-2 text-xs font-bold text-[#1D1C1A] transition hover:bg-[#FAF7F2] sm:py-2.5"
              >
                <Download className="h-3.5 w-3.5" /> Export JSON
              </button>
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center justify-center gap-1.5 rounded-full border border-[#EFE9E0] bg-white px-3.5 py-2 text-xs font-bold text-[#1D1C1A] transition hover:bg-[#FAF7F2] sm:py-2.5"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" /> Export CSV
              </button>
            </div>
          )}
        </section>

        {statusBanner && (
          <StatusBanner banner={statusBanner} onDismiss={() => setStatusBanner(null)} />
        )}

        {adminMenu === 'catalog' && (
          <AdminOverviewBento
            products={products}
            analytics={analytics}
            categories={categories}
            chromeCdpState={chromeCdpState}
            syncingAll={syncingAll}
            onOpenNewProduct={openNewForm}
            onSyncAllPrices={handleSyncAllPrices}
            onToggleChromeSync={() => setShowChromeSync((s) => !s)}
            onOpenEditProduct={openEditForm}
            onNavigateMenu={(menu) => {
              setAdminMenu(menu);
              setStatusBanner(null);
            }}
            onScrollToCatalog={scrollToCatalogSection}
          />
        )}

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

      {adminMenu === 'posting' && (
        <AdminThreadsPosting
          products={products}
          onStatusBanner={setStatusBanner}
          onApiError={handleApiError}
        />
      )}

      {adminMenu === 'personas' && (
        <AdminPersonas
          onStatusBanner={setStatusBanner}
          onApiError={handleApiError}
        />
      )}

      {/* CATALOG MENU CONTENT */}
      {adminMenu === 'catalog' && (
        <>
          {/* Real Chrome Bulk Sync Drawer */}
          {showChromeSync && (
            <section className="rounded-[28px] bg-white p-5 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-extrabold text-[#1D1C1A]">
                    <Globe className="h-4 w-4 text-[#F58C56]" />
                    Real Chrome Bulk Sync (1–100+ Links)
                  </h3>
                  <p className="mt-0.5 text-xs text-[#8C837A]">
                    Connects to your real non-incognito Chrome window, opens links sequentially with
                    gentle scrolling, extracts price, sold count, rating, title &amp; gallery images,
                    and pauses safely if login/verification appears.
                  </p>
                </div>
                <button type="button" onClick={() => setShowChromeSync(false)}>
                  <X className="h-4 w-4 text-[#8C837A]" />
                </button>
              </div>

              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#FAF7F2] p-3">
                <div className="flex items-center gap-2 text-xs font-bold">
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full ${
                      chromeCdpState.connected ? 'bg-emerald-500' : 'bg-rose-500'
                    }`}
                  />
                  <span className={chromeCdpState.connected ? 'text-emerald-700' : 'text-rose-700'}>
                    {chromeCdpState.connected
                      ? `Connected (${chromeCdpState.browser || 'Google Chrome'})`
                      : 'Real Chrome Not Connected (Port 9222)'}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleLaunchRealChrome}
                    disabled={launchingChrome}
                    className="rounded-xl bg-[#1E1D1B] px-3.5 py-2 text-xs font-bold text-white hover:bg-black disabled:opacity-60"
                  >
                    {launchingChrome ? 'Opening Chrome...' : 'Open Real Chrome'}
                  </button>
                  <button
                    type="button"
                    onClick={refreshChromeCdpStatus}
                    className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-[#1D1C1A] shadow-sm hover:bg-[#EFE9E0]"
                  >
                    Check Status
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-[#6E655D]">
                    Paste Product Links (1 link per line — up to 100+ Shopee / TikTok / Lazada / Pinduoduo links)
                  </label>
                  <textarea
                    rows={5}
                    value={chromeUrlsText}
                    onChange={(e) => setChromeUrlsText(e.target.value)}
                    placeholder={`https://s.shopee.com.my/2BGkdfkuBD\nhttps://s.shopee.com.my/2LaBxwfjZT`}
                    className="w-full rounded-2xl bg-[#FAF7F2] p-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-[#F58C56]"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-[#6E655D]">
                      Default Category (for new items)
                    </label>
                    <select
                      value={chromeCategory}
                      onChange={(e) => setChromeCategory(e.target.value)}
                      className="w-full rounded-xl bg-[#FAF7F2] px-3 py-2.5 text-xs font-bold"
                    >
                      {categories.map((cat) => (
                        <option key={cat.slug} value={cat.slug}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-[#6E655D]">
                      Pause Between Links (seconds)
                    </label>
                    <input
                      type="number"
                      min="2"
                      max="60"
                      step="0.5"
                      value={chromeDelaySec}
                      onChange={(e) => setChromeDelaySec(e.target.value)}
                      className="w-full rounded-xl bg-[#FAF7F2] px-3 py-2.5 text-xs font-bold"
                    />
                  </div>

                  <div className="flex items-end gap-2">
                    {!chromeJob?.running ? (
                      <button
                        type="button"
                        onClick={() => handleStartChromeSync(null)}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[#F58C56] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#e57c45]"
                      >
                        <Play className="h-3.5 w-3.5" /> Start Bulk Chrome Sync
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleStopChromeSync}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-rose-700"
                      >
                        <Square className="h-3.5 w-3.5" /> Stop Sync
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-2xl bg-[#FAF7F2] px-3.5 py-2.5 text-xs font-semibold text-[#1D1C1A]">
                    <input
                      type="checkbox"
                      checked={chromeHeadless}
                      onChange={(e) => setChromeHeadless(e.target.checked)}
                      className="accent-[#F58C56]"
                    />
                    <span>
                      Run in <span className="font-bold">Headless Chrome</span> (background mode —
                      close open Chrome first)
                    </span>
                  </label>
                  <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-2xl bg-[#FAF7F2] px-3.5 py-2.5 text-xs font-semibold text-[#1D1C1A]">
                    <input
                      type="checkbox"
                      checked={chromeAutoClose}
                      onChange={(e) => setChromeAutoClose(e.target.checked)}
                      className="accent-[#F58C56]"
                    />
                    <span>
                      <span className="font-bold">Auto-close Chrome window</span> once all links
                      complete
                    </span>
                  </label>
                </div>

                {chromeJob && (chromeJob.running || chromeJob.total > 0) && (
                  <div className="rounded-2xl border border-[#EFE9E0] bg-[#FAF7F2] p-3.5">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
                      <span>
                        Progress: {chromeJob.completed}/{chromeJob.total} • Saved:{' '}
                        <span className="text-emerald-700">{chromeJob.succeeded}</span> • Failed:{' '}
                        <span className="text-rose-700">{chromeJob.failed}</span>
                      </span>
                      <div className="flex items-center gap-2">
                        {chromeJob.running && chromeJob.currentUrl && (
                          <span className="max-w-xs truncate text-[#C85A21]">
                            Opening: {chromeJob.currentUrl}
                          </span>
                        )}
                        {!chromeJob.running && (
                          <button
                            type="button"
                            onClick={handleClearChromeJob}
                            className="rounded-lg bg-white px-2 py-1 text-[11px] font-bold text-[#6E655D] hover:bg-[#EFE9E0]"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#EFE9E0]">
                      <div
                        className="h-full bg-[#F58C56] transition-all"
                        style={{
                          width: `${
                            chromeJob.total > 0
                              ? Math.round((chromeJob.completed / chromeJob.total) * 100)
                              : 0
                          }%`,
                        }}
                      />
                    </div>

                    {chromeJob.running && chromeJob.waitingUser && chromeJob.waitMessage && (
                      <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                        {chromeJob.waitMessage}
                      </div>
                    )}

                    {chromeJob.paused && chromeJob.remainingUrls?.length > 0 && (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                        <span>{chromeJob.pauseReason}</span>
                        <button
                          type="button"
                          onClick={() => handleStartChromeSync(chromeJob.remainingUrls)}
                          className="rounded-xl bg-[#1E1D1B] px-3 py-1.5 text-[11px] font-bold text-white"
                        >
                          Resume Remaining ({chromeJob.remainingUrls.length})
                        </button>
                      </div>
                    )}

                    {chromeJob.results?.length > 0 && (
                      <div className="mt-3 max-h-48 space-y-1.5 overflow-y-auto">
                        {chromeJob.results.map((r, i) => (
                          <div
                            key={r.url + i}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-[11px]"
                          >
                            <div className="min-w-0 flex-1">
                              <span
                                className={`mr-1.5 font-extrabold ${
                                  r.ok ? 'text-emerald-700' : 'text-rose-700'
                                }`}
                              >
                                {r.ok ? `${r.action === 'updated' ? 'Updated' : 'Added'} ${r.code}` : 'Error'}
                              </span>
                              <span className="font-semibold text-[#1D1C1A]">
                                {r.ok ? r.title : r.url}
                              </span>
                            </div>
                            {r.ok ? (
                              <div className="flex items-center gap-2 font-bold text-[#6E655D]">
                                <span>{r.price ? `RM ${Number(r.price).toFixed(2)}` : 'No price'}</span>
                                <span>• {r.soldCount ?? 0} sold</span>
                                <span>• ★ {r.rating ?? '-'}</span>
                                <span>• {r.imageCount || 0} imgs</span>
                              </div>
                            ) : (
                              <span className="text-rose-700">{r.error}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

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
                      onChange={(e) => {
                        const nextTitle = e.target.value;
                        setForm((prev) => {
                          const next = { ...prev, title: nextTitle };
                          return { ...next, tags: autoTagsForForm(next) };
                        });
                      }}
                      placeholder="e.g. Baseus MagSafe Powerbank 10000mAh"
                      className="w-full rounded-xl bg-[#FAF7F2] px-3 py-2 text-sm font-semibold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-[#78716C]">
                      Category ({categories.filter((c) => c.slug !== 'all').length} available)
                    </label>
                    <CategoryDropdown
                      categories={categories}
                      value={form.category_slug}
                      onChange={(nextSlug) => {
                        setForm((prev) => {
                          const next = { ...prev, category_slug: nextSlug };
                          return { ...next, tags: autoTagsForForm(next) };
                        });
                      }}
                    />
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <label className="text-[11px] font-bold text-[#78716C]">
                        Smart Search Tags (auto-added, min 5)
                      </label>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                            parseTagList(form.tags).length >= 5
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {parseTagList(form.tags).length}/5+ tags
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setTagsManuallyEdited(false);
                            setForm((prev) => ({ ...prev, tags: autoTagsForForm(prev, true) }));
                          }}
                          className="rounded-full bg-[#FFF0E6] px-2 py-0.5 text-[10px] font-bold text-[#C85A21] hover:bg-[#FFE4D1]"
                        >
                          Auto-Generate
                        </button>
                      </div>
                    </div>
                    <textarea
                      rows={3}
                      value={form.tags}
                      onChange={(e) => {
                        setTagsManuallyEdited(true);
                        setForm({ ...form, tags: e.target.value });
                      }}
                      placeholder="Auto-generated from product title & category (at least 5 tags)..."
                      className="w-full rounded-xl bg-[#FAF7F2] px-3 py-2 text-xs font-semibold"
                    />
                    <p className="mt-1 text-[10px] text-[#8C837A]">
                      Tags update automatically from your title &amp; category. At least 5 smart
                      search tags are guaranteed on save.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-bold text-[#78716C]">
                    Description
                  </label>
                  <textarea
                    rows={2}
                    value={form.description}
                    onChange={(e) => {
                      const nextDesc = e.target.value;
                      setForm((prev) => {
                        const next = { ...prev, description: nextDesc };
                        return { ...next, tags: autoTagsForForm(next) };
                      });
                    }}
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
                              onClick={() => handleChromeSyncOne(pl.id)}
                              disabled={syncingChromeOne === pl.id}
                              className="inline-flex items-center gap-1 rounded-full bg-[#FFF0E6] px-2.5 py-1 text-[11px] font-bold text-[#C85A21] shadow-sm hover:bg-[#FFE4D1] disabled:opacity-60"
                            >
                              <Globe className="h-3 w-3" />
                              {syncingChromeOne === pl.id ? 'Syncing...' : 'Chrome Sync'}
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

          {/* Products Table / List with Smart Search + 10/page Pagination */}
          {(() => {
            const activeCatalogList = catalogSearchResults !== null ? catalogSearchResults : products;
            const totalCatalogCount = activeCatalogList.length;
            const totalPages = Math.max(1, Math.ceil(totalCatalogCount / CATALOG_PAGE_SIZE));
            const safePage = Math.min(catalogPage, totalPages);
            const visibleCatalogProducts = showAllCatalog
              ? activeCatalogList
              : activeCatalogList.slice(
                  (safePage - 1) * CATALOG_PAGE_SIZE,
                  safePage * CATALOG_PAGE_SIZE
                );
            const startItem =
              totalCatalogCount === 0
                ? 0
                : showAllCatalog
                  ? 1
                  : (safePage - 1) * CATALOG_PAGE_SIZE + 1;
            const endItem = showAllCatalog
              ? totalCatalogCount
              : Math.min(totalCatalogCount, safePage * CATALOG_PAGE_SIZE);

            return (
              <section
                id="admin-catalog-section"
                className="rounded-[24px] border border-[#EFE9E0] bg-white p-5 shadow-[0_6px_22px_rgba(32,24,16,0.04)]"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
                  <h3 className="text-sm font-extrabold text-[#1D1C1A]">
                    Catalog (
                    {catalogSearchResults !== null
                      ? `${totalCatalogCount} of ${products.length}`
                      : products.length}
                    )
                  </h3>

                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end sm:max-w-xl">
                    <form
                      onSubmit={handleCatalogSmartSearch}
                      className="flex min-w-0 flex-1 items-center gap-1.5 rounded-2xl bg-[#FAF7F2] px-3 py-1.5 focus-within:ring-2 focus-within:ring-[#F58C56]"
                    >
                      <Search className="h-3.5 w-3.5 shrink-0 text-[#8C837A]" />
                      <input
                        type="text"
                        value={catalogQuery}
                        onChange={(e) => setCatalogQuery(e.target.value)}
                        placeholder="Smart search (e.g. ps5, under 80, kipas, #011)"
                        className="w-full bg-transparent text-xs font-semibold text-[#1D1C1A] placeholder:text-[#A39A90] focus:outline-none"
                      />
                      {catalogQuery && (
                        <button
                          type="button"
                          onClick={handleClearCatalogSearch}
                          aria-label="Clear catalog search"
                          className="rounded-full p-0.5 text-[#8C837A] hover:bg-[#EFE9E0] hover:text-[#1D1C1A]"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="submit"
                        disabled={searchingCatalog}
                        className="shrink-0 rounded-xl bg-[#1E1D1B] px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-black disabled:opacity-60"
                      >
                        {searchingCatalog ? 'Searching...' : 'Smart Search'}
                      </button>
                    </form>

                    <button
                      type="button"
                      onClick={onCatalogChanged}
                      className="inline-flex items-center gap-1 rounded-xl bg-[#FAF7F2] px-3 py-2 text-xs font-bold text-[#F58C56] hover:bg-[#EFE9E0]"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Refresh
                    </button>
                  </div>
                </div>

                {visibleCatalogProducts.length === 0 ? (
                  <div className="rounded-2xl bg-[#FAF7F2] p-6 text-center text-xs font-semibold text-[#8C837A]">
                    No products matched your smart search.{' '}
                    {catalogSearchResults !== null && (
                      <button
                        type="button"
                        onClick={handleClearCatalogSearch}
                        className="ml-1 font-bold text-[#F58C56] underline"
                      >
                        Reset search
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                    {visibleCatalogProducts.map((prod) => (
                      <div
                        key={prod.id}
                        data-testid="admin-catalog-row"
                        className="flex items-center gap-3 rounded-2xl bg-[#FAF7F2] p-3"
                      >
                        <img
                          src={prod.image_url}
                          alt={prod.title}
                          className="h-12 w-12 shrink-0 rounded-xl bg-white object-contain p-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-bold text-[#8C837A]">
                              {prod.code}
                            </span>
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
                )}

                {totalCatalogCount > 0 && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#F3EDE4] pt-3">
                    <span className="text-xs font-semibold text-[#8C837A]">
                      Showing {startItem}–{endItem} of {totalCatalogCount} products
                    </span>

                    <div className="flex flex-wrap items-center gap-2">
                      {!showAllCatalog && (
                        <>
                          <button
                            type="button"
                            onClick={() => setCatalogPage((p) => Math.max(1, p - 1))}
                            disabled={safePage <= 1}
                            className="inline-flex items-center gap-1 rounded-xl bg-[#FAF7F2] px-3 py-1.5 text-xs font-bold text-[#1D1C1A] transition hover:bg-[#EFE9E0] disabled:opacity-40"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" /> Previous
                          </button>
                          <span className="px-2 text-xs font-bold text-[#6E655D]">
                            Page {safePage} / {totalPages}
                          </span>
                          <button
                            type="button"
                            onClick={() => setCatalogPage((p) => Math.min(totalPages, p + 1))}
                            disabled={safePage >= totalPages}
                            className="inline-flex items-center gap-1 rounded-xl bg-[#FAF7F2] px-3 py-1.5 text-xs font-bold text-[#1D1C1A] transition hover:bg-[#EFE9E0] disabled:opacity-40"
                          >
                            Next <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setShowAllCatalog((v) => !v);
                          setCatalogPage(1);
                        }}
                        className="rounded-xl bg-[#FFF0E6] px-3 py-1.5 text-xs font-bold text-[#C85A21] transition hover:bg-[#FFE4D1]"
                      >
                        {showAllCatalog ? 'Show 10 / Page' : `See All Products (${totalCatalogCount})`}
                      </button>
                    </div>
                  </div>
                )}
              </section>
            );
          })()}
        </>
      )}
      </div>

      {/* Mobile Admin Floating Bottom Dock (matches Storefront PWA dock) */}
      <nav
        aria-label="Admin mobile navigation"
        className="fixed bottom-3 left-1/2 z-40 w-[calc(100%-20px)] max-w-md -translate-x-1/2 rounded-[26px] bg-[#1E1D1B] px-2.5 py-2 shadow-[0_14px_38px_rgba(18,16,14,0.32)] md:hidden"
      >
        <div className="flex items-center justify-between">
          {[...menuNavItems, ...generalNavItems].map((item) => {
            const Icon = item.icon;
            const isActive = adminMenu === item.id;
            const shortLabel = item.id === 'password' ? 'Password' : item.label;
            return (
              <button
                key={item.id}
                type="button"
                aria-label={item.label}
                onClick={() => {
                  setAdminMenu(item.id);
                  setStatusBanner(null);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`relative flex flex-col items-center gap-0.5 rounded-2xl px-2.5 py-1 transition ${
                  isActive
                    ? 'bg-[#F58C56]/15 text-[#F58C56]'
                    : 'text-[#A69F98] hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="whitespace-nowrap text-[10px] font-bold">{shortLabel}</span>
              </button>
            );
          })}
          {onNavigateStorefront && (
            <button
              type="button"
              aria-label="View Storefront"
              onClick={onNavigateStorefront}
              className="flex flex-col items-center gap-0.5 rounded-2xl px-2.5 py-1 text-[#A69F98] transition hover:text-white"
            >
              <Store className="h-4 w-4" />
              <span className="whitespace-nowrap text-[10px] font-bold">Store</span>
            </button>
          )}
        </div>
      </nav>

      <ConfirmDialog
        open={Boolean(pendingSaveProduct)}
        title={pendingSaveProduct?.isEdit ? 'Confirm Product Update' : 'Confirm Adding Product'}
        description={
          pendingSaveProduct?.isEdit
            ? `Are you sure you want to save these changes to ${pendingSaveProduct.productCode}?`
            : 'Are you sure you want to publish this product to the BeliApaHarini catalog?'
        }
        details={pendingSaveProduct?.details || []}
        confirmLabel={pendingSaveProduct?.isEdit ? 'Yes, Save Changes' : 'Yes, Add Product'}
        cancelLabel="Review Details"
        loading={saving}
        onConfirm={confirmSaveProduct}
        onCancel={() => setPendingSaveProduct(null)}
      />

      <ConfirmDialog
        open={Boolean(pendingDeleteProduct)}
        title="Confirm Product Deletion"
        description="Are you sure you want to permanently remove this product from the catalog? This action cannot be undone."
        details={
          pendingDeleteProduct
            ? [
                { label: 'Product Code', value: pendingDeleteProduct.code },
                { label: 'Product Title', value: pendingDeleteProduct.title },
              ]
            : []
        }
        confirmLabel="Yes, Delete Product"
        cancelLabel="Keep Product"
        variant="danger"
        loading={deletingProduct}
        onConfirm={confirmDeleteProduct}
        onCancel={() => {
          if (!deletingProduct) setPendingDeleteProduct(null);
        }}
      />

      <ConfirmDialog
        open={showLogoutConfirm}
        title="Confirm Sign Out"
        description="Are you sure you want to sign out of the Admin Dashboard?"
        confirmLabel="Yes, Log Out"
        cancelLabel="Stay Signed In"
        variant="danger"
        loading={loggingOut}
        onConfirm={confirmLogout}
        onCancel={() => {
          if (!loggingOut) setShowLogoutConfirm(false);
        }}
      />

      <ResultDialog
        open={Boolean(productResultModal)}
        status={productResultModal?.status || 'success'}
        title={productResultModal?.title}
        message={productResultModal?.message}
        details={productResultModal?.details || []}
        onClose={() => setProductResultModal(null)}
      />
    </div>
  );
}
