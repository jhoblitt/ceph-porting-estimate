import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/report.json';
import { bindingsText, dependencySummary, vendoredText } from './dependencies';
import { list } from './format';
import { STRATEGY_MEANINGS } from './labels';
import { type FeatureEstimate, type GroupEstimate, estimate, resolveParams } from './model';
import { type Report, TARGET_LABELS, parseReport } from './report';

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

/** The fixture's RocksDB with its own and nested sizes replaced. */
function rocksdbWith(own: Partial<NonNullable<Report['dependencies'][number]['submodule_own']>> | null, nested?: Partial<NonNullable<Report['dependencies'][number]['submodule_size']>>): Report {
  return {
    ...report,
    dependencies: report.dependencies.map((d) =>
      d.id === 'rocksdb'
        ? {
            ...d,
            submodule_own: own === null ? null : { ...d.submodule_own!, ...own },
            submodule_size: { ...d.submodule_size!, ...nested },
          }
        : d,
    ),
  };
}

function rocksdbRow(r: Report) {
  return dependencySummary(r, estimate(r, 'go', 'opus-5-5', params), 'go').rows.find((x) => x.id === 'rocksdb')!;
}

describe('vendoredText', () => {
  it('gives one size, with its files, where the submodule nests nothing', () => {
    const row = rocksdbRow(rocksdbWith({ code: 611_013, files: 2079 }, { code: 611_013, files: 2079 }));
    expect(vendoredText(row)).toEqual({ text: '611k lines in 2,079 files of its own', note: '' });
  });

  it('gives its own size against the size with what is nested in it', () => {
    const row = rocksdbRow(rocksdbWith({ code: 128_305, files: 1_000 }, { code: 2_312_696, files: 9_000 }));
    expect(vendoredText(row)).toEqual({
      text: '128k lines in 1,000 files of its own; 2.31M lines in 9,000 files with the submodules nested in it',
      note: '',
    });
  });

  it('says how many nested submodules could not be counted', () => {
    const row = rocksdbRow(rocksdbWith({ code: 508_655 }, { code: 3_552_714, unavailable_nested: 3 }));
    expect(vendoredText(row).note).toBe('3 nested submodules could not be counted.');
  });

  it('says "not available" where nothing was counted', () => {
    expect(vendoredText(rocksdbRow(rocksdbWith({ available: false }, { available: false })))).toEqual({ text: 'Not available', note: '' });
    expect(vendoredText(rocksdbRow(rocksdbWith(null, { available: false })))).toEqual({ text: 'Not available', note: '' });
    const boost = dependencySummary(report, estimate(report, 'go', 'opus-5-5', params), 'go').rows.find((x) => x.id === 'boost')!;
    expect(vendoredText(boost)).toEqual({ text: 'Not available', note: 'Not vendored: a system library.' });
  });
});

/** Entries as data/dependencies.yaml has them, whose bindings do not keep what the entry names as it is. */
const REAL_ENTRIES: Report['dependencies'] = [
  {
    id: 'cython',
    name: 'Cython',
    used_for: 'rados/rbd/cephfs/rgw Python bindings (src/pybind/*.pyx)',
    submodules: [],
    submodule_size: null,
    submodule_own: null,
    targets: {
      go: {
        strategy: 'bindings',
        package: null,
        sloc_equivalent: 1500,
        difficulty: 'standard',
        note: 'Expose a C ABI from Go (-buildmode=c-shared) and keep thin Cython/cffi wrappers; ~1.5k lines of export glue.',
      },
      rust: { strategy: 'native', package: 'pyo3', sloc_equivalent: 0, difficulty: 'glue', note: 'pyo3 generates the Python modules directly from Rust.' },
      wasm: { strategy: 'drop', package: null, sloc_equivalent: 0, difficulty: 'glue', note: 'No host Python inside WASI; bindings lost (component-model bindings possible, unverified).' },
    },
  },
  {
    id: 'python3-saml',
    name: 'python3-saml (xmlsec1)',
    used_for: 'Dashboard SAML2 single sign-on',
    submodules: [],
    submodule_size: null,
    submodule_own: null,
    targets: {
      go: { strategy: 'native', package: 'github.com/crewjam/saml', sloc_equivalent: 0, difficulty: 'glue', note: 'Maintained pure-Go SAML SP.' },
      rust: { strategy: 'bindings', package: 'samael', sloc_equivalent: 0, difficulty: 'standard', note: 'Maintained Rust SAML crate; relies on xmlsec for signatures.' },
      wasm: { strategy: 'drop', package: null, sloc_equivalent: 0, difficulty: 'standard', note: 'xmlsec1 not available on WASI; SSO lost or delegated to a proxy.' },
    },
  },
  {
    id: 'lua',
    name: 'Lua 5.3+ (+ LuaRocks)',
    used_for: 'RGW request scripting, cls_lua object class and MDS Mantle balancer',
    submodules: [],
    submodule_size: null,
    submodule_own: null,
    targets: {
      go: {
        strategy: 'native',
        package: 'github.com/yuin/gopher-lua',
        sloc_equivalent: 0,
        difficulty: 'standard',
        note: 'Pure-Go VM implements Lua 5.1 only; scripts relying on 5.3+ semantics (integers, bit ops) break and LuaRocks C modules are lost.',
      },
      rust: { strategy: 'bindings', package: 'mlua', sloc_equivalent: 0, difficulty: 'glue', note: 'Maintained binding that can vendor Lua 5.3/5.4.' },
      wasm: {
        strategy: 'bindings',
        package: 'mlua',
        sloc_equivalent: 0,
        difficulty: 'standard',
        note: 'Vendored Lua C compiled to wasm32-wasi (unverified); C rock packages lost.',
      },
    },
  },
];

describe('the bindings and the ones without work', () => {
  it('lists the dependencies a target uses through bindings, from the data', () => {
    for (const t of ['go', 'rust', 'wasm'] as const) {
      const want = report.dependencies.filter((d) => d.targets[t].strategy === 'bindings').map((d) => d.name);
      expect(dependencySummary(report, estimate(report, t, 'opus-5-5', params), t).bindings.map((d) => d.name)).toEqual(want);
    }
  });

  /**
   * A claim that an entry, as named, is itself kept: false of python3-saml
   * under Rust (samael replaces the Python package, xmlsec1 stays) and of Lua
   * under WASM (the C rock packages are lost).
   */
  const KEEPS_ENTRY =
    /\b(kept|keeps?|keeping|whole|unchanged|links?|linked|C or C\+\+)\b|in the language it is written in|relies on it\b|code each of these entries names/i;

  it.each([
    ['rust', 'python3-saml'],
    ['wasm', 'lua'],
    ['go', 'cython'],
  ] as const)('under %s, claims nothing of %s that its plan contradicts, in the note or the legend', (target, id) => {
    const real: Report = { ...report, dependencies: [...report.dependencies, ...REAL_ENTRIES] };
    const s = dependencySummary(real, estimate(real, target, 'opus-5-5', params), target);
    expect(s.bindings.map((d) => d.id)).toContain(id);
    const note = bindingsText(TARGET_LABELS[target], s.bindings);
    expect(note).not.toMatch(KEEPS_ENTRY);
    expect(STRATEGY_MEANINGS.bindings).not.toMatch(KEEPS_ENTRY);
    // What is kept and what replaced is each entry's own plan: the note sends the reader there.
    expect(note).toMatch(/plan/);
    expect(note).toContain(list(s.bindings.map((d) => d.name)));
  });

  it('says so when a target uses nothing through bindings', () => {
    expect(bindingsText('WASM', [])).toBe('A WASM port built to this estimate uses no dependency through bindings.');
  });

  it('names a binding or a port that leaves no lines of work', () => {
    const noLines: Report = {
      ...report,
      dependencies: report.dependencies.map((d) =>
        d.id === 'rocksdb' ? { ...d, targets: { ...d.targets, go: { ...d.targets.go, sloc_equivalent: 0 } } } : d,
      ),
    };
    const s = dependencySummary(noLines, estimate(noLines, 'go', 'opus-5-5', params), 'go');
    expect(s.withoutWork).toContainEqual({ id: 'rocksdb', name: 'RocksDB', strategy: 'bindings' });
    const none = report.dependencies.filter(
      (d) => (d.targets.go.strategy === 'bindings' || d.targets.go.strategy === 'port') && d.targets.go.sloc_equivalent === 0,
    );
    expect(dependencySummary(report, estimate(report, 'go', 'opus-5-5', params), 'go').withoutWork.map((d) => d.id)).toEqual(
      none.map((d) => d.id),
    );
  });
});
