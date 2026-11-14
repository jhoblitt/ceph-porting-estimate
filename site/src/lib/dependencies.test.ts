import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/report.json';
import { dependencySummary } from './dependencies';
import { type FeatureEstimate, type GroupEstimate, estimate, resolveParams } from './model';
import { type Report, parseReport } from './report';

const report = parseReport(fixture);
const params = resolveParams(report, 'calibrated');

function depEstimate(root: GroupEstimate, id: string): FeatureEstimate {
  const deps = root.children.find((c): c is GroupEstimate => c.kind !== 'feature' && c.id === 'dependencies');
  const f = deps?.children.find((c): c is FeatureEstimate => c.kind === 'feature' && c.id === id);
  if (!f) throw new Error(id);
  return f;
}

describe('dependencySummary', () => {
  it('gives one row per dependency with the current target, its cost from the estimate, dearest first', () => {
    const root = estimate(report, 'go', 'opus-5-5', params);
    const s = dependencySummary(report, root, 'go');
    expect(s.rows.map((r) => r.id)).toEqual(['rocksdb', 'boost']);
    const [rocksdb, boost] = s.rows;
    expect(rocksdb).toMatchObject({
      name: 'RocksDB',
      usedFor: 'BlueStore metadata and the monitor store.',
      strategy: 'bindings',
      package: 'github.com/linxGnu/grocksdb',
      lines: 6000,
      difficulty: 'hard',
      note: "cgo bindings exist; Ceph's merge operators and env need wrapping.",
      submodules: ['src/rocksdb'],
      submodule: { code: 412_300, files: 1210, nestedUnavailable: 0 },
    });
    expect(rocksdb!.usd).toBe(depEstimate(root, 'rocksdb').usd);
    expect(rocksdb!.share).toBeCloseTo(rocksdb!.usd / root.headline.usd, 12);
    expect(boost).toMatchObject({ strategy: 'native', lines: 0, usd: 0, share: 0, submodule: null, package: null });
  });

  it('lists every target for comparison, in target order, whatever the current one', () => {
    const root = estimate(report, 'rust', 'opus-5-5', params);
    const rocksdb = dependencySummary(report, root, 'rust').rows.find((r) => r.id === 'rocksdb')!;
    expect(rocksdb.strategy).toBe('bindings');
    expect(rocksdb.lines).toBe(4000);
    expect(rocksdb.targets.map((t) => [t.target, t.strategy, t.package, t.lines, t.current])).toEqual([
      ['go', 'bindings', 'github.com/linxGnu/grocksdb', 6000, false],
      ['rust', 'bindings', 'rust-rocksdb', 4000, true],
      ['wasm', 'port', null, 60000, false],
    ]);
    expect(rocksdb.targets[2]!.note).toBe('No WASI build; the subset BlueStore uses must be ported.');
  });

  it('counts the strategies for the target and totals the dependency work', () => {
    const root = estimate(report, 'wasm', 'opus-5-5', params);
    const s = dependencySummary(report, root, 'wasm');
    expect(s.counts).toEqual([
      { strategy: 'native', count: 0 },
      { strategy: 'bindings', count: 0 },
      { strategy: 'port', count: 1 },
      { strategy: 'drop', count: 1 },
    ]);
    const deps = root.children.find((c) => c.id === 'dependencies') as GroupEstimate;
    expect(s.usd).toBe(deps.headline.usd);
    expect(s.lines).toBe(60_000);
    expect(s.share).toBeCloseTo(deps.headline.usd / root.headline.usd, 12);
  });

  it('says when a submodule could not be counted', () => {
    const unavailable: Report = {
      ...report,
      dependencies: report.dependencies.map((d) =>
        d.id === 'rocksdb' ? { ...d, submodule_size: { ...d.submodule_size!, available: false, unavailable_nested: 2 } } : d,
      ),
    };
    const root = estimate(unavailable, 'go', 'opus-5-5', params);
    const row = dependencySummary(unavailable, root, 'go').rows[0]!;
    expect(row.submodule).toBeNull();
    expect(row.submodules).toEqual(['src/rocksdb']);
  });

  it('is empty without dependencies', () => {
    const none: Report = { ...report, dependencies: [] };
    const s = dependencySummary(none, estimate(none, 'go', 'opus-5-5', params), 'go');
    expect(s.rows).toEqual([]);
    expect(s.usd).toBe(0);
    expect(s.counts.every((c) => c.count === 0)).toBe(true);
  });
});
