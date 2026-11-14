import { describe, expect, it } from 'vitest';
import { count, countExact, decimal, list, multiplier, percent, tokens, usd, usdExact } from './format';

const NON_FINITE = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

describe('usd', () => {
  it.each([
    [0, '$0'],
    [689, '$689'],
    [689.4, '$689'],
    [12.345, '$12.3'],
    [999.4, '$999'],
    [999.5, '$1k'],
    [1000, '$1k'],
    [18_100, '$18.1k'],
    [18_000, '$18k'],
    [12_265, '$12.3k'],
    [298_782.41, '$299k'],
    [999_400, '$999k'],
    [999_500, '$1M'],
    [2_160_290, '$2.16M'],
    [2_100_000, '$2.1M'],
    [3_091_705, '$3.09M'],
    [4.2e9, '$4.2B'],
    [0.5, '$0.50'],
    [0.054, '$0.05'],
    [0.999, '$1'],
    [999_499_999, '$999M'],
    [999.5e6, '$1B'],
    [0.004, '<$0.01'],
    [-298_782, '−$299k'],
    [-0.004, '>−$0.01'],
  ])('%d → %s', (n, want) => {
    expect(usd(n)).toBe(want);
  });

  it.each(NON_FINITE)('shows %d as a dash', (n) => {
    expect(usd(n)).toBe('—');
  });
});

describe('usdExact', () => {
  it.each([
    [0, '$0'],
    [298_782.41, '$298,782'],
    [2_160_290, '$2,160,290'],
    [999.5, '$999.50'],
    [689.4, '$689.40'],
    [0.004, '$0.00'],
    [-12_265.2, '−$12,265'],
  ])('%d → %s', (n, want) => {
    expect(usdExact(n)).toBe(want);
  });

  it.each(NON_FINITE)('shows %d as a dash', (n) => {
    expect(usdExact(n)).toBe('—');
  });
});

describe('tokens', () => {
  it.each([
    [0, '0'],
    [689, '689'],
    [999.5, '1k'],
    [24_400_000, '24.4M'],
    [743_900_000, '744M'],
    [999_500, '1M'],
    [929e9, '929B'],
    [999.5e9, '1T'],
    [1.06e12, '1.06T'],
    [0.35, '0.35'],
    [0.004_2, '<0.01'],
    [-24_400_000, '−24.4M'],
  ])('%d → %s', (n, want) => {
    expect(tokens(n)).toBe(want);
  });

  it.each(NON_FINITE)('shows %d as a dash', (n) => {
    expect(tokens(n)).toBe('—');
  });
});

describe('count', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [999.5, '1k'],
    [2_070_979, '2.07M'],
    [1_053_238, '1.05M'],
    [230_038, '230k'],
    [-5_000, '−5k'],
  ])('%d → %s', (n, want) => {
    expect(count(n)).toBe(want);
  });

  it.each(NON_FINITE)('shows %d as a dash', (n) => {
    expect(count(n)).toBe('—');
  });
});

describe('countExact', () => {
  it.each([
    [0, '0'],
    [2_070_979, '2,070,979'],
    [2_070_979.4, '2,070,979'],
    [999.5, '1,000'],
    [-1_053_238, '−1,053,238'],
  ])('%d → %s', (n, want) => {
    expect(countExact(n)).toBe(want);
  });

  it.each(NON_FINITE)('shows %d as a dash', (n) => {
    expect(countExact(n)).toBe('—');
  });
});

describe('percent', () => {
  it.each([
    [0, '0%'],
    [1, '100%'],
    [0.533, '53.3%'],
    [0.979_4, '97.9%'],
    [0.0728, '7.28%'],
    [0.999_95, '100%'],
    [0.000_05, '<0.01%'],
    [-0.25, '−25%'],
  ])('%d → %s', (x, want) => {
    expect(percent(x)).toBe(want);
  });

  it.each(NON_FINITE)('shows %d as a dash', (x) => {
    expect(percent(x)).toBe('—');
  });
});

describe('multiplier', () => {
  it.each([
    [0, '0×'],
    [1, '1×'],
    [1.25, '1.25×'],
    [1.4375, '1.44×'],
    [434.6, '435×'],
    [7_210, '7.21k×'],
    [0.004, '<0.01×'],
  ])('%d → %s', (x, want) => {
    expect(multiplier(x)).toBe(want);
  });

  it.each(NON_FINITE)('shows %d as a dash', (x) => {
    expect(multiplier(x)).toBe('—');
  });
});

describe('decimal', () => {
  it.each([
    [0, '0'],
    [1, '1'],
    [1.15, '1.15'],
    [10.939, '10.939'],
    [11.450000000000001, '11.45'],
    [1248.91, '1,248.91'],
    [0.007776, '0.007776'],
    [0.0728, '0.0728'],
    [39.61, '39.61'],
    [-0.5, '−0.5'],
  ])('%d → %s', (n, want) => {
    expect(decimal(n)).toBe(want);
  });

  it.each(NON_FINITE)('shows %d as a dash', (n) => {
    expect(decimal(n)).toBe('—');
  });
});

describe('list', () => {
  it.each([
    [[], ''],
    [['A'], 'A'],
    [['A', 'B'], 'A and B'],
    [['A', 'B', 'C'], 'A, B, and C'],
  ])('%j → %j', (items, want) => {
    expect(list(items)).toBe(want);
  });
});

describe('no output ever spells a non-number', () => {
  const all = [usd, usdExact, tokens, count, countExact, percent, multiplier, decimal];
  const inputs = [...NON_FINITE, 0, -0, 1e-300, -1e-300, 1e300, Number.MAX_VALUE, Number.MIN_VALUE];
  it.each(all.map((f) => [f.name, f] as const))('%s', (_name, f) => {
    for (const n of inputs) expect(f(n)).not.toMatch(/NaN|Infinity|e[+-]/);
  });
});
