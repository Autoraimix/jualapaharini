import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import db from '../db.js';
import { executeAiTask, executeAiTaskWithMeta, safeParseJSON } from '../ai/openrouter.js';
import { getPersonaPrompt, getGroupPersonaPrompt } from '../ai/personas.js';
import { processThreadsQueue } from '../ai/threadsQueue.js';
import {
  getThreadsToken,
  refreshAllUserAccountTokens,
  refreshUserToken,
  keepAliveAllUserTokens,
  checkAndRefreshExpiringTokens,
} from '../ai/threadsToken.js';
import { generateDailyAutoPosts } from '../ai/autoPost.js';
import {
  resolveOwnPost,
  classifyEligibleAccounts,
  generateReplyBatch,
  regenerateReplyJob,
  approveReplyBatch,
  processReplyQueue,
} from '../ai/threadsReplies.js';
import {
  createOAuthState,
  consumeOAuthState,
  buildAuthorizationUrl,
  completeOAuthConnection,
} from '../ai/threadsOAuth.js';

const THREADS_CHAR_LIMIT = 500;
const MAX_REGEN_ATTEMPTS = 3;

const POST_FORMATS = [
  'Open with a short relatable everyday story or personal situation, then naturally slip in the item and link at the end like sharing with friends',
  'Start with a casual daily moment or small observation ("Tadi baru perasan...", "Baru-baru ni...", "Ingatkan biasa je..."), then flow naturally into the recommendation',
  'Write like chatting casually to a friend about what you actually use or found, with the link tucked smoothly near the end — zero ad-speak',
  'Share a brief before-vs-after or honest reaction from daily routine, keeping the tone warm, unscripted, and human',
  'Begin with a relatable domestic/work moment or light confession, then casually mention where to check it out via the attached link',
];

function pickPostFormat(accountId) {
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  return POST_FORMATS[(accountId * 3 + dayIndex) % POST_FORMATS.length];
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

function getSpreadTimesForDate(postCount, timezone, targetDateStr) {
  const now = new Date();
  const startHour = 8;
  const endHour = 22;
  const tzOffsetMs = getUTCOffsetMs(timezone, now);
  const utcMidnight = new Date(`${targetDateStr}T00:00:00Z`);

  const startUTC = new Date(utcMidnight.getTime() + startHour * 3_600_000 - tzOffsetMs);
  const endUTC = new Date(utcMidnight.getTime() + endHour * 3_600_000 - tzOffsetMs);

  const actualStart =
    startUTC < now ? new Date(Math.max(now.getTime() + 20 * 60_000, startUTC.getTime())) : startUTC;

  if (postCount <= 1) return [actualStart < endUTC ? actualStart : startUTC];
  if (actualStart >= endUTC) {
    return Array.from({ length: postCount }, (_, i) => new Date(actualStart.getTime() + i * 30 * 60_000));
  }

  const JITTER_MS = 10 * 60_000;
  const intervalMs = (endUTC.getTime() - actualStart.getTime()) / (postCount - 1);
  return Array.from({ length: postCount }, (_, i) => {
    const base = actualStart.getTime() + intervalMs * i;
    const jitter = (Math.random() * 2 - 1) * JITTER_MS;
    return new Date(base + jitter);
  });
}

function getDateRange(days, timezone) {
  const dates = [];
  const now = new Date();
  for (let d = 0; d < Math.min(days, 30); d++) {
    const date = new Date(now.getTime() + d * 86_400_000);
    dates.push(date.toLocaleDateString('en-CA', { timeZone: timezone }));
  }
  return dates;
}

function validatePost(content) {
  const text = String(content || '').trim();
  if (!text || text.length < 15) {
    return { valid: false, reason: 'post is too short or empty' };
  }
  if (text.length > THREADS_CHAR_LIMIT) {
    return { valid: false, reason: `exceeds ${THREADS_CHAR_LIMIT}-char Threads limit (got ${text.length})` };
  }
  if (/<\|[^>]{1,60}\|>/.test(text)) {
    return { valid: false, reason: 'contains model artifact token' };
  }
  if (/\{"posts"\s*:/.test(text) || /"content"\s*:\s*"/.test(text) || /```(json)?/i.test(text)) {
    return { valid: false, reason: 'contains leaked prompt or JSON format' };
  }
  if (/\[object\s+Object\]/.test(text) || /\[Function\b/.test(text) || /undefined\s+undefined/.test(text)) {
    return { valid: false, reason: 'contains code or programming artifacts' };
  }
  if (/[\s,;:]$/.test(text) || /\b(and|but|or|because|since|when|that|which|the|a|an|to|of)$/i.test(text)) {
    return { valid: false, reason: 'post appears truncated mid-sentence' };
  }
  return { valid: true, reason: null };
}

function buildGenerationPrompt(
  topic,
  count,
  links,
  postType,
  formatInstruction,
  recentContext,
  isRetry,
  learningContext = '',
  instructionsContext = '',
  lengthConstraint = ''
) {
  const retryNote = isRetry
    ? `IMPORTANT: Write ONLY clean, natural human language. No code, no special characters, no technical tokens, no meta-commentary. Keep it under ${THREADS_CHAR_LIMIT} characters.\n`
    : '';

  return `${retryNote}Generate ${count} unique, distinct Threads post${count > 1 ? 's' : ''} about: "${topic}"
Format: ${postType === 'thread' ? 'Conversational thread-style' : 'Standalone single post'}
${
  links.length > 1
    ? `Attached links (include ALL ${links.length} links casually near/at the end, keeping every URL exact): ${links.join(', ')}`
    : links.length === 1
      ? `Attached link to slip in casually near the end (keep URL exact): ${links[0]}`
      : ''
}
Do NOT include any hashtags unless the topic itself explicitly requests them.
Storytelling approach: ${formatInstruction}
${lengthConstraint}
${instructionsContext}
${learningContext}
${recentContext}

Rules:
- Sound like a real human posting casually on Threads — tell a brief relatable story or everyday situation first, then naturally slip in the product/link at the end (no stiff "semak di sini:" or infomercial sales pitch)
- Use everyday Malaysian Threads wording (e.g. "CD" not "cakera", "visual" not "grafik", NO Indonesian words like "fisik"/"cek", NO formal/textbook Malay like "peminat tegar"/"keduanya", and NEVER announce your role like "Aku sebagai rider...")
- NEVER recite raw catalog clutter (expiry dates, exact pack weights/counts like 750g x 3, SKU tags, or robotic price-comparison scripts like "compare harga di BeliApaHarini") unless explicitly asked
- Each post must be clearly different in angle and phrasing
- Write in clean, natural language matching the persona — no code, no tokens, no hashtags
- Keep every post under ${THREADS_CHAR_LIMIT} characters
- Complete every sentence — never truncate mid-thought

Return ONLY this JSON (no markdown, no explanation):
{"posts":[{"content":"..."}]}`;
}

async function generatePostsForAccount(
  topic,
  persona,
  count,
  links,
  _includeHashtags,
  postType,
  accountId,
  postLength
) {
  const recentRows = db
    .prepare(
      `SELECT content FROM threads_scheduled_posts
       WHERE account_id = ? AND status = 'published'
       ORDER BY scheduled_at DESC LIMIT 3`
    )
    .all(accountId);

  const recentContext =
    recentRows.length > 0
      ? `\nAvoid repeating these recent posts:\n${recentRows
          .map((r, i) => `${i + 1}. "${String(r.content).slice(0, 120)}"`)
          .join('\n')}`
      : '';

  const editRows = db
    .prepare(
      `SELECT original_content, edited_content, user_comment FROM content_edits
       WHERE account_id = ? ORDER BY created_at DESC LIMIT 5`
    )
    .all(accountId);

  const learningContext =
    editRows.length > 0
      ? `\nLearn from how this account's owner previously improved AI-generated content:\n${editRows
          .map(
            (e) =>
              `- Before: "${String(e.original_content).slice(0, 100)}" → After: "${String(
                e.edited_content
              ).slice(0, 100)}"${e.user_comment ? ` (Reason: ${e.user_comment})` : ''}`
          )
          .join('\n')}\nApply similar style, tone and improvements to new content.`
      : '';

  const acct = db
    .prepare('SELECT writing_instructions FROM thread_accounts WHERE id = ?')
    .get(accountId);
  const instructionsContext = acct?.writing_instructions
    ? `\nAccount writing style rules (always apply): ${acct.writing_instructions}`
    : '';

  const lengthConstraintMap = {
    short: 'Keep each post SHORT — maximum 80 characters. Punchy and direct.',
    medium: 'Keep each post MEDIUM length — 150–280 characters. Clear and engaging.',
    long: 'Write LONGER posts — 350–480 characters. Detailed and informative.',
  };
  const lengthConstraint = lengthConstraintMap[postLength ?? 'medium'] ?? lengthConstraintMap.medium;
  const formatInstruction = pickPostFormat(accountId);

  let system = getPersonaPrompt(persona);
  const customPersona = db
    .prepare("SELECT prompt FROM custom_personas WHERE name = ? AND is_enabled = 'true' LIMIT 1")
    .get(persona);
  if (customPersona) {
    system = `You are a persona writing engaging content for Meta Threads. Each post must be under 500 characters.\n\n${customPersona.prompt}`;
  }

  const firstPrompt = buildGenerationPrompt(
    topic,
    count,
    links,
    postType,
    formatInstruction,
    recentContext,
    false,
    learningContext,
    instructionsContext,
    lengthConstraint
  );
  const raw = await executeAiTask(system, firstPrompt, true, { module: 'threads-posting' });
  const parsed = safeParseJSON(raw, { posts: [] });
  const allCandidates = (parsed.posts || []).map((p) => String(p?.content || '').trim()).filter(Boolean);

  const validPosts = [];
  const failedSlots = [];

  for (let i = 0; i < Math.min(allCandidates.length, count); i++) {
    const check = validatePost(allCandidates[i]);
    if (check.valid) validPosts.push(allCandidates[i]);
    else failedSlots.push(i);
  }
  for (let i = allCandidates.length; i < count; i++) failedSlots.push(i);

  if (failedSlots.length > 0) {
    for (const _slot of failedSlots) {
      for (let attempt = 1; attempt <= MAX_REGEN_ATTEMPTS; attempt++) {
        const retryPrompt = buildGenerationPrompt(
          topic,
          1,
          links,
          postType,
          formatInstruction,
          recentContext,
          true,
          learningContext,
          instructionsContext,
          lengthConstraint
        );
        try {
          const retryRaw = await executeAiTask(system, retryPrompt, true, { module: 'threads-posting' });
          const retryParsed = safeParseJSON(retryRaw, { posts: [] });
          const retryContent = String(retryParsed.posts?.[0]?.content || '').trim();
          const check = validatePost(retryContent);
          if (check.valid && retryContent) {
            validPosts.push(retryContent);
            break;
          }
        } catch {
          // Continue retry
        }
      }
    }
  }

  if (validPosts.length === 0) {
    const fallback =
      links.length > 0
        ? `Baru teringat nak share pasal ${topic} ni — siapa yang tengah cari juga boleh tengok dekat sini: ${links.join(' / ')}`
        : `Tengah layan cerita pasal ${topic} hari ni, macam-macam benda baru perasan.`;
    return [fallback];
  }

  return validPosts.slice(0, count);
}

// Ensure multi-post threads only place links in one post (middle or last) instead of repeating across every post
function keepLinksOnceInThread(posts, attachedLinks = []) {
  if (!Array.isArray(posts) || posts.length <= 1 || attachedLinks.length === 0) return posts;

  const normalizedLinks = attachedLinks.map((l) => String(l || '').trim()).filter(Boolean);
  if (normalizedLinks.length === 0) return posts;

  const hasAllLinks = (text) => normalizedLinks.every((url) => text.includes(url));
  const hasAnyLink = (text) => normalizedLinks.some((url) => text.includes(url));

  // Prefer the last post if it has links (or middle/later post if intentionally placed there), else default to last post
  let ownerIdx = posts.length - 1;
  const fullIdx = posts.findIndex((p, idx) => idx > 0 && hasAllLinks(p.content));
  if (fullIdx !== -1) {
    ownerIdx = fullIdx;
  } else {
    const midIdx = posts.findIndex((p, idx) => idx > 0 && idx < posts.length - 1 && hasAnyLink(p.content));
    if (midIdx !== -1 && !hasAnyLink(posts[posts.length - 1].content)) {
      ownerIdx = midIdx;
    }
  }

  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const linkPatterns = normalizedLinks.map((u) => new RegExp(`\\s*${escapeRegex(u)}`, 'g'));

  return posts.map((post, idx) => {
    let content = post.content;
    if (idx !== ownerIdx) {
      for (const re of linkPatterns) content = content.replace(re, '');
      content = content
        .replace(/(?:^|\s)(?:Shopee|Lazada|TikTok|Link(?:\s+Shopee|\s+Lazada)?|Cek link ni|Link dia)[:\s-]*$/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      return { ...post, content };
    }

    const missing = normalizedLinks.filter((u) => !content.includes(u));
    if (missing.length > 0) {
      const suffix = missing.join(' ');
      if (content.length + suffix.length + 1 <= THREADS_CHAR_LIMIT) {
        content = `${content} ${suffix}`.trim();
      }
    }
    return { ...post, content };
  });
}

function buildPostText(p, includeHashtags = true) {
  const ctaStr = p.cta ? `\n\n${p.cta}` : '';
  const hashtagStr =
    includeHashtags && p.hashtags?.length
      ? `\n\n${p.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}`
      : '';
  return `${p.content}${ctaStr}${hashtagStr}`.slice(0, 500);
}

async function createContainer(body, accessToken) {
  const res = await fetch('https://graph.threads.net/v1.0/me/threads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: accessToken }),
  });
  if (!res.ok) throw new Error(`Container failed: ${res.status} — ${await res.text()}`);
  const { id } = await res.json();
  return id;
}

async function publishContainer(containerId, accessToken) {
  const res = await fetch('https://graph.threads.net/v1.0/me/threads_publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: containerId, access_token: accessToken }),
  });
  if (!res.ok) throw new Error(`Publish failed: ${res.status} — ${await res.text()}`);
  const { id } = await res.json();
  return id;
}

async function publishToThreads(postsArr, accessToken, media = [], includeHashtags = true) {
  const firstText = buildPostText(postsArr[0], includeHashtags);
  let firstContainerId;

  if (media.length === 0) {
    firstContainerId = await createContainer({ media_type: 'TEXT', text: firstText }, accessToken);
  } else if (media.length === 1) {
    const m = media[0];
    firstContainerId = await createContainer(
      {
        media_type: m.type === 'video' ? 'VIDEO' : 'IMAGE',
        [m.type === 'video' ? 'video_url' : 'image_url']: m.url,
        text: firstText,
      },
      accessToken
    );
  } else {
    const itemIds = await Promise.all(
      media.map((m) =>
        createContainer(
          {
            media_type: m.type === 'video' ? 'VIDEO' : 'IMAGE',
            [m.type === 'video' ? 'video_url' : 'image_url']: m.url,
            is_carousel_item: true,
          },
          accessToken
        )
      )
    );
    firstContainerId = await createContainer(
      {
        media_type: 'CAROUSEL',
        children: itemIds.join(','),
        text: firstText,
      },
      accessToken
    );
  }

  const firstPostId = await publishContainer(firstContainerId, accessToken);

  let replyToId = firstPostId;
  for (let i = 1; i < postsArr.length; i++) {
    const containerId = await createContainer(
      {
        media_type: 'TEXT',
        text: buildPostText(postsArr[i], includeHashtags),
        reply_to_id: replyToId,
      },
      accessToken
    );
    replyToId = await publishContainer(containerId, accessToken);
  }

  return firstPostId;
}

function formatPersona(p) {
  return {
    id: p.id,
    name: p.name,
    prompt: p.prompt,
    isEnabled: p.is_enabled,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

function formatAccount(a) {
  return {
    id: a.id,
    username: a.username,
    password: a.password,
    productKey: a.product_key ?? null,
    apiKey: a.api_key ?? null,
    persona: a.persona,
    postsPerDay: a.posts_per_day,
    timezone: a.timezone ?? 'Asia/Kuala_Lumpur',
    rateLimitedUntil: a.rate_limited_until ?? null,
    tokenIssuedAt: a.token_issued_at ?? null,
    proxyUrl: a.proxy_url ?? null,
    strikes: a.strikes ?? 0,
    labels: a.labels ?? null,
    writingInstructions: a.writing_instructions ?? null,
    autoPostEnabled: a.auto_post_enabled === 'true',
    autoPostMaxPerDay: parseInt(a.auto_post_max_per_day ?? '1', 10),
    autoPostMode: a.auto_post_mode ?? 'draft',
    autoPostWindowStart: a.auto_post_window_start ?? '08:00',
    autoPostWindowEnd: a.auto_post_window_end ?? '22:00',
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  };
}

function formatPost(r) {
  let parsedPosts = [];
  try {
    parsedPosts = typeof r.posts === 'string' ? JSON.parse(r.posts) : r.posts;
  } catch {
    parsedPosts = [];
  }
  return {
    id: r.id,
    topic: r.topic,
    posts: parsedPosts,
    personas: r.personas ? r.personas.split(',').filter(Boolean) : [],
    postType: r.post_type,
    status: r.status,
    isDraft: r.is_draft === 'true',
    scheduledAt: r.scheduled_at ?? null,
    publishedAt: r.published_at ?? null,
    errorMessage: r.error_message ?? null,
    threadsPostId: r.threads_post_id ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function formatScheduledRow(r) {
  return {
    id: r.id,
    accountId: r.account_id,
    username: r.username ?? null,
    persona: r.persona ?? null,
    topic: r.topic,
    content: r.content,
    scheduledAt: r.scheduled_at,
    status: r.status,
    retryCount: r.retry_count ?? 0,
    nextRetryAt: r.next_retry_at ?? null,
    publishedAt: r.published_at ?? null,
    threadsPostId: r.threads_post_id ?? null,
    errorMessage: r.error_message ?? null,
    imageUrl: r.image_url ?? null,
    createdAt: r.created_at,
  };
}

function formatReplyJob(j) {
  return {
    id: j.id,
    batchId: j.batch_id,
    targetUrl: j.target_url,
    accountId: j.account_id,
    username: j.username ?? undefined,
    persona: j.persona_snapshot,
    replyText: j.reply_text,
    status: j.status,
    scheduledAt: j.scheduled_at ?? null,
    publishedAt: j.published_at ?? null,
    threadsReplyId: j.threads_reply_id ?? null,
    errorMessage: j.error_message ?? null,
  };
}

function getBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}`;
}

export function createMarketingRouter({ requireAdmin, uploadsDir }) {
  const router = Router();
  const threadsUploadsDir = path.join(uploadsDir, 'threads');
  fs.mkdirSync(threadsUploadsDir, { recursive: true });

  // ── PERSONAS ────────────────────────────────────────────────────────────────

  router.get('/personas', requireAdmin, (_req, res) => {
    const rows = db.prepare('SELECT * FROM custom_personas ORDER BY created_at ASC').all();
    res.json(rows.map(formatPersona));
  });

  router.post('/personas', requireAdmin, (req, res) => {
    const { name, prompt } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    if (!prompt?.trim()) return res.status(400).json({ error: 'prompt is required' });

    const now = new Date().toISOString();
    const info = db
      .prepare(
        `INSERT INTO custom_personas (name, prompt, is_enabled, created_at, updated_at)
         VALUES (?, ?, 'true', ?, ?)`
      )
      .run(name.trim(), prompt.trim(), now, now);
    const row = db.prepare('SELECT * FROM custom_personas WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(formatPersona(row));
  });

  router.post('/personas/batch', requireAdmin, (req, res) => {
    const { personas } = req.body || {};
    if (!Array.isArray(personas) || personas.length === 0) {
      return res.status(400).json({ error: 'personas array is required' });
    }
    const valid = personas.filter((p) => p?.name?.trim() && p?.prompt?.trim());
    if (valid.length === 0) {
      return res.status(400).json({ error: 'No valid personas found in the array' });
    }

    const now = new Date().toISOString();
    const stmt = db.prepare(
      `INSERT INTO custom_personas (name, prompt, is_enabled, created_at, updated_at)
       VALUES (?, ?, 'true', ?, ?)`
    );
    const tx = db.transaction((items) => {
      for (const p of items) stmt.run(p.name.trim(), p.prompt.trim(), now, now);
    });
    tx(valid);

    res.status(201).json({ count: valid.length });
  });

  router.put('/personas/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = db.prepare('SELECT * FROM custom_personas WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Persona not found' });

    const { name, prompt, isEnabled } = req.body || {};
    const nextName = name !== undefined ? String(name).trim() : existing.name;
    const nextPrompt = prompt !== undefined ? String(prompt).trim() : existing.prompt;
    const nextEnabled = isEnabled !== undefined ? (isEnabled ? 'true' : 'false') : existing.is_enabled;
    const now = new Date().toISOString();

    db.prepare(
      'UPDATE custom_personas SET name = ?, prompt = ?, is_enabled = ?, updated_at = ? WHERE id = ?'
    ).run(nextName, nextPrompt, nextEnabled, now, id);

    const row = db.prepare('SELECT * FROM custom_personas WHERE id = ?').get(id);
    res.json(formatPersona(row));
  });

  router.delete('/personas/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    db.prepare('DELETE FROM custom_personas WHERE id = ?').run(id);
    res.sendStatus(204);
  });

  router.post('/personas/bulk-delete', requireAdmin, (req, res) => {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }
    const stmt = db.prepare('DELETE FROM custom_personas WHERE id = ?');
    const tx = db.transaction((list) => {
      for (const id of list) stmt.run(Number(id));
    });
    tx(ids);
    res.json({ deleted: ids.length });
  });

  router.post('/personas/bulk-update', requireAdmin, (req, res) => {
    const { ids, isEnabled } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }
    const val = isEnabled ? 'true' : 'false';
    const now = new Date().toISOString();
    const stmt = db.prepare('UPDATE custom_personas SET is_enabled = ?, updated_at = ? WHERE id = ?');
    const tx = db.transaction((list) => {
      for (const id of list) stmt.run(val, now, Number(id));
    });
    tx(ids);
    res.json({ updated: ids.length });
  });

  // ── AI THREADS GENERATION (COMPOSE) ─────────────────────────────────────────

  router.post('/ai/generate-threads', requireAdmin, async (req, res) => {
    const { topic, personas, postType, links } = req.body || {};
    if (!topic) return res.status(400).json({ error: 'topic is required' });

    const fallback = { posts: [], summary: 'AI request failed — check OPENROUTER_API_KEY in .env.' };
    const personaList =
      Array.isArray(personas) && personas.length > 0 ? personas.join(', ') : 'Professional Marketer';
    const isThread = postType === 'thread';

    let basePrompt = getGroupPersonaPrompt(personaList);
    if (Array.isArray(personas) && personas.length > 0) {
      const customRows = db.prepare("SELECT name, prompt FROM custom_personas WHERE is_enabled = 'true'").all();
      const matchedCustoms = customRows.filter((c) => personas.includes(c.name));
      for (const c of matchedCustoms) {
        basePrompt += `\n\nWhen writing as ${c.name}, adhere STRICTLY to these traits:\n${c.prompt}`;
      }
    }

    const systemPrompt = `${basePrompt}
Rule 1: Keep every single post strictly under 500 characters.
Rule 2: Respond ONLY with a raw JSON object matching the requested schema. No markdown wrappers.
Rule 3: Write in authentic everyday Malaysian Threads/WhatsApp conversational style — casual, short, relatable. NEVER use Indonesian words ("fisik", "cek"), NEVER use textbook/skema Malay ("cakera", "grafik", "peminat tegar", "keduanya" — use everyday terms like "CD", "visual", "gila smooth", "dua-dua"), and NEVER announce your persona ("Aku sebagai rider ni...").
Rule 4: Tell a brief, relatable everyday story or genuine moment first — never sound like a product brochure, ad copywriter, or salesperson.
Rule 5: Do NOT dump raw catalog specs (like expiry dates, pack sizes/weights, promo prices, or scripted website promos like "compare harga di BeliApaHarini") unless explicitly requested.
Rule 6: Keep "cta" as an empty string "" — NEVER generate a separate CTA line.${
      isThread
        ? `\nRule 7 (Multi-post Thread links): If links are provided, put the link(s) in ONLY ONE post (the LAST post — or once in the middle post if it fits naturally). All other posts in the thread must have ZERO links, URLs, or "klik link" text.`
        : ''
    }`;

    const userPrompt = `Product / Topic: ${topic}
Format requested: ${isThread ? 'Multi-post Thread (3-5 connected posts telling one natural story/sharing)' : 'Single Post'}
${
  links?.length
    ? isThread
      ? `Attached link(s): ${links.join(', ')} — DO NOT put links in every post! Tell your story/thoughts across earlier posts with NO links, then slip ALL ${links.length} link(s) casually into ONLY ONE post (the LAST post, or middle post). Keep each URL exact.`
      : links.length > 1
        ? `Attached links: ${links.join(', ')} — slip ALL ${links.length} links casually near/at the end after your short story (like telling friends where to get it if they want it, keeping every URL exact).`
        : `Attached link: ${links[0]} — slip the link casually near/at the end after your short story (like telling friends where to get it if they want it).`
    : ''
}
Do NOT include any hashtags unless the topic itself explicitly requests them.

Output Schema required:
{
  "posts": [ { "content": "...", "hashtags": [], "cta": "" } ],
  "summary": "..."
}`;

    try {
      const result = await executeAiTaskWithMeta(systemPrompt, userPrompt, true, {
        module: 'threads-compose',
      });
      const parsed = safeParseJSON(result.content, fallback);
      const cleanedPosts = Array.isArray(parsed.posts)
        ? parsed.posts.map((p) => ({
            content: String(p?.content || '').trim(),
            hashtags: Array.isArray(p?.hashtags) ? p.hashtags : [],
            cta: '',
          }))
        : [];
      const posts = isThread ? keepLinksOnceInThread(cleanedPosts, links) : cleanedPosts;
      res.json({ ...parsed, posts, _debug: { model: result.model, tokensUsed: result.tokensUsed } });
    } catch (err) {
      res.status(500).json({ error: err?.message || 'AI generation failed' });
    }
  });

  // ── MEDIA UPLOAD FOR THREADS ────────────────────────────────────────────────

  router.post('/media/upload', requireAdmin, (req, res) => {
    try {
      const { files } = req.body || {};
      if (!Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ error: 'No files provided' });
      }
      if (files.length > 10) {
        return res.status(400).json({ error: 'Maximum 10 files allowed' });
      }
      const allowed = /\.(jpg|jpeg|png|gif|webp|mp4|mov)$/i;
      const baseUrl = getBaseUrl(req);
      const saved = files.map((file) => {
        const ext = path.extname(file.name || '').toLowerCase();
        if (!allowed.test(ext)) throw new Error(`File type not allowed: ${file.name}`);
        const base64 = String(file.data || '').replace(/^data:[^;]+;base64,/, '');
        const buffer = Buffer.from(base64, 'base64');
        if (buffer.byteLength > 50 * 1024 * 1024) {
          throw new Error(`File too large (max 50 MB): ${file.name}`);
        }
        const filename = `${crypto.randomUUID()}${ext}`;
        fs.writeFileSync(path.join(threadsUploadsDir, filename), buffer);
        return {
          url: `${baseUrl}/api/uploads/${filename}`,
          type: String(file.type || '').startsWith('video/') ? 'video' : 'image',
          name: file.name,
          size: buffer.byteLength,
        };
      });
      res.json({ files: saved });
    } catch (err) {
      res.status(500).json({ error: err?.message || 'Upload failed' });
    }
  });

  router.get('/uploads/:filename', (req, res) => {
    const filename = path.basename(req.params.filename);
    const filepath = path.join(threadsUploadsDir, filename);
    res.sendFile(filepath, (err) => {
      if (err) res.status(404).json({ error: 'File not found' });
    });
  });

  // ── DRAFTS ──────────────────────────────────────────────────────────────────

  router.get('/threads/drafts', requireAdmin, (_req, res) => {
    const rows = db
      .prepare("SELECT * FROM threads_posts WHERE is_draft = 'true' ORDER BY updated_at DESC")
      .all();
    res.json(rows.map(formatPost));
  });

  router.post('/threads/drafts', requireAdmin, (req, res) => {
    const { topic, posts, personas, postType, scheduledAt } = req.body || {};
    if (!topic || !posts) return res.status(400).json({ error: 'topic and posts are required' });

    const now = new Date().toISOString();
    const info = db
      .prepare(
        `INSERT INTO threads_posts (topic, posts, personas, post_type, status, is_draft, scheduled_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'draft', 'true', ?, ?, ?)`
      )
      .run(
        topic,
        typeof posts === 'string' ? posts : JSON.stringify(posts),
        Array.isArray(personas) ? personas.join(',') : personas ?? '',
        postType ?? 'single',
        scheduledAt ?? null,
        now,
        now
      );
    const row = db.prepare('SELECT * FROM threads_posts WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(formatPost(row));
  });

  router.patch('/threads/drafts/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = db.prepare('SELECT * FROM threads_posts WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Draft not found' });

    const { posts, topic, scheduledAt } = req.body || {};
    db.prepare(
      'UPDATE threads_posts SET posts = ?, topic = ?, scheduled_at = ?, updated_at = ? WHERE id = ?'
    ).run(
      posts ? (typeof posts === 'string' ? posts : JSON.stringify(posts)) : existing.posts,
      topic ?? existing.topic,
      scheduledAt ?? existing.scheduled_at,
      new Date().toISOString(),
      id
    );
    const row = db.prepare('SELECT * FROM threads_posts WHERE id = ?').get(id);
    res.json(formatPost(row));
  });

  router.delete('/threads/drafts/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    db.prepare('DELETE FROM threads_posts WHERE id = ?').run(id);
    res.sendStatus(204);
  });

  // ── SINGLE PUBLISH & HISTORY ────────────────────────────────────────────────

  router.post('/threads/publish', requireAdmin, async (req, res) => {
    const { topic, posts, personas, postType, draftId, media: mediaRaw, includeHashtags = true } = req.body || {};
    if (!topic || !posts) return res.status(400).json({ error: 'topic and posts are required' });

    const postsArr = typeof posts === 'string' ? JSON.parse(posts) : posts;
    const media = Array.isArray(mediaRaw) ? mediaRaw : [];

    const threadsKey = getThreadsToken();
    let publishedPostId = null;
    let status = 'success';
    let errorMessage = null;

    if (!threadsKey) {
      status = 'failed';
      errorMessage = 'THREADS_API_KEY is not configured in .env (or add a connected account in Automate Post).';
    } else {
      try {
        publishedPostId = await publishToThreads(postsArr, threadsKey, media, includeHashtags);
      } catch (err) {
        status = 'failed';
        errorMessage = err?.message ?? 'Unknown error';
      }
    }

    const now = new Date().toISOString();
    const info = db
      .prepare(
        `INSERT INTO threads_posts
          (topic, posts, personas, post_type, status, is_draft, published_at, error_message, threads_post_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'false', ?, ?, ?, ?, ?)`
      )
      .run(
        topic,
        typeof posts === 'string' ? posts : JSON.stringify(posts),
        Array.isArray(personas) ? personas.join(',') : personas ?? '',
        postType ?? 'single',
        status,
        status === 'success' ? now : null,
        errorMessage,
        publishedPostId,
        now,
        now
      );

    if (draftId) {
      db.prepare('DELETE FROM threads_posts WHERE id = ?').run(parseInt(draftId, 10));
    }

    const row = db.prepare('SELECT * FROM threads_posts WHERE id = ?').get(info.lastInsertRowid);
    res.json({
      ...formatPost(row),
      message:
        status === 'success'
          ? 'Post published to Threads successfully!'
          : `Publish recorded but failed: ${errorMessage}`,
    });
  });

  router.get('/threads/history', requireAdmin, (_req, res) => {
    const rows = db
      .prepare("SELECT * FROM threads_posts WHERE is_draft = 'false' ORDER BY created_at DESC")
      .all();
    res.json(rows.map(formatPost));
  });

  // ── THREAD ACCOUNTS ─────────────────────────────────────────────────────────

  router.get('/threads/accounts', requireAdmin, (req, res) => {
    const all = req.query.all === 'true';
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = 10;
    const offset = (page - 1) * limit;

    const rows = all
      ? db.prepare('SELECT * FROM thread_accounts ORDER BY created_at ASC').all()
      : db.prepare('SELECT * FROM thread_accounts ORDER BY created_at ASC LIMIT ? OFFSET ?').all(limit, offset);

    const { total } = db.prepare('SELECT COUNT(*) AS total FROM thread_accounts').get();
    res.json({ accounts: rows.map(formatAccount), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  });

  router.post('/threads/accounts/fix-timezone', requireAdmin, (_req, res) => {
    const rows = db
      .prepare("SELECT id, username FROM thread_accounts WHERE timezone = 'UTC'")
      .all();
    db.prepare("UPDATE thread_accounts SET timezone = 'Asia/Kuala_Lumpur' WHERE timezone = 'UTC'").run();
    res.json({ fixed: rows.length, usernames: rows.map((r) => r.username) });
  });

  router.post('/threads/accounts', requireAdmin, (req, res) => {
    const {
      username,
      password,
      productKey,
      apiKey,
      persona,
      postsPerDay,
      timezone,
      proxyUrl,
      labels,
      writingInstructions,
    } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }
    const now = new Date().toISOString();
    const info = db
      .prepare(
        `INSERT INTO thread_accounts
          (username, password, product_key, api_key, persona, posts_per_day, timezone, proxy_url, labels, writing_instructions, token_issued_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        username,
        password,
        productKey || null,
        apiKey || null,
        persona || 'Professional Marketer',
        postsPerDay ? Number(postsPerDay) : 1,
        timezone || 'Asia/Kuala_Lumpur',
        proxyUrl || null,
        labels || null,
        writingInstructions || null,
        apiKey ? now : null,
        now,
        now
      );
    const account = db.prepare('SELECT * FROM thread_accounts WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(formatAccount(account));
  });

  router.get('/threads/oauth/start', (req, res) => {
    // Allow token via query param since browser navigation cannot send Authorization header
    const qToken = typeof req.query.token === 'string' ? req.query.token.trim() : '';
    const session = qToken
      ? db.prepare('SELECT username FROM admin_sessions WHERE token = ?').get(qToken)
      : null;
    if (!session) {
      return res.status(401).json({ error: 'Admin authentication required.' });
    }
    const baseUrl = getBaseUrl(req);
    try {
      const state = createOAuthState(session.username);
      res.redirect(buildAuthorizationUrl(state, `${baseUrl}/api/threads/oauth/callback`));
    } catch (err) {
      res.redirect(
        `${baseUrl}/admin?${new URLSearchParams({
          oauth: 'error',
          message: err?.message || 'Could not start Threads login',
        })}`
      );
    }
  });

  router.get('/threads/oauth/callback', async (req, res) => {
    const baseUrl = getBaseUrl(req);
    const redirectUri = `${baseUrl}/api/threads/oauth/callback`;
    const backToApp = (params) => res.redirect(`${baseUrl}/admin?${new URLSearchParams(params)}`);

    const { code, state, error, error_description } = req.query;
    if (typeof error === 'string') {
      return backToApp({ oauth: 'error', message: typeof error_description === 'string' ? error_description : error });
    }
    if (typeof state !== 'string' || typeof code !== 'string') {
      return backToApp({ oauth: 'error', message: "Threads didn't return the expected login details." });
    }

    const entry = consumeOAuthState(state);
    if (!entry) {
      return backToApp({ oauth: 'error', message: 'This connection link expired or was already used — please try again.' });
    }

    try {
      const { username, longLivedToken } = await completeOAuthConnection(code, redirectUri);
      const existing = db.prepare('SELECT * FROM thread_accounts WHERE username = ?').get(username);
      const now = new Date().toISOString();

      if (existing) {
        db.prepare('UPDATE thread_accounts SET api_key = ?, token_issued_at = ?, updated_at = ? WHERE id = ?').run(
          longLivedToken,
          now,
          now,
          existing.id
        );
      } else {
        db.prepare(
          `INSERT INTO thread_accounts (username, password, api_key, token_issued_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(username, crypto.randomUUID(), longLivedToken, now, now, now);
      }

      backToApp({ oauth: 'success', username, mode: existing ? 'reconnected' : 'created' });
    } catch (err) {
      backToApp({ oauth: 'error', message: err?.message || 'Connection failed' });
    }
  });

  router.post('/threads/accounts/bulk', requireAdmin, (req, res) => {
    const accounts = req.body;
    if (!Array.isArray(accounts) || accounts.length === 0) {
      return res.status(400).json({ error: 'Expected an array of accounts' });
    }
    const valid = accounts.filter((a) => a?.username && a?.password);
    if (valid.length === 0) return res.status(400).json({ error: 'No valid accounts provided' });

    const now = new Date().toISOString();
    const stmt = db.prepare(
      `INSERT INTO thread_accounts
        (username, password, product_key, api_key, persona, posts_per_day, timezone, token_issued_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'Asia/Kuala_Lumpur', ?, ?, ?)`
    );
    const inserted = [];
    const tx = db.transaction((items) => {
      for (const acc of items) {
        const info = stmt.run(
          acc.username,
          acc.password,
          acc.productKey || null,
          acc.apiKey || null,
          acc.persona || 'Professional Marketer',
          acc.postsPerDay ? Number(acc.postsPerDay) : 1,
          acc.apiKey ? now : null,
          now,
          now
        );
        inserted.push(db.prepare('SELECT * FROM thread_accounts WHERE id = ?').get(info.lastInsertRowid));
      }
    });
    tx(valid);
    res.status(201).json(inserted.map(formatAccount));
  });

  router.put('/threads/accounts/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = db.prepare('SELECT * FROM thread_accounts WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Account not found' });

    const b = req.body || {};
    const now = new Date().toISOString();
    const nextApiKey = b.apiKey !== undefined ? b.apiKey || null : existing.api_key;
    const nextTokenIssuedAt = b.apiKey !== undefined && b.apiKey ? now : existing.token_issued_at;

    db.prepare(
      `UPDATE thread_accounts SET
        username = ?, password = ?, product_key = ?, api_key = ?, token_issued_at = ?,
        persona = ?, posts_per_day = ?, timezone = ?, proxy_url = ?, labels = ?, writing_instructions = ?,
        auto_post_enabled = ?, auto_post_max_per_day = ?, auto_post_mode = ?,
        auto_post_window_start = ?, auto_post_window_end = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      b.username !== undefined ? b.username : existing.username,
      b.password !== undefined ? b.password : existing.password,
      b.productKey !== undefined ? b.productKey || null : existing.product_key,
      nextApiKey,
      nextTokenIssuedAt,
      b.persona !== undefined ? b.persona : existing.persona,
      b.postsPerDay !== undefined ? Number(b.postsPerDay) : existing.posts_per_day,
      b.timezone !== undefined ? b.timezone || 'Asia/Kuala_Lumpur' : existing.timezone,
      b.proxyUrl !== undefined ? b.proxyUrl || null : existing.proxy_url,
      b.labels !== undefined ? b.labels || null : existing.labels,
      b.writingInstructions !== undefined ? b.writingInstructions || null : existing.writing_instructions,
      b.autoPostEnabled !== undefined ? (b.autoPostEnabled ? 'true' : 'false') : existing.auto_post_enabled,
      b.autoPostMaxPerDay !== undefined ? String(b.autoPostMaxPerDay) : existing.auto_post_max_per_day,
      b.autoPostMode !== undefined ? b.autoPostMode : existing.auto_post_mode,
      b.autoPostWindowStart !== undefined ? b.autoPostWindowStart : existing.auto_post_window_start,
      b.autoPostWindowEnd !== undefined ? b.autoPostWindowEnd : existing.auto_post_window_end,
      now,
      id
    );

    const updated = db.prepare('SELECT * FROM thread_accounts WHERE id = ?').get(id);
    res.json(formatAccount(updated));
  });

  router.delete('/threads/accounts/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    db.prepare('DELETE FROM threads_scheduled_posts WHERE account_id = ?').run(id);
    db.prepare('UPDATE automation_events SET account_id = NULL WHERE account_id = ?').run(id);
    db.prepare('UPDATE content_edits SET account_id = NULL WHERE account_id = ?').run(id);
    db.prepare('DELETE FROM thread_accounts WHERE id = ?').run(id);
    res.sendStatus(204);
  });

  router.delete('/threads/accounts', requireAdmin, (req, res) => {
    const { accountIds } = req.body || {};
    if (!Array.isArray(accountIds) || accountIds.length === 0) {
      return res.status(400).json({ error: 'accountIds array is required' });
    }
    const tx = db.transaction((ids) => {
      for (const rawId of ids) {
        const id = Number(rawId);
        db.prepare('DELETE FROM threads_scheduled_posts WHERE account_id = ?').run(id);
        db.prepare('UPDATE automation_events SET account_id = NULL WHERE account_id = ?').run(id);
        db.prepare('UPDATE content_edits SET account_id = NULL WHERE account_id = ?').run(id);
        db.prepare('DELETE FROM thread_accounts WHERE id = ?').run(id);
      }
    });
    tx(accountIds);
    res.json({ deleted: accountIds.length });
  });

  // ── MULTI-ACCOUNT & POST NOW ────────────────────────────────────────────────

  router.post('/threads/publish-multi', requireAdmin, async (req, res) => {
    const { topic, posts, accountIds, media: mediaRaw, includeHashtags = true } = req.body || {};
    if (!topic || !posts || !Array.isArray(accountIds) || accountIds.length === 0) {
      return res.status(400).json({ error: 'topic, posts, and accountIds are required' });
    }
    const accounts = accountIds
      .map((id) => db.prepare('SELECT * FROM thread_accounts WHERE id = ?').get(Number(id)))
      .filter(Boolean);
    const postsArr = typeof posts === 'string' ? JSON.parse(posts) : posts;
    const media = Array.isArray(mediaRaw) ? mediaRaw : [];

    const settled = await Promise.allSettled(
      accounts.map(async (account) => {
        const accessToken = account.api_key || getThreadsToken();
        if (!accessToken) throw new Error('No API key configured for this account');
        const postId = await publishToThreads(postsArr, accessToken, media, includeHashtags);
        return { username: account.username, postId };
      })
    );

    const results = settled.map((r, i) =>
      r.status === 'fulfilled'
        ? { accountId: accounts[i].id, username: accounts[i].username, status: 'success', postId: r.value.postId }
        : { accountId: accounts[i].id, username: accounts[i].username, status: 'failed', error: r.reason?.message }
    );
    const successCount = results.filter((r) => r.status === 'success').length;
    res.json({ results, successCount, failCount: results.length - successCount });
  });

  router.post('/threads/post-now', requireAdmin, async (req, res) => {
    try {
      const { topic, links = [], postType = 'single', accountIds, postLength, preGeneratedContent } = req.body || {};
      if (!topic || !Array.isArray(accountIds) || accountIds.length === 0) {
        return res.status(400).json({ error: 'topic and accountIds are required' });
      }
      const accounts = accountIds
        .map((id) => db.prepare('SELECT * FROM thread_accounts WHERE id = ?').get(Number(id)))
        .filter(Boolean);

      const results = await Promise.allSettled(
        accounts.map(async (account) => {
          const accessToken = account.api_key || getThreadsToken();
          if (!accessToken) throw new Error('No API key configured for this account');

          const preGen = Array.isArray(preGeneratedContent)
            ? preGeneratedContent.find((p) => p.accountId === account.id)?.content
            : null;
          const contents = preGen
            ? [preGen]
            : await generatePostsForAccount(topic, account.persona, 1, links, false, postType, account.id, postLength);
          const content = contents[0] ?? topic;

          const postId = await publishToThreads([{ content }], accessToken);
          const publishedAt = new Date().toISOString();

          db.prepare(
            `INSERT INTO threads_posts
              (topic, posts, personas, post_type, status, is_draft, published_at, threads_post_id, error_message, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'success', 'false', ?, ?, NULL, ?, ?)`
          ).run(
            topic,
            JSON.stringify([{ content }]),
            `@${account.username} · ${account.persona}`,
            postType,
            publishedAt,
            postId,
            publishedAt,
            publishedAt
          );

          return { accountId: account.id, username: account.username, status: 'success', postId, content };
        })
      );

      const mapped = results.map((r, i) =>
        r.status === 'fulfilled'
          ? r.value
          : { accountId: accounts[i].id, username: accounts[i].username, status: 'failed', error: r.reason?.message, content: null }
      );
      const successCount = mapped.filter((r) => r.status === 'success').length;
      res.json({ results: mapped, successCount, failCount: mapped.length - successCount });
    } catch (err) {
      res.status(500).json({ error: err?.message || 'Post-now failed' });
    }
  });

  // ── AUTOMATE & PREVIEW ──────────────────────────────────────────────────────

  router.post('/threads/preview', requireAdmin, async (req, res) => {
    try {
      const { topic, links = [], postType = 'single', accountIds, postLength } = req.body || {};
      if (!topic || !Array.isArray(accountIds) || accountIds.length === 0) {
        return res.status(400).json({ error: 'topic and accountIds are required' });
      }
      const accounts = accountIds
        .map((id) => db.prepare('SELECT * FROM thread_accounts WHERE id = ?').get(Number(id)))
        .filter(Boolean);

      const results = await Promise.allSettled(
        accounts.map(async (account) => {
          const contents = await generatePostsForAccount(
            topic,
            account.persona,
            1,
            links,
            false,
            postType,
            account.id,
            postLength
          );
          const { n } = db.prepare('SELECT COUNT(*) AS n FROM content_edits WHERE account_id = ?').get(account.id);
          return {
            accountId: account.id,
            username: account.username,
            persona: account.persona,
            content: contents[0] ?? '',
            learnedEdits: Number(n ?? 0),
          };
        })
      );

      res.json(
        results.map((r, i) =>
          r.status === 'fulfilled'
            ? r.value
            : {
                accountId: accounts[i].id,
                username: accounts[i].username,
                persona: accounts[i].persona,
                content: null,
                error: r.reason?.message,
                learnedEdits: 0,
              }
        )
      );
    } catch (err) {
      res.status(500).json({ error: err?.message || 'Preview failed' });
    }
  });

  router.post('/threads/automate/preview', requireAdmin, async (req, res) => {
    try {
      const { topic, links = [], postType = 'single', accountIds, days = 1, postLength } = req.body || {};
      if (!topic || !Array.isArray(accountIds) || accountIds.length === 0) {
        return res.status(400).json({ error: 'topic and accountIds are required' });
      }
      const accounts = accountIds
        .map((id) => db.prepare('SELECT * FROM thread_accounts WHERE id = ?').get(Number(id)))
        .filter(Boolean);
      const totalDays = Math.max(1, Math.min(Number(days) || 1, 30));
      const previews = [];

      for (const account of accounts) {
        const tz = account.timezone ?? 'Asia/Kuala_Lumpur';
        const dateRange = getDateRange(totalDays, tz);
        const totalPosts = account.posts_per_day * dateRange.length;
        const allContents = await generatePostsForAccount(
          topic,
          account.persona,
          totalPosts,
          links,
          false,
          postType,
          account.id,
          postLength
        );
        let ci = 0;
        for (const dateStr of dateRange) {
          const times = getSpreadTimesForDate(account.posts_per_day, tz, dateStr);
          const dayContents = allContents.slice(ci, ci + account.posts_per_day);
          ci += account.posts_per_day;
          for (let i = 0; i < times.length; i++) {
            previews.push({
              tempId: `${account.id}-${dateStr}-${i}`,
              accountId: account.id,
              username: account.username,
              persona: account.persona,
              dateStr,
              scheduledAt: times[i].toISOString(),
              content: dayContents[i] ?? dayContents[0] ?? topic,
            });
          }
        }
      }
      res.json({ previews, total: previews.length });
    } catch (err) {
      res.status(500).json({ error: err?.message || 'Automate preview failed' });
    }
  });

  router.post('/threads/automate', requireAdmin, async (req, res) => {
    try {
      const {
        topic,
        links = [],
        hashtags = true,
        postType = 'single',
        accountIds,
        days = 1,
        postLength,
        preGeneratedPosts,
      } = req.body || {};
      if (!topic || !Array.isArray(accountIds) || accountIds.length === 0) {
        return res.status(400).json({ error: 'topic and accountIds are required' });
      }

      const accounts = accountIds
        .map((id) => db.prepare('SELECT * FROM thread_accounts WHERE id = ?').get(Number(id)))
        .filter(Boolean);
      const accountMap = new Map(accounts.map((a) => [a.id, a]));

      const scheduled = [];
      let duplicatesSkipped = 0;
      const totalDays = Math.max(1, Math.min(Number(days) || 1, 30));
      const now = new Date().toISOString();

      const insertItem = (accountId, content, scheduledAtIso) => {
        const account = accountMap.get(accountId);
        if (!account) return;
        const contentHash = crypto.createHash('sha256').update(content).digest('hex');
        const existing = db
          .prepare(
            "SELECT id FROM threads_scheduled_posts WHERE account_id = ? AND content_hash = ? AND status = 'pending' LIMIT 1"
          )
          .get(account.id, contentHash);
        if (existing) {
          duplicatesSkipped++;
          return;
        }
        const info = db
          .prepare(
            `INSERT INTO threads_scheduled_posts (account_id, topic, content, content_hash, scheduled_at, status, created_at)
             VALUES (?, ?, ?, ?, ?, 'pending', ?)`
          )
          .run(account.id, topic, content, contentHash, scheduledAtIso, now);
        const row = db.prepare('SELECT * FROM threads_scheduled_posts WHERE id = ?').get(info.lastInsertRowid);
        scheduled.push(
          formatScheduledRow({ ...row, username: account.username, persona: account.persona })
        );
      };

      if (Array.isArray(preGeneratedPosts) && preGeneratedPosts.length > 0) {
        for (const item of preGeneratedPosts) {
          insertItem(Number(item.accountId), String(item.content || topic), item.scheduledAt);
        }
      } else {
        for (const account of accounts) {
          const tz = account.timezone ?? 'Asia/Kuala_Lumpur';
          const dateRange = getDateRange(totalDays, tz);
          const totalPosts = account.posts_per_day * dateRange.length;
          const allContents = await generatePostsForAccount(
            topic,
            account.persona,
            totalPosts,
            links,
            hashtags,
            postType,
            account.id,
            postLength
          );
          let contentIndex = 0;
          for (const dateStr of dateRange) {
            const times = getSpreadTimesForDate(account.posts_per_day, tz, dateStr);
            const dayContents = allContents.slice(contentIndex, contentIndex + account.posts_per_day);
            contentIndex += account.posts_per_day;
            for (let i = 0; i < times.length; i++) {
              insertItem(account.id, dayContents[i] ?? dayContents[0] ?? topic, times[i].toISOString());
            }
          }
        }
      }

      res.json({
        scheduled,
        totalPosts: scheduled.length,
        accounts: accounts.length,
        duplicatesSkipped,
        days: totalDays,
        message: `Scheduled ${scheduled.length} posts across ${accounts.length} account${
          accounts.length !== 1 ? 's' : ''
        } over ${totalDays} day${totalDays !== 1 ? 's' : ''}${
          duplicatesSkipped > 0 ? ` (${duplicatesSkipped} duplicates skipped)` : ''
        }`,
      });
    } catch (err) {
      res.status(500).json({ error: err?.message || 'Automation failed' });
    }
  });

  router.post('/threads/automate/generate-now', requireAdmin, async (_req, res) => {
    try {
      const result = await generateDailyAutoPosts();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err?.message || 'Generation failed' });
    }
  });

  // ── SCHEDULED QUEUE ─────────────────────────────────────────────────────────

  router.get('/threads/scheduled', requireAdmin, (_req, res) => {
    const rows = db
      .prepare(
        `SELECT p.*, a.username, a.persona
         FROM threads_scheduled_posts p
         LEFT JOIN thread_accounts a ON p.account_id = a.id
         ORDER BY p.scheduled_at ASC`
      )
      .all();
    res.json(rows.map(formatScheduledRow));
  });

  router.patch('/threads/scheduled/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = db
      .prepare("SELECT * FROM threads_scheduled_posts WHERE id = ? AND status IN ('pending', 'draft')")
      .get(id);
    if (!existing) return res.status(404).json({ error: 'Post not found or already published' });

    const { content, scheduledAt, imageUrl } = req.body || {};
    if (content === undefined && scheduledAt === undefined && imageUrl === undefined) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    db.prepare(
      'UPDATE threads_scheduled_posts SET content = ?, scheduled_at = ?, image_url = ? WHERE id = ?'
    ).run(
      content !== undefined ? content : existing.content,
      scheduledAt !== undefined ? new Date(scheduledAt).toISOString() : existing.scheduled_at,
      imageUrl !== undefined ? imageUrl : existing.image_url,
      id
    );

    const row = db
      .prepare(
        `SELECT p.*, a.username, a.persona
         FROM threads_scheduled_posts p
         LEFT JOIN thread_accounts a ON p.account_id = a.id
         WHERE p.id = ?`
      )
      .get(id);
    res.json(formatScheduledRow(row));
  });

  router.delete('/threads/scheduled/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    db.prepare('UPDATE automation_events SET post_id = NULL WHERE post_id = ?').run(id);
    db.prepare('DELETE FROM threads_scheduled_posts WHERE id = ?').run(id);
    res.sendStatus(204);
  });

  router.post('/threads/scheduled/:id/approve', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = db
      .prepare("SELECT * FROM threads_scheduled_posts WHERE id = ? AND status = 'draft'")
      .get(id);
    if (!existing) return res.status(404).json({ error: 'Draft not found or already approved' });

    db.prepare("UPDATE threads_scheduled_posts SET status = 'pending' WHERE id = ?").run(id);
    const row = db
      .prepare(
        `SELECT p.*, a.username, a.persona
         FROM threads_scheduled_posts p
         LEFT JOIN thread_accounts a ON p.account_id = a.id
         WHERE p.id = ?`
      )
      .get(id);
    res.json(formatScheduledRow(row));
  });

  router.post('/threads/scheduled/pause-all', requireAdmin, (_req, res) => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO system_config (key, value, updated_at) VALUES ('automation_paused', 'true', ?)
       ON CONFLICT(key) DO UPDATE SET value = 'true', updated_at = excluded.updated_at`
    ).run(now);
    res.json({ paused: true });
  });

  router.post('/threads/scheduled/resume-all', requireAdmin, (_req, res) => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO system_config (key, value, updated_at) VALUES ('automation_paused', 'false', ?)
       ON CONFLICT(key) DO UPDATE SET value = 'false', updated_at = excluded.updated_at`
    ).run(now);
    res.json({ paused: false });
  });

  router.get('/threads/scheduled/pause-status', requireAdmin, (_req, res) => {
    const row = db.prepare("SELECT value FROM system_config WHERE key = 'automation_paused'").get();
    res.json({ paused: row?.value === 'true' });
  });

  // ── TOKEN MANAGEMENT & STATS & CRON ─────────────────────────────────────────

  router.post('/threads/check-expiring-tokens', requireAdmin, async (_req, res) => {
    try {
      res.json(await checkAndRefreshExpiringTokens());
    } catch (err) {
      res.status(500).json({ error: err?.message });
    }
  });

  router.post('/threads/keep-alive-tokens', requireAdmin, async (_req, res) => {
    try {
      res.json(await keepAliveAllUserTokens());
    } catch (err) {
      res.status(500).json({ error: err?.message });
    }
  });

  router.post('/threads/refresh-tokens', requireAdmin, async (_req, res) => {
    try {
      res.json(await refreshAllUserAccountTokens());
    } catch (err) {
      res.status(500).json({ error: err?.message });
    }
  });

  router.post('/threads/accounts/:id/refresh-token', requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const account = db.prepare('SELECT * FROM thread_accounts WHERE id = ?').get(id);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    if (!account.api_key) return res.status(400).json({ error: 'This account has no API key to refresh' });

    try {
      const newToken = await refreshUserToken(account.api_key);
      const now = new Date().toISOString();
      db.prepare('UPDATE thread_accounts SET api_key = ?, token_issued_at = ?, updated_at = ? WHERE id = ?').run(
        newToken,
        now,
        now,
        id
      );
      res.json(formatAccount(db.prepare('SELECT * FROM thread_accounts WHERE id = ?').get(id)));
    } catch (err) {
      res.status(500).json({ error: err?.message });
    }
  });

  router.get('/threads/queue/stats', requireAdmin, (_req, res) => {
    const stats = db
      .prepare(
        `SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
          SUM(CASE WHEN retry_count > 0 THEN 1 ELSE 0 END) AS retried
         FROM threads_scheduled_posts`
      )
      .get();

    const accountBreakdown = db
      .prepare(
        `SELECT
          p.account_id AS accountId,
          a.username,
          a.persona,
          a.timezone,
          COUNT(*) AS total,
          SUM(CASE WHEN p.status = 'published' THEN 1 ELSE 0 END) AS published,
          SUM(CASE WHEN p.status = 'failed' THEN 1 ELSE 0 END) AS failed,
          SUM(CASE WHEN p.status = 'pending' THEN 1 ELSE 0 END) AS pending
         FROM threads_scheduled_posts p
         LEFT JOIN thread_accounts a ON p.account_id = a.id
         GROUP BY p.account_id, a.username, a.persona, a.timezone`
      )
      .all();

    const total = Number(stats?.total ?? 0);
    const published = Number(stats?.published ?? 0);
    res.json({
      total,
      pending: Number(stats?.pending ?? 0),
      published,
      failed: Number(stats?.failed ?? 0),
      retried: Number(stats?.retried ?? 0),
      successRate: total > 0 ? Math.round((published / total) * 100) : 0,
      accountBreakdown: accountBreakdown.map((a) => ({
        accountId: a.accountId,
        username: a.username,
        persona: a.persona,
        timezone: a.timezone ?? 'Asia/Kuala_Lumpur',
        total: Number(a.total),
        published: Number(a.published),
        failed: Number(a.failed),
        pending: Number(a.pending),
      })),
    });
  });

  router.all('/threads/process-queue', requireAdmin, async (_req, res) => {
    try {
      res.json(await processThreadsQueue());
    } catch (err) {
      res.status(500).json({ error: err?.message });
    }
  });

  router.all('/threads/cron/generate-auto-posts', requireAdmin, async (_req, res) => {
    try {
      res.json(await generateDailyAutoPosts());
    } catch (err) {
      res.status(500).json({ error: err?.message });
    }
  });

  // ── CONTENT EDITS & TOPIC TEMPLATES & SUGGESTIONS ───────────────────────────

  router.post('/threads/content-edits', requireAdmin, (req, res) => {
    const { accountId, persona, topic, originalContent, editedContent, userComment } = req.body || {};
    if (!originalContent || !editedContent) {
      return res.status(400).json({ error: 'originalContent and editedContent are required' });
    }
    const info = db
      .prepare(
        `INSERT INTO content_edits (account_id, persona, topic, original_content, edited_content, user_comment, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        accountId ?? null,
        persona ?? null,
        topic ?? null,
        String(originalContent).slice(0, 1000),
        String(editedContent).slice(0, 1000),
        userComment ? String(userComment).slice(0, 300) : null,
        new Date().toISOString()
      );
    const row = db.prepare('SELECT * FROM content_edits WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(row);
  });

  router.get('/threads/topic-templates', requireAdmin, (_req, res) => {
    const rows = db.prepare('SELECT * FROM post_topic_templates ORDER BY created_at DESC').all();
    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        topic: r.topic,
        links: r.links ? JSON.parse(r.links) : [],
        postType: r.post_type,
        postLength: r.post_length,
        createdAt: r.created_at,
      }))
    );
  });

  router.post('/threads/topic-templates', requireAdmin, (req, res) => {
    const { name, topic, links = [], postType = 'single', postLength = 'medium' } = req.body || {};
    if (!name?.trim() || !topic?.trim()) {
      return res.status(400).json({ error: 'name and topic are required' });
    }
    const now = new Date().toISOString();
    const info = db
      .prepare(
        `INSERT INTO post_topic_templates (name, topic, links, post_type, post_length, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(name.trim(), topic.trim(), JSON.stringify(links), postType, postLength, now);
    const row = db.prepare('SELECT * FROM post_topic_templates WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({
      id: row.id,
      name: row.name,
      topic: row.topic,
      links,
      postType: row.post_type,
      postLength: row.post_length,
      createdAt: row.created_at,
    });
  });

  router.delete('/threads/topic-templates/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    db.prepare('DELETE FROM post_topic_templates WHERE id = ?').run(id);
    res.sendStatus(204);
  });

  router.post('/threads/suggest-topics', requireAdmin, async (req, res) => {
    try {
      const { personas = [], count = 6, location = 'Malaysia' } = req.body || {};
      const month = new Date().toLocaleString('en-US', { month: 'long' });
      const year = new Date().getFullYear();
      const personaList = personas.slice(0, 5).join(', ') || 'Malaysian social media users';

      const system =
        'You are a creative social media content strategist. Generate topic ideas that are culturally relevant and engagement-driven.';
      const user = `Generate ${count} unique, creative Threads post topic ideas for these personas: ${personaList}.
Target market: ${location}. Current month: ${month} ${year}.
Make them specific, timely, and compelling — not generic.
Return ONLY this JSON: {"topics":["topic1","topic2",...]}`;

      const raw = await executeAiTask(system, user, true, { module: 'threads-suggest' });
      const parsed = safeParseJSON(raw, { topics: [] });
      res.json({ topics: (parsed.topics || []).slice(0, count), source: 'openrouter' });
    } catch (err) {
      res.status(500).json({ error: err?.message || 'Topic suggestion failed' });
    }
  });

  // ── ENGAGE (REPLIES) ────────────────────────────────────────────────────────

  router.post('/threads/replies/resolve', requireAdmin, async (req, res) => {
    try {
      const { url } = req.body || {};
      if (!url || typeof url !== 'string') return res.status(400).json({ error: 'url is required' });
      const target = await resolveOwnPost(url);
      const { eligible, excluded } = classifyEligibleAccounts(target.ownerAccount.id);
      res.json({
        mediaId: target.mediaId,
        text: target.text,
        permalink: target.permalink,
        ownerUsername: target.ownerAccount.username,
        eligible: eligible.map((a) => ({ id: a.id, username: a.username, persona: a.persona })),
        excluded,
      });
    } catch (err) {
      res.status(400).json({ error: err?.message });
    }
  });

  router.post('/threads/replies/generate', requireAdmin, async (req, res) => {
    try {
      const { url, mode, maxAccounts } = req.body || {};
      if (!url || typeof url !== 'string') return res.status(400).json({ error: 'url is required' });
      const batch = await generateReplyBatch(url, mode === 'all' ? 'all' : 'auto', maxAccounts ? Number(maxAccounts) : undefined);
      res.status(201).json({ ...batch, jobs: batch.jobs.map(formatReplyJob) });
    } catch (err) {
      res.status(400).json({ error: err?.message });
    }
  });

  router.get('/threads/replies/batches', requireAdmin, (_req, res) => {
    const jobs = db
      .prepare(
        `SELECT j.*, a.username
         FROM threads_reply_jobs j
         LEFT JOIN thread_accounts a ON j.account_id = a.id
         ORDER BY j.created_at DESC LIMIT 300`
      )
      .all();

    const batches = new Map();
    for (const row of jobs) {
      if (!batches.has(row.batch_id)) {
        batches.set(row.batch_id, {
          batchId: row.batch_id,
          targetUrl: row.target_url,
          targetText: row.target_text,
          createdAt: row.created_at,
          jobs: [],
        });
      }
      batches.get(row.batch_id).jobs.push(formatReplyJob(row));
    }
    res.json([...batches.values()].slice(0, 20));
  });

  router.put('/threads/replies/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    const replyText = typeof req.body?.replyText === 'string' ? req.body.replyText.trim() : '';
    if (Number.isNaN(id) || !replyText) return res.status(400).json({ error: 'replyText is required' });
    if (replyText.length > 480) return res.status(400).json({ error: 'Replies must be under 480 characters' });

    const existing = db
      .prepare("SELECT * FROM threads_reply_jobs WHERE id = ? AND status = 'draft'")
      .get(id);
    if (!existing) return res.status(404).json({ error: 'Draft not found (already scheduled or published?)' });

    const now = new Date().toISOString();
    db.prepare('UPDATE threads_reply_jobs SET reply_text = ?, updated_at = ? WHERE id = ?').run(replyText, now, id);

    if (existing.reply_text.trim() !== replyText) {
      db.prepare(
        `INSERT INTO content_edits (account_id, persona, topic, original_content, edited_content, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        existing.account_id,
        existing.persona_snapshot,
        existing.target_text ? `Reply to: ${existing.target_text.slice(0, 80)}` : null,
        existing.reply_text.slice(0, 1000),
        replyText.slice(0, 1000),
        now
      );
    }

    res.json(formatReplyJob(db.prepare('SELECT * FROM threads_reply_jobs WHERE id = ?').get(id)));
  });

  router.post('/threads/replies/:id/regenerate', requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) return res.status(400).json({ error: 'invalid id' });
      const row = await regenerateReplyJob(id);
      res.json(formatReplyJob(row));
    } catch (err) {
      res.status(400).json({ error: err?.message });
    }
  });

  router.delete('/threads/replies/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'invalid id' });
    const job = db.prepare('SELECT * FROM threads_reply_jobs WHERE id = ?').get(id);
    if (!job) return res.status(404).json({ error: 'Not found' });

    if (job.status === 'draft') {
      db.prepare('DELETE FROM threads_reply_jobs WHERE id = ?').run(id);
    } else if (job.status === 'scheduled') {
      db.prepare("UPDATE threads_reply_jobs SET status = 'cancelled', updated_at = ? WHERE id = ?").run(
        new Date().toISOString(),
        id
      );
    } else {
      return res.status(400).json({ error: `Cannot remove a ${job.status} reply` });
    }
    res.status(204).end();
  });

  router.post('/threads/replies/approve', requireAdmin, (req, res) => {
    try {
      const { batchId, windowHours } = req.body || {};
      if (!batchId || typeof batchId !== 'string') return res.status(400).json({ error: 'batchId is required' });
      const jobs = approveReplyBatch(batchId, windowHours ? Number(windowHours) : undefined);
      res.json({ scheduled: jobs.length, jobs: jobs.map(formatReplyJob) });
    } catch (err) {
      res.status(400).json({ error: err?.message });
    }
  });

  router.post('/threads/replies/process', requireAdmin, async (_req, res) => {
    try {
      res.json(await processReplyQueue());
    } catch (err) {
      res.status(500).json({ error: err?.message });
    }
  });

  return router;
}
