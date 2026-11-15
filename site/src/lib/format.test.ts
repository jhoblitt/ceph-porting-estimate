import { describe, expect, it } from 'vitest';
import {
  PERCENT_FLOOR,
  belowPercentFloor,
  count,
  countExact,
  decimal,
  paramValue,
  list,
  magnitude,
  multiplier,
  percent,
  cardinal,
  rate,
  signedPercent,
  times,
  tokens,
  usd,
  usdExact,
} from './format';

const NON_FINITE = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

describe('usd', () => {
  it.each([
    [0, '$0'],
    [689, '$690'],
    [683.4, '$680'],
    [12.345, '$12'],
    [1.234, '$1.2'],
    [94.9, '$95'],
    [99.4, '$99'],
    [99.5, '$100'],
    [949, '$950'],
    [994, '$990'],
    [995, '$1k'],
    [1000, '$1k'],
    [9_940, '$9.9k'],
    [9_950, '$10k'],
    [18_100, '$18k'],
    [12_265, '$12k'],
    [99_400, '$99k'],
    [99_500, '$100k'],
    [272_724, '$270k'],
    [298_782.41, '$300k'],
    [994_000, '$990k'],
    [995_000, '$1M'],
    [2_160_290, '$2.2M'],
    [2_100_000, '$2.1M'],
    [3_091_705, '$3.1M'],
    [4.2e9, '$4.2B'],
    [0.5, '$0.50'],
    [0.054, '$0.05'],
    [0.999, '$1'],
    [994e6, '$990M'],
    [995e6, '$1B'],
    [0.004, '<$0.01'],
    [-298_782, '−$300k'],
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
    [689, '690'],
    [995, '1k'],
    [24_400_000, '24M'],
    [743_900_000, '740M'],
    [995_000, '1M'],
    [929e9, '930B'],
    [995e9, '1T'],
    [1.06e12, '1.1T'],
    [0.35, '0.35'],
    [0.004_2, '<0.01'],
    [-24_400_000, '−24M'],
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
    [0.533, '53%'],
    [0.979_4, '98%'],
    [0.0728, '7.3%'],
    [0.0995, '10%'],
    [0.995, '100%'],
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
    [1.2133, '1.2133'],
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

describe('paramValue', () => {
  it.each([
    [0, '0'],
    [1, '1'],
    [1.15, '1.15'],
    [1.2133, '1.21'],
    [10.939, '10.9'],
    [1248.91, '1,250'],
    [0.007776, '0.00778'],
    [0.0728, '0.0728'],
    [39.61, '39.6'],
    [0.8333, '0.833'],
    [-0.5, '−0.5'],
  ])('%d → %s', (n, want) => {
    expect(paramValue(n)).toBe(want);
  });

  it.each(NON_FINITE)('shows %d as a dash', (n) => {
    expect(paramValue(n)).toBe('—');
  });
});

describe('times', () => {
  it.each([
    [16.3, '16'],
    [15.5, '16'],
    [9.94, '9.9'],
    [9.96, '10'],
    [1.53, '1.5'],
    [160.4, '160'],
    [1234, '1,200'],
  ])('%d → %s', (x, want) => {
    expect(times(x)).toBe(want);
  });

  it.each(NON_FINITE)('shows %d as a dash', (x) => {
    expect(times(x)).toBe('—');
  });
});

describe('magnitude', () => {
  it.each([
    [0.8, 'less than a dollar'],
    [1.2, 'about a dollar'],
    [6, 'a few dollars'],
    [45, 'tens of dollars'],
    [683, 'a few hundred dollars'],
    [1_200, 'about a thousand dollars'],
    [5_000, 'a few thousand dollars'],
    [12_000, 'about ten thousand dollars'],
    [45_000, 'tens of thousands of dollars'],
    [120_000, 'about a hundred thousand dollars'],
    [144_999, 'about a hundred thousand dollars'],
    [145_000, 'a few hundred thousand dollars'],
    [149_999, 'a few hundred thousand dollars'],
    [150_000, 'a few hundred thousand dollars'],
    [272_724, 'a few hundred thousand dollars'],
    [994_999, 'a few hundred thousand dollars'],
    [995_000, 'about a million dollars'],
    [999_999, 'about a million dollars'],
    [1_000_000, 'about a million dollars'],
    [2_130_000, 'a few million dollars'],
    [45e6, 'tens of millions of dollars'],
    [3e9, 'a few billion dollars'],
  ])('%d → %s', (n, want) => {
    expect(magnitude(n)).toBe(want);
  });

  it('reads the figure as usd prints it, so the words agree with the hero', () => {
    for (const n of [0.996, 9.96, 99.6, 995, 9_960, 99_600, 995_000, 9.96e6, 99.6e6, 995e6]) {
      expect(magnitude(n)).toBe(magnitude(Number(n.toPrecision(2))));
    }
    expect(usd(995_000)).toBe('$1M');
    expect(magnitude(995_000)).toBe('about a million dollars');
    expect(usd(149_999)).toBe('$150k');
    expect(magnitude(149_999)).toBe('a few hundred thousand dollars');
  });

  it('falls back to the figure where it has no words', () => {
    expect(magnitude(0)).toBe('$0');
    expect(magnitude(5e15)).toBe(usd(5e15));
    expect(magnitude(Number.NaN)).toBe('—');
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
  const all = [usd, usdExact, tokens, count, countExact, percent, multiplier, decimal, paramValue, times, magnitude];
  const inputs = [...NON_FINITE, 0, -0, 1e-300, -1e-300, 1e300, Number.MAX_VALUE, Number.MIN_VALUE];
  it.each(all.map((f) => [f.name, f] as const))('%s', (_name, f) => {
    for (const n of inputs) expect(f(n)).not.toMatch(/NaN|Infinity|e[+-]/);
  });
});

describe('signedPercent', () => {
  it('gives a change its sign on the shared percentage', () => {
    expect(signedPercent(0.0356)).toBe(`+${percent(0.0356)}`);
    expect(signedPercent(-0.3109)).toBe(`−${percent(0.3109)}`);
    expect(signedPercent(0.0356)).toBe('+3.6%');
  });

  it('prints no change as 0%, and a change below what percent prints as a bound', () => {
    expect(signedPercent(0)).toBe('0%');
    expect(signedPercent(0.00001)).toBe('<+0.01%');
    expect(signedPercent(-0.00001)).toBe('>−0.01%');
  });

  it.each(NON_FINITE)('prints a dash for %s', (n) => {
    expect(signedPercent(n)).toBe('—');
  });

  it('says a change is below its floor exactly when it prints one of the bound forms', () => {
    expect(percent(PERCENT_FLOOR)).toBe('0.01%');
    for (const x of [0, 1e-9, -1e-9, 0.00009, -0.00009, PERCENT_FLOOR, -PERCENT_FLOOR, 0.00011, 0.0029, -0.5]) {
      expect(belowPercentFloor(x), `${x}`).toBe(/^[<>]/.test(signedPercent(x)));
    }
  });
});

describe('cardinal', () => {
  it('writes a small count in words and a large one in figures', () => {
    expect([0, 2, 4, 10].map(cardinal)).toEqual(['zero', 'two', 'four', 'ten']);
    expect(cardinal(11)).toBe(countExact(11));
    expect(cardinal(Number.NaN)).toBe('—');
  });
});

describe('rate', () => {
  it('prints two decimals whatever the value, so paired rates line up', () => {
    expect([rate(3.1), rate(3.7142)]).toEqual(['3.10', '3.71']);
    expect(rate(2920.7)).toBe('2,920.70');
    expect(rate(Number.POSITIVE_INFINITY)).toBe('—');
  });
});
