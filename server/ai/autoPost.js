import crypto from 'node:crypto';
import db from '../db.js';
import { executeAiTask } from './openrouter.js';
import { getPersonaPrompt } from './personas.js';

const MIN_GAP_MS = 45 * 60 * 1000;
const MAX_ATTEMPTS = 150;

function getUTCOffsetMs(timezone, date) {
  try {
    const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzStr = date.toLocaleString('en-US', { timeZone: timezone });
    return new Date(tzStr).getTime() - new Date(utcStr).getTime();
  } catch {
    return 0;
  }
}

function pickUniqueTimes(count, dateStr, timezone, windowStart, windowEnd, takenTimes) {
  const now = new Date();
  const tzOffsetMs = getUTCOffsetMs(timezone, now);

  const [sh, sm] = String(windowStart || '08:00').split(':').map(Number);
  const [eh, em] = String(windowEnd || '22:00').split(':').map(Number);

  const utcMidnight = new Date(`${dateStr}T00:00:00Z`);
  const configuredStartMs = utcMidnight.getTime() + (sh * 60 + sm) * 60_000 - tzOffsetMs;
  const windowEndMs = utcMidnight.getTime() + (eh * 60 + em) * 60_000 - tzOffsetMs;

  const windowStartMs = Math.min(Math.max(configuredStartMs, now.getTime() + 60_000), windowEndMs);
  const windowDurMs = Math.max(0, windowEndMs - windowStartMs);
  if (windowDurMs <= 0) return [];

  const result = [];
  for (let slot = 0; slot < count; slot++) {
    const segStart = windowStartMs + (windowDurMs / count) * slot;
    const segEnd = windowStartMs + (windowDurMs / count) * (slot + 1);
    const segDur = segEnd - segStart;

    let picked = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const candidate = new Date(segStart + Math.random() * segDur);
      const allTaken = [...takenTimes, ...result];
      const conflict = allTaken.some((t) => Math.abs(t.getTime() - candidate.getTime()) < MIN_GAP_MS);
      if (!conflict) {
        picked = candidate;
        break;
      }
    }

    if (!picked) {
      let bestTime = new Date(segStart + Math.random() * segDur);
      let bestMinDist = -1;
      for (let j = 0; j < 80; j++) {
        const candidate = new Date(segStart + Math.random() * segDur);
        const allTaken = [...takenTimes, ...result];
        const minDist =
          allTaken.length > 0
            ? Math.min(...allTaken.map((t) => Math.abs(t.getTime() - candidate.getTime())))
            : segDur;
        if (minDist > bestMinDist) {
          bestMinDist = minDist;
          bestTime = candidate;
        }
      }
      picked = bestTime;
    }

    result.push(picked);
  }

  return result;
}

async function generateAutoPostContent(account, timeOfDay) {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = dayNames[new Date().getDay()];

  const recentRows = db
    .prepare(
      `SELECT content FROM threads_scheduled_posts
       WHERE account_id = ? AND status = 'published'
       ORDER BY scheduled_at DESC LIMIT 3`
    )
    .all(account.id);

  const recentContext =
    recentRows.length > 0
      ? `\n\nAvoid repeating themes from these recent posts:\n${recentRows
          .map((r, i) => `${i + 1}. "${String(r.content).slice(0, 100)}"`)
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

  const instructionsContext = account.writingInstructions
    ? `\n\nAlways apply these writing style rules: ${account.writingInstructions}`
    : '';

  let systemPrompt = getPersonaPrompt(account.persona);
  const customPersona = db
    .prepare("SELECT prompt FROM custom_personas WHERE name = ? AND is_enabled = 'true' LIMIT 1")
    .get(account.persona);

  if (customPersona) {
    systemPrompt = `You are a persona writing engaging content for Meta Threads. Each post must be under 500 characters.\n\n${customPersona.prompt}`;
  }

  const userPrompt = `It is ${timeOfDay} on ${dayName}.

Write ONE natural, authentic Threads post as yourself — your own thought, observation, feeling, or reaction for today.
This is NOT a marketing post or a campaign. Think of it like a personal diary entry that you are willing to share publicly.

Rules:
- Under 500 characters.
- Sound completely human — no hashtags unless it truly feels natural, no forced calls to action.
- Vary your tone to the time of day: mornings feel fresh/energetic, afternoons reflective or practical, evenings warm or introspective.
- You may reference something mundane, something in Malaysia, a feeling, a small observation — anything that fits your personality.
- Output ONLY the post text. No explanation, no quotes around it.
${recentContext}${learningContext}${instructionsContext}`;

  const raw = await executeAiTask(systemPrompt, userPrompt, false, { module: 'auto-post' });
  return raw.trim().replace(/^["']|["']$/g, '');
}

export async function generateDailyAutoPosts() {
  const stats = { generated: 0, skipped: 0, errors: 0 };

  const accounts = db
    .prepare("SELECT * FROM thread_accounts WHERE auto_post_enabled = 'true'")
    .all();

  if (accounts.length === 0) return stats;

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'UTC' });

  const existingToday = db
    .prepare(
      `SELECT account_id, scheduled_at FROM threads_scheduled_posts
       WHERE source = 'auto' AND substr(scheduled_at, 1, 10) = ?`
    )
    .all(todayStr);

  const autoCountByAccount = new Map();
  for (const row of existingToday) {
    autoCountByAccount.set(row.account_id, (autoCountByAccount.get(row.account_id) ?? 0) + 1);
  }

  const allTodayPosts = db
    .prepare(
      `SELECT scheduled_at FROM threads_scheduled_posts
       WHERE status IN ('pending', 'draft') AND substr(scheduled_at, 1, 10) = ?`
    )
    .all(todayStr);

  const takenTimes = allTodayPosts.map((r) => new Date(r.scheduled_at));

  for (const account of accounts) {
    try {
      const alreadyGenerated = autoCountByAccount.get(account.id) ?? 0;
      const maxPerDay = parseInt(account.auto_post_max_per_day ?? '1', 10) || 1;
      const targetToday = maxPerDay === 1 ? 1 : Math.random() > 0.5 ? 2 : 1;
      const needed = targetToday - alreadyGenerated;

      if (needed <= 0) {
        stats.skipped++;
        continue;
      }

      const timezone = account.timezone ?? 'Asia/Kuala_Lumpur';
      const windowStart = account.auto_post_window_start ?? '08:00';
      const windowEnd = account.auto_post_window_end ?? '22:00';

      let times = pickUniqueTimes(needed, todayStr, timezone, windowStart, windowEnd, takenTimes);
      let rolledToTomorrow = false;

      if (times.length === 0) {
        const tomorrowStr = new Date(new Date(`${todayStr}T00:00:00Z`).getTime() + 86_400_000)
          .toLocaleDateString('en-CA', { timeZone: 'UTC' });
        const tomorrowTaken = db
          .prepare(
            `SELECT scheduled_at FROM threads_scheduled_posts
             WHERE status IN ('pending', 'draft') AND substr(scheduled_at, 1, 10) = ?`
          )
          .all(tomorrowStr);
        times = pickUniqueTimes(
          needed,
          tomorrowStr,
          timezone,
          windowStart,
          windowEnd,
          tomorrowTaken.map((r) => new Date(r.scheduled_at))
        );
        rolledToTomorrow = times.length > 0;
      }

      if (times.length === 0) {
        stats.skipped++;
        continue;
      }

      if (!rolledToTomorrow) takenTimes.push(...times);

      for (const slotTime of times) {
        const hour = Number(
          slotTime.toLocaleString('en-US', { timeZone: timezone, hour: '2-digit', hour12: false })
        );
        const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

        const content = await generateAutoPostContent(
          {
            id: account.id,
            persona: account.persona,
            writingInstructions: account.writing_instructions ?? null,
          },
          timeOfDay
        );

        const contentHash = crypto.createHash('sha256').update(content).digest('hex');

        db.prepare(
          `INSERT INTO threads_scheduled_posts
            (account_id, topic, content, scheduled_at, status, source, content_hash, created_at)
           VALUES (?, 'auto-post', ?, ?, ?, 'auto', ?, ?)`
        ).run(
          account.id,
          content,
          slotTime.toISOString(),
          account.auto_post_mode === 'publish' ? 'pending' : 'draft',
          contentHash,
          new Date().toISOString()
        );

        stats.generated++;
      }
    } catch {
      stats.errors++;
    }
  }

  return stats;
}
