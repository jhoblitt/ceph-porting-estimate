import { describe, expect, it } from 'vitest';
import fixture from '../__fixtures__/report.json';
import { cephSloc, estimate, existingTestRatio, matrix, resolveParams } from '../model';
import { type Report, TARGETS, parseReport } from '../report';
import { parseCalibration } from './calibration';
import {
  coverageSentence,
  effectLabel,
  judgement,
  longContextScenarios,
  portCost,
  proseFacts,
  subagentCounts,
  unsizedSentence,
} from './facts';
import { checkContent } from './check';
import { type BackTest, type EarlyRead, type PhaseFacts, goReadEarly } from './phases';
import type { Limitation } from './variants';

const report = parseReport(fixture);
const calibration = parseCalibration(report.calibration);

/** assumptions.yaml's measured pricing mix, which the fixture's baseline does not carry. */
const REAL_MIX = {
  long_cache_write_share: 0.0728,
  'long_context_share.uncached': 0.55,
  'long_context_share.cache_write': 0.748,
  'long_context_share.cache_read': 0.797,
  'long_context_share.output': 0.699,
};

/** calibration.yaml's measured port row, in millions of tokens; the fixture's is a miniature. */
const REAL_PORT = { scope: 'The port', calls: 163_109, uncached: 0.35, cache_write: 1137.2, cache_read: 56_213.6, output: 45.01 };
const realCalibration = { ...calibration, measurement: { ...calibration.measurement, port: REAL_PORT } };

describe('portCost', () => {
  // The fixture's price sheets are models.yaml's; with the measured pricing
  // mix the real port row reproduces calibration.yaml's sanity figure for
  // Opus 5.5 and the brief's check figures for the other two.
  it.each([
    ['opus-5-5', 18_078],
    ['fable-5-2', 24_914],
    ['gpt-6-astra', 130_713],
  ])('prices the port row on %s at about $%d', (id, want) => {
    const model = report.models.find((m) => m.id === id);
    if (!model) throw new Error(id);
    expect(portCost(model, resolveParams(report, 'calibrated', REAL_MIX), realCalibration)).toBeCloseTo(want, -1);
  });

  it('prices a model without long-context prices on its standard sheet whatever the shares', () => {
    const opus = report.models.find((m) => m.id === 'opus-5-5');
    if (!opus) throw new Error('opus');
    const zero = resolveParams(report, 'calibrated', { ...REAL_MIX, 'long_context_share.cache_read': 0 });
    expect(portCost(opus, zero, calibration)).toBeCloseTo(portCost(opus, resolveParams(report, 'calibrated', REAL_MIX), calibration), 6);
  });
});

describe('proseFacts', () => {
  const facts = proseFacts(report);
  const params = resolveParams(report, 'calibrated');

  it('quotes the published scenario for the default target and model', () => {
    expect(facts.scenario).toEqual({ id: 'calibrated', label: report.assumptions.scenarios['calibrated']?.label });
    expect(facts.target).toEqual({ id: 'go', name: 'Go' });
    expect(facts.model).toEqual({ id: 'opus-5-5', name: 'Claude Opus 5.5' });
    expect(facts.targetNames).toEqual(['Go', 'Rust', 'WASM']);
  });

  it("splits Ceph's own code lines by scope and by group, consistently", () => {
    const own = cephSloc(estimate(report, 'go', 'opus-5-5', params));
    expect(facts.lines).toEqual({
      headline: own.headline.code,
      shown: own.shown.code,
      notPorted: own.notPorted.code,
      total: own.sloc.code,
    });
    for (const key of ['headline', 'shown', 'notPorted', 'total'] as const) {
      expect(facts.linesByGroup.reduce((s, g) => s + g[key], 0)).toBe(facts.lines[key]);
    }
    expect(facts.linesByGroup.map((g) => g.id)).toEqual(['rados', 'rgw', 'tests', 'crimson']);
    expect(facts.group['rgw']).toBe(facts.linesByGroup[1]);
    expect(facts.counts).toEqual({ groups: 4, components: 4, features: 10, dependencies: 2 });
  });

  it("splits the quoted target and model's headline dollars by group, dependency work aside", () => {
    const root = estimate(report, 'go', 'opus-5-5', params);
    const deps = root.children.find((c) => c.id === 'dependencies');
    if (!deps || deps.kind === 'feature') throw new Error('dependencies');
    const groups = facts.linesByGroup.reduce((s, g) => s + g.usd, 0);
    expect(groups + deps.headline.usd).toBeCloseTo(root.headline.usd, 6);
  });

  it("gives each language's share of the headline code lines", () => {
    const shares = Object.values(facts.headlineLanguageShare);
    expect(shares.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
    expect(facts.headlineLanguageShare['cpp']).toBeGreaterThan(0);
  });

  it('gives the test ratios the model applies', () => {
    const R = existingTestRatio(report, params);
    expect(facts.tests).toEqual({ existing: R, target: params.testRatio, toWrite: Math.max(0, params.testRatio - R) });
  });

  it('gives the headline matrix in dollars', () => {
    const m = matrix(report, params);
    for (const t of TARGETS) {
      for (const model of report.models) expect(facts.headline[t][model.id]).toBe(m[t][model.id]?.usd);
    }
    expect(facts.quotedHeadline).toBe(m.go['opus-5-5']?.usd);
  });

  it("prices each long-context model at the baseline and with rgw-go's measured shares, the upper case", () => {
    expect(facts.longContext.map((m) => m.id)).toEqual(['gpt-6-astra']);
    expect(facts.hasLongContext).toBe(true);
    const lc = facts.longContext[0];
    if (!lc) throw new Error('fixture has a long-context model');
    expect(lc.threshold).toBe(272_000);
    const shares = calibration.measurement_detail.prompt_size_tokens.share_over_threshold;
    const upper = matrix(
      report,
      resolveParams(report, 'calibrated', {
        'long_context_share.uncached': shares.uncached,
        'long_context_share.cache_write': shares.cache_write,
        'long_context_share.cache_read': shares.cache_read,
        'long_context_share.output': shares.output,
      }),
    );
    for (const t of TARGETS) {
      expect(lc.baseline[t]).toBe(facts.headline[t]['gpt-6-astra']);
      expect(lc.withShares[t]).toBe(upper[t]['gpt-6-astra']?.usd);
      // Billing long prompts at a surcharge cannot lower a figure.
      expect(lc.withShares[t]).toBeGreaterThan(lc.baseline[t]);
    }
    expect(facts.longContextRise).toBeCloseTo(lc.withShares.go / lc.baseline.go - 1, 12);
    expect(facts.longContextScenarios).toEqual(['Pessimistic']);
    expect(facts.longContextSentence).toBe('The Pessimistic scenario applies these shares unchanged to every model with long-context prices.');
    expect(facts.longContextAs).toBe('as the Pessimistic scenario does');
    expect([facts.longContextBilled, facts.longContextUnbilled]).toEqual([true, false]);
  });

  it('totals dependency work per target from the strategies', () => {
    // Fixture: rocksdb is bindings (6,000 lines) / bindings (4,000) / port (60,000); boost is native / native / drop.
    expect(facts.dependencies.go).toEqual({ strategies: { native: 1, bindings: 1, port: 0, drop: 0 }, withWork: 1, lines: 6000 });
    expect(facts.dependencies.wasm).toEqual({ strategies: { native: 0, bindings: 0, port: 1, drop: 1 }, withWork: 1, lines: 60_000 });
    for (const t of TARGETS) {
      const want = report.dependencies
        .map((d) => d.targets[t])
        .filter((x) => x.strategy === 'bindings' || x.strategy === 'port')
        .reduce((s, x) => s + x.sloc_equivalent, 0);
      expect(facts.dependencies[t].lines).toBe(want);
    }
  });

  it('moves the headline with the coverage assumption: less coverage, more cost', () => {
    const at = (E: number) => estimate(report, 'go', 'opus-5-5', resolveParams(report, 'calibrated', { expansion: E })).headline.usd;
    expect(facts.byCoverage).toEqual({
      low: at(calibration.derived.expansion.at_low_coverage),
      central: at(calibration.derived.expansion.central),
      high: at(calibration.derived.expansion.at_high_coverage),
    });
    expect(facts.byCoverage.low).toBeGreaterThan(facts.byCoverage.central);
    expect(facts.byCoverage.central).toBeGreaterThan(facts.byCoverage.high);
  });

  it('shares of headline lines and output in code rated above standard', () => {
    // Fixture headline: rgw-core is hard, rgw-multisite, osd-core and bluestore extreme, rocksdb's Go bindings hard.
    expect(facts.aboveStandard.lines).toBeGreaterThan(0);
    expect(facts.aboveStandard.lines).toBeLessThan(1);
    expect(facts.aboveStandard.output).toBeGreaterThan(facts.aboveStandard.lines);
    expect(facts.aboveStandard.output).toBeLessThanOrEqual(1);
  });

  it("totals the port row and prices it on every model's sheet", () => {
    const row = calibration.measurement.port;
    const total = (row.uncached + row.cache_write + row.cache_read + row.output) * 1e6;
    expect(facts.port.tokens).toBeCloseTo(total, 0);
    expect(facts.port.cacheReadShare).toBeCloseTo((row.cache_read * 1e6) / total, 12);
    expect(facts.port.callsOverThreshold).toBeCloseTo(87_888 / 163_112, 12);
    expect(facts.port.costs.map((c) => c.id)).toEqual(report.models.map((m) => m.id));
    for (const c of facts.port.costs) {
      expect(facts.port.cost[c.id]).toBe(c);
      expect(c.perProductLine).toBeCloseTo(c.usd / 124_396, 12);
    }
  });
});

describe('flags for conditional prose', () => {
  it('says when no model has long-context prices, and computes nothing for one', () => {
    const r = structuredClone(report);
    for (const m of r.models) m.long_context = null;
    const f = proseFacts(r);
    expect(f.hasLongContext).toBe(false);
    expect(f.longContext).toEqual([]);
  });

  it('says whether every model has the same efficiency factor', () => {
    expect(proseFacts(report).sameModelEfficiency).toBe(true);
    const r = structuredClone(report);
    const astra = r.assumptions.params.model_efficiency['gpt-6-astra'];
    if (!astra) throw new Error('astra');
    astra.value = 1.3;
    expect(proseFacts(r).sameModelEfficiency).toBe(false);
  });

  it('lists the dependencies whose submodules could not be counted', () => {
    const r = structuredClone(report);
    const [a, b] = r.dependencies;
    if (!a || !b) throw new Error('two dependencies');
    a.submodule_size = { available: false, unavailable_nested: 0, files: 0, code: 0, comment: 0, blank: 0, bytes: 0 };
    b.submodule_size = { available: true, unavailable_nested: 3, files: 1, code: 1, comment: 0, blank: 0, bytes: 1 };
    expect(proseFacts(r).submodules).toEqual({
      unavailable: [a.name],
      anyUnavailable: true,
      nestedUnavailable: 3,
      anyNestedUnavailable: true,
    });
  });
});

describe('qa classes', () => {
  it("names the classes of the headline features that claim qa/'s tasks and workunits, with their multipliers", () => {
    // Fixture: one standard feature, qa-tasks, claims both.
    expect(proseFacts(report).qa).toEqual({ tasks: ['standard (1×)'], workunits: ['standard (1×)'] });
    const r = structuredClone(report);
    const qa = r.components.find((c) => c.id === 'qa');
    const tasks = qa?.features.find((f) => f.id === 'qa-tasks');
    if (!qa || !tasks) throw new Error('qa-tasks');
    tasks.globs = ['qa/tasks/**'];
    qa.features.push({ ...tasks, id: 'qa-workunits', globs: ['qa/workunits/**'], difficulty: 'glue' });
    expect(proseFacts(r).qa).toEqual({ tasks: ['standard (1×)'], workunits: ['glue (0.5×)'] });
  });
});

describe('cache-write tiers', () => {
  it("says whether every sheet's longer-lived cache write costs more than its shorter one", () => {
    expect(proseFacts(report).longerCacheWriteCostsMore).toBe(true);
    const r = structuredClone(report);
    const first = r.models[0];
    if (!first) throw new Error('model');
    first.usd_per_mtok.cache_write_long = first.usd_per_mtok.cache_write_short;
    expect(proseFacts(r).longerCacheWriteCostsMore).toBe(false);
  });
});

describe('parseCalibration', () => {
  it('rejects calibration data the arithmetic cannot use', () => {
    const broken = structuredClone(report.calibration) as { measurement: { port: { output: unknown } } };
    broken.measurement.port.output = 0;
    expect(() => parseCalibration(broken)).toThrow(/measurement\.port\.output must be a positive number/);
    expect(() => parseCalibration({})).toThrow(/calibration: /);
  });
});

describe('the closing judgement', () => {
  const facts = proseFacts(report);

  it('counts only sized items by direction', () => {
    const sized = facts.limitations.filter((l) => l.effect);
    expect(facts.limitationCounts.raises).toBe(sized.filter((l) => l.direction === 'raises').length);
    expect(facts.limitationCounts.lowers).toBe(sized.filter((l) => l.direction === 'lowers').length);
    expect(facts.limitationCounts.notSized).toBe(facts.limitations.length - sized.length);
  });

  it('builds the unsized sentence from the direction each item declares', () => {
    expect(facts.unsized).toBe(
      'Of the items that cannot be sized, integration, qualification and upstream change push it up; ' +
        'two release floors and a workflow still being worked out push it down; ' +
        'the billing basis could move it either way; and ' +
        "other models' token use does not move it.",
    );
    expect(unsizedSentence([])).toBeNull();
  });

  it('labels a zero effect as no change', () => {
    expect(effectLabel({ low: 0, high: 0 })).toBe('No change');
    expect(effectLabel(null)).toBe('Not sized');
  });

  it('quotes the measured model, and cannot describe a report without one', () => {
    expect(facts.model.id).toBe('opus-5-5');
    const unknown = structuredClone(report);
    (unknown.calibration as { measurement: { model_id: string } }).measurement.model_id = 'not-listed';
    expect(() => proseFacts(unknown)).toThrow(/calibration\.measurement\.model_id "not-listed" names no model the report prices/);
    const missing = structuredClone(report);
    delete (missing.calibration as { measurement: { model_id?: string } }).measurement.model_id;
    expect(() => proseFacts(missing)).toThrow(/calibration\.measurement\.model_id is missing/);
  });

  it('says which branch of the back-test applies', () => {
    expect(facts.backTestUnder).toBe((facts.backTest?.outputGap ?? 0) < 0);
    expect(facts.backTestOver).toBe((facts.backTest?.outputGap ?? 0) > 0);
  });
});

describe('the measured model in the build check', () => {
  it('fails the build, naming the key, without a priced measured model', async () => {
    const { checkContent } = await import('./check');
    const missing = structuredClone(report);
    delete (missing.calibration as { measurement: { model_id?: string } }).measurement.model_id;
    expect(checkContent(missing)[0]).toMatch(/^computed figures: calibration\.measurement\.model_id is missing/);
    const unknown = structuredClone(report);
    (unknown.calibration as { measurement: { model_id: string } }).measurement.model_id = 'gpt-2';
    expect(checkContent(unknown)[0]).toMatch(/calibration\.measurement\.model_id "gpt-2" names no model the report prices/);
  });
});

describe('subagentCounts', () => {
  type Raw = { measurement: { port: { scope: string } }; measurement_detail: { cache_write_by_call?: { note: string } } };
  const withText = (scope: string, note: string | null) => {
    const raw = structuredClone(report.calibration) as Raw;
    raw.measurement.port.scope = scope;
    if (note === null) delete raw.measurement_detail.cache_write_by_call;
    else if (raw.measurement_detail.cache_write_by_call) raw.measurement_detail.cache_write_by_call.note = note;
    return parseCalibration(raw);
  };

  it("reads the cache-write note's approximate count and the port row's own, and says they differ", () => {
    expect(subagentCounts(calibration)).toEqual({ note: 1030, port: 984 });
    const f = proseFacts(report);
    expect(f.subagents).toEqual({ note: 1030, port: 984 });
    expect(f.subagentsDiffer).toBe(true);
  });

  it('gives nothing to attribute when either count is missing, and no difference when they agree', () => {
    expect(subagentCounts(withText('The port', 'Most are the first call of each of about 1,030 subagents.'))).toBeNull();
    expect(subagentCounts(withText('The port: controller + 984 subagents', 'Most are first calls.'))).toBeNull();
    expect(subagentCounts(withText('The port: controller + 984 subagents', null))).toBeNull();
    const same = withText('The port: controller + 1,030 subagents', 'each of about 1,030 subagents');
    expect(subagentCounts(same)).toEqual({ note: 1030, port: 1030 });
    const r = structuredClone(report);
    r.calibration = same as unknown as typeof r.calibration;
    expect(proseFacts(r).subagentsDiffer).toBe(false);
  });
});

describe('longContextScenarios', () => {
  const measured = { uncached: 0.55, cacheWrite: 0.748, cacheRead: 0.797, output: 0.699 };

  it('splits the scenarios that bill the measured shares exactly from those that bill others, in the plural too', () => {
    const r = structuredClone(report);
    const s = r.assumptions.scenarios as unknown as Record<string, { label: string; overrides?: Record<string, number> }>;
    const lc = Object.fromEntries(Object.entries(s['pessimistic']?.overrides ?? {}).filter(([k]) => k.startsWith('long_context_share.')));
    s['optimistic'] = { ...(s['optimistic'] as { label: string }), overrides: lc };
    const two = longContextScenarios(r, measured);
    expect(two.exact).toEqual(['Optimistic', 'Pessimistic']);
    expect(two.sentence).toBe('The Optimistic and Pessimistic scenarios apply these shares unchanged to every model with long-context prices.');
    expect(two.as).toBe('as the Optimistic and Pessimistic scenarios do');
    // Within cephest check's 0.1% tolerance the shares count as the measured ones.
    expect(longContextScenarios(report, { ...measured, output: 0.699 * 1.0009 }).exact).toEqual(['Pessimistic']);
    expect(longContextScenarios(report, { ...measured, output: 0.699 * 1.0011 }).exact).toEqual([]);
    const other = longContextScenarios(report, { ...measured, output: 0.5 });
    expect(other.exact).toEqual([]);
    expect(other.sentence).toBe('The Pessimistic scenario bills other shares at those prices.');
    const none = structuredClone(report);
    for (const sc of Object.values(none.assumptions.scenarios)) delete (sc as { overrides?: unknown }).overrides;
    expect(longContextScenarios(none, measured).sentence).toBeNull();
  });
});

describe('coverageSentence', () => {
  type Sc = { label: string; overrides?: Record<string, number>; scale?: Record<string, number> };
  const scenarios = (r: Report) => r.assumptions.scenarios as unknown as Record<string, Sc>;
  const ends = (r: Report) => (r.calibration as { coverage: { scenario_end?: Record<string, string> } }).coverage;
  const CENTRAL = 'Under the central scenario every estimated token and dollar figure is inversely proportional to it, through the expansion E.';
  const NOT =
    "The cost of rgw-go's own port, priced from its measured tokens, and the figures computed from rgw-go's phases alone, the back-test and the phase rates, do not depend on it; " +
    'nor do ratios between figures estimated under the central scenario, such as the break-evens and the shares of the estimated dollars that re-read context and test code make up.';

  it('names the coverage end each mapped scenario uses, and the reference scenario that follows less than in proportion (the fixture, as the real data)', () => {
    expect(coverageSentence(report)).toBe(
      `${CENTRAL} ` +
        'The Optimistic scenario uses the expansion at the top of the coverage range (47%) and the Pessimistic scenario uses the expansion at the bottom of the coverage range (35%). ' +
        "Under the Naive scenario the output is inversely proportional to it, as under the central scenario; the read of the source is not, so that scenario's figure moves less than in proportion. " +
        NOT,
    );
  });

  it('says a scenario mapped to the coverage value itself uses the central expansion, not one set independently', () => {
    const r = structuredClone(report);
    scenarios(r)['optimistic'] = { label: 'Optimistic', overrides: { expansion: 1.62 } };
    const e = ends(r);
    e.scenario_end = { ...e.scenario_end, optimistic: 'value' };
    const got = coverageSentence(r);
    expect(got).toContain('The Optimistic scenario uses the expansion at the coverage value itself (40%), as the central scenario does');
    expect(got).not.toContain('independently');
  });

  it('says a scenario that keeps the central expansion follows coverage too', () => {
    const r = structuredClone(report);
    scenarios(r)['optimistic'] = { label: 'Optimistic' };
    delete ends(r).scenario_end?.['optimistic'];
    expect(coverageSentence(r)).toContain(`${CENTRAL} So is every such figure under the Optimistic scenario.`);
  });

  it('adds the input that follows the output for a reading scenario whose per-output ratios are above zero', () => {
    const r = structuredClone(report);
    const s = scenarios(r);
    s['naive'] = { ...(s['naive'] as Sc), overrides: { ...s['naive']?.overrides, cache_read_per_output: 10 } };
    expect(coverageSentence(r)).toContain(
      'Under the Naive scenario the output is inversely proportional to it, as under the central scenario, and so is the input that follows the output; the read of the source is not',
    );
  });

  it('says a scenario sets its expansion independently only when the data maps no scenario to a coverage end', () => {
    const r = structuredClone(report);
    delete ends(r).scenario_end;
    expect(coverageSentence(r)).toContain('The Optimistic and Pessimistic scenarios set their expansion independently of coverage.');
    expect(coverageSentence(r)).not.toContain('top of the coverage range');
  });

  it('fails, as cephest check does, on an expansion override the mapping leaves out and on a scaled expansion', () => {
    const unmapped = structuredClone(report);
    delete ends(unmapped).scenario_end?.['optimistic'];
    expect(() => coverageSentence(unmapped)).toThrow(/scenarios\.optimistic\.overrides\.expansion names no coverage end in calibration\.coverage\.scenario_end/);
    const scaled = structuredClone(report);
    scenarios(scaled)['optimistic'] = { label: 'Optimistic', scale: { expansion: 0.9 } };
    expect(() => coverageSentence(scaled)).toThrow(/scenarios\.optimistic\.scale\.expansion: the expansion is set only by an override/);
  });

  it('fails on a central scenario whose figures would not all be inversely proportional to coverage', () => {
    const atEnd = structuredClone(report);
    scenarios(atEnd)['calibrated'] = { label: 'Scaled from rgw-go', overrides: { expansion: 1.8514 } };
    ends(atEnd).scenario_end = { ...ends(atEnd).scenario_end, calibrated: 'low' };
    expect(() => coverageSentence(atEnd)).toThrow(/the central scenario "calibrated" takes its expansion at coverage\.low/);
    const reads = structuredClone(report);
    scenarios(reads)['calibrated'] = { label: 'Scaled from rgw-go', overrides: { source_read_passes: 1 } };
    expect(() => coverageSentence(reads)).toThrow(/the central scenario "calibrated" reads the source/);
    expect(checkContent(reads)[0]).toMatch(/^computed figures: the central scenario "calibrated" reads the source/);
    const atValue = structuredClone(report);
    scenarios(atValue)['calibrated'] = { label: 'Scaled from rgw-go', overrides: { expansion: 1.62 } };
    ends(atValue).scenario_end = { ...ends(atValue).scenario_end, calibrated: 'value' };
    expect(coverageSentence(atValue).startsWith(CENTRAL)).toBe(true);
  });
});

describe('judgement', () => {
  const item = (id: string, low: number, high: number, over: Partial<Limitation> = {}): Limitation => ({
    id,
    effect: { low, high },
    direction: low >= 0 ? 'raises' : high <= 0 ? 'lowers' : 'either',
    declared: 'either',
    choice: false,
    phrase: id,
    plural: false,
    ends: 'chosen',
    ...over,
  });
  const floors: Limitation = { ...item('floors', 0, 0), effect: null, direction: 'lowers', declared: 'lowers' };
  /** A phase table with these output-per-Go-byte rates in phase order, from phase 0, and an all-phases rate. */
  const phases = (rates: number[], all: number): PhaseFacts[] =>
    [...rates.map((r, i) => ({ phase: i as number | 'all', outputPerGoByte: r })), { phase: 'all' as const, outputPerGoByte: all }].map(
      (p) => ({ ...p }) as PhaseFacts,
    );
  /** rgw-go's shape: 2.06, 2.70, 3.71 per byte, 3.10 over all phases. */
  const risingTable = phases([2.06, 2.7, 3.71], 3.1);
  const test = { outputRateRise: 0.37 } as BackTest;

  it('is made when the rate rose in every phase and the latest is above the average, and names the rates in order', () => {
    const j = judgement([item('a', -0.1, 0.3, { ends: 'measured' }), item('b', -0.2, 0.2), item('d', -0.4, 0, { choice: true }), floors], risingTable, test);
    expect(j).toMatchObject({ made: true, lowers: true, either: 2, chosen: 1, latest: 2, average: 3.1 });
    expect(j.rates).toBe('2.06, 2.70, and 3.71 output tokens per byte in phases 0, 1, and 2');
    expect(j.ranges).toBe('The ranges above that go either way are not offered as evidence of direction: one of the two has ends this report chose.');
    expect(j.against).toBe('What cuts the other way: the unsized item above that pushes the figure down, which is not a choice a port could make.');
  });

  it('is made on two phases only, when the later is above the earlier and the average', () => {
    const j = judgement([item('a', -0.1, 0.3)], phases([2.7, 3.71], 3.2), test);
    expect(j).toMatchObject({ made: true, latest: 1 });
    expect(j.rates).toBe('2.70 and 3.71 output tokens per byte in phases 0 and 1');
  });

  it('says where the latest phase is read early, within a day or further, and when it is not', () => {
    const read = (days: number): EarlyRead => ({ phase: 2, at: 'x', ends: 'y', days, atSizesCommit: false });
    expect(judgement([], risingTable, test, [read(1)])).toMatchObject({ readSlight: true, readFar: false, readOnTime: false });
    expect(judgement([], risingTable, test, [read(4)])).toMatchObject({ readSlight: false, readFar: true, readDays: 4, readOnTime: false });
    expect(judgement([], risingTable, test, [{ ...read(1), phase: 1 }])).toMatchObject({ readSlight: false, readFar: false, readOnTime: true });
    expect(judgement([], phases([3, 2], 2.5), test, [read(1)])).toMatchObject({ readSlight: false, readFar: false, readOnTime: false });
  });

  it('prints no clause about lowering items when there are none, and none about what cuts the other way when nothing does', () => {
    const j = judgement([item('a', -0.1, 0.3), item('b', -0.2, 0.2)], risingTable, test);
    expect(j).toMatchObject({ made: true, lowers: false, hasAgainst: false, against: '' });
  });

  it('words the count of chosen ends for one range, for all of them, and leaves it out when none was chosen', () => {
    const ranges = (...items: Limitation[]) => judgement(items, risingTable, test).ranges;
    expect(ranges(item('a', -0.1, 0.3))).toBe(
      "The range above that goes either way is not offered as evidence of direction: its ends are this report's choice.",
    );
    expect(ranges(item('a', -0.1, 0.3), item('b', -0.2, 0.2))).toBe(
      'The ranges above that go either way are not offered as evidence of direction: both have ends this report chose.',
    );
    expect(ranges(item('a', -0.1, 0.3), item('b', -0.2, 0.2), item('c', -0.3, 0.1))).toBe(
      'The ranges above that go either way are not offered as evidence of direction: all three have ends this report chose.',
    );
    expect(ranges(item('a', -0.1, 0.3), item('b', -0.2, 0.2), item('c', -0.3, 0.1, { ends: 'measured' }))).toBe(
      'The ranges above that go either way are not offered as evidence of direction: two of the three have ends this report chose.',
    );
    for (const j of [judgement([item('a', -0.1, 0.3, { ends: 'measured' })], risingTable, test), judgement([item('r', 0, 0.3)], risingTable, test)]) {
      expect(j).toMatchObject({ made: true, ranges: '', hasRanges: false });
    }
  });

  it('is not made on a dip between earlier phases, a latest phase not above the average, one phase, no back-test, or a lowering item that is not a choice', () => {
    const items = [item('a', -0.1, 0.3), item('d', -0.4, 0, { choice: true })];
    const cases = [
      // A dip between phases 0 and 1, the latest still above the average.
      judgement(items, phases([2.9, 2.7, 3.71], 3.1), test),
      // Rising, but the latest phase below the all-phases rate.
      judgement(items, phases([2.06, 2.7, 3.0], 3.1), test),
      judgement(items, phases([3.71], 3.71), test),
      judgement(items, phases([2.06, 2.7, 3.71], 3.1), null),
      judgement([item('d', -0.4, 0)], risingTable, test),
    ];
    for (const j of cases) {
      expect(j).toMatchObject({ made: false, lowers: false, hasRanges: false, hasAgainst: false, rates: '', readOnTime: false });
    }
  });

  it('is computed on the fixture from its limitations and back-test', () => {
    const f = proseFacts(report);
    expect(f.judgement).toEqual(judgement(f.limitations, f.phases, f.backTest, goReadEarly(calibration)));
    expect(f.judgement).toMatchObject({ made: true, latest: 2, readSlight: true });
  });
});
