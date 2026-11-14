import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/report.json';
import { explorerLevel, perLineRange } from './explorer';
import { estimate, resolveParams } from './model';
import { parseReport } from './report';
import {
  type CellBox,
  type Rect,
  type TreemapNode,
  labelFit,
  layoutTreemap,
  mapHeight,
  neighbour,
  shadeSteps,
  treemapInput,
} from './treemap';

const report = parseReport(fixture);
const root = estimate(report, 'go', 'opus-5-5', resolveParams(report, 'calibrated'));

const NO_GAPS = { headerHeight: 0, groupGap: 0, cellGap: 0, partGap: 0 };
const area = (r: Rect) => r.w * r.h;

function node(id: string, value: number): TreemapNode {
  return { id, kind: 'part', value };
}

describe('treemapInput', () => {
  it('nests groups, rows and parts at the root, sized by code lines or cost', () => {
    const level = explorerLevel(report, root, null, 'all');
    const byCode = treemapInput(level, 'code');
    expect(byCode.kind).toBe('root');
    expect(byCode.children!.map((g) => [g.kind, g.id])).toEqual(level.groups.map((g) => ['group', g.id]));
    const osd = byCode.children![0]!.children![0]!;
    expect(osd).toMatchObject({ id: 'osd', kind: 'row' });
    expect(osd.children!.map((p) => [p.id, p.scope, p.value])).toEqual(
      level.groups[0]!.rows[0]!.parts.map((p) => [`osd/${p.scope}`, p.scope, p.code]),
    );
    const byCost = treemapInput(level, 'cost');
    expect(byCost.children![0]!.children![0]!.children!.map((p) => p.value)).toEqual(
      level.groups[0]!.rows[0]!.parts.map((p) => p.usd),
    );
  });

  it('has rows straight under the root at a component', () => {
    const level = explorerLevel(report, root, 'rgw', 'headline');
    const input = treemapInput(level, 'code');
    expect(input.children!.map((r) => [r.kind, r.id])).toEqual([
      ['row', 'rgw-core'],
      ['row', 'rgw-multisite'],
      ['row', 'rgw-tests'],
    ]);
  });
});

describe('layoutTreemap', () => {
  it('gives each cell an area in proportion to its value', () => {
    const input: TreemapNode = {
      id: 'root',
      kind: 'root',
      children: [
        { id: 'a', kind: 'row', children: [node('a/headline', 60)] },
        { id: 'b', kind: 'row', children: [node('b/headline', 30)] },
        { id: 'c', kind: 'row', children: [node('c/headline', 10)] },
      ],
    };
    const layout = layoutTreemap(input, 400, 300, NO_GAPS);
    expect(layout.cells.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    const values = [60, 30, 10];
    for (const [i, c] of layout.cells.entries()) {
      const v = values[i] as number;
      expect(area(c.rect) / (400 * 300)).toBeCloseTo(v / 100, 9);
      expect(c.value).toBe(v);
    }
  });

  it('keeps proportions for real data, in either area mode', () => {
    for (const mode of ['code', 'cost'] as const) {
      const level = explorerLevel(report, root, null, 'all');
      const layout = layoutTreemap(treemapInput(level, mode), 800, 500, NO_GAPS);
      const total = layout.cells.reduce((s, c) => s + c.value, 0);
      for (const c of layout.cells) {
        expect(area(c.rect) / (800 * 500)).toBeCloseTo(c.value / total, 9);
        const partArea = c.parts.reduce((s, p) => s + area(p.rect), 0);
        expect(partArea).toBeCloseTo(area(c.rect), 6);
      }
    }
  });

  it('leaves out nodes of zero, negative or non-finite size, and what they empty', () => {
    const input: TreemapNode = {
      id: 'root',
      kind: 'root',
      children: [
        { id: 'g1', kind: 'group', children: [{ id: 'a', kind: 'row', children: [node('a/headline', 5), node('a/not-ported', 0)] }] },
        { id: 'g2', kind: 'group', children: [{ id: 'b', kind: 'row', children: [node('b/headline', 0)] }] },
        { id: 'g3', kind: 'group', children: [{ id: 'c', kind: 'row', children: [node('c/headline', Number.NaN)] }] },
        { id: 'g4', kind: 'group', children: [{ id: 'd', kind: 'row', children: [node('d/headline', -3)] }] },
      ],
    };
    const layout = layoutTreemap(input, 200, 100, NO_GAPS);
    expect(layout.groups.map((g) => g.id)).toEqual(['g1']);
    expect(layout.cells.map((c) => [c.id, c.parts.length])).toEqual([['a', 1]]);
    expect(layout.cells[0]!.rect).toEqual({ x: 0, y: 0, w: 200, h: 100 });
  });

  it('is empty when everything is zero or there is no room', () => {
    const zero: TreemapNode = { id: 'root', kind: 'root', children: [{ id: 'a', kind: 'row', children: [node('a/x', 0)] }] };
    expect(layoutTreemap(zero, 200, 100)).toEqual({ width: 200, height: 100, groups: [], cells: [] });
    const level = explorerLevel(report, root, null, 'headline');
    expect(layoutTreemap(treemapInput(level, 'code'), 0, 100).cells).toEqual([]);
  });

  it('gives a group a header when it is big enough, and keeps its cells inside it, below the header', () => {
    const level = explorerLevel(report, root, null, 'headline');
    const layout = layoutTreemap(treemapInput(level, 'code'), 900, 500, { headerHeight: 20, groupGap: 4, cellGap: 2, partGap: 1 });
    expect(layout.groups.map((g) => g.id).sort()).toEqual(level.groups.map((g) => g.id).sort());
    for (const g of layout.groups) {
      const cells = layout.cells.filter((c) => c.groupId === g.id);
      expect(cells.length).toBeGreaterThan(0);
      for (const c of cells) {
        expect(c.rect.x).toBeGreaterThanOrEqual(g.rect.x - 1e-9);
        expect(c.rect.x + c.rect.w).toBeLessThanOrEqual(g.rect.x + g.rect.w + 1e-9);
        expect(c.rect.y).toBeGreaterThanOrEqual(g.rect.y + (g.header ? 20 : 0) - 1e-9);
        expect(c.rect.y + c.rect.h).toBeLessThanOrEqual(g.rect.y + g.rect.h + 1e-9);
      }
    }
    expect(layout.groups.some((g) => g.header)).toBe(true);
    const tiny = layoutTreemap(treemapInput(level, 'code'), 40, 30, { headerHeight: 20, groupGap: 4, cellGap: 2, partGap: 1 });
    expect(tiny.groups.every((g) => !g.header)).toBe(true);
  });

  it('puts larger nodes first, and ties in id order', () => {
    const input: TreemapNode = {
      id: 'root',
      kind: 'root',
      children: [
        { id: 'b', kind: 'row', children: [node('b/x', 1)] },
        { id: 'c', kind: 'row', children: [node('c/x', 5)] },
        { id: 'a', kind: 'row', children: [node('a/x', 1)] },
      ],
    };
    expect(layoutTreemap(input, 100, 100, NO_GAPS).cells.map((c) => c.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('shadeSteps', () => {
  it('shades each part by scope on the level’s range, and leaves what costs nothing unshaded', () => {
    const level = explorerLevel(report, root, null, 'all');
    const osd = level.groups[0]!.rows[0]!;
    const range = { min: osd.parts[0]!.perLine! / 10, max: osd.parts[0]!.perLine! };
    expect(shadeSteps(osd, range, 7)).toEqual({ headline: 7, 'not-ported': 0 });
    const qa = level.groups[2]!.rows[0]!;
    const steps = shadeSteps(qa, perLineRange(level), 7);
    expect(Object.keys(steps).sort()).toEqual(['headline', 'shown']);
    expect(shadeSteps(qa, null, 7)).toEqual({ headline: 0, shown: 0 });
  });
});

describe('mapHeight', () => {
  it.each([
    [0, 0],
    [Number.NaN, 0],
    [326, 424],
    [200, 360],
    [700, 400],
    [1000, 550],
    [1400, 560],
  ])('is %d high at %d wide', (width, want) => {
    expect(mapHeight(width)).toBe(want);
  });
});

describe('labelFit', () => {
  const box = (w: number, h: number): Rect => ({ x: 0, y: 0, w, h });

  it.each([
    ['a short name and its figure in a roomy cell', box(200, 60), 'OSD', { lines: 1, figure: true }],
    ['a name alone in a short cell', box(200, 26), 'OSD (classic)', { lines: 1, figure: false }],
    ['a long name over two lines in a tall narrow cell', box(110, 80), 'RADOS Gateway (API plane)', { lines: 2, figure: true }],
    ['at most three lines', box(70, 300), 'Peripheral clients and examples of every kind', { lines: 3, figure: true }],
    ['no more lines than the height allows', box(110, 42), 'RADOS Gateway (API plane)', { lines: 2, figure: false }],
    ['nothing where too few letters would show', box(40, 60), 'Messenger', { lines: 0, figure: false }],
    ['a name that fits whole, however narrow', box(34, 30), 'Mon', { lines: 1, figure: false }],
    ['nothing in a sliver', box(200, 18), 'OSD', { lines: 0, figure: false }],
    ['nothing in an empty rect', box(0, 0), 'OSD', { lines: 0, figure: false }],
  ] as const)('fits %s', (_, rect, name, want) => {
    expect(labelFit(rect, name)).toEqual(want);
  });
});

describe('neighbour', () => {
  // a b
  // c d
  //   e (under d, narrower)
  const cell = (id: string, x: number, y: number, w: number, h: number): CellBox => ({
    id,
    groupId: null,
    rect: { x, y, w, h },
    parts: [],
    value: 1,
  });
  const cells = [cell('a', 0, 0, 50, 50), cell('b', 50, 0, 50, 50), cell('c', 0, 50, 50, 50), cell('d', 50, 50, 50, 25), cell('e', 50, 75, 50, 25)];

  it.each([
    ['a', 'right', 'b'],
    ['a', 'down', 'c'],
    ['b', 'left', 'a'],
    ['b', 'down', 'd'],
    ['d', 'down', 'e'],
    ['e', 'up', 'd'],
    ['e', 'left', 'c'],
    ['c', 'right', 'd'],
    ['a', 'left', null],
    ['a', 'up', null],
    ['e', 'down', null],
    ['nope', 'down', null],
  ] as const)('from %s going %s reaches %s', (from, dir, want) => {
    expect(neighbour(cells, from, dir)).toBe(want);
  });

  it('tolerates the gaps between cells', () => {
    const gapped = [cell('a', 0, 0, 48, 48), cell('b', 50, 0, 48, 48)];
    expect(neighbour(gapped, 'a', 'right')).toBe('b');
  });
});
