// The per-feature formulas and the price sheet, as docs/cost-model.md
// "Formulas" and "Dollars" write them.

import type { Difficulty, Kind, LineCounts, Model, Prices, Target } from '../report';
import { CATEGORIES, type Category, type Factors, type Params, type Sloc, type Tokens } from './types';

/** The counter's name for binary files, which carry no tokens. */
const BINARY = 'binary';

export function zeroTokens(): Tokens {
  return { uncached: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
}

export function zeroSloc(): Sloc {
  return { files: 0, code: 0, comment: 0, blank: 0, bytes: 0 };
}

export function sumTokens(t: Tokens): number {
  return CATEGORIES.reduce((s, cat) => s + t[cat], 0);
}

/** bpt[lang], falling back to bpt.default. */
export function bytesPerToken(params: Params, lang: string): number {
  const bpt = params.bytesPerToken;
  const value = Object.hasOwn(bpt, lang) ? bpt[lang] : bpt['default'];
  if (value === undefined) throw new Error('cost model: bytesPerToken has no default');
  return value;
}

/** S_f = Σ_lang bytes ÷ bpt[lang], skipping binary. */
export function sourceTokens(langs: Record<string, LineCounts>, params: Params): number {
  let s = 0;
  for (const [lang, counts] of Object.entries(langs)) {
    if (lang !== BINARY) s += counts.bytes / bytesPerToken(params, lang);
  }
  return s;
}

/** Line counts over every language, binary included. */
export function slocOf(langs: Record<string, LineCounts>): Sloc {
  const sloc = zeroSloc();
  for (const counts of Object.values(langs)) addSloc(sloc, counts);
  return sloc;
}

export function addSloc(into: Sloc, from: Sloc): void {
  into.files += from.files;
  into.code += from.code;
  into.comment += from.comment;
  into.blank += from.blank;
  into.bytes += from.bytes;
}

/** F[t]: go 1, rust rust_factor, wasm rust_factor × wasm_overhead. */
export function targetFactor(params: Params, target: Target): number {
  switch (target) {
    case 'go':
      return 1;
    case 'rust':
      return params.rustFactor;
    case 'wasm':
      return params.rustFactor * params.wasmOverhead;
  }
}

/** class(f) = config if kind = config, else f.difficulty. */
export function difficultyClass(kind: Kind, difficulty: Difficulty): Difficulty {
  return kind === 'config' ? 'config' : difficulty;
}

/** T_new = max(0, T − R). */
export function newTestRatio(params: Params, existing: number): number {
  return Math.max(0, params.testRatio - existing);
}

/** The four token categories for a feature of S source tokens under these factors. */
export function featureTokens(S: number, f: Factors, params: Params): Tokens {
  const W = S * f.difficulty * f.target;
  const code = W * f.expansion;
  // newTestRatio is 0 for test and config, which leaves out_f = code_f × H × M × C.
  const out = code * (1 + f.newTestRatio) * f.overhead * f.modelEfficiency * f.cleanBreak;
  const tokens: Tokens = {
    uncached: out * params.uncachedPerOutput + W * params.sourceReadPasses,
    cacheWrite: out * params.cacheWritePerOutput,
    cacheRead: out * params.cacheReadPerOutput,
    output: out,
  };
  if (params.toggles.includeAdjacent) {
    for (const cat of CATEGORIES) tokens[cat] *= 1 + params.adjacentUplift[cat];
  }
  return tokens;
}

/** Dollars per token category for a model's price sheet (USD per million tokens). */
export function usdByCategory(model: Model, params: Params, tokens: Tokens): Tokens {
  const prices = model.usd_per_mtok;
  const long = model.long_context;
  // blend(x, cat) = (1 − s) × P.x + s × P.long_context.x, s = σ[cat] only with long-context prices.
  const blend = (x: keyof Prices, cat: Category): number => {
    if (!long) return prices[x];
    const s = params.longContextShare[cat];
    return (1 - s) * prices[x] + s * long[x];
  };
  const lambda = params.longCacheWriteShare;
  const cacheWritePrice = (1 - lambda) * blend('cache_write_short', 'cacheWrite') + lambda * blend('cache_write_long', 'cacheWrite');
  return {
    uncached: (tokens.uncached * blend('input', 'uncached')) / 1e6,
    cacheWrite: (tokens.cacheWrite * cacheWritePrice) / 1e6,
    cacheRead: (tokens.cacheRead * blend('cache_read', 'cacheRead')) / 1e6,
    output: (tokens.output * blend('output', 'output')) / 1e6,
  };
}
