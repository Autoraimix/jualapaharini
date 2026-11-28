function extractMetaCode(text) {
  const match = String(text || '').match(/"code"\s*:\s*(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

export function classifyError(errorText) {
  const t = String(errorText || '').toLowerCase();
  const metaCode = extractMetaCode(errorText);

  if (
    metaCode === 190 ||
    t.includes('session has expired') ||
    t.includes('invalid oauth access token') ||
    t.includes('oauthexception') ||
    t.includes('access token')
  ) {
    return {
      type: 'token_expired',
      severity: 'critical',
      code: metaCode ? String(metaCode) : '190',
      knownFix: 'Refresh the Threads access token using th_refresh_token grant and retry',
    };
  }

  if (
    t.includes('rate limit') ||
    t.includes('too many requests') ||
    t.includes('"code":4') ||
    t.includes('"code":17') ||
    t.includes('"code":32')
  ) {
    return {
      type: 'rate_limited',
      severity: 'warning',
      code: metaCode ? String(metaCode) : '429',
      knownFix: 'Wait 15 minutes before retrying — Threads API rate limit reached',
    };
  }

  if (
    t.includes('community standards') ||
    t.includes('content policy') ||
    t.includes('spam') ||
    t.includes('violat') ||
    metaCode === 368 ||
    metaCode === 200
  ) {
    return {
      type: 'content_policy',
      severity: 'error',
      code: metaCode ? String(metaCode) : null,
      knownFix: 'Review post content for policy violations before resubmitting',
    };
  }

  if (
    t.includes('econnrefused') ||
    t.includes('etimedout') ||
    t.includes('enotfound') ||
    t.includes('fetch failed') ||
    t.includes('network')
  ) {
    return {
      type: 'network',
      severity: 'warning',
      code: null,
      knownFix: 'Transient network error — retry after a short delay',
    };
  }

  if (
    t.includes('sql') ||
    t.includes('relation') ||
    t.includes('database') ||
    t.includes('sqlite')
  ) {
    return {
      type: 'db_error',
      severity: 'critical',
      code: null,
      knownFix: 'Database error — check DB connection and schema',
    };
  }

  return {
    type: 'unknown',
    severity: 'error',
    code: metaCode ? String(metaCode) : null,
    knownFix: null,
  };
}
