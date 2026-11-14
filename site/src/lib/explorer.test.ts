import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/report.json';
import {
  DEPENDENCY_GROUP_ID,
  type Row,
  componentScopes,
  costPerThousandLines,
  explorerLevel,
  factorChain,
  filterGroups,
  hasContent,
  largestRow,
  perLineRange,
  requiredMode,
  rootLines,
  sortRows,
  widerMode,
} from './explorer';
import { type FeatureEstimate, type GroupEstimate, cephSloc, estimate, resolveParams } from './model';
import { parseReport } from './report';

const report = parseReport(fixture);
const params = resolveParams(report, 'calibrated');
const root = estimate(report, 'go', 'opus-5-5', params);

function component(id: string): GroupEstimate {
  const c = root.children.find((x): x is GroupEstimate => x.kind !== 'feature' && x.id === id);
  if (!c) throw new Error(`no component ${id}`);
  return c;
}

function feature(componentId: string, id: string, r: GroupEstimate = root): FeatureEstimate {
  const c = r.children.find((x): x is GroupEstimate => x.kind !== 'feature' && x.id === componentId);
  const f = c?.children.find((x): x is FeatureEstimate => x.kind === 'feature' && x.id === id);
  if (!f) throw new Error(`no feature ${componentId}/${id}`);
  return f;
}

const rowIds = (rows: Row[]) => rows.map((r) => r.id);

describe('explorerLevel at the root', () => {
  it('groups components under the report groups, with the dependency work last', () => {
    const level = explorerLevel(report, root, null, 'headline');
    expect(level.componentId).toBeNull();
    expect(level.groups.map((g) => [g.id, rowIds(g.rows)])).toEqual([
      ['rados', ['osd']],
      ['rgw', ['rgw']],
      ['tests', ['qa']],
      ['crimson', ['crimson']],
      [DEPENDENCY_GROUP_ID, ['dependencies']],
    ]);
    expect(level.groups[0]!.name).toBe('RADOS core');
  });

  it('gives each group a subtotal of its rows and a total equal to the headline', () => {
    const level = explorerLevel(report, root, null, 'headline');
    for (const g of level.groups) {
      expect(g.subtotal.usd).toBeCloseTo(g.rows.reduce((s, r) => s + r.figures.usd, 0), 9);
      expect(g.subtotal.code).toBe(g.rows.reduce((s, r) => s + r.figures.code, 0));
    }
    expect(level.total.usd).toBeCloseTo(root.headline.usd, 9);
    expect(level.total.sourceTokens).toBeCloseTo(root.headline.sourceTokens, 6);
    expect(level.total.outputTokens).toBeCloseTo(root.headline.tokens.output, 6);
    expect(level.total.cacheReadTokens).toBeCloseTo(root.headline.tokens.cacheRead, 3);
    expect(level.total.code).toBe(root.headline.sloc.code);
    expect(level.share).toBeCloseTo(1, 12);
  });

  it('takes a component row from the scope the reader chose', () => {
    const qa = component('qa');
    const headline = explorerLevel(report, root, null, 'headline').groups[2]!.rows[0]!;
    expect(headline.figures).toEqual({
      code: qa.headline.sloc.code,
      sourceTokens: qa.headline.sourceTokens,
      outputTokens: qa.headline.tokens.output,
      cacheReadTokens: qa.headline.tokens.cacheRead,
      usd: qa.headline.usd,
    });
    const costed = explorerLevel(report, root, null, 'costed').groups[2]!.rows[0]!;
    expect(costed.figures.code).toBe(qa.headline.sloc.code + qa.shown.sloc.code);
    expect(costed.figures.usd).toBeCloseTo(qa.headline.usd + qa.shown.usd, 9);
    expect(costed.parts.map((p) => p.scope)).toEqual(['headline', 'shown']);
  });

  it('counts code that is not ported only when asked, and never as cost', () => {
    const osd = component('osd');
    const all = explorerLevel(report, root, null, 'all');
    const row = all.groups[0]!.rows[0]!;
    expect(row.figures.code).toBe(osd.sloc.code);
    expect(row.figures.usd).toBeCloseTo(osd.headline.usd, 9);
    const notPorted = row.parts.find((p) => p.scope === 'not-ported');
    expect(notPorted).toEqual({ scope: 'not-ported', code: 188, usd: 0, perLine: null });
    // Not-ported lines do not dilute the cost per line.
    expect(row.perLine).toBeCloseTo(osd.headline.usd / osd.headline.sloc.code, 12);
    expect(all.total.code).toBe(cephSloc(root).sloc.code + component('dependencies').sloc.code);
    expect(all.total.usd).toBeCloseTo(root.headline.usd + root.shown.usd, 9);
  });

  it('gives each row its share of the headline cost', () => {
    const level = explorerLevel(report, root, null, 'costed');
    for (const g of level.groups) {
      expect(g.share).toBeCloseTo(g.subtotal.usd / root.headline.usd, 12);
      for (const r of g.rows) expect(r.share).toBeCloseTo(r.figures.usd / root.headline.usd, 12);
    }
    // Shown work is costed outside the headline, so the shares add to more than one.
    expect(level.share).toBeGreaterThan(1);
  });

  it('gives each row a bar length on the level’s common scale', () => {
    const level = explorerLevel(report, root, null, 'costed');
    const rows = level.groups.flatMap((g) => g.rows);
    const max = Math.max(...rows.map((r) => r.share));
    for (const r of rows) expect(r.bar).toBeCloseTo(r.share / max, 12);
    expect(Math.max(...rows.map((r) => r.bar))).toBe(1);
    const free = explorerLevel(report, root, 'osd', 'all').groups[0]!.rows.find((r) => r.id === 'osd-build')!;
    expect(free.bar).toBe(0);
  });

  it('gives each part and row its cost per line, and none where nothing is costed', () => {
    const level = explorerLevel(report, root, null, 'headline');
    const rgw = component('rgw');
    const row = level.groups[1]!.rows[0]!;
    expect(row.perLine).toBeCloseTo(rgw.headline.usd / rgw.headline.sloc.code, 12);
    expect(row.parts[0]!.perLine).toBeCloseTo(rgw.headline.usd / rgw.headline.sloc.code, 12);
    const range = perLineRange(level);
    const perLine = level.groups.flatMap((g) => g.rows.map((r) => r.perLine as number));
    expect(range).toEqual({ min: Math.min(...perLine), max: Math.max(...perLine) });
  });

  it('leaves out components and groups with nothing in scope', () => {
    const shownOnly = {
      ...report,
      components: [
        ...report.components,
        {
          id: 'ui',
          name: 'UI',
          description: '',
          group: 'tests',
          root: [],
          features: [{ ...report.components[2]!.features[2]!, id: 'ui-e2e' }],
        },
      ],
    };
    const r = estimate(shownOnly, 'go', 'opus-5-5', params);
    expect(rowIds(explorerLevel(shownOnly, r, null, 'headline').groups[2]!.rows)).toEqual(['qa']);
    expect(rowIds(explorerLevel(shownOnly, r, null, 'costed').groups[2]!.rows)).toEqual(['qa', 'ui']);
    const nativeOnly = { ...report, dependencies: report.dependencies.filter((d) => d.id === 'boost') };
    const noWork = estimate(nativeOnly, 'go', 'opus-5-5', params);
    expect(explorerLevel(nativeOnly, noWork, null, 'all').groups.map((g) => g.id)).toEqual(['rados', 'rgw', 'tests', 'crimson']);
  });

  it('counts only features that match files', () => {
    const level = explorerLevel(report, root, null, 'all');
    const rgw = level.groups[1]!.rows[0]!;
    expect(report.components[0]!.features.map((f) => f.id)).toContain('rgw-lua');
    expect(rgw.features).toBe(3);
  });
});

describe('rootLines', () => {
  it("splits the root's lines into Ceph's own and the dependency work, which add up to the total", () => {
    const own = cephSloc(root);
    const deps = component('dependencies').headline.sloc.code;
    expect(deps).toBeGreaterThan(0);
    const headline = rootLines(explorerLevel(report, root, null, 'headline'));
    expect(headline).toEqual({ ceph: own.headline.code, dependencies: deps });
    const all = explorerLevel(report, root, null, 'all');
    expect(rootLines(all)).toEqual({ ceph: all.total.code - deps, dependencies: deps });
  });

  it('has nothing to split at a component', () => {
    expect(rootLines(explorerLevel(report, root, 'rgw', 'headline'))).toBeNull();
  });
});

describe('explorerLevel at a component', () => {
  it('lists the features in scope, without those that match no file', () => {
    expect(rowIds(explorerLevel(report, root, 'rgw', 'all').groups[0]!.rows)).toEqual([
      'rgw-core',
      'rgw-multisite',
      'rgw-tests',
    ]);
    expect(rowIds(explorerLevel(report, root, 'osd', 'headline').groups[0]!.rows)).toEqual(['osd-core', 'bluestore']);
    expect(rowIds(explorerLevel(report, root, 'osd', 'all').groups[0]!.rows)).toEqual([
      'osd-core',
      'bluestore',
      'osd-build',
    ]);
    expect(rowIds(explorerLevel(report, root, 'qa', 'costed').groups[0]!.rows)).toEqual([
      'qa-tasks',
      'qa-suites',
      'qa-dashboard-e2e',
    ]);
  });

  it('describes each feature row by its scope, kind and difficulty', () => {
    const level = explorerLevel(report, root, 'osd', 'all');
    const [core, , build] = level.groups[0]!.rows;
    const f = feature('osd', 'osd-core');
    expect(core).toMatchObject({ kind: 'feature', scope: 'headline', featureKind: 'product', difficulty: 'extreme' });
    expect(core!.figures.usd).toBe(f.usd);
    expect(core!.figures.outputTokens).toBe(f.tokens.output);
    expect(core!.share).toBeCloseTo(f.usd / root.headline.usd, 12);
    expect(build).toMatchObject({ scope: 'not-ported', perLine: null, parts: [{ scope: 'not-ported', code: 188, usd: 0 }] });
  });

  it('totals the component in scope', () => {
    const level = explorerLevel(report, root, 'qa', 'costed');
    const qa = component('qa');
    expect(level.componentId).toBe('qa');
    expect(level.groups).toHaveLength(1);
    expect(level.total.usd).toBeCloseTo(qa.headline.usd + qa.shown.usd, 9);
    expect(level.share).toBeCloseTo(level.total.usd / root.headline.usd, 12);
  });

  it('lists only the dependencies with work for the target', () => {
    expect(rowIds(explorerLevel(report, root, 'dependencies', 'all').groups[0]!.rows)).toEqual(['rocksdb']);
  });

  it('gives an empty level for a component the tree lacks', () => {
    const level = explorerLevel(report, root, 'nope', 'headline');
    expect(level.groups).toEqual([]);
    expect(level.total.usd).toBe(0);
  });
});

describe('hasContent', () => {
  it('is false for a feature that matches no file, true for dependency work', () => {
    expect(hasContent(feature('rgw', 'rgw-lua'))).toBe(false);
    expect(hasContent(feature('rgw', 'rgw-core'))).toBe(true);
    expect(hasContent(feature('dependencies', 'rocksdb'))).toBe(true);
    expect(hasContent(feature('dependencies', 'boost'))).toBe(false);
  });
});

describe('largestRow', () => {
  it('is the row the map draws largest, by code lines or by cost', () => {
    const rows = explorerLevel(report, root, 'rgw', 'all').groups[0]!.rows;
    const byCode = [...rows].sort((a, b) => b.figures.code - a.figures.code)[0]!;
    const byCost = [...rows].sort((a, b) => b.figures.usd - a.figures.usd)[0]!;
    expect(largestRow(rows, 'code')?.id).toBe(byCode.id);
    expect(largestRow(rows, 'cost')?.id).toBe(byCost.id);
    expect(largestRow([], 'code')).toBeUndefined();
  });

  it('breaks a tie by id, as the layout does', () => {
    const rows = explorerLevel(report, root, 'rgw', 'all').groups[0]!.rows.map((r) => ({ ...r, figures: { ...r.figures, code: 5 } }));
    expect(largestRow(rows, 'code')?.id).toBe([...rows.map((r) => r.id)].sort()[0]);
  });
});

describe('sortRows', () => {
  const rows = explorerLevel(report, root, 'rgw', 'all').groups[0]!.rows;

  it('sorts by any column, either way, without changing its input', () => {
    const before = rowIds(rows);
    const byCost = sortRows(rows, { key: 'usd', dir: 'desc' });
    const costs = byCost.map((r) => r.figures.usd);
    expect(costs).toEqual([...costs].sort((a, b) => b - a));
    expect(rowIds(sortRows(rows, { key: 'usd', dir: 'asc' }))).toEqual(rowIds(byCost).reverse());
    expect(rowIds(sortRows(rows, { key: 'name', dir: 'asc' }))).toEqual(['rgw-multisite', 'rgw-core', 'rgw-tests']);
    expect(rowIds(sortRows(rows, { key: 'name', dir: 'desc' }))).toEqual(['rgw-tests', 'rgw-core', 'rgw-multisite']);
    for (const key of ['code', 'sourceTokens', 'outputTokens', 'cacheReadTokens', 'share'] as const) {
      const sorted = sortRows(rows, { key, dir: 'desc' });
      const values = sorted.map((r) => (key === 'share' ? r.share : r.figures[key]));
      expect(values).toEqual([...values].sort((a, b) => b - a));
    }
    expect(rowIds(rows)).toEqual(before);
  });

  it('breaks ties by name', () => {
    const tied = rows.map((r) => ({ ...r, figures: { ...r.figures, usd: 1 } }));
    expect(sortRows(tied, { key: 'usd', dir: 'desc' }).map((r) => r.name)).toEqual([
      'Multisite sync',
      'Request handling',
      'Unit tests',
    ]);
  });
});

describe('filterGroups', () => {
  const level = explorerLevel(report, root, null, 'costed');

  it('keeps rows whose name contains the text, any case, and drops empty groups', () => {
    const groups = filterGroups(level.groups, '  osd ');
    expect(groups.map((g) => [g.id, rowIds(g.rows)])).toEqual([['rados', ['osd']]]);
    expect(filterGroups(level.groups, 'GATEWAY').map((g) => [g.id, rowIds(g.rows)])).toEqual([['rgw', ['rgw']]]);
    expect(filterGroups(level.groups, 'Suites').map((g) => g.id)).toEqual(['tests']);
    expect(filterGroups(level.groups, 'no such thing')).toEqual([]);
  });

  it('keeps subtotals of the whole group', () => {
    const groups = filterGroups(level.groups, 'osd');
    expect(groups[0]!.subtotal).toBe(level.groups[0]!.subtotal);
  });

  it('returns the groups unchanged for empty text', () => {
    expect(filterGroups(level.groups, '')).toBe(level.groups);
    expect(filterGroups(level.groups, '   ')).toBe(level.groups);
  });
});

describe('factorChain', () => {
  it('runs from source tokens to output tokens through every factor', () => {
    const f = feature('rgw', 'rgw-core');
    const chain = factorChain(f, params);
    expect(chain.map((s) => s.key)).toEqual([
      'source',
      'difficulty',
      'target',
      'expansion',
      'newTests',
      'overhead',
      'modelEfficiency',
      'cleanBreak',
    ]);
    expect(chain[0]).toMatchObject({ factor: null, value: f.sourceTokens });
    expect(chain[1]).toMatchObject({ factor: f.factors.difficulty, value: f.sourceTokens * f.factors.difficulty });
    expect(chain.find((s) => s.key === 'newTests')!.factor).toBeCloseTo(1 + f.factors.newTestRatio, 12);
    expect(chain.at(-1)!.value).toBeCloseTo(f.tokens.output, 3);
  });

  it('applies the uplift for adjacent work when that switch is on', () => {
    const p = resolveParams(report, 'pessimistic');
    const f = feature('rgw', 'rgw-core', estimate(report, 'rust', 'gpt-6-astra', p));
    const chain = factorChain(f, p);
    expect(chain.at(-1)).toMatchObject({ key: 'adjacent', factor: 1 + p.adjacentUplift.output });
    expect(chain.at(-1)!.value).toBeCloseTo(f.tokens.output, 3);
  });

  it('gives no chain for a feature that is not ported', () => {
    expect(factorChain(feature('osd', 'osd-build'), params)).toEqual([]);
  });
});

describe('requiredMode', () => {
  it('is the narrowest scope that shows the path', () => {
    expect(requiredMode(root, [])).toBe('headline');
    expect(requiredMode(root, ['osd'])).toBe('headline');
    expect(requiredMode(root, ['osd', 'osd-core'])).toBe('headline');
    expect(requiredMode(root, ['qa', 'qa-dashboard-e2e'])).toBe('costed');
    expect(requiredMode(root, ['osd', 'osd-build'])).toBe('all');
    expect(requiredMode(root, ['nope'])).toBe('headline');
  });

  it('widens for a component with nothing in the headline', () => {
    const shownOnly = {
      ...report,
      components: [
        {
          id: 'ui',
          name: 'UI',
          description: '',
          group: 'tests',
          root: [],
          features: [{ ...report.components[2]!.features[2]! }],
        },
      ],
    };
    expect(requiredMode(estimate(shownOnly, 'go', 'opus-5-5', params), ['ui'])).toBe('costed');
  });

  it('orders the modes from narrow to wide', () => {
    expect(widerMode('headline', 'all')).toBe('all');
    expect(widerMode('costed', 'headline')).toBe('costed');
    expect(widerMode('costed', 'costed')).toBe('costed');
  });
});

describe('componentScopes', () => {
  it('gives the component lines and cost by scope, and its share of the headline', () => {
    const osd = component('osd');
    expect(componentScopes(root, 'osd')).toEqual({
      headline: { code: osd.headline.sloc.code, usd: osd.headline.usd, share: osd.headline.usd / root.headline.usd },
      shown: { code: 0, usd: 0, share: 0 },
      notPorted: { code: 188 },
      features: 3,
    });
    expect(componentScopes(root, 'rgw')!.features).toBe(3);
    expect(componentScopes(root, 'nope')).toBeNull();
  });
});

describe('costPerThousandLines', () => {
  it('scales a cost per line to a thousand lines, and keeps null', () => {
    expect(costPerThousandLines(0.0625)).toBeCloseTo(62.5, 12);
    expect(costPerThousandLines(null)).toBeNull();
  });
});
