import db from '../db.js';
import { getThreadsToken, refreshThreadsToken, refreshUserToken } from './threadsToken.js';
import { classifyError } from './errorClassifier.js';
import { executeAiTask, safeParseJSON } from './openrouter.js';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 30 * 60 * 1000;
const RATE_LIMIT_DELAY_MS = 60 * 60 * 1000;

async function humanDelay(extraMs = 0) {
  const base = 5_000 + Math.floor(Math.random() * 85_000);
  await new Promise((r) => setTimeout(r, base + extraMs));
}

async function publishSingle(text, accessToken, imageUrl = null) {
  const containerBody = imageUrl
    ? { media_type: 'IMAGE', image_url: imageUrl, text, access_token: accessToken }
    : { media_type: 'TEXT', text, access_token: accessToken };

  const createRes = await fetch('https://graph.threads.net/v1.0/me/threads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(containerBody),
  });
  if (!createRes.ok) {
    const body = await createRes.text();
    throw Object.assign(new Error(body), { rawBody: body });
  }
  const { id: containerId } = await createRes.json();

  const pubRes = await fetch('https://graph.threads.net/v1.0/me/threads_publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: containerId, access_token: accessToken }),
  });
  if (!pubRes.ok) {
    const body = await pubRes.text();
    throw Object.assign(new Error(body), { rawBody: body });
  }
  const { id: postId } = await pubRes.json();
  return postId;
}

function logEvent(data) {
  const res = db
    .prepare(
      `INSERT INTO automation_events
        (type, severity, error_message, error_code, context, account_id, post_id, fix_type, fix_applied, fix_outcome, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      data.type,
      data.severity,
      String(data.errorMessage || '').slice(0, 1000),
      data.errorCode ?? null,
      data.context ? JSON.stringify(data.context) : null,
      data.accountId ?? null,
      data.postId ?? null,
      data.fixType ?? null,
      data.fixApplied ?? null,
      data.fixOutcome ?? null,
      new Date().toISOString()
    );
  return Number(res.lastInsertRowid);
}

function runAiDiagnosisAsync(eventId, errorType, errorMessage, contextJson) {
  if (!process.env.OPENROUTER_API_KEY) return;
  (async () => {
    try {
      const systemPrompt =
        'You are an expert diagnostician for an automated social media posting system built on Meta Threads API. ' +
        'Respond ONLY with valid JSON: {"diagnosis":"...","suggestion":"...","confidence":"high"|"medium"|"low"}';
      const userPrompt = `Error type: ${errorType}\nError message: ${errorMessage}\nContext: ${contextJson}`;
      const raw = await executeAiTask(systemPrompt, userPrompt, true, { module: 'ai-healer' });
      const parsed = safeParseJSON(raw, {});
      db.prepare(
        `UPDATE automation_events
         SET ai_diagnosis = ?, ai_suggestion = ?, ai_confidence = ?, fix_type = 'ai_suggested', fix_outcome = 'pending'
         WHERE id = ?`
      ).run(
        parsed.diagnosis || 'Unable to produce diagnosis.',
        parsed.suggestion || 'Manual review required.',
        parsed.confidence || 'low',
        eventId
      );
    } catch {
      // Non-blocking
    }
  })();
}

export async function processThreadsQueue() {
  const pauseConfig = db
    .prepare("SELECT value FROM system_config WHERE key = 'automation_paused'")
    .get();
  if (pauseConfig?.value === 'true') {
    return { processed: 0, success: 0, failed: 0, retried: 0, skipped: 0, message: 'Automation paused' };
  }

  const nowIso = new Date().toISOString();
  const due = db
    .prepare(
      `SELECT
         p.*,
         a.api_key AS account_api_key,
         a.username AS account_username,
         a.persona AS account_persona,
         a.rate_limited_until AS account_rate_limited_until,
         a.strikes AS account_strikes,
         a.id AS account_db_id
       FROM threads_scheduled_posts p
       LEFT JOIN thread_accounts a ON p.account_id = a.id
       WHERE p.status = 'pending'
         AND p.scheduled_at <= ?
         AND (p.next_retry_at IS NULL OR p.next_retry_at <= ?)`
    )
    .all(nowIso, nowIso);

  if (due.length === 0) {
    return { processed: 0, success: 0, failed: 0, retried: 0, skipped: 0, message: 'No posts due' };
  }

  let success = 0;
  let failed = 0;
  let retried = 0;
  let skipped = 0;

  for (const row of due) {
    if (row.account_rate_limited_until && row.account_rate_limited_until > nowIso) {
      skipped++;
      continue;
    }

    const currentStrikes = row.account_strikes ?? 0;
    const extraPenaltyMs = currentStrikes >= 5 ? 60_000 : 0;
    await humanDelay(extraPenaltyMs);

    const token = row.account_api_key || getThreadsToken();
    if (!token) {
      logEvent({
        type: 'token_expired',
        severity: 'critical',
        errorMessage: `No API key configured for @${row.account_username}`,
        accountId: row.account_id,
        postId: row.id,
        fixType: 'none',
        fixOutcome: 'failed',
      });
      db.prepare("UPDATE threads_scheduled_posts SET status = 'failed', error_message = ? WHERE id = ?").run(
        `No API key for @${row.account_username}`,
        row.id
      );
      failed++;
      continue;
    }

    try {
      const postId = await publishSingle(row.content, token, row.image_url);
      const publishedAt = new Date().toISOString();

      db.prepare(
        "UPDATE threads_scheduled_posts SET status = 'published', published_at = ?, threads_post_id = ? WHERE id = ?"
      ).run(publishedAt, postId, row.id);

      db.prepare(
        `INSERT INTO threads_posts (topic, posts, personas, post_type, status, is_draft, published_at, threads_post_id, error_message, created_at, updated_at)
         VALUES (?, ?, ?, 'single', 'success', 'false', ?, ?, NULL, ?, ?)`
      ).run(
        row.topic,
        JSON.stringify([{ content: row.content, imageUrl: row.image_url ?? undefined }]),
        `@${row.account_username ?? 'unknown'} · ${row.account_persona ?? ''}`,
        publishedAt,
        postId,
        publishedAt,
        publishedAt
      );

      if (row.account_db_id && currentStrikes > 0) {
        db.prepare('UPDATE thread_accounts SET strikes = ? WHERE id = ?').run(
          Math.max(0, currentStrikes - 1),
          row.account_db_id
        );
      }

      success++;
    } catch (err) {
      const rawBody = err?.rawBody ?? err?.message ?? '';
      const classified = classifyError(rawBody);
      const retryCount = row.retry_count ?? 0;
      const nowMs = Date.now();

      if (classified.type === 'token_expired') {
        const eventId = logEvent({
          type: 'token_expired',
          severity: 'critical',
          errorMessage: rawBody,
          errorCode: classified.code,
          context: { username: row.account_username, postId: row.id, topic: row.topic, retryCount },
          accountId: row.account_id,
          postId: row.id,
          fixType: 'predetermined',
          fixApplied: classified.knownFix,
          fixOutcome: 'pending',
        });

        try {
          let newToken;
          if (row.account_api_key) {
            newToken = await refreshUserToken(row.account_api_key);
            db.prepare('UPDATE thread_accounts SET api_key = ?, updated_at = ? WHERE id = ?').run(
              newToken,
              new Date().toISOString(),
              row.account_id
            );
          } else {
            newToken = await refreshThreadsToken();
          }

          const postId = await publishSingle(row.content, newToken, row.image_url);
          const publishedAt = new Date().toISOString();
          db.prepare(
            "UPDATE threads_scheduled_posts SET status = 'published', published_at = ?, threads_post_id = ? WHERE id = ?"
          ).run(publishedAt, postId, row.id);
          db.prepare(
            `INSERT INTO threads_posts (topic, posts, personas, post_type, status, is_draft, published_at, threads_post_id, error_message, created_at, updated_at)
             VALUES (?, ?, ?, 'single', 'success', 'false', ?, ?, NULL, ?, ?)`
          ).run(
            row.topic,
            JSON.stringify([{ content: row.content, imageUrl: row.image_url ?? undefined }]),
            `@${row.account_username ?? 'unknown'} · ${row.account_persona ?? ''}`,
            publishedAt,
            postId,
            publishedAt,
            publishedAt
          );
          db.prepare("UPDATE automation_events SET fix_outcome = 'success', resolved_at = ? WHERE id = ?").run(
            publishedAt,
            eventId
          );
          success++;
        } catch (retryErr) {
          if (retryCount < MAX_RETRIES) {
            const nextRetryAt = new Date(nowMs + RETRY_DELAY_MS).toISOString();
            db.prepare(
              "UPDATE threads_scheduled_posts SET retry_count = ?, next_retry_at = ?, status = 'pending', error_message = ? WHERE id = ?"
            ).run(
              retryCount + 1,
              nextRetryAt,
              `Token refresh failed: ${String(retryErr.message).slice(0, 300)}`,
              row.id
            );
            db.prepare("UPDATE automation_events SET fix_outcome = 'failed' WHERE id = ?").run(eventId);
            retried++;
          } else {
            db.prepare("UPDATE threads_scheduled_posts SET status = 'failed', error_message = ? WHERE id = ?").run(
              `Token refresh failed after ${MAX_RETRIES} attempts: ${retryErr.message}`,
              row.id
            );
            db.prepare("UPDATE automation_events SET fix_outcome = 'failed' WHERE id = ?").run(eventId);
            failed++;
          }
        }
      } else if (classified.type === 'rate_limited') {
        const rateLimitedUntil = new Date(nowMs + RATE_LIMIT_DELAY_MS).toISOString();
        logEvent({
          type: 'rate_limited',
          severity: 'warning',
          errorMessage: rawBody,
          errorCode: classified.code,
          context: { username: row.account_username, postId: row.id, rateLimitedUntil },
          accountId: row.account_id,
          postId: row.id,
          fixType: 'predetermined',
          fixApplied: `Back-off until ${rateLimitedUntil}`,
          fixOutcome: 'pending',
        });

        if (row.account_id) {
          db.prepare('UPDATE thread_accounts SET rate_limited_until = ?, strikes = ? WHERE id = ?').run(
            rateLimitedUntil,
            Math.min(10, currentStrikes + 3),
            row.account_id
          );
        }
        db.prepare('UPDATE threads_scheduled_posts SET next_retry_at = ?, error_message = ? WHERE id = ?').run(
          rateLimitedUntil,
          `Rate-limited — will retry after ${new Date(rateLimitedUntil).toLocaleTimeString()}`,
          row.id
        );
        skipped++;
      } else {
        if (row.account_id) {
          db.prepare('UPDATE thread_accounts SET strikes = ? WHERE id = ?').run(
            Math.min(10, currentStrikes + 1),
            row.account_id
          );
        }

        if (retryCount < MAX_RETRIES) {
          const nextRetryAt = new Date(nowMs + RETRY_DELAY_MS).toISOString();
          db.prepare(
            "UPDATE threads_scheduled_posts SET retry_count = ?, next_retry_at = ?, status = 'pending', error_message = ? WHERE id = ?"
          ).run(retryCount + 1, nextRetryAt, `Attempt ${retryCount + 1} failed: ${rawBody.slice(0, 200)}`, row.id);

          const eventId = logEvent({
            type: classified.type,
            severity: classified.severity,
            errorMessage: rawBody,
            errorCode: classified.code,
            context: { username: row.account_username, postId: row.id, topic: row.topic, attempt: retryCount + 1 },
            accountId: row.account_id,
            postId: row.id,
            fixType: 'predetermined',
            fixApplied: `Retry #${retryCount + 1} scheduled for ${nextRetryAt}`,
            fixOutcome: 'pending',
          });

          if (classified.type === 'unknown' || !classified.knownFix) {
            runAiDiagnosisAsync(eventId, classified.type, rawBody, JSON.stringify({ username: row.account_username, postId: row.id, topic: row.topic }));
          }
          retried++;
        } else {
          db.prepare("UPDATE threads_scheduled_posts SET status = 'failed', error_message = ? WHERE id = ?").run(
            rawBody.slice(0, 500),
            row.id
          );
          const nowTs = new Date().toISOString();
          db.prepare(
            `INSERT INTO threads_posts (topic, posts, personas, post_type, status, is_draft, published_at, threads_post_id, error_message, created_at, updated_at)
             VALUES (?, ?, ?, 'single', 'failed', 'false', NULL, NULL, ?, ?, ?)`
          ).run(
            row.topic,
            JSON.stringify([{ content: row.content, imageUrl: row.image_url ?? undefined }]),
            `@${row.account_username ?? 'unknown'} · ${row.account_persona ?? ''}`,
            rawBody.slice(0, 500),
            nowTs,
            nowTs
          );

          const eventId = logEvent({
            type: classified.type,
            severity: 'critical',
            errorMessage: `Permanently failed after ${MAX_RETRIES} retries: ${rawBody}`,
            errorCode: classified.code,
            context: { username: row.account_username, postId: row.id, topic: row.topic },
            accountId: row.account_id,
            postId: row.id,
            fixType: classified.knownFix ? 'predetermined' : null,
            fixApplied: classified.knownFix,
            fixOutcome: 'failed',
          });

          if (classified.type === 'unknown' || !classified.knownFix) {
            runAiDiagnosisAsync(eventId, classified.type, rawBody, JSON.stringify({ username: row.account_username, postId: row.id, topic: row.topic }));
          }
          failed++;
        }
      }
    }
  }

  return { processed: due.length, success, failed, retried, skipped };
}
