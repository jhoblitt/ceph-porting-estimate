import { beforeAll, describe, expect, it } from 'vitest';
import fixture from './__fixtures__/report.json';
// staged.json is the staged data's assumptions.yaml with its `ceph` key
// removed, as `assumptions`, and models.yaml's `models` list, as `models`,
// converted to JSON unchanged except `read_on` kept a string:
//   python3 -c 'import json,sys,yaml; d=sys.argv[1]; a=yaml.safe_load(open(d+"/assumptions.yaml")); a.pop("ceph");
//     m=yaml.safe_load(open(d+"/models.yaml"))["models"]; [x.update(read_on=str(x["read_on"])) for x in m];
//     print(json.dumps({"assumptions": a, "models": m}, indent=2, ensure_ascii=False))' <data dir> > staged.json
import staged from './__fixtures__/staged.json';
import {
  cephSloc,
  type Cost,
  describeParams,
  estimate,
  existingTestRatio,
  type FeatureEstimate,
  type GroupEstimate,
  matrix,
  type Params,
  resolveParams,
  type Sloc,
  type Tokens,
} from './model';
import {
  type Assumptions,
  type Component,
  type Dependency,
  type DependencyTarget,
  type Difficulty,
  type Feature,
  type Kind,
  type Model,
  type Report,
  type Scenario,
  type Scope,
  type Strategy,
  TARGETS,
} from './report';

const CATS = ['uncached', 'cacheWrite', 'cacheRead', 'output'] as const;
const STAGED_ASSUMPTIONS = staged.assumptions as unknown as Assumptions;
const STAGED_MODELS = staged.models as unknown as Model[];

function expectClose(actual: number, expected: number, rel = 1e-12): void {
  const tol = rel * Math.abs(expected) + 1e-12;
  if (!(Math.abs(actual - expected) <= tol)) {
    expect.fail(`expected ${actual} to be within ${rel} (relative) of ${expected}`);
  }
}

function expectTokens(actual: Tokens, expected: Tokens, rel = 1e-12): void {
  for (const c of CATS) expectClose(actual[c], expected[c], rel);
}

function feat(id: string, kind: Kind, difficulty: Difficulty, scope: Scope, bytes: Record<string, number>): Feature {
  const langs = Object.fromEntries(
    Object.entries(bytes).map(([lang, b]) => [lang, { files: 1, code: Math.round(b / 40), comment: 3, blank: 2, bytes: b }]),
  );
  return { id, name: id, description: '', globs: [], scope, kind, difficulty, why: '', langs };
}

function comp(id: string, features: Feature[]): Component {
  return { id, name: id, description: '', group: 'g', root: [], features };
}

function depTarget(strategy: Strategy, sloc_equivalent: number, difficulty: Difficulty): DependencyTarget {
  return { strategy, package: null, sloc_equivalent, difficulty, note: '' };
}

function dep(id: string, go: DependencyTarget, rust: DependencyTarget, wasm: DependencyTarget): Dependency {
  return { id, name: id, used_for: '', submodules: [], submodule_size: null, submodule_own: null, targets: { go, rust, wasm } };
}

function report(components: Component[], dependencies: Dependency[] = [], models: Model[] = STAGED_MODELS): Report {
  const groups = [{ id: 'g', name: 'G', description: '' }];
  return { ceph: fixture.ceph, groups, components, dependencies, models, assumptions: STAGED_ASSUMPTIONS, calibration: {} };
}

function searchFeature(g: GroupEstimate, id: string): FeatureEstimate | undefined {
  for (const c of g.children) {
    const found = c.kind === 'feature' ? (c.id === id ? c : undefined) : searchFeature(c, id);
    if (found) return found;
  }
  return undefined;
}

function findFeature(g: GroupEstimate, id: string): FeatureEstimate {
  const found = searchFeature(g, id);
  if (!found) throw new Error(`no feature ${id}`);
  return found;
}

function findGroup(g: GroupEstimate, id: string): GroupEstimate {
  const found = g.children.find((c): c is GroupEstimate => c.kind !== 'feature' && c.id === id);
  if (!found) throw new Error(`no group ${id}`);
  return found;
}

// ---------------------------------------------------------------------------
// 1 and 2: the calibration identity and the dollar cross-check
// ---------------------------------------------------------------------------

// RGW v19.2.7 source tokens × coverage 0.40, all of it C++ at 3.5 bytes/token.
const RGW_S = 2_756_184 * 0.4; // 1,102,473.6
const rgwReport = report([comp('rgw', [feat('rgw', 'product', 'standard', 'headline', { cpp: RGW_S * 3.5 })])]);

describe('calibration identity', () => {
  let p: Params;
  let root: GroupEstimate;
  beforeAll(() => {
    p = resolveParams(rgwReport, 'calibrated');
    root = estimate(rgwReport, 'go', 'opus-5-5', p);
  });

  it('reads the calibrated baseline from the staged assumptions', () => {
    expect([p.expansion, p.testRatio, p.overhead]).toEqual([1.2133, 2.076, 10.939]);
    expect([p.uncachedPerOutput, p.cacheWritePerOutput, p.cacheReadPerOutput]).toEqual([0.007776, 25.266, 1248.91]);
    expect(p.difficulty.standard).toBe(1);
    expect(p.toggles).toEqual({ includeAdjacent: false, cleanBreak: false });
  });

  it('sizes the feature at RGW source tokens × coverage', () => {
    expectClose(findFeature(root, 'rgw').sourceTokens, RGW_S);
    expect(existingTestRatio(rgwReport, p)).toBe(0);
  });

  it("reproduces rgw-go's measured port row within 1%", () => {
    // out = S × E × (1 + T) × H = 1,102,473.6 × 1.2133 × 3.076 × 10.939 ≈ 45.009M
    const t = root.headline.tokens;
    expectClose(t.output, 45.01e6, 0.01);
    expectClose(t.cacheRead, 56_213.6e6, 0.01);
    expectClose(t.cacheWrite, 1_137.2e6, 0.01);
    expectClose(t.uncached, 0.35e6, 0.01);
  });
});

describe('dollars', () => {
  let p: Params;
  beforeAll(() => {
    p = resolveParams(rgwReport, 'calibrated');
  });
  const usd = (model: string, params: Params = p) => estimate(rgwReport, 'go', model, params).headline;

  it('uses the measured cache-write and long-context shares', () => {
    expect(p.longCacheWriteShare).toBe(0.0728);
    expect(p.longContextShare).toEqual({ uncached: 0.55, cacheWrite: 0.748, cacheRead: 0.797, output: 0.699 });
  });

  it.each([
    // Independent figures: the port row (45.01M out, 56,213.6M read,
    // 1,137.2M write, 0.35M uncached) at models.yaml list prices.
    ['opus-5-5', 18_078],
    ['fable-5-2', 24_914],
    ['gpt-6-astra', 130_713],
  ])('prices the rgw-go-sized port on %s at about $%d', (model, expected) => {
    expectClose(usd(model).usd, expected, 0.005);
  });

  it('blends long-context prices only for the model that has them', () => {
    const noLong = resolveParams(rgwReport, 'calibrated', {
      'long_context_share.uncached': 0,
      'long_context_share.cache_write': 0,
      'long_context_share.cache_read': 0,
      'long_context_share.output': 0,
    });
    expect(usd('opus-5-5', noLong).usd).toBe(usd('opus-5-5').usd);
    expect(usd('fable-5-2', noLong).usd).toBe(usd('fable-5-2').usd);

    // Astra at short-context prices only: input 10, writes 12.5 / 25, read 1, output 50.
    const t = usd('gpt-6-astra', noLong).tokens;
    const shortOnly = (t.uncached * 10 + t.cacheWrite * (0.9272 * 12.5 + 0.0728 * 25) + t.cacheRead * 1 + t.output * 50) / 1e6;
    expectClose(usd('gpt-6-astra', noLong).usd, shortOnly, 1e-9);
    expect(usd('gpt-6-astra').usd).toBeGreaterThan(shortOnly * 1.7);
  });
});

// ---------------------------------------------------------------------------
// 3: hand-computed small cases
// ---------------------------------------------------------------------------

// Round prices: m1 has no long-context sheet, m2 has one.
const ROUND_MODELS: Model[] = [
  {
    id: 'm1',
    name: 'M1',
    vendor: 'v',
    source: 's',
    read_on: '2026-11-14',
    usd_per_mtok: { input: 1, cache_write_short: 2, cache_write_long: 4, cache_read: 0.1, output: 10 },
    cache_write_ttl: { short: '5m', long: '1h' },
    long_context: null,
  },
  {
    id: 'm2',
    name: 'M2',
    vendor: 'v',
    source: 's',
    read_on: '2026-11-14',
    usd_per_mtok: { input: 1, cache_write_short: 2, cache_write_long: 4, cache_read: 0.1, output: 10 },
    cache_write_ttl: { short: '5m', long: '1h' },
    long_context: { threshold_tokens: 1000, input: 3, cache_write_short: 4, cache_write_long: 8, cache_read: 0.3, output: 20 },
  },
];

const ROUND: Params = {
  bytesPerToken: { default: 4, cpp: 4, python: 2 },
  expansion: 1.5,
  testRatio: 2,
  overhead: 10,
  uncachedPerOutput: 0.01,
  cacheWritePerOutput: 20,
  cacheReadPerOutput: 1000,
  sourceReadPasses: 0,
  difficulty: { config: 0.1, glue: 0.5, standard: 1, hard: 1.5, extreme: 2 },
  rustFactor: 1.2,
  wasmOverhead: 1.5,
  cleanBreakDiscount: 0.5,
  longCacheWriteShare: 0.25,
  longContextShare: { uncached: 0.5, cacheWrite: 0.5, cacheRead: 0.5, output: 0.5 },
  modelEfficiency: { m1: 1, m2: 1 },
  slocEquivalentBytesPerLine: 40,
  adjacentUplift: { uncached: 0.1, cacheWrite: 0.2, cacheRead: 0.3, output: 0.4 },
  toggles: { includeAdjacent: false, cleanBreak: false },
};

const round = (over: Partial<Params> = {}): Params => ({ ...ROUND, ...over });

// Source tokens S (bytes ÷ bytes per token):
//   a-prod  product standard headline  cpp 40,000 B ÷ 4 = 10,000 (+ 1 MB binary, no tokens)
//   a-test  test    hard     headline  python 4,000 B ÷ 2 = 2,000
//   b-conf  config  (standard, but config kind wins) headline  yaml 8,000 B ÷ default 4 = 2,000
//   b-shown product glue     shown     cpp 4,000 B ÷ 4 = 1,000
//   b-np    product extreme  not-ported cpp 400,000 B ÷ 4 = 100,000
// R = headline test ÷ headline product = 2,000 ÷ 10,000 = 0.2, so T_new = 2 − 0.2 = 1.8.
const small = report(
  [
    comp('a', [
      feat('a-prod', 'product', 'standard', 'headline', { cpp: 40_000, binary: 1_000_000 }),
      feat('a-test', 'test', 'hard', 'headline', { python: 4_000 }),
    ]),
    comp('b', [
      feat('b-conf', 'config', 'standard', 'headline', { yaml: 8_000 }),
      feat('b-shown', 'product', 'glue', 'shown', { cpp: 4_000 }),
      feat('b-np', 'product', 'extreme', 'not-ported', { cpp: 400_000 }),
    ]),
  ],
  [],
  ROUND_MODELS,
);

// Go, m1, toggles off. a-prod: W = 10,000; code = 15,000; out = 15,000 × 2.8 × 10 = 420,000.
const A_PROD: Tokens = { uncached: 4_200, cacheWrite: 8_400_000, cacheRead: 420_000_000, output: 420_000 };
// a-test: W = 2,000 × 1.5 = 3,000; code = 4,500; out = 4,500 × 10 = 45,000 (no test ratio).
const A_TEST: Tokens = { uncached: 450, cacheWrite: 900_000, cacheRead: 45_000_000, output: 45_000 };
// b-conf: W = 2,000 × 0.1 = 200; code = 300; out = 3,000.
const B_CONF: Tokens = { uncached: 30, cacheWrite: 60_000, cacheRead: 3_000_000, output: 3_000 };
// b-shown: W = 1,000 × 0.5 = 500; code = 750; out = 750 × 2.8 × 10 = 21,000.
const B_SHOWN: Tokens = { uncached: 210, cacheWrite: 420_000, cacheRead: 21_000_000, output: 21_000 };
const ZERO: Tokens = { uncached: 0, cacheWrite: 0, cacheRead: 0, output: 0 };

const scaled = (t: Tokens, k: number): Tokens => ({
  uncached: t.uncached * k,
  cacheWrite: t.cacheWrite * k,
  cacheRead: t.cacheRead * k,
  output: t.output * k,
});
const add = (...ts: Tokens[]): Tokens => ({
  uncached: ts.reduce((s, t) => s + t.uncached, 0),
  cacheWrite: ts.reduce((s, t) => s + t.cacheWrite, 0),
  cacheRead: ts.reduce((s, t) => s + t.cacheRead, 0),
  output: ts.reduce((s, t) => s + t.output, 0),
});

describe('hand-computed small cases', () => {
  let go: GroupEstimate;
  beforeAll(() => {
    go = estimate(small, 'go', 'm1', round());
  });

  it('computes R from raw headline source tokens', () => {
    expectClose(existingTestRatio(small, round()), 0.2);
    // Difficulty, target and toggles do not move it.
    const other = round({ difficulty: { config: 9, glue: 9, standard: 9, hard: 9, extreme: 9 }, rustFactor: 7 });
    expectClose(existingTestRatio(small, { ...other, toggles: { includeAdjacent: true, cleanBreak: true } }), 0.2);
  });

  it('counts source tokens per language, skipping binary and defaulting unknown languages', () => {
    expect(findFeature(go, 'a-prod').sourceTokens).toBe(10_000);
    expect(findFeature(go, 'a-test').sourceTokens).toBe(2_000);
    expect(findFeature(go, 'b-conf').sourceTokens).toBe(2_000);
  });

  it('keeps binary bytes in the line counts', () => {
    const sloc = findFeature(go, 'a-prod').sloc;
    expect(sloc.bytes).toBe(1_040_000);
    expect(sloc.code).toBe(1_000 + 25_000);
    expect(sloc.files).toBe(2);
  });

  it('applies the test ratio shortfall to product features only', () => {
    expectTokens(findFeature(go, 'a-prod').tokens, A_PROD);
    expectTokens(findFeature(go, 'a-test').tokens, A_TEST);
    expectTokens(findFeature(go, 'b-conf').tokens, B_CONF);
    expect(findFeature(go, 'a-prod').factors).toEqual({
      difficulty: 1,
      target: 1,
      expansion: 1.5,
      newTestRatio: 1.8,
      overhead: 10,
      modelEfficiency: 1,
      cleanBreak: 1,
    });
    expect(findFeature(go, 'a-test').factors.newTestRatio).toBe(0);
    expect(findFeature(go, 'b-conf').factors.newTestRatio).toBe(0);
    expect(findFeature(go, 'b-conf').factors.difficulty).toBe(0.1);
  });

  it('writes no new tests when the existing tests exceed T', () => {
    // T = 0.1 < R = 0.2: T_new = 0, so a-prod out = 15,000 × 1 × 10 = 150,000.
    const f = findFeature(estimate(small, 'go', 'm1', round({ testRatio: 0.1 })), 'a-prod');
    expect(f.factors.newTestRatio).toBe(0);
    expectClose(f.tokens.output, 150_000);
  });

  it('separates the scopes', () => {
    expectTokens(findFeature(go, 'b-shown').tokens, B_SHOWN);
    const np = findFeature(go, 'b-np');
    expectTokens(np.tokens, ZERO);
    expect(np.usd).toBe(0);
    expect(np.scope).toBe('not-ported');

    expectTokens(go.headline.tokens, add(A_PROD, A_TEST, B_CONF));
    expectTokens(go.shown.tokens, B_SHOWN);
    expect(go.notPorted.sloc.bytes).toBe(400_000);
    expect(go.shown.sloc.bytes).toBe(4_000);
    expect(go.headline.sloc.bytes).toBe(1_040_000 + 4_000 + 8_000);
    expect(go.sloc.bytes).toBe(1_040_000 + 4_000 + 8_000 + 4_000 + 400_000);
    expect(go.headline.sourceTokens).toBe(14_000);
    expect(go.shown.sourceTokens).toBe(1_000);

    const b = findGroup(go, 'b');
    expectTokens(b.headline.tokens, B_CONF);
    expectTokens(b.shown.tokens, B_SHOWN);
  });

  it('prices every category, splitting cache writes by TTL', () => {
    // m1: 4,200 × $1 + 8.4M × (0.75 × $2 + 0.25 × $4 = $2.50) + 420M × $0.10 + 420,000 × $10
    //   = 0.0042 + 21 + 42 + 4.2 = $67.2042
    const f = findFeature(go, 'a-prod');
    expectTokens(f.usdByCategory, { uncached: 0.0042, cacheWrite: 21, cacheRead: 42, output: 4.2 });
    expectClose(f.usd, 67.2042);
  });

  it('blends long-context prices by σ for a model that has them', () => {
    // m2, σ = 0.5: input 2, writes 0.75 × 3 + 0.25 × 6 = 3.75, read 0.2, output 15.
    //   4,200 × 2 + 8.4M × 3.75 + 420M × 0.2 + 420,000 × 15 = 0.0084 + 31.5 + 84 + 6.3 = $121.8084
    const f = findFeature(estimate(small, 'go', 'm2', round()), 'a-prod');
    expectTokens(f.tokens, A_PROD);
    expectTokens(f.usdByCategory, { uncached: 0.0084, cacheWrite: 31.5, cacheRead: 84, output: 6.3 });
    expectClose(f.usd, 121.8084);
  });

  it.each([
    ['go', 1],
    ['rust', 1.2],
    ['wasm', 1.8], // rust_factor × wasm_overhead = 1.2 × 1.5
  ] as const)('applies the %s target factor %d', (target, factor) => {
    const t = estimate(small, target, 'm1', round());
    expectClose(findFeature(t, 'a-prod').factors.target, factor);
    expectTokens(findFeature(t, 'a-prod').tokens, scaled(A_PROD, factor));
    expectTokens(findFeature(t, 'a-test').tokens, scaled(A_TEST, factor));
    expectTokens(t.headline.tokens, scaled(add(A_PROD, A_TEST, B_CONF), factor));
  });

  it('applies the clean-break discount to output when the toggle is on', () => {
    const on = estimate(small, 'go', 'm1', round({ toggles: { includeAdjacent: false, cleanBreak: true } }));
    expect(findFeature(on, 'a-prod').factors.cleanBreak).toBe(0.5);
    expectTokens(findFeature(on, 'a-prod').tokens, scaled(A_PROD, 0.5));
    expectTokens(findFeature(on, 'a-test').tokens, scaled(A_TEST, 0.5));
    // Off: the discount value has no effect.
    expectTokens(findFeature(estimate(small, 'go', 'm1', round({ cleanBreakDiscount: 0.1 })), 'a-prod').tokens, A_PROD);
    // C discounts out, not the source reads: p = 2 gives 4,200 × 0.5 + 10,000 × 2 = 22,100.
    const withReads = round({ sourceReadPasses: 2, toggles: { includeAdjacent: false, cleanBreak: true } });
    expectClose(findFeature(estimate(small, 'go', 'm1', withReads), 'a-prod').tokens.uncached, 22_100);
  });

  it('scales each category by its own adjacent uplift when the toggle is on', () => {
    const on = estimate(small, 'go', 'm1', round({ toggles: { includeAdjacent: true, cleanBreak: false } }));
    // × 1.1, 1.2, 1.3, 1.4
    expectTokens(findFeature(on, 'a-prod').tokens, {
      uncached: 4_620,
      cacheWrite: 10_080_000,
      cacheRead: 546_000_000,
      output: 588_000,
    });
    // The uplift covers the source reads too: (4,200 + 10,000 × 2) × 1.1 = 26,620.
    const withReads = round({ sourceReadPasses: 2, toggles: { includeAdjacent: true, cleanBreak: false } });
    expectClose(findFeature(estimate(small, 'go', 'm1', withReads), 'a-prod').tokens.uncached, 26_620);
  });

  it('adds source read passes to uncached input in work units', () => {
    // p = 2: uncached = out × u + W × p = 4,200 + 10,000 × 2 = 24,200; rust: × 1.2 = 29,040.
    const p2 = round({ sourceReadPasses: 2 });
    expectClose(findFeature(estimate(small, 'go', 'm1', p2), 'a-prod').tokens.uncached, 24_200);
    expectClose(findFeature(estimate(small, 'rust', 'm1', p2), 'a-prod').tokens.uncached, 29_040);
    expectClose(findFeature(estimate(small, 'go', 'm1', p2), 'a-prod').tokens.output, 420_000);
  });

  it('applies model efficiency to output-driven tokens, not to source reads', () => {
    // M = 2, p = 2: out doubles to 840,000; uncached = 8,400 + 20,000 = 28,400.
    const p = round({ sourceReadPasses: 2, modelEfficiency: { m1: 2, m2: 1 } });
    const f = findFeature(estimate(small, 'go', 'm1', p), 'a-prod');
    expect(f.factors.modelEfficiency).toBe(2);
    expectTokens(f.tokens, { uncached: 28_400, cacheWrite: 16_800_000, cacheRead: 840_000_000, output: 840_000 });
    expectTokens(findFeature(estimate(small, 'go', 'm2', p), 'a-prod').tokens, { ...A_PROD, uncached: 24_200 });
  });

  it('files dependency work under a dependencies component', () => {
    const withDeps = report(
      small.components,
      [
        dep('d1', depTarget('bindings', 1_000, 'hard'), depTarget('port', 2_000, 'standard'), depTarget('native', 0, 'glue')),
        dep('d2', depTarget('drop', 0, 'glue'), depTarget('native', 0, 'glue'), depTarget('drop', 0, 'glue')),
      ],
      ROUND_MODELS,
    );
    const go2 = estimate(withDeps, 'go', 'm1', round());
    expect(go2.children.map((c) => c.id)).toEqual(['a', 'b', 'dependencies']);
    const deps = findGroup(go2, 'dependencies');
    expect(deps.kind).toBe('component');
    expect(deps.children.map((c) => c.id)).toEqual(['d1', 'd2']);

    // d1 on go: S = 1,000 lines × 40 B ÷ 4 (cpp) = 10,000; W = 10,000 × 1.5 = 15,000;
    // code = 22,500; out = 22,500 × 2.8 × 10 = 630,000. R stays 0.2.
    const d1 = findFeature(go2, 'd1');
    expect(d1).toMatchObject({ scope: 'headline', featureKind: 'product', difficulty: 'hard' });
    expect(d1.sloc).toEqual({ files: 0, code: 1_000, comment: 0, blank: 0, bytes: 40_000 });
    expect(d1.sourceTokens).toBe(10_000);
    expectClose(d1.tokens.output, 630_000);
    expectClose(existingTestRatio(withDeps, round()), 0.2);
    expectTokens(go2.headline.tokens, add(A_PROD, A_TEST, B_CONF, d1.tokens));

    // d1 on rust: S = 20,000; W = 20,000 × 1 × 1.2 = 24,000; out = 36,000 × 2.8 × 10 = 1,008,000.
    expectClose(findFeature(estimate(withDeps, 'rust', 'm1', round()), 'd1').tokens.output, 1_008_000);

    // native and drop: listed, zero cost.
    for (const [target, id] of [['go', 'd2'], ['wasm', 'd1'], ['wasm', 'd2']] as const) {
      const f = findFeature(estimate(withDeps, target, 'm1', round()), id);
      expectTokens(f.tokens, ZERO);
      expect(f.usd).toBe(0);
    }
  });

  it('sizes dependency work with the default bytes per token when cpp has none', () => {
    const t = depTarget('port', 100, 'standard');
    const withDep = report([], [dep('d', t, t, t)], ROUND_MODELS);
    const p = round({ bytesPerToken: { default: 8 } });
    expect(findFeature(estimate(withDep, 'go', 'm1', p), 'd').sourceTokens).toBe(500); // 100 × 40 ÷ 8
  });

  it('gives native and drop dependencies no lines even when the data carries some', () => {
    const withDep = report(
      small.components,
      [dep('d', depTarget('native', 5_000, 'hard'), depTarget('drop', 3_000, 'extreme'), depTarget('port', 100, 'standard'))],
      ROUND_MODELS,
    );
    for (const target of ['go', 'rust'] as const) {
      const root = estimate(withDep, target, 'm1', round());
      const f = findFeature(root, 'd');
      expect(f.sloc).toEqual({ files: 0, code: 0, comment: 0, blank: 0, bytes: 0 });
      expect(f.sourceTokens).toBe(0);
      expectTokens(f.tokens, ZERO);
      expect(f.usd).toBe(0);
      expect(findGroup(root, 'dependencies').headline.sloc.code).toBe(0);
    }
    // The port target still counts: 100 lines × 40 B.
    expect(findFeature(estimate(withDep, 'wasm', 'm1', round()), 'd').sloc).toMatchObject({ code: 100, bytes: 4_000 });
  });

  it("separates Ceph's own lines from dependency-equivalent lines", () => {
    const withDep = report(
      small.components,
      [dep('d', depTarget('port', 1_000, 'hard'), depTarget('port', 1_000, 'hard'), depTarget('port', 1_000, 'hard'))],
      ROUND_MODELS,
    );
    const root = estimate(withDep, 'go', 'm1', round());
    // The root's totals include the 1,000 dependency lines at 40 B each.
    expect(root.headline.sloc.bytes).toBe(1_052_000 + 40_000);
    expect(cephSloc(root)).toEqual({
      sloc: { files: 6, code: 26_000 + 100 + 200 + 100 + 10_000, comment: 18, blank: 12, bytes: 1_456_000 },
      headline: { files: 4, code: 26_000 + 100 + 200, comment: 12, blank: 8, bytes: 1_052_000 },
      shown: { files: 1, code: 100, comment: 3, blank: 2, bytes: 4_000 },
      notPorted: { files: 1, code: 10_000, comment: 3, blank: 2, bytes: 400_000 },
    });
  });
});

// ---------------------------------------------------------------------------
// 4: scenarios from the staged assumptions
// ---------------------------------------------------------------------------

const stagedMany = report(
  [
    comp('x', [
      feat('x-prod', 'product', 'hard', 'headline', { cpp: 700_000, python: 37_000 }),
      feat('x-test', 'test', 'extreme', 'headline', { cpp: 350_000 }),
    ]),
    comp('y', [
      feat('y-conf', 'config', 'config', 'headline', { yaml: 30_000 }),
      feat('y-glue', 'product', 'glue', 'headline', { shell: 33_000 }),
    ]),
  ],
  [],
);

describe('scenarios', () => {
  it('calibrated equals the baseline', () => {
    const expected: Params = {
      bytesPerToken: Object.fromEntries(Object.entries(STAGED_ASSUMPTIONS.bytes_per_token).map(([k, q]) => [k, q.value])),
      expansion: 1.2133,
      testRatio: 2.076,
      overhead: 10.939,
      uncachedPerOutput: 0.007776,
      cacheWritePerOutput: 25.266,
      cacheReadPerOutput: 1248.91,
      sourceReadPasses: 0,
      difficulty: { config: 0.1, glue: 0.5, standard: 1, hard: 1.5, extreme: 2 },
      rustFactor: 1.15,
      wasmOverhead: 1.25,
      cleanBreakDiscount: 0.6,
      longCacheWriteShare: 0.0728,
      longContextShare: { uncached: 0.55, cacheWrite: 0.748, cacheRead: 0.797, output: 0.699 },
      modelEfficiency: { 'fable-5-2': 1, 'opus-5-5': 1, 'gpt-6-astra': 1 },
      slocEquivalentBytesPerLine: 39.61,
      adjacentUplift: { uncached: 0.1429, cacheWrite: 0.1597, cacheRead: 0.0955, output: 0.3208 },
      toggles: { includeAdjacent: false, cleanBreak: false },
    };
    expect(resolveParams(stagedMany, 'calibrated')).toEqual(expected);
    expect(expected.bytesPerToken['cpp']).toBe(3.5);
  });

  it.each(['go', 'rust', 'wasm'] as const)('naive reads every headline file once and writes it once (%s)', (target) => {
    const p = resolveParams(stagedMany, 'naive');
    const root = estimate(stagedMany, target, 'opus-5-5', p);
    for (const id of ['x-prod', 'x-test', 'y-conf', 'y-glue']) {
      const f = findFeature(root, id);
      expect(f.tokens.output).toBe(f.sourceTokens * 1.2133);
      expect(f.tokens.uncached).toBe(f.sourceTokens);
      expect(f.tokens.cacheWrite).toBe(0);
      expect(f.tokens.cacheRead).toBe(0);
    }
    const S = root.headline.sourceTokens;
    // 700,000/3.5 + 37,000/3.7 + 350,000/3.5 + 30,000/3.0 + 33,000/3.3
    expectClose(S, 200_000 + 10_000 + 100_000 + 10_000 + 10_000);
    expectClose(root.headline.tokens.output, S * 1.2133);
    expectClose(root.headline.tokens.uncached, S);
  });

  it('pessimistic scales overhead, raises hard and extreme, and includes adjacent work', () => {
    const p = resolveParams(stagedMany, 'pessimistic');
    const base = resolveParams(stagedMany, 'calibrated');
    expect(p.overhead).toBe(10.939 * 1.25);
    expect(p.difficulty).toEqual({ ...base.difficulty, hard: 2, extreme: 3 });
    expect(p.toggles).toEqual({ includeAdjacent: true, cleanBreak: false });
    expect({ ...p, overhead: 0, difficulty: base.difficulty, toggles: base.toggles }).toEqual({ ...base, overhead: 0 });
  });

  it('scales the baseline even when the user overrides another path', () => {
    const p = resolveParams(stagedMany, 'pessimistic', { 'difficulty.glue': 0.7, expansion: 2 });
    expect(p.overhead).toBe(10.939 * 1.25);
    expect(p.difficulty.glue).toBe(0.7);
    expect(p.expansion).toBe(2);
  });

  it('lets a user override replace a scaled or scenario value', () => {
    const p = resolveParams(stagedMany, 'pessimistic', { overhead: 5, 'difficulty.hard': 1.1, 'toggles.include_adjacent': 0 });
    expect(p.overhead).toBe(5);
    expect(p.difficulty.hard).toBe(1.1);
    expect(p.toggles.includeAdjacent).toBe(false);
    expect(resolveParams(stagedMany, 'calibrated', { 'toggles.clean_break': 1 }).toggles.cleanBreak).toBe(true);
  });

  it('maps snake_case paths to their params', () => {
    const p = resolveParams(stagedMany, 'calibrated', {
      'long_context_share.cache_read': 0.5,
      'model_efficiency.gpt-6-astra': 1.4,
      'adjacent_uplift.cache_write': 0.25,
      sloc_equivalent_bytes_per_line: 40,
      source_read_passes: 0.5,
    });
    expect(p.longContextShare.cacheRead).toBe(0.5);
    expect(p.modelEfficiency['gpt-6-astra']).toBe(1.4);
    expect(p.adjacentUplift.cacheWrite).toBe(0.25);
    expect(p.slocEquivalentBytesPerLine).toBe(40);
    expect(p.sourceReadPasses).toBe(0.5);
  });

  it('ignores unknown paths and non-finite values, and clamps negatives to zero', () => {
    const base = resolveParams(stagedMany, 'calibrated');
    expect(
      resolveParams(stagedMany, 'calibrated', {
        nonsense: 3,
        'difficulty.impossible': 3,
        'bytes_per_token.cpp': 1,
        'toggles.nope': 1,
        expansion: Number.NaN,
        overhead: Number.POSITIVE_INFINITY,
        'toggles.include_adjacent': Number.NaN,
      }),
    ).toEqual(base);
    // As state.ts builds overrides from the URL: an own `__proto__` key.
    expect(resolveParams(stagedMany, 'calibrated', Object.fromEntries([['__proto__', 1], ['toString', 2]]))).toEqual(base);
    const neg = resolveParams(stagedMany, 'calibrated', { overhead: -4, 'difficulty.hard': -1, 'toggles.clean_break': -1 });
    expect(neg.overhead).toBe(0);
    expect(neg.difficulty.hard).toBe(0);
    expect(neg.toggles.cleanBreak).toBe(false);
  });

  it('keeps shares between 0 and 1', () => {
    const p = resolveParams(stagedMany, 'calibrated', { long_cache_write_share: 3, 'long_context_share.output': 2 });
    expect(p.longCacheWriteShare).toBe(1);
    expect(p.longContextShare.output).toBe(1);
  });

  it('throws on an unknown scenario or model', () => {
    expect(() => resolveParams(stagedMany, 'optimistic')).toThrow(/scenario "optimistic"/);
    expect(() => describeParams(stagedMany, 'toString')).toThrow(/scenario "toString"/);
    const p = resolveParams(stagedMany, 'calibrated');
    expect(() => estimate(stagedMany, 'go', 'gpt-2', p)).toThrow(/model "gpt-2"/);
  });

  describe('rejects bad scenario data', () => {
    const withScenario = (bad: Partial<Scenario>): Report => ({
      ...stagedMany,
      assumptions: {
        ...STAGED_ASSUMPTIONS,
        scenarios: { ...STAGED_ASSUMPTIONS.scenarios, bad: { label: 'Bad', description: '', ...bad } as Scenario },
      },
    });

    it.each([
      ['an override of an unknown path', { overrides: { 'difficulty.hrad': 2 } }, /scenario "bad" overrides unknown param "difficulty\.hrad"/],
      ['an override of a non-leaf path', { overrides: { difficulty: 2 } }, /scenario "bad" overrides unknown param "difficulty"/],
      ['a scale of an unknown path', { scale: { overheda: 1.25 } }, /scenario "bad" scales unknown param "overheda"/],
      ['a non-finite override', { overrides: { overhead: Number.NaN } }, /scenario "bad" overrides "overhead" with a non-finite value/],
      ['a non-finite scale', { scale: { overhead: Number.POSITIVE_INFINITY } }, /scenario "bad" scales "overhead" by a non-finite factor/],
      ['a path both overridden and scaled', { overrides: { overhead: 2 }, scale: { overhead: 1.25 } }, /scenario "bad" both overrides and scales "overhead"/],
      ['an unknown toggle', { toggles: { include_adjacnet: true } as Scenario['toggles'] }, /scenario "bad" sets unknown toggle "include_adjacnet"/],
    ])('throws on %s', (_name, bad, message) => {
      const r = withScenario(bad as Partial<Scenario>);
      expect(() => resolveParams(r, 'bad')).toThrow(message);
      expect(() => describeParams(r, 'bad')).toThrow(message);
      // Other scenarios of the same report still resolve.
      expect(resolveParams(r, 'calibrated')).toEqual(resolveParams(stagedMany, 'calibrated'));
    });

    it('still ignores the same bad paths as user overrides', () => {
      const base = resolveParams(stagedMany, 'calibrated');
      expect(
        resolveParams(stagedMany, 'calibrated', { 'difficulty.hrad': 2, difficulty: 2, overheda: 1.25, overhead: Number.NaN }),
      ).toEqual(base);
      expect(resolveParams(stagedMany, 'calibrated', { 'toggles.include_adjacnet': 1 })).toEqual(base);
    });
  });
});

// ---------------------------------------------------------------------------
// 5: invariants
// ---------------------------------------------------------------------------

function zeroCost(): Cost & { sloc: Sloc } {
  return {
    sourceTokens: 0,
    tokens: { ...ZERO },
    usd: 0,
    usdByCategory: { ...ZERO },
    sloc: { files: 0, code: 0, comment: 0, blank: 0, bytes: 0 },
  };
}

function accumulate(into: Cost & { sloc: Sloc }, c: Cost & { sloc: Sloc }): void {
  into.sourceTokens += c.sourceTokens;
  into.usd += c.usd;
  for (const k of CATS) {
    into.tokens[k] += c.tokens[k];
    into.usdByCategory[k] += c.usdByCategory[k];
  }
  for (const k of ['files', 'code', 'comment', 'blank', 'bytes'] as const) into.sloc[k] += c.sloc[k];
}

function expectCost(actual: Cost, expected: Cost, rel = 1e-9): void {
  expectClose(actual.sourceTokens, expected.sourceTokens, rel);
  expectClose(actual.usd, expected.usd, rel);
  expectTokens(actual.tokens, expected.tokens, rel);
  expectTokens(actual.usdByCategory, expected.usdByCategory, rel);
}

function expectFiniteCost(c: Cost): void {
  for (const v of [c.sourceTokens, c.usd, ...CATS.map((k) => c.tokens[k]), ...CATS.map((k) => c.usdByCategory[k])]) {
    expect(Number.isFinite(v) && v >= 0, `${v} is finite and non-negative`).toBe(true);
  }
}

/** Checks a group against independent sums over its descendants; returns the count of features seen. */
function checkGroup(g: GroupEstimate): number {
  const headline = zeroCost();
  const shown = zeroCost();
  const notPorted = zeroCost();
  const all = zeroCost();
  let features = 0;
  for (const c of g.children) {
    if (c.kind === 'feature') {
      features += 1;
      expectFiniteCost(c);
      expectClose(c.usd, CATS.reduce((s, k) => s + c.usdByCategory[k], 0), 1e-12);
      const bucket = c.scope === 'headline' ? headline : c.scope === 'shown' ? shown : notPorted;
      accumulate(bucket, c);
      accumulate(all, c);
      if (c.scope === 'not-ported') {
        expectTokens(c.tokens, ZERO);
        expect(c.usd).toBe(0);
      }
    } else {
      features += checkGroup(c);
      accumulate(headline, c.headline);
      accumulate(shown, c.shown);
      accumulate(notPorted, { ...zeroCost(), sloc: c.notPorted.sloc });
      accumulate(all, { ...zeroCost(), sloc: c.sloc });
    }
  }
  expectFiniteCost(g.headline);
  expectFiniteCost(g.shown);
  expectCost(g.headline, headline);
  expectCost(g.shown, shown);
  expect(g.headline.sloc).toEqual(headline.sloc);
  expect(g.shown.sloc).toEqual(shown.sloc);
  expect(g.notPorted.sloc).toEqual(notPorted.sloc);
  expect(g.sloc).toEqual(all.sloc);
  for (const part of [g.headline, g.shown]) {
    expectClose(part.usd, CATS.reduce((s, k) => s + part.usdByCategory[k], 0), 1e-9);
  }
  return features;
}

function checkReport(r: Report, p: Params): void {
  const m = matrix(r, p);
  expect(Object.keys(m)).toEqual([...TARGETS]);
  for (const target of TARGETS) {
    expect(Object.keys(m[target])).toEqual(r.models.map((x) => x.id));
    for (const model of r.models) {
      const root = estimate(r, target, model.id, p);
      expect(root.kind).toBe('root');
      checkGroup(root);
      const { sloc: _sloc, ...cost } = root.headline;
      expect(m[target][model.id]).toEqual(cost);
    }
  }
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomReport(seed: number): Report {
  const rnd = mulberry32(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
  const difficulties = ['config', 'glue', 'standard', 'hard', 'extreme'] as const;
  const components = Array.from({ length: 5 }, (_, i) =>
    comp(
      `c${i}`,
      Array.from({ length: 1 + Math.floor(rnd() * 6) }, (_, j) => {
        const bytes: Record<string, number> = {};
        for (const lang of ['cpp', 'python', 'yaml', 'binary', 'fortran']) {
          if (rnd() < 0.5) bytes[lang] = Math.floor(rnd() * 2_000_000);
        }
        return feat(
          `c${i}-f${j}`,
          pick(['product', 'product', 'test', 'config'] as const),
          pick(difficulties),
          pick(['headline', 'headline', 'shown', 'not-ported'] as const),
          bytes,
        );
      }),
    ),
  );
  const dt = () => depTarget(pick(['native', 'bindings', 'port', 'drop'] as const), Math.floor(rnd() * 50_000), pick(difficulties));
  const dependencies = Array.from({ length: 6 }, (_, i) => dep(`d${i}`, dt(), dt(), dt()));
  return report(components, dependencies);
}

const fixtureReport = report(fixture.components as Component[], fixture.dependencies as Dependency[]);

describe('invariants', () => {
  const reports: [string, Report][] = [
    ['the fixture', fixtureReport],
    ['a random report (seed 7)', randomReport(7)],
    ['a random report (seed 1234)', randomReport(1234)],
  ];

  describe.each(reports)('on %s', (_name, r) => {
    it.each(['naive', 'calibrated', 'pessimistic'])('sums and matrix agree under %s', (scenario) => {
      checkReport(r, resolveParams(r, scenario));
      checkReport(r, resolveParams(r, scenario, { 'toggles.clean_break': 1, source_read_passes: 0.5 }));
    });

    it('changes dollars but not tokens with the model', () => {
      const p = resolveParams(r, 'calibrated');
      const a = estimate(r, 'go', 'opus-5-5', p).headline;
      const b = estimate(r, 'go', 'gpt-6-astra', p).headline;
      expectTokens(b.tokens, a.tokens);
      expect(b.usd).not.toBeCloseTo(a.usd);
    });

    it('changes component cost only by the target factor', () => {
      const p = resolveParams(r, 'pessimistic', { source_read_passes: 0.3 });
      const go = estimate(r, 'go', 'fable-5-2', p);
      for (const [target, factor] of [
        ['rust', 1.15],
        ['wasm', 1.15 * 1.25],
      ] as const) {
        const other = estimate(r, target, 'fable-5-2', p);
        for (const c of r.components) {
          const g = findGroup(go, c.id);
          const o = findGroup(other, c.id);
          expectClose(o.headline.sourceTokens, g.headline.sourceTokens);
          expectTokens(o.headline.tokens, scaled(g.headline.tokens, factor), 1e-12);
          expectClose(o.headline.usd, g.headline.usd * factor, 1e-12);
          expectTokens(o.shown.tokens, scaled(g.shown.tokens, factor), 1e-12);
        }
      }
    });
  });

  it('lists every component in order, then dependencies', () => {
    const root = estimate(fixtureReport, 'go', 'opus-5-5', resolveParams(fixtureReport, 'calibrated'));
    expect(root.children.map((c) => c.id)).toEqual(['rgw', 'osd', 'qa', 'dependencies']);
    expect(findGroup(root, 'dependencies').children.map((c) => c.id)).toEqual(['rocksdb', 'boost']);
  });

  it('treats an unclassified component like any other', () => {
    const r = report([comp('unclassified', [feat('unclassified', 'product', 'standard', 'not-ported', { cpp: 1_000 })])]);
    const root = estimate(r, 'go', 'opus-5-5', resolveParams(r, 'calibrated'));
    expect(findGroup(root, 'unclassified').notPorted.sloc.bytes).toBe(1_000);
    expect(root.headline.usd).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 6: robustness
// ---------------------------------------------------------------------------

describe('robustness', () => {
  const all = (v: number) => Object.fromEntries(describeParams(fixtureReport, 'calibrated').map((d) => [d.path, v]));

  it.each([
    ['0', 0],
    ['1e6', 1e6],
  ])('stays finite with every slider at %s', (_name, v) => {
    for (const scenario of ['naive', 'calibrated', 'pessimistic']) {
      checkReport(fixtureReport, resolveParams(fixtureReport, scenario, all(v)));
      checkReport(fixtureReport, resolveParams(fixtureReport, scenario, { ...all(v), 'toggles.clean_break': 1 }));
    }
  });

  it('gives zero cost with every slider at 0', () => {
    const p = resolveParams(fixtureReport, 'calibrated', all(0));
    const root = estimate(fixtureReport, 'go', 'gpt-6-astra', p);
    expectTokens(root.headline.tokens, ZERO);
    expect(root.headline.usd).toBe(0);
  });

  it('clamps negative sliders to zero', () => {
    expect(resolveParams(fixtureReport, 'pessimistic', all(-3))).toEqual(resolveParams(fixtureReport, 'pessimistic', all(0)));
  });

  it('ignores NaN and infinite sliders', () => {
    const base = resolveParams(fixtureReport, 'pessimistic');
    expect(resolveParams(fixtureReport, 'pessimistic', all(Number.NaN))).toEqual(base);
    expect(resolveParams(fixtureReport, 'pessimistic', all(Number.POSITIVE_INFINITY))).toEqual(base);
    expect(resolveParams(fixtureReport, 'pessimistic', all(Number.NEGATIVE_INFINITY))).toEqual(base);
  });

  it('returns zeros, not NaN, for an empty report', () => {
    const empty = report([], []);
    const p = resolveParams(empty, 'calibrated');
    expect(existingTestRatio(empty, p)).toBe(0);
    const root = estimate(empty, 'rust', 'opus-5-5', p);
    expect(root.children.map((c) => c.id)).toEqual(['dependencies']);
    expect(root.headline).toEqual(zeroCost());
    expect(root.shown).toEqual(zeroCost());
    expect(root.sloc).toEqual(zeroCost().sloc);
    for (const target of TARGETS) {
      for (const cost of Object.values(matrix(empty, p)[target])) expect(cost.usd).toBe(0);
    }
  });

  it('gives R = 0 when there is no headline product code', () => {
    const r = report([
      comp('t', [feat('t', 'test', 'standard', 'headline', { cpp: 1_000 }), feat('p', 'product', 'standard', 'shown', { cpp: 1_000 })]),
    ]);
    const p = resolveParams(r, 'calibrated');
    expect(existingTestRatio(r, p)).toBe(0);
    checkReport(r, p);
  });
});

// ---------------------------------------------------------------------------
// 7: describeParams
// ---------------------------------------------------------------------------

describe('describeParams', () => {
  const PATHS = [
    'expansion',
    'test_ratio',
    'overhead',
    'uncached_per_output',
    'cache_write_per_output',
    'cache_read_per_output',
    'source_read_passes',
    'difficulty.config',
    'difficulty.glue',
    'difficulty.standard',
    'difficulty.hard',
    'difficulty.extreme',
    'rust_factor',
    'wasm_overhead',
    'clean_break_discount',
    'long_cache_write_share',
    'long_context_share.uncached',
    'long_context_share.cache_write',
    'long_context_share.cache_read',
    'long_context_share.output',
    'model_efficiency.fable-5-2',
    'model_efficiency.opus-5-5',
    'model_efficiency.gpt-6-astra',
    'sloc_equivalent_bytes_per_line',
    'adjacent_uplift.uncached',
    'adjacent_uplift.cache_write',
    'adjacent_uplift.cache_read',
    'adjacent_uplift.output',
  ];

  it('lists every numeric leaf of the params, once each', () => {
    expect(describeParams(stagedMany, 'calibrated').map((d) => d.path)).toEqual(PATHS);
  });

  it('carries baseline, scenario value and provenance', () => {
    const byPath = new Map(describeParams(stagedMany, 'pessimistic').map((d) => [d.path, d]));
    expect(byPath.get('overhead')).toMatchObject({
      baseline: 10.939,
      scenario: 10.939 * 1.25,
      measured: true,
      source: 'calibration.yaml',
    });
    expect(byPath.get('difficulty.hard')).toMatchObject({ baseline: 1.5, scenario: 2, measured: false, source: 'assumption' });
    expect(byPath.get('expansion')).toMatchObject({ baseline: 1.2133, scenario: 1.2133 });
    expect(byPath.get('test_ratio')?.reason).toMatch(/^rgw-go test \+ tooling Go/);
    expect(byPath.get('model_efficiency.gpt-6-astra')?.label).toMatch(/GPT-6 Astra/);
    const labels = [...byPath.values()].map((d) => d.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const l of labels) expect(l).not.toBe('');
  });

  it('describes the naive scenario values', () => {
    const naive = describeParams(stagedMany, 'naive');
    for (const d of naive.filter((x) => x.path.startsWith('difficulty.'))) expect(d.scenario).toBe(1);
  });

  it('names only paths resolveParams accepts', () => {
    const numbers = (p: Params): number[] =>
      Object.values(p).flatMap((v): unknown[] => (typeof v === 'object' ? Object.values(v) : [v])).filter((x): x is number => typeof x === 'number');
    const marker = 0.625;
    expect(numbers(resolveParams(stagedMany, 'calibrated'))).not.toContain(marker);
    for (const { path } of describeParams(stagedMany, 'calibrated')) {
      const hits = numbers(resolveParams(stagedMany, 'calibrated', { [path]: marker })).filter((v) => v === marker);
      expect(hits, path).toHaveLength(1);
    }
  });
});
