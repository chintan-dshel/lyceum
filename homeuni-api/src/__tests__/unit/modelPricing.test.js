import { describe, it, expect } from 'vitest';
import { computeCost } from '../../lib/modelPricing.js';

describe('computeCost — known models', () => {
  it('Haiku: $0.80 input / $4.00 output per MTok', () => {
    const { inputPricePerMtok, outputPricePerMtok, costUsd } =
      computeCost('claude-haiku-4-5-20251001', 1_000_000, 1_000_000);
    expect(inputPricePerMtok).toBe(0.80);
    expect(outputPricePerMtok).toBe(4.00);
    expect(costUsd).toBeCloseTo(4.80, 5);
  });

  it('Sonnet: $3.00 input / $15.00 output per MTok', () => {
    const { inputPricePerMtok, outputPricePerMtok, costUsd } =
      computeCost('claude-sonnet-4-6', 1_000_000, 1_000_000);
    expect(inputPricePerMtok).toBe(3.00);
    expect(outputPricePerMtok).toBe(15.00);
    expect(costUsd).toBeCloseTo(18.00, 5);
  });

  it('Opus 4.6: $15.00 input / $75.00 output per MTok', () => {
    const { inputPricePerMtok, outputPricePerMtok, costUsd } =
      computeCost('claude-opus-4-6', 1_000_000, 1_000_000);
    expect(inputPricePerMtok).toBe(15.00);
    expect(outputPricePerMtok).toBe(75.00);
    expect(costUsd).toBeCloseTo(90.00, 5);
  });

  it('Opus 4.7: same rates as 4.6', () => {
    const a = computeCost('claude-opus-4-6', 500_000, 250_000);
    const b = computeCost('claude-opus-4-7', 500_000, 250_000);
    expect(a.costUsd).toBeCloseTo(b.costUsd, 5);
  });
});

describe('computeCost — unknown model fallback', () => {
  it('unknown model falls back to Sonnet rates', () => {
    const { inputPricePerMtok, outputPricePerMtok } =
      computeCost('unknown-model-xyz', 0, 0);
    expect(inputPricePerMtok).toBe(3.00);
    expect(outputPricePerMtok).toBe(15.00);
  });
});

describe('computeCost — math', () => {
  it('zero tokens → zero cost', () => {
    const { costUsd } = computeCost('claude-sonnet-4-6', 0, 0);
    expect(costUsd).toBe(0);
  });

  it('only input tokens', () => {
    const { costUsd } = computeCost('claude-sonnet-4-6', 1_000_000, 0);
    expect(costUsd).toBeCloseTo(3.00, 5);
  });

  it('only output tokens', () => {
    const { costUsd } = computeCost('claude-sonnet-4-6', 0, 1_000_000);
    expect(costUsd).toBeCloseTo(15.00, 5);
  });

  it('fractional tokens scale correctly', () => {
    const { costUsd } = computeCost('claude-haiku-4-5-20251001', 100_000, 50_000);
    expect(costUsd).toBeCloseTo(0.08 + 0.20, 5);
  });

  it('costUsd = inputPricePerMtok * inputMtok + outputPricePerMtok * outputMtok', () => {
    const inputTokens = 4_000;
    const outputTokens = 8_000;
    const { inputPricePerMtok, outputPricePerMtok, costUsd } =
      computeCost('claude-sonnet-4-6', inputTokens, outputTokens);
    const expected =
      (inputTokens / 1_000_000) * inputPricePerMtok +
      (outputTokens / 1_000_000) * outputPricePerMtok;
    expect(costUsd).toBeCloseTo(expected, 8);
  });
});
