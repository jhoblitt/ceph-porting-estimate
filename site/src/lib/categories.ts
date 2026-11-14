// The four token categories as the views show them. `series` is the slot in
// the categorical palette (--series-N in tokens.css); the order is the model's
// and was validated as adjacent pairs, so keep the two together.

import { CATEGORIES, type Category, type Tokens, sumTokens } from './model';

export interface CategoryMeta {
  key: Category;
  label: string;
  /** One line for a reader who has not met prompt caching. */
  description: string;
  series: number;
}

const TEXT: Record<Category, Omit<CategoryMeta, 'key' | 'series'>> = {
  uncached: { label: 'Uncached input', description: 'Input read at the full price, without a cache.' },
  cacheWrite: { label: 'Cache writes', description: 'Context stored in the prompt cache for later calls.' },
  cacheRead: { label: 'Cache reads', description: 'Context the model re-reads from the cache on every call.' },
  output: { label: 'Output', description: 'Tokens the model writes: code, tests, reviews and rework.' },
};

export const CATEGORY_META: readonly CategoryMeta[] = CATEGORIES.map((key, i) => ({ key, ...TEXT[key], series: i + 1 }));

/** One part of a segmented bar. */
export interface Part {
  key: string;
  label: string;
  /** Slot in the categorical palette, --series-N. */
  series: number;
  /** The part's weight within the drawn bar; parts are sized in proportion to it. */
  share: number;
  /** Printed inside a tall bar's part when it fits. */
  text: string;
  /** Hover text and the part's entry in the bar's accessible name. */
  title: string;
}

/** A bar part per category, in model order, weighted by `weights`. */
export function categoryParts(weights: Tokens, describe: (c: CategoryMeta) => { text: string; title: string }): Part[] {
  return CATEGORY_META.map((c) => ({ key: c.key, label: c.label, series: c.series, share: weights[c.key], ...describe(c) }));
}

export function totalTokens(t: Tokens): number {
  return sumTokens(t);
}

/** Each category's share of the total; all zero for an empty set. */
export function shares(t: Tokens): Tokens {
  const total = sumTokens(t);
  const share = (v: number) => (total > 0 ? v / total : 0);
  return { uncached: share(t.uncached), cacheWrite: share(t.cacheWrite), cacheRead: share(t.cacheRead), output: share(t.output) };
}
