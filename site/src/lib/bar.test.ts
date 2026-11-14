import { describe, expect, it } from 'vitest';
import { segmentGeometry } from './bar';

const parts = (...shares: number[]) => shares.map((share, i) => ({ key: `p${i}`, share }));

describe('segmentGeometry', () => {
  it('lays the segments end to end, summing to the bar', () => {
    const segs = segmentGeometry(parts(0.62, 0.33, 0.05), 0.4);
    expect(segs.map((s) => s.part.key)).toEqual(['p0', 'p1', 'p2']);
    expect(segs[0]!.start).toBe(0);
    for (let i = 1; i < segs.length; i++) expect(segs[i]!.start).toBeCloseTo(segs[i - 1]!.start + segs[i - 1]!.width, 15);
    expect(segs.reduce((s, x) => s + x.width, 0)).toBeCloseTo(0.4, 15);
  });

  it('never runs past the bar total', () => {
    for (const length of [1, 0.4, 0.1, 0.0123, 1e-6]) {
      const segs = segmentGeometry(parts(0.1, 0.2, 0.3, 0.4), length);
      const last = segs.at(-1)!;
      expect(last.start + last.width).toBeLessThanOrEqual(length);
      expect(last.start + last.width).toBe(length);
    }
  });

  it('gives each segment exactly its share, so a tiny category does not distort the others', () => {
    const segs = segmentGeometry(parts(0.62, 0.33, 0.0001, 0.0499), 0.25);
    const total = 0.62 + 0.33 + 0.0001 + 0.0499;
    expect(segs[0]!.width).toBeCloseTo((0.62 / total) * 0.25, 15);
    expect(segs[1]!.width).toBeCloseTo((0.33 / total) * 0.25, 15);
    expect(segs[2]!.width).toBeCloseTo((0.0001 / total) * 0.25, 15);
    expect(segs[3]!.width).toBeCloseTo((0.0499 / total) * 0.25, 15);
  });

  it('draws nothing for a part at zero or not a number, and keeps the rest in proportion', () => {
    const segs = segmentGeometry(parts(0.5, 0, Number.NaN, -1, 0.5), 1);
    expect(segs.map((s) => [s.part.key, s.start, s.width])).toEqual([
      ['p0', 0, 0.5],
      ['p4', 0.5, 0.5],
    ]);
  });

  it('draws nothing for an empty bar', () => {
    expect(segmentGeometry(parts(0, 0), 1)).toEqual([]);
    expect(segmentGeometry(parts(0.5, 0.5), 0)).toEqual([]);
    expect(segmentGeometry(parts(0.5, 0.5), Number.NaN)).toEqual([]);
  });

  it('holds the bar to the full width', () => {
    const segs = segmentGeometry(parts(1), 1.5);
    expect(segs[0]!.width).toBe(1);
  });
});
