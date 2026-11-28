import db from '../db.js';

export const PRIMARY_MODEL = 'deepseek/deepseek-v4.1-flash-1017';
export const OPENROUTER_MODELS = [
  'deepseek/deepseek-v4.1-flash-1017',
  'tencent/hy4-flash',
  'z-ai/glm-5.3-flash',
];

const MODEL_PRICING = {
  'deepseek/deepseek-v4.1-flash-1017': { input: 0.14, output: 0.28 },
  'tencent/hy4-flash': { input: 0.1, output: 0.2 },
  'z-ai/glm-5.3-flash': { input: 0.1, output: 0.2 },
};

function logCost({ model, promptTokens = 0, completionTokens = 0, module = null }) {
  try {
    const pricing = MODEL_PRICING[model] || { input: 0, output: 0 };
    const cost = (promptTokens * pricing.input + completionTokens * pricing.output) / 1_000_000;
    db.prepare(
      `INSERT INTO ai_cost_logs (model, module, prompt_tokens, completion_tokens, estimated_cost_usd, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(model, module, promptTokens, completionTokens, cost, new Date().toISOString());
  } catch {
    // Non-blocking cost log
  }
}

export function safeParseJSON(content, fallback) {
  const cleaned = String(content || '')
    .replace(/```json\n?/gi, '')
    .replace(/```\n?/g, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const lastBrace = cleaned.lastIndexOf('}');
    if (lastBrace !== -1) {
      try {
        const salvaged = JSON.parse(cleaned.substring(0, lastBrace + 1) + ']}');
        if (salvaged && Array.isArray(salvaged.posts)) {
          return salvaged;
        }
      } catch {
        // Fallback below
      }
    }
    return fallback;
  }
}

export async function runOpenRouterCascadeWithMeta(
  messages,
  requireJson = false,
  logCtx = {},
  modelList = null
) {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterKey) {
    throw new Error('OPENROUTER_API_KEY is not set in .env.');
  }

  const referer = process.env.APP_URL || 'http://localhost:5173';
  const modelsToTry = Array.isArray(modelList) && modelList.length > 0 ? modelList : OPENROUTER_MODELS;
  let lastError = null;

  for (const model of modelsToTry) {
    try {
      const body = { model, messages, max_tokens: 8192 };
      if (requireJson) body.response_format = { type: 'json_object' };

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openRouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': referer,
          'X-Title': 'BeliApaHarini AI Marketing',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45000),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        if (content) {
          const promptTokens = data?.usage?.prompt_tokens ?? 0;
          const completionTokens = data?.usage?.completion_tokens ?? 0;
          logCost({
            model,
            promptTokens,
            completionTokens,
            module: logCtx?.module ?? null,
          });
          return {
            content,
            model,
            tokensUsed: promptTokens + completionTokens,
          };
        }
        lastError = new Error(`${model} returned empty content`);
      } else {
        const errText = await response.text().catch(() => '');
        lastError = new Error(`${model} HTTP ${response.status}: ${errText.slice(0, 200)}`);
        console.warn(`[openrouter] ${lastError.message}`);
      }
    } catch (err) {
      lastError = err;
      console.warn(`[openrouter] ${model} failed: ${err?.message || err}`);
    }
  }

  throw lastError || new Error('All OpenRouter models exhausted.');
}

export async function runOpenRouterCascade(messages, requireJson = false, logCtx = {}, modelList = null) {
  const res = await runOpenRouterCascadeWithMeta(messages, requireJson, logCtx, modelList);
  return res.content;
}

export async function executeAiTaskWithMeta(
  systemPrompt,
  userPrompt,
  requireJson = false,
  logCtx = {},
  modelOverride = null
) {
  const models =
    modelOverride && modelOverride.includes('/')
      ? [modelOverride, ...OPENROUTER_MODELS.filter((m) => m !== modelOverride)]
      : OPENROUTER_MODELS;

  return runOpenRouterCascadeWithMeta(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    requireJson,
    logCtx,
    models
  );
}

export async function executeAiTask(
  systemPrompt,
  userPrompt,
  requireJson = false,
  logCtx = {},
  modelOverride = null
) {
  const res = await executeAiTaskWithMeta(systemPrompt, userPrompt, requireJson, logCtx, modelOverride);
  return res.content;
}
