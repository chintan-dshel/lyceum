import Anthropic from '@anthropic-ai/sdk';
import { computeCost } from './modelPricing.js';
import { query } from '../db/pool.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Models
export const MODELS = {
  HAIKU: 'claude-haiku-4-5-20251001', // clarifier agent — lightweight inference
  FAST:  'claude-sonnet-4-6',          // advisor chat, professor Q&A, assessor
  DEEP:  'claude-opus-4-6',            // course generator, reviewer — do not downgrade
};

// ── Telemetry ────────────────────────────────────────────────────────────────

// Fire-and-forget trace write — a DB hiccup never surfaces as a 500.
function writeTrace({ meta = {}, model, inputTokens, outputTokens, latencyMs, status, errorMessage }) {
  const { inputPricePerMtok, outputPricePerMtok, costUsd } =
    computeCost(model, inputTokens, outputTokens);

  query(
    `INSERT INTO agent_traces
       (user_id, program_id, course_id, agent,
        model, input_tokens, output_tokens,
        input_price_per_mtok, output_price_per_mtok, cost_usd,
        latency_ms, status, error_message)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      meta.userId    ?? null,
      meta.programId ?? null,
      meta.courseId  ?? null,
      meta.agent     ?? 'unknown',
      model,
      inputTokens,
      outputTokens,
      inputPricePerMtok,
      outputPricePerMtok,
      costUsd,
      latencyMs,
      status,
      errorMessage ?? null,
    ]
  ).catch(err => console.error('[telemetry] trace write failed:', err.message));
}

// ── Core call ────────────────────────────────────────────────────────────────

/**
 * Core Claude call — handles both regular and streaming responses.
 * @param {object} opts
 * @param {string} opts.model
 * @param {string} opts.system
 * @param {Array}  opts.messages        — [{ role, content }]
 * @param {number} [opts.maxTokens]
 * @param {boolean} [opts.extendedThinking]
 * @param {number}  [opts.thinkingBudget]
 * @param {object}  [opts.meta]         — { userId, programId, courseId, agent }
 */
export async function callClaude({
  model = MODELS.FAST,
  system,
  messages,
  maxTokens = 4096,
  extendedThinking = false,
  thinkingBudget = 8000,
  meta = {},
}) {
  const params = {
    model,
    max_tokens: extendedThinking ? Math.max(maxTokens, thinkingBudget + 1000) : maxTokens,
    system,
    messages,
  };

  if (extendedThinking) {
    params.thinking = { type: 'enabled', budget_tokens: thinkingBudget };
  }

  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    const start = performance.now();
    try {
      const response = await client.messages.create(params);
      const latencyMs = Math.round(performance.now() - start);
      const text = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('');

      writeTrace({
        meta, model,
        inputTokens:  response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        latencyMs,
        status: 'success',
      });

      return { text, usage: response.usage, stopReason: response.stop_reason };
    } catch (err) {
      lastErr = err;
      const latencyMs = Math.round(performance.now() - start);

      if (err.status === 429) {
        const waitSecs = 65 * (attempt + 1);
        console.log(`[Claude] Rate limited — waiting ${waitSecs}s before retry ${attempt + 1}/2...`);
        await new Promise(r => setTimeout(r, waitSecs * 1000));
        continue;
      }

      // Non-retryable error — write error trace and throw
      writeTrace({
        meta, model,
        inputTokens: 0, outputTokens: 0,
        latencyMs,
        status: 'error',
        errorMessage: String(err.message).slice(0, 500),
      });
      throw err;
    }
  }

  // Exhausted retries
  writeTrace({
    meta, model,
    inputTokens: 0, outputTokens: 0,
    latencyMs: 0,
    status: 'error',
    errorMessage: String(lastErr?.message ?? 'rate limit retry exhausted').slice(0, 500),
  });
  throw lastErr;
}

// ── JSON helper ──────────────────────────────────────────────────────────────

export async function callClaudeJSON(opts) {
  const { text } = await callClaude(opts);

  try {
    return parseJSON(text);
  } catch {
    const correctionMessages = [
      ...opts.messages,
      { role: 'assistant', content: text },
      {
        role: 'user',
        content: 'Your response contained invalid JSON. Please respond with ONLY the JSON object, no prose, no markdown fences.',
      },
    ];
    const retry = await callClaude({ ...opts, messages: correctionMessages });
    return parseJSON(retry.text);
  }
}

function parseJSON(text) {
  try { return JSON.parse(text.trim()); } catch {}
  const stripped = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  try { return JSON.parse(stripped); } catch {}
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch {} }
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) { try { return JSON.parse(arrMatch[0]); } catch {} }
  console.error('[Claude] JSON extraction failed. Response snippet:\n', text.slice(0, 500));
  throw new Error('Could not extract valid JSON from Claude response');
}

// ── Streaming ────────────────────────────────────────────────────────────────

export async function* streamClaude({
  model = MODELS.FAST,
  system,
  messages,
  maxTokens = 2048,
  meta = {},
}) {
  const start = performance.now();
  const stream = await client.messages.stream({
    model,
    max_tokens: maxTokens,
    system,
    messages,
  });

  let inputTokens = 0, outputTokens = 0;

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
      yield chunk.delta.text;
    }
    if (chunk.type === 'message_start') {
      inputTokens = chunk.message?.usage?.input_tokens ?? 0;
    }
    if (chunk.type === 'message_delta') {
      outputTokens = chunk.usage?.output_tokens ?? 0;
    }
  }

  writeTrace({
    meta, model, inputTokens, outputTokens,
    latencyMs: Math.round(performance.now() - start),
    status: 'success',
  });
}
