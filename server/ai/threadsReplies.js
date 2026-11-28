import { randomUUID } from 'node:crypto';
import db from '../db.js';
import { executeAiTask, runOpenRouterCascade, safeParseJSON, OPENROUTER_MODELS } from './openrouter.js';
import { getPersonaPrompt } from './personas.js';
import { classifyError } from './errorClassifier.js';

const PARTICIPATION_MIN = 0.4;
const PARTICIPATION_MAX = 0.6;
const HARD_CAP_ACCOUNTS = 12;
const COOLDOWN_HOURS = 12;
const MAX_PER_DAY = 2;
const DEFAULT_WINDOW_HOURS = 6;
const MIN_GAP_MS = 3 * 60_000;
const FIRST_REPLY_MIN_DELAY_MS = 2 * 60_000;
const TAPER_EXPONENT = 1.7;
const SIMILARITY_THRESHOLD = 0.55;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 30 * 60_000;
const RATE_LIMIT_DELAY_MS = 60 * 60_000;

export function parseThreadsPostUrl(url) {
  try {
    const u = new URL(String(url || '').trim());
    if (!/(^|\.)threads\.(com|net)$/.test(u.hostname)) return null;
    const m = u.pathname.match(/^\/@([A-Za-z0-9._]+)\/post\/([A-Za-z0-9_-]+)/);
    if (!m) return null;
    return { handle: m[1], shortcode: m[2] };
  } catch {
    return null;
  }
}

export function textSimilarity(a, b) {
  const words = (s) =>
    new Set(
      String(s || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, '')
        .split(/\s+/)
        .filter((w) => w.length > 1)
    );
  const wa = words(a);
  const wb = words(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return (2 * common) / (wa.size + wb.size);
}

function computeTaperedOffsets(count, windowMs, minGapMs = MIN_GAP_MS, minDelayMs = FIRST_REPLY_MIN_DELAY_MS) {
  if (count <= 0) return [];
  const usable = Math.max(windowMs - minDelayMs, minGapMs * count);
  const raw = Array.from(
    { length: count },
    () => minDelayMs + Math.pow(Math.random(), TAPER_EXPONENT) * usable
  );
  raw.sort((x, y) => x - y);
  for (let i = 1; i < raw.length; i++) {
    if (raw[i] - raw[i - 1] < minGapMs) raw[i] = raw[i - 1] + minGapMs + Math.random() * minGapMs;
  }
  return raw;
}

function getUTCOffsetMs(timezone, date) {
  try {
    const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzStr = date.toLocaleString('en-US', { timeZone: timezone });
    return new Date(tzStr).getTime() - new Date(utcStr).getTime();
  } catch {
    return 0;
  }
}

function shiftIntoActiveWindow(when, timezone, windowStart, windowEnd) {
  const [sh, sm] = String(windowStart || '08:00').split(':').map(Number);
  const [eh, em] = String(windowEnd || '22:00').split(':').map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return when;

  const tzOffsetMs = getUTCOffsetMs(timezone, when);
  const local = new Date(when.getTime() + tzOffsetMs);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;

  if (minutes >= startMin && minutes < endMin) return when;

  const localMidnight = new Date(local);
  localMidnight.setUTCHours(0, 0, 0, 0);
  let opening = new Date(localMidnight.getTime() + startMin * 60_000);
  if (minutes >= endMin) opening = new Date(opening.getTime() + 86_400_000);
  const jitter = Math.random() * 45 * 60_000;
  return new Date(opening.getTime() - tzOffsetMs + jitter);
}

const REPLY_INTENTS = [
  "agree with the post and give ONE specific reason of your own why, about the post's actual subject",
  "share a very short personal anecdote or opinion directly about the post's actual subject — not a tangent triggered by a single word in it",
  "ask ONE genuine, curious follow-up question about the post's actual subject",
  "add one related fact, tip, or piece of local knowledge about the post's actual subject",
  "gently offer a different angle or friendly nuance on the post's actual subject — warm, never hostile",
  "react warmly and briefly to the post's actual subject, like a friend passing by the post",
];

const LENGTH_BANDS = [
  'short — one complete, coherent sentence (never sacrifice grammar or sense just to be brief)',
  'one short sentence',
  'one to two short sentences',
  'two short sentences',
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function resolveOwnPost(url) {
  const parsed = parseThreadsPostUrl(url);
  if (!parsed) {
    throw new Error("That doesn't look like a Threads post link. Paste a link like https://www.threads.com/@username/post/XXXX");
  }

  const accounts = db.prepare('SELECT * FROM thread_accounts').all();
  const owner = accounts.find(
    (a) => a.username.replace(/^@/, '').toLowerCase() === parsed.handle.toLowerCase()
  );
  if (!owner) {
    throw new Error(`@${parsed.handle} isn't one of your connected accounts. Replies can only target your own posts.`);
  }
  if (!owner.api_key) {
    throw new Error(`@${parsed.handle} has no API token connected, so its posts can't be looked up.`);
  }

  let after = null;
  for (let page = 0; page < 2; page++) {
    const params = new URLSearchParams({
      fields: 'id,shortcode,permalink,text',
      limit: '50',
      access_token: owner.api_key,
    });
    if (after) params.set('after', after);
    const res = await fetch(`https://graph.threads.net/v1.0/me/threads?${params}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new Error(`Couldn't read @${parsed.handle}'s posts (HTTP ${res.status}). The token may be expired — try refreshing it in Accounts.`);
    }
    const data = await res.json();
    const match = (data.data ?? []).find(
      (m) => m.shortcode === parsed.shortcode || m.permalink?.includes(`/post/${parsed.shortcode}`)
    );
    if (match) {
      return { mediaId: match.id, text: match.text ?? null, permalink: match.permalink ?? null, ownerAccount: owner };
    }
    after = data.paging?.cursors?.after ?? null;
    if (!after) break;
  }

  throw new Error("Couldn't find that post among the account's recent posts. Engage works best on fresh posts — older posts aren't searchable.");
}

export function classifyEligibleAccounts(ownerAccountId) {
  const nowIso = new Date().toISOString();
  const accounts = db.prepare('SELECT * FROM thread_accounts').all();
  const cooldownSince = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60_000).toISOString();
  const daySince = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

  const recentJobs = db
    .prepare(
      `SELECT account_id, created_at FROM threads_reply_jobs
       WHERE status IN ('scheduled', 'published') AND created_at >= ?`
    )
    .all(daySince);

  const inCooldown = new Set();
  const dayCount = new Map();
  for (const j of recentJobs) {
    dayCount.set(j.account_id, (dayCount.get(j.account_id) ?? 0) + 1);
    if (j.created_at >= cooldownSince) inCooldown.add(j.account_id);
  }

  const eligible = [];
  const excluded = [];

  for (const a of accounts) {
    if (a.id === ownerAccountId) {
      excluded.push({ username: a.username, reason: 'post owner' });
      continue;
    }
    if (!a.api_key) {
      excluded.push({ username: a.username, reason: 'no API token' });
      continue;
    }
    if (a.rate_limited_until && a.rate_limited_until > nowIso) {
      excluded.push({ username: a.username, reason: 'rate-limited' });
      continue;
    }
    if ((a.strikes ?? 0) >= 3) {
      excluded.push({ username: a.username, reason: 'too many strikes' });
      continue;
    }
    if (inCooldown.has(a.id)) {
      excluded.push({ username: a.username, reason: `replied in the last ${COOLDOWN_HOURS}h (cooldown)` });
      continue;
    }
    if ((dayCount.get(a.id) ?? 0) >= MAX_PER_DAY) {
      excluded.push({ username: a.username, reason: 'daily reply limit reached' });
      continue;
    }
    eligible.push(a);
  }

  return { eligible, excluded };
}

function pickParticipants(eligible, mode, maxAccounts) {
  const cap = Math.min(maxAccounts ?? HARD_CAP_ACCOUNTS, HARD_CAP_ACCOUNTS);
  const shuffled = shuffle(eligible);
  if (mode === 'all') return shuffled.slice(0, cap);
  const pct = PARTICIPATION_MIN + Math.random() * (PARTICIPATION_MAX - PARTICIPATION_MIN);
  const n = Math.max(1, Math.min(Math.round(eligible.length * pct), cap));
  return shuffled.slice(0, n);
}

function personaSystemPrompt(account) {
  const custom = db
    .prepare("SELECT prompt FROM custom_personas WHERE name = ? AND is_enabled = 'true' LIMIT 1")
    .get(account.persona);
  if (custom) {
    return `You are a persona replying to posts on Meta Threads. Stay under 300 characters.\n\n${custom.prompt}`;
  }
  return getPersonaPrompt(account.persona).replace(
    'writing engaging content for Meta Threads. Each post must be under 500 characters.',
    'replying to posts on Meta Threads. Keep replies under 300 characters.'
  );
}

const INDONESIAN_MARKERS =
  /\b(nggak|ngga|banget|aja|doang|gimana|gitu|gini|udah|kayak|dong|deh|sih|cewek|cowok|keren|ngobrol|pengen|kepengen|capek|bikin|nggih|gue|elo|lu)\b/i;

function findNonMalaysianArtifact(text) {
  const indo = text.match(INDONESIAN_MARKERS);
  if (indo) return `contains Indonesian vocabulary ("${indo[0]}")`;
  const accented = text.match(/[À-ÖØ-öø-ÿ]/);
  if (accented) return `contains foreign accented character ("${accented[0]}")`;
  if (/\*\*|__|\[.+\]\(/.test(text)) return 'contains markdown formatting artifacts';
  const garbled = text.match(/[a-z]\.[a-z]{3,}/i);
  if (garbled) return `contains garbled word fragment ("${garbled[0]}")`;
  return null;
}

async function checkMalaysianVoice(reply) {
  const artifact = findNonMalaysianArtifact(reply);
  if (artifact) return artifact;

  const system =
    'You are a strict language QA checker for Malaysian social media content. You know exactly how Malaysians write on Threads — everyday Bahasa Melayu Malaysia (bahasa pasar), Manglish, and Malaysian English — and you instantly spot Indonesian vocabulary or spelling, invented/garbled words, foreign-language fragments, and broken grammar no real Malaysian would type.';
  const user = `Check this Threads reply:

"${reply}"

Return JSON only:
- {"ok": true} if a real Malaysian could plausibly have typed this (casual/imperfect spelling is fine).
- {"ok": false, "problems": "<short specific reason>"} if it contains Indonesian words or spellings, invented or garbled words, fragments of any other language, half-finished or nonsensical sentences, or phrasing no Malaysian uses.`;
  try {
    const raw = await runOpenRouterCascade(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      true,
      { module: 'threads-engage-qa' },
      OPENROUTER_MODELS
    );
    const parsed = safeParseJSON(raw, { ok: true });
    if (parsed && parsed.ok === false) {
      return String(parsed.problems || 'phrasing a real Malaysian would not use').slice(0, 300);
    }
    return null;
  } catch {
    return null;
  }
}

async function extractPostContext(targetText) {
  const systemPrompt = "You read Threads posts carefully and extract exactly what they're about — nothing more, nothing less.";
  const userPrompt = `Read this Threads post and extract its concrete substance: the specific topic, any named people/places/parties/events, dates, and the actual question or claim being made. Be precise and factual, based only on what's written here — never invent anything not in the text.

"${targetText.slice(0, 800)}"

Output 1–2 plain sentences summarizing exactly what this post is about. No preamble, no labels, just the summary.`;
  try {
    const raw = await executeAiTask(systemPrompt, userPrompt, false, { module: 'threads-engage' });
    return raw.trim().slice(0, 400);
  } catch {
    return targetText.slice(0, 400);
  }
}

async function generateOneReply(account, targetText, postContext, intent, lengthBand, avoidTexts) {
  const systemPrompt = personaSystemPrompt(account);
  const instructionsContext = account.writing_instructions
    ? `\nAlways apply these writing style rules: ${account.writing_instructions}`
    : '';
  const avoidContext =
    avoidTexts.length > 0
      ? `\nOther people already replied with the following — yours must feel clearly different in wording AND angle:\n${avoidTexts
          .map((t) => `- "${t.slice(0, 120)}"`)
          .join('\n')}`
      : '';

  const editRows = db
    .prepare(
      `SELECT original_content, edited_content FROM content_edits
       WHERE account_id = ? ORDER BY created_at DESC LIMIT 3`
    )
    .all(account.id);

  const learningContext =
    editRows.length > 0
      ? `\n\nLearn from how this account owner refined AI content before:\n${editRows
          .map(
            (e) =>
              `- Before: "${String(e.original_content).slice(0, 80)}" → After: "${String(
                e.edited_content
              ).slice(0, 80)}"`
          )
          .join('\n')}`
      : '';

  const userPrompt = `POST YOU'RE REPLYING TO:
"${targetText.slice(0, 800)}"

CONFIRMED — WHAT THIS POST IS ACTUALLY ABOUT:
${postContext}

YOUR TASK: write ONE natural reply as yourself, reacting to that confirmed topic. ${intent}.
LENGTH: ${lengthBand}.

HOW TO WRITE IT:
- LANGUAGE — write ONLY in everyday Bahasa Melayu MALAYSIA (bahasa pasar or standard, whichever fits your persona), Manglish, or Malaysian English. NEVER use Indonesian vocabulary or spelling (nggak, banget, aja, gimana, udah, kayak, dong, deh, gue...).
- Filter your reaction through YOUR persona's own background, opinions, and voice.
- Write like a real, slightly imperfect human typing quickly on their phone.
- Do NOT summarize or repeat the post's wording back. No hashtags, links, or @mentions. At most one emoji.

Output ONLY the reply text — no quotes, no explanation.${instructionsContext}${avoidContext}${learningContext}`;

  const clean = (raw) => raw.trim().replace(/^["']|["']$/g, '').slice(0, 480);

  let text = null;
  let problem = null;
  try {
    text = clean(await executeAiTask(systemPrompt, userPrompt, false, { module: 'threads-engage' }));
    problem = await checkMalaysianVoice(text);
  } catch {
    text = null;
  }

  if (!text || problem) {
    const retryHint =
      problem && text
        ? `\n\nIMPORTANT: a previous attempt was rejected because it ${problem}. Write a completely fresh reply in natural everyday Malaysian language, avoiding that problem.`
        : '';
    text = clean(await executeAiTask(systemPrompt, userPrompt + retryHint, false, { module: 'threads-engage' }));
    problem = await checkMalaysianVoice(text);
    if (problem) {
      throw new Error(`Reply failed the Malaysian-language check: ${problem}`);
    }
  }

  return text;
}

export async function generateReplyBatch(url, mode = 'auto', maxAccounts) {
  const target = await resolveOwnPost(url);
  if (!target.text?.trim()) {
    throw new Error("That post has no text (e.g. image/video-only), so there's nothing for the personas to read and react to.");
  }

  const { eligible, excluded } = classifyEligibleAccounts(target.ownerAccount.id);
  if (eligible.length === 0) {
    throw new Error(
      excluded.length === 0
        ? 'You need at least one other connected Threads account to reply with.'
        : `No eligible accounts right now (${excluded.map((e) => `@${e.username}: ${e.reason}`).join('; ')}).`
    );
  }

  const participants = pickParticipants(eligible, mode, maxAccounts);
  const batchId = randomUUID();
  const intents = shuffle(REPLY_INTENTS);
  const accepted = [];
  const postContext = await extractPostContext(target.text);

  for (let i = 0; i < participants.length; i++) {
    const account = participants[i];
    const intent = intents[i % intents.length];
    const lengthBand = LENGTH_BANDS[Math.floor(Math.random() * LENGTH_BANDS.length)];
    const avoid = accepted.map((r) => r.text);

    try {
      let text = await generateOneReply(account, target.text, postContext, intent, lengthBand, avoid);
      if (accepted.some((r) => textSimilarity(r.text, text) > SIMILARITY_THRESHOLD)) {
        const retry = await generateOneReply(account, target.text, postContext, intent, lengthBand, [
          ...avoid,
          text,
        ]);
        const worst = (t) => Math.max(0, ...accepted.map((r) => textSimilarity(r.text, t)));
        if (worst(retry) < worst(text)) text = retry;
      }
      accepted.push({ account, text });
    } catch {
      // Skip failing account
    }
  }

  if (accepted.length === 0) {
    throw new Error('Reply generation failed for every selected account — check OPENROUTER_API_KEY.');
  }

  const now = new Date().toISOString();
  const insertStmt = db.prepare(
    `INSERT INTO threads_reply_jobs
      (batch_id, target_url, target_media_id, target_owner_account_id, target_text, account_id, persona_snapshot, reply_text, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`
  );

  const inserted = [];
  for (const { account, text } of accepted) {
    const info = insertStmt.run(
      batchId,
      url,
      target.mediaId,
      target.ownerAccount.id,
      target.text,
      account.id,
      account.persona,
      text,
      now,
      now
    );
    inserted.push(db.prepare('SELECT * FROM threads_reply_jobs WHERE id = ?').get(info.lastInsertRowid));
  }

  return {
    batchId,
    target: { url, mediaId: target.mediaId, text: target.text, ownerUsername: target.ownerAccount.username },
    jobs: inserted,
    excluded,
  };
}

export async function regenerateReplyJob(jobId) {
  const job = db.prepare('SELECT * FROM threads_reply_jobs WHERE id = ?').get(jobId);
  if (!job) throw new Error('Reply not found.');
  if (job.status !== 'draft') throw new Error('Only drafts can be regenerated.');
  const account = db.prepare('SELECT * FROM thread_accounts WHERE id = ?').get(job.account_id);
  if (!account) throw new Error('The replying account no longer exists.');
  if (!job.target_text) throw new Error('This job has no target text to react to.');

  const siblings = db
    .prepare('SELECT reply_text FROM threads_reply_jobs WHERE batch_id = ? AND id != ?')
    .all(job.batch_id, jobId);

  const intent = REPLY_INTENTS[Math.floor(Math.random() * REPLY_INTENTS.length)];
  const lengthBand = LENGTH_BANDS[Math.floor(Math.random() * LENGTH_BANDS.length)];
  const postContext = await extractPostContext(job.target_text);
  const text = await generateOneReply(account, job.target_text, postContext, intent, lengthBand, [
    ...siblings.map((s) => s.reply_text),
    job.reply_text,
  ]);

  const now = new Date().toISOString();
  db.prepare('UPDATE threads_reply_jobs SET reply_text = ?, updated_at = ? WHERE id = ?').run(text, now, jobId);
  return db.prepare('SELECT * FROM threads_reply_jobs WHERE id = ?').get(jobId);
}

export function approveReplyBatch(batchId, windowHours) {
  const drafts = db
    .prepare("SELECT * FROM threads_reply_jobs WHERE batch_id = ? AND status = 'draft'")
    .all(batchId);
  if (drafts.length === 0) throw new Error('No drafts to approve in this batch.');

  const windowMs = Math.max(1, Math.min(windowHours ?? DEFAULT_WINDOW_HOURS, 24)) * 60 * 60_000;
  const offsets = computeTaperedOffsets(drafts.length, windowMs);
  const nowMs = Date.now();
  const shuffled = shuffle(drafts);

  const updated = [];
  for (let i = 0; i < shuffled.length; i++) {
    const job = shuffled[i];
    const account = db.prepare('SELECT * FROM thread_accounts WHERE id = ?').get(job.account_id);
    let when = new Date(nowMs + offsets[i]);
    if (account) {
      when = shiftIntoActiveWindow(
        when,
        account.timezone || 'Asia/Kuala_Lumpur',
        account.auto_post_window_start || '08:00',
        account.auto_post_window_end || '22:00'
      );
    }
    const nowIso = new Date().toISOString();
    db.prepare(
      "UPDATE threads_reply_jobs SET status = 'scheduled', scheduled_at = ?, updated_at = ? WHERE id = ?"
    ).run(when.toISOString(), nowIso, job.id);
    updated.push(db.prepare('SELECT * FROM threads_reply_jobs WHERE id = ?').get(job.id));
  }
  return updated;
}

async function publishReply(text, replyToMediaId, accessToken) {
  const createRes = await fetch('https://graph.threads.net/v1.0/me/threads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_type: 'TEXT', text, reply_to_id: replyToMediaId, access_token: accessToken }),
  });
  if (!createRes.ok) {
    const body = await createRes.text();
    throw Object.assign(new Error(body), { rawBody: body });
  }
  const { id: containerId } = await createRes.json();

  await new Promise((r) => setTimeout(r, 2_000 + Math.random() * 4_000));

  const pubRes = await fetch('https://graph.threads.net/v1.0/me/threads_publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: containerId, access_token: accessToken }),
  });
  if (!pubRes.ok) {
    const body = await pubRes.text();
    throw Object.assign(new Error(body), { rawBody: body });
  }
  const { id: replyId } = await pubRes.json();
  return replyId;
}

export async function processReplyQueue() {
  const pauseConfig = db
    .prepare("SELECT value FROM system_config WHERE key = 'automation_paused'")
    .get();
  if (pauseConfig?.value === 'true') {
    return { processed: 0, success: 0, failed: 0, retried: 0, skipped: 0, message: 'Automation paused' };
  }

  const nowIso = new Date().toISOString();
  const due = db
    .prepare(
      `SELECT j.*, a.api_key AS account_api_key, a.username AS account_username, a.rate_limited_until AS account_rate_limited_until
       FROM threads_reply_jobs j
       LEFT JOIN thread_accounts a ON j.account_id = a.id
       WHERE j.status = 'scheduled'
         AND j.scheduled_at <= ?
         AND (j.next_retry_at IS NULL OR j.next_retry_at <= ?)`
    )
    .all(nowIso, nowIso);

  if (due.length === 0) {
    return { processed: 0, success: 0, failed: 0, retried: 0, skipped: 0, message: 'No replies due' };
  }

  const result = { processed: due.length, success: 0, failed: 0, retried: 0, skipped: 0 };

  for (const job of due) {
    if (!job.account_api_key) {
      db.prepare("UPDATE threads_reply_jobs SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?").run(
        'Account missing or has no API token',
        new Date().toISOString(),
        job.id
      );
      result.failed++;
      continue;
    }
    if (job.account_rate_limited_until && job.account_rate_limited_until > new Date().toISOString()) {
      result.skipped++;
      continue;
    }

    await new Promise((r) => setTimeout(r, 3_000 + Math.random() * 12_000));

    try {
      const replyId = await publishReply(job.reply_text, job.target_media_id, job.account_api_key);
      const now = new Date().toISOString();
      db.prepare(
        "UPDATE threads_reply_jobs SET status = 'published', published_at = ?, threads_reply_id = ?, error_message = NULL, updated_at = ? WHERE id = ?"
      ).run(now, replyId, now, job.id);
      result.success++;
    } catch (err) {
      const rawBody = err?.rawBody ?? err?.message ?? '';
      const classified = classifyError(rawBody);

      if (classified.type === 'rate_limited') {
        db.prepare('UPDATE thread_accounts SET rate_limited_until = ? WHERE id = ?').run(
          new Date(Date.now() + RATE_LIMIT_DELAY_MS).toISOString(),
          job.account_id
        );
      }

      if ((job.retry_count ?? 0) < MAX_RETRIES) {
        db.prepare(
          'UPDATE threads_reply_jobs SET retry_count = ?, next_retry_at = ?, error_message = ?, updated_at = ? WHERE id = ?'
        ).run(
          (job.retry_count ?? 0) + 1,
          new Date(Date.now() + (classified.type === 'rate_limited' ? RATE_LIMIT_DELAY_MS : RETRY_DELAY_MS)).toISOString(),
          rawBody.slice(0, 500),
          new Date().toISOString(),
          job.id
        );
        result.retried++;
      } else {
        db.prepare("UPDATE threads_reply_jobs SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?").run(
          rawBody.slice(0, 500),
          new Date().toISOString(),
          job.id
        );
        result.failed++;
      }
    }
  }

  return result;
}
