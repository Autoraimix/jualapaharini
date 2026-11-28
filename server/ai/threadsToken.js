import db from '../db.js';

const DB_KEY = 'threads_system_token';
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const RETRY_DELAY_MS = 5 * 60 * 1000;
const MAX_RETRIES = 3;
const TOKEN_REFRESH_TRIGGER_DAYS = 50;

let cachedToken = null;
let refreshTimer = null;

function saveTokenToDB(token) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO system_config (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(DB_KEY, token, now);
}

function loadTokenFromDB() {
  try {
    const row = db.prepare('SELECT value FROM system_config WHERE key = ?').get(DB_KEY);
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export function getThreadsToken() {
  return cachedToken || loadTokenFromDB() || process.env.THREADS_API_KEY;
}

async function callRefreshEndpoint(currentToken) {
  const url = new URL('https://graph.threads.net/refresh_access_token');
  url.searchParams.set('grant_type', 'th_refresh_token');
  url.searchParams.set('access_token', currentToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token renewal failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return { token: data.access_token, expiresIn: data.expires_in };
}

export async function callExchangeEndpoint(shortLivedToken) {
  const appId = process.env.APP_ID;
  const appSecret = process.env.APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error('APP_ID and APP_SECRET required for initial token exchange');
  }

  const url = new URL('https://graph.threads.net/access_token');
  url.searchParams.set('grant_type', 'th_exchange_token');
  url.searchParams.set('client_id', appId);
  url.searchParams.set('client_secret', appSecret);
  url.searchParams.set('access_token', shortLivedToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return { token: data.access_token, expiresIn: data.expires_in };
}

export async function refreshThreadsToken() {
  const currentToken = cachedToken || loadTokenFromDB() || process.env.THREADS_API_KEY;
  if (!currentToken) {
    throw new Error('No THREADS_API_KEY found. Set the initial token in .env.');
  }

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { token } = await callRefreshEndpoint(currentToken);
      cachedToken = token;
      process.env.THREADS_API_KEY = token;
      saveTokenToDB(token);
      return token;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }
  throw lastError;
}

export async function refreshUserToken(currentToken) {
  const url = new URL('https://graph.threads.net/refresh_access_token');
  url.searchParams.set('grant_type', 'th_refresh_token');
  url.searchParams.set('access_token', currentToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`User token refresh failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return data.access_token;
}

export async function refreshAllUserAccountTokens() {
  const accounts = db
    .prepare('SELECT id, username, api_key FROM thread_accounts WHERE api_key IS NOT NULL')
    .all();

  let refreshed = 0;
  let failed = 0;
  const errors = [];

  for (const account of accounts) {
    if (!account.api_key) continue;
    try {
      const newToken = await refreshUserToken(account.api_key);
      db.prepare('UPDATE thread_accounts SET api_key = ?, token_issued_at = ?, updated_at = ? WHERE id = ?').run(
        newToken,
        new Date().toISOString(),
        new Date().toISOString(),
        account.id
      );
      refreshed++;
    } catch (err) {
      failed++;
      errors.push(`@${account.username}: ${err.message}`);
    }
  }

  return { refreshed, failed, errors };
}

export async function keepAliveAllUserTokens() {
  const appId = process.env.APP_ID;
  const appSecret = process.env.APP_SECRET;
  if (!appId || !appSecret) {
    return refreshAllUserAccountTokens();
  }

  const accounts = db
    .prepare('SELECT id, username, api_key FROM thread_accounts WHERE api_key IS NOT NULL')
    .all();

  let refreshed = 0;
  let failed = 0;
  const errors = [];

  for (const account of accounts) {
    if (!account.api_key) continue;
    try {
      const { token } = await callExchangeEndpoint(account.api_key);
      db.prepare('UPDATE thread_accounts SET api_key = ?, token_issued_at = ?, updated_at = ? WHERE id = ?').run(
        token,
        new Date().toISOString(),
        new Date().toISOString(),
        account.id
      );
      refreshed++;
    } catch (err) {
      try {
        const newToken = await refreshUserToken(account.api_key);
        db.prepare('UPDATE thread_accounts SET api_key = ?, token_issued_at = ?, updated_at = ? WHERE id = ?').run(
          newToken,
          new Date().toISOString(),
          new Date().toISOString(),
          account.id
        );
        refreshed++;
      } catch (err2) {
        failed++;
        errors.push(`@${account.username}: ${err2.message || err.message}`);
      }
    }
  }

  return { refreshed, failed, errors };
}

export async function checkAndRefreshExpiringTokens() {
  const cutoff = new Date(Date.now() - TOKEN_REFRESH_TRIGGER_DAYS * 86_400_000).toISOString();
  const accounts = db
    .prepare(
      `SELECT id, username, api_key, token_issued_at FROM thread_accounts
       WHERE api_key IS NOT NULL AND (token_issued_at IS NULL OR token_issued_at <= ?)`
    )
    .all(cutoff);

  let refreshed = 0;
  let failed = 0;
  const errors = [];

  for (const account of accounts) {
    if (!account.api_key) continue;
    try {
      const newToken = await refreshUserToken(account.api_key);
      db.prepare('UPDATE thread_accounts SET api_key = ?, token_issued_at = ?, updated_at = ? WHERE id = ?').run(
        newToken,
        new Date().toISOString(),
        new Date().toISOString(),
        account.id
      );
      refreshed++;
    } catch (err) {
      failed++;
      errors.push(`@${account.username}: ${err.message}`);
    }
  }

  return { refreshed, failed, errors };
}

export function startTokenRefreshSchedule() {
  if (refreshTimer) return;
  const dbToken = loadTokenFromDB();
  if (dbToken) {
    cachedToken = dbToken;
    process.env.THREADS_API_KEY = dbToken;
  }

  refreshTimer = setInterval(async () => {
    try {
      if (getThreadsToken()) {
        await refreshThreadsToken();
      }
    } catch {
      // Non-fatal
    }
  }, REFRESH_INTERVAL_MS);
  refreshTimer.unref?.();
}
