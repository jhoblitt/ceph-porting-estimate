import { describe, expect, it } from 'vitest';
import { CATEGORY_META, categoryParts, shares, totalTokens } from './categories';

describe('categories', () => {
  it('lists the four token categories in the model order, each with its own series slot', () => {
    expect(CATEGORY_META.map((c) => c.key)).toEqual(['uncached', 'cacheWrite', 'cacheRead', 'output']);
    expect(CATEGORY_META.map((c) => c.series)).toEqual([1, 2, 3, 4]);
  });

  it('sums and splits a token set', () => {
    const t = { uncached: 1, cacheWrite: 2, cacheRead: 6, output: 1 };
    expect(totalTokens(t)).toBe(10);
    expect(shares(t)).toEqual({ uncached: 0.1, cacheWrite: 0.2, cacheRead: 0.6, output: 0.1 });
  });

  it('splits an empty set into zeros, not NaN', () => {
    expect(shares({ uncached: 0, cacheWrite: 0, cacheRead: 0, output: 0 })).toEqual({
      uncached: 0,
      cacheWrite: 0,
      cacheRead: 0,
      output: 0,
    });
  });
});

describe('categoryParts', () => {
  it('builds one bar part per category, in order, with its weight, text and title', () => {
    const parts = categoryParts({ uncached: 0.1, cacheWrite: 0.2, cacheRead: 0.6, output: 0.1 }, (c) => ({
      text: c.key,
      title: `${c.label}!`,
    }));
    expect(parts.map((p) => [p.key, p.series, p.share, p.text, p.title])).toEqual([
      ['uncached', 1, 0.1, 'uncached', 'Uncached input!'],
      ['cacheWrite', 2, 0.2, 'cacheWrite', 'Cache writes!'],
      ['cacheRead', 3, 0.6, 'cacheRead', 'Cache reads!'],
      ['output', 4, 0.1, 'output', 'Output!'],
    ]);
  });
});
