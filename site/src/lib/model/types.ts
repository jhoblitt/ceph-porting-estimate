// The cost model's seam types. Symbols in comments are docs/cost-model.md's.

import type { Difficulty, Kind, Scope } from '../report';

export type { Target } from '../report';

export type Tokens = { uncached: number; cacheWrite: number; cacheRead: number; output: number };
export type Category = keyof Tokens;
export const CATEGORIES: readonly Category[] = ['uncached', 'cacheWrite', 'cacheRead', 'output'];

/** Fully resolved numbers: a camelCase mirror of assumptions.params, bytes_per_token and toggles. */
export type Params = {
  /** bpt[lang]; includes `default`. */
  bytesPerToken: Record<string, number>;
  /** E */
  expansion: number;
  /** T */
  testRatio: number;
  /** H */
  overhead: number;
  /** u */
  uncachedPerOutput: number;
  /** w */
  cacheWritePerOutput: number;
  /** r */
  cacheReadPerOutput: number;
  /** p */
  sourceReadPasses: number;
  /** D[class] */
  difficulty: Record<Difficulty, number>;
  rustFactor: number;
  wasmOverhead: number;
  /** C, applied when toggles.cleanBreak is on */
  cleanBreakDiscount: number;
  /** λ */
  longCacheWriteShare: number;
  /** σ[cat] */
  longContextShare: Tokens;
  /** M[model] */
  modelEfficiency: Record<string, number>;
  /** B */
  slocEquivalentBytesPerLine: number;
  /** A[cat], applied when toggles.includeAdjacent is on */
  adjacentUplift: Tokens;
  toggles: { includeAdjacent: boolean; cleanBreak: boolean };
};

/** One adjustable parameter, for the UI. */
export type ParamInfo = {
  /** Dotted snake_case path under assumptions.params, as resolveParams accepts it. */
  path: string;
  label: string;
  baseline: number;
  /** The value after the scenario's overrides and scale, before any user override. */
  scenario: number;
  measured: boolean;
  source: string;
  reason: string;
};

export type Sloc = { files: number; code: number; comment: number; blank: number; bytes: number };

export type Cost = {
  /** S, summed */
  sourceTokens: number;
  tokens: Tokens;
  usd: number;
  usdByCategory: Tokens;
};

export type Factors = {
  /** D[class(f)] */
  difficulty: number;
  /** F[target] */
  target: number;
  /** E */
  expansion: number;
  /** T_new for a product feature, 0 for test and config */
  newTestRatio: number;
  /** H */
  overhead: number;
  /** M[model] */
  modelEfficiency: number;
  /** C when clean_break is on, else 1 */
  cleanBreak: number;
};

export type FeatureEstimate = Cost & {
  kind: 'feature';
  id: string;
  name: string;
  scope: Scope;
  featureKind: Kind;
  difficulty: Difficulty;
  sloc: Sloc;
  /**
   * The multipliers the formulas use for this feature. A not-ported feature
   * reports them too, but its tokens and dollars are zero.
   */
  factors: Factors;
};

export type GroupEstimate = {
  kind: 'component' | 'root';
  id: string;
  name: string;
  /**
   * Every descendant, whatever its scope. Under the root this includes the
   * `dependencies` component's dependency-equivalent lines (code =
   * sloc_equivalent, bytes = sloc_equivalent × B), which are not Ceph
   * source: use cephSloc for the size of Ceph itself.
   */
  sloc: Sloc;
  /** Descendants with scope headline; under the root, dependency work and its equivalent lines too. */
  headline: Cost & { sloc: Sloc };
  /** Descendants with scope shown. */
  shown: Cost & { sloc: Sloc };
  notPorted: { sloc: Sloc };
  children: (GroupEstimate | FeatureEstimate)[];
};

/** A root's line counts over the report's own components, without dependency-equivalent lines. */
export type CephSloc = { sloc: Sloc; headline: Sloc; shown: Sloc; notPorted: Sloc };
