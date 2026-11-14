import { describe, expect, it } from 'vitest';
import { labelRows } from './placement';

const label = (id: string, center: number, width = 40) => ({ id, center, width });

describe('labelRows', () => {
  it('keeps labels that do not touch on the bottom row', () => {
    const rows = labelRows([label('low', 50), label('central', 150), label('high', 250)]);
    expect([...rows.entries()]).toEqual([
      ['low', 0],
      ['central', 0],
      ['high', 0],
    ]);
  });

  it('raises a label only over the neighbour it would overlap', () => {
    // A reader's own value far to the right squeezes the three outcomes to the left.
    const rows = labelRows([label('low', 20), label('central', 50), label('high', 110), label('yours', 600)]);
    expect(rows.get('low')).toBe(0);
    expect(rows.get('central')).toBe(1);
    expect(rows.get('high')).toBe(0);
    expect(rows.get('yours')).toBe(0);
  });

  it('stacks two nearly equal figures, and a third over both', () => {
    const rows = labelRows([label('a', 100), label('b', 101), label('c', 102)]);
    expect([rows.get('a'), rows.get('b'), rows.get('c')]).toEqual([0, 1, 2]);
  });

  it('places by position, whatever the input order, and counts the gap', () => {
    const rows = labelRows([label('right', 144), label('left', 100)], 4);
    expect(rows.get('left')).toBe(0);
    // 100 + 20 + 4 > 144 − 20: they would sit closer than the gap.
    expect(rows.get('right')).toBe(1);
    expect(labelRows([label('right', 145), label('left', 100)], 4).get('right')).toBe(0);
  });

  it('puts everything on one row before widths are known', () => {
    const rows = labelRows([label('a', 0, 0), label('b', 0, 0)]);
    expect([rows.get('a'), rows.get('b')]).toEqual([0, 0]);
  });
});
