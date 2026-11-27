const ADMIN_TOKEN_KEY = 'hja_admin_token';

export function getStoredToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY) || '';
}

export function setStoredToken(token) {
  if (token) {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
  }
}

async function apiRequest(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data.code || '';
    throw err;
  }
  return data;
}

export function fetchStoreInfo() {
  return apiRequest('/api/store-info');
}

export function fetchNotifications() {
  return apiRequest('/api/notifications');
}

export function fetchProducts(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '' && v !== false) {
      qs.set(k, String(v));
    }
  });
  return apiRequest(`/api/products?${qs.toString()}`);
}

export function syncProductPrices(id, force = false) {
  return apiRequest(`/api/products/${id}/sync-prices`, {
    method: 'POST',
    body: JSON.stringify({ force }),
  });
}

export function trackPlatformClick(id, platform) {
  return apiRequest(`/api/products/${id}/click`, {
    method: 'POST',
    body: JSON.stringify({ platform }),
  });
}

function adminHeaders() {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function adminLogin(username, password) {
  return apiRequest('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export function adminLogout() {
  return apiRequest('/api/admin/logout', {
    method: 'POST',
    headers: adminHeaders(),
  });
}

export function verifyAdminSession(passive = false) {
  return apiRequest(`/api/admin/verify${passive ? '?passive=1' : ''}`, {
    headers: adminHeaders(),
  });
}

export function keepAliveAdminSession() {
  return apiRequest('/api/admin/keepalive', {
    method: 'POST',
    headers: adminHeaders(),
  });
}

export function fetchAdminAnalytics() {
  return apiRequest('/api/admin/analytics', { headers: adminHeaders() });
}

export function fetchUrlMetadata(url) {
  return apiRequest('/api/admin/fetch-meta', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ url }),
  });
}

export function uploadProductImage(file) {
  const form = new FormData();
  form.append('image', file);
  return apiRequest('/api/admin/upload', {
    method: 'POST',
    headers: adminHeaders(),
    body: form,
  });
}

export function createProduct(payload) {
  return apiRequest('/api/admin/products', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
}

export function updateProduct(id, payload) {
  return apiRequest(`/api/admin/products/${id}`, {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
}

export function deleteProduct(id) {
  return apiRequest(`/api/admin/products/${id}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
}

export function bulkImportProducts(format, content) {
  return apiRequest('/api/admin/import', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ format, content }),
  });
}

export function exportProductsJson() {
  return apiRequest('/api/admin/export', { headers: adminHeaders() });
}

export async function exportProductsCsv() {
  const res = await fetch('/api/admin/export?format=csv', { headers: adminHeaders() });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Export failed (${res.status})`);
  }
  return res.text();
}

export function changeAdminCredentials(payload) {
  return apiRequest('/api/admin/change-password', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
}

export function syncAllProducts() {
  return apiRequest('/api/admin/sync-all', {
    method: 'POST',
    headers: adminHeaders(),
  });
}

export function getChromeSyncStatus() {
  return apiRequest('/api/admin/chrome/status', { headers: adminHeaders() });
}

export function launchRealChrome() {
  return apiRequest('/api/admin/chrome/launch', {
    method: 'POST',
    headers: adminHeaders(),
  });
}

export function startChromeBulkSync(payload) {
  return apiRequest('/api/admin/chrome/sync-start', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
}

export function pollChromeBulkSync() {
  return apiRequest('/api/admin/chrome/sync-status', { headers: adminHeaders() });
}

export function stopChromeBulkSync() {
  return apiRequest('/api/admin/chrome/sync-stop', {
    method: 'POST',
    headers: adminHeaders(),
  });
}

export function clearChromeBulkSync() {
  return apiRequest('/api/admin/chrome/sync-clear', {
    method: 'POST',
    headers: adminHeaders(),
  });
}

export function extractOneViaChrome(payload) {
  return apiRequest('/api/admin/chrome/extract-one', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
}
