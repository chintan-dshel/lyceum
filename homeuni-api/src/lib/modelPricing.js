/**
 * Model pricing — snapshot at write time.
 * Store rates alongside the computed cost_usd so historical records
 * remain accurate if Anthropic changes pricing.
 *
 * Prices in USD per million tokens (as of 2026-04).
 * Update this file when Anthropic updates pricing; old traces are unaffected.
 */

const PRICING = {
  // Haiku 4.5
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },

  // Sonnet 4.6
  'claude-sonnet-4-6': { input: 3.00, output: 15.00 },

  // Opus 4.6 / 4.7
  'claude-opus-4-6':  { input: 15.00, output: 75.00 },
  'claude-opus-4-7':  { input: 15.00, output: 75.00 },
};

const FALLBACK = { input: 3.00, output: 15.00 }; // default to Sonnet rates

/**
 * Returns { inputPricePerMtok, outputPricePerMtok, costUsd } for a call.
 */
export function computeCost(model, inputTokens, outputTokens) {
  const rates = PRICING[model] ?? FALLBACK;
  const costUsd =
    (inputTokens  / 1_000_000) * rates.input +
    (outputTokens / 1_000_000) * rates.output;

  return {
    inputPricePerMtok:  rates.input,
    outputPricePerMtok: rates.output,
    costUsd,
  };
}
