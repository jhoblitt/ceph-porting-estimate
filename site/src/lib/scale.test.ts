import { describe, expect, it } from 'vitest';
import { linearTicks, logScale, positiveRange, sequentialStep } from './scale';

describe('logScale', () => {
  it('spans whole decades around the values', () => {
    const s = logScale([689, 298_782, 510_191]);
    expect(s.min).toBe(100);
    expect(s.max).toBe(1_000_000);
    expect(s.ticks).toEqual([100, 1_000, 10_000, 100_000, 1_000_000]);
  });

  it('places values by their logarithm', () => {
    const s = logScale([100, 10_000]);
    expect(s.position(100)).toBe(0);
    expect(s.position(1_000)).toBeCloseTo(0.5, 12);
    expect(s.position(10_000)).toBe(1);
  });

  it('keeps a value on a decade inside the domain', () => {
    expect(logScale([1_000, 1_000])).toMatchObject({ min: 100, max: 10_000 });
  });

  it('pins zero, negative and non-finite values to the left edge', () => {
    const s = logScale([0, 100, 1_000]);
    expect(s.min).toBe(100);
    for (const v of [0, -5, Number.NaN]) expect(s.position(v)).toBe(0);
  });

  it('falls back to one decade when nothing is positive', () => {
    expect(logScale([0, 0])).toMatchObject({ min: 1, max: 10, ticks: [1, 10] });
  });
});

describe('sequentialStep', () => {
  it('maps the low end to step 1 and the high end to the last step', () => {
    expect(sequentialStep(298_782, 298_782, 3_091_705, 7)).toBe(1);
    expect(sequentialStep(3_091_705, 298_782, 3_091_705, 7)).toBe(7);
  });

  it('steps by logarithm, so a value ten times another is far from it', () => {
    // 1k on a 100 → 10k domain sits halfway.
    expect(sequentialStep(1_000, 100, 10_000, 7)).toBe(4);
  });

  it('gives the middle step when every value is the same', () => {
    expect(sequentialStep(5, 5, 5, 7)).toBe(4);
  });

  it('gives zero, negative and non-finite values no step, so they cannot pass for the cheapest', () => {
    for (const v of [0, -1, Number.NaN]) expect(sequentialStep(v, 1, 100, 7)).toBe(0);
  });
});

describe('positiveRange', () => {
  it('spans the positive values only, so a zero cell does not flatten the others', () => {
    expect(positiveRange([0, 298_782, 3_091_705, 412_000])).toEqual({ min: 298_782, max: 3_091_705 });
  });

  it('is null when nothing is positive', () => {
    expect(positiveRange([0, Number.NaN, -3])).toBeNull();
  });

  it('keeps the shading of the other cells when one is zero', () => {
    const values = [0, 100, 10_000];
    const r = positiveRange(values)!;
    expect(values.map((v) => sequentialStep(v, r.min, r.max, 7))).toEqual([0, 1, 7]);
  });
});

describe('logScale off-scale values', () => {
  it('says which values it cannot place', () => {
    const s = logScale([0, 683, 503_644]);
    expect(s.onScale(683)).toBe(true);
    for (const v of [0, -1, Number.NaN]) expect(s.onScale(v)).toBe(false);
  });
});

describe('linearTicks', () => {
  it.each([
    [2_132_207, [0, 500_000, 1_000_000, 1_500_000, 2_000_000]],
    [3_051_384, [0, 1_000_000, 2_000_000, 3_000_000]],
    [503_644, [0, 100_000, 200_000, 300_000, 400_000, 500_000]],
    [1, [0, 0.2, 0.4, 0.6, 0.8, 1]],
  ])('puts round ticks from 0 up to %d', (max, want) => {
    const ticks = linearTicks(max);
    expect(ticks).toHaveLength(want.length);
    ticks.forEach((t, i) => expect(t).toBeCloseTo(want[i]!, 9));
  });

  it('has only 0 for an empty or broken scale', () => {
    for (const max of [0, -5, Number.NaN]) expect(linearTicks(max)).toEqual([0]);
  });
});
