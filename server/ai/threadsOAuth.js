import { randomUUID } from 'node:crypto';
import { callExchangeEndpoint } from './threadsToken.js';

const AUTHORIZE_URL = 'https://www.threads.net/oauth/authorize';
const TOKEN_EXCHANGE_URL = 'https://graph.threads.net/oauth/access_token';
const SCOPES = 'threads_basic,threads_content_publish,threads_read_replies,threads_manage_replies';
const STATE_TTL_MS = 10 * 60_000;

const oauthStates = new Map();

export function createOAuthState(adminUser = 'admin') {
  const state = randomUUID();
  oauthStates.set(state, { adminUser, expiresAt: Date.now() + STATE_TTL_MS });
  return state;
}

export function consumeOAuthState(state) {
  const entry = oauthStates.get(state);
  oauthStates.delete(state);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return { adminUser: entry.adminUser };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of oauthStates) {
    if (entry.expiresAt < now) oauthStates.delete(key);
  }
}, 15 * 60_000).unref?.();

export function buildAuthorizationUrl(state, redirectUri) {
  const appId = process.env.APP_ID;
  if (!appId) throw new Error('APP_ID is not configured in .env');
  if (!redirectUri.startsWith('https://')) {
    throw new Error("This page isn't being served over https:// — Threads login requires a secure connection.");
  }

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: SCOPES,
    response_type: 'code',
    state,
  });
  return `${AUTHORIZE_URL}?${params}`;
}

async function exchangeCodeForShortLivedToken(code, redirectUri) {
  const appId = process.env.APP_ID;
  const appSecret = process.env.APP_SECRET;
  if (!appId || !appSecret) throw new Error('APP_ID and APP_SECRET must be configured');

  const body = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code,
  });

  const res = await fetch(TOKEN_EXCHANGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error('Threads rejected that login — the link may have expired. Please try connecting again.');
  }
  const data = await res.json();
  return data.access_token;
}

async function fetchThreadsUsername(accessToken) {
  const params = new URLSearchParams({ fields: 'id,username', access_token: accessToken });
  const res = await fetch(`https://graph.threads.net/v1.0/me?${params}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error("Connected, but couldn't read the account's username afterward.");
  }
  const data = await res.json();
  return data.username;
}

export async function completeOAuthConnection(code, redirectUri) {
  const shortLivedToken = await exchangeCodeForShortLivedToken(code, redirectUri);
  const { token: longLivedToken } = await callExchangeEndpoint(shortLivedToken);
  const username = await fetchThreadsUsername(longLivedToken);
  return { username, longLivedToken };
}
