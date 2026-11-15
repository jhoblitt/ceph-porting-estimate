import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/report.json';
import { compactReport } from './compact';
import { type Effect, checkEffectReasons, effectsDiffer, paramEffects, smallReach } from './effects';
import { describeParams, estimate, resolveParams } from './model';
import { type Report, TARGETS, type Target, parseReport } from './report';
import { defaultState } from './state';

const report = parseReport(fixture);
const defaults = defaultState(report);

interface Selection {
  target: Target;
  model: string;
  scenario: string;
  overrides: Record<string, number>;
}

function effects(patch: Partial<Selection> = {}, of: Report = report): Map<string, Effect> {
  const s: Selection = { target: defaults.target, model: defaults.model, scenario: defaults.scenario, overrides: {}, ...patch };
  return paramEffects({
    report: of,
    scenarioId: s.scenario,
    target: s.target,
    modelId: s.model,
    overrides: s.overrides,
    info: describeParams(of, s.scenario),
  });
}

const kind = (e: Map<string, Effect>, path: string) => e.get(path)?.kind;
const LONG_CONTEXT = ['uncached', 'cache_write', 'cache_read', 'output'].map((c) => `long_context_share.${c}`);
const ADJACENT = ['uncached', 'cache_write', 'cache_read', 'output'].map((c) => `adjacent_uplift.${c}`);

/** The headline with these overrides on the default selection. */
function headline(overrides: Record<string, number>): number {
  return estimate(report, defaults.target, defaults.model, resolveParams(report, defaults.scenario, overrides)).headline.usd;
}

describe('paramEffects', () => {
  it('gives every param an effect', () => {
    const e = effects();
    expect([...e.keys()]).toEqual(describeParams(report, defaults.scenario).map((p) => p.path));
  });

  it('on Go, gives both target factors no effect, saying which targets each applies to', () => {
    const e = effects({ target: 'go' });
    expect(e.get('rust_factor')).toEqual({ kind: 'none', reason: { kind: 'target', target: 'go', appliesTo: ['rust', 'wasm'] } });
    expect(e.get('wasm_overhead')).toEqual({ kind: 'none', reason: { kind: 'target', target: 'go', appliesTo: ['wasm'] } });
  });

  it('on Rust, makes the Rust factor live and leaves the WASM one without effect', () => {
    const e = effects({ target: 'rust' });
    expect(kind(e, 'rust_factor')).toBe('live');
    expect(e.get('wasm_overhead')).toEqual({ kind: 'none', reason: { kind: 'target', target: 'rust', appliesTo: ['wasm'] } });
  });

  it('on WASM, makes both target factors live', () => {
    const e = effects({ target: 'wasm' });
    expect(kind(e, 'rust_factor')).toBe('live');
    expect(kind(e, 'wasm_overhead')).toBe('live');
  });

  it('gives the long-context shares no effect with a model that has no long-context prices, and an effect with one that does', () => {
    const opus = effects({ model: 'opus-5-5' });
    for (const path of LONG_CONTEXT) {
      expect(opus.get(path), path).toEqual({ kind: 'none', reason: { kind: 'long-context', model: 'opus-5-5' } });
    }
    const astra = effects({ model: 'gpt-6-astra' });
    for (const path of LONG_CONTEXT) expect(kind(astra, path), path).not.toBe('none');
  });

  it("gives another model's token use no effect, naming that model, and the chosen model's a live one", () => {
    const e = effects({ model: 'opus-5-5' });
    expect(kind(e, 'model_efficiency.opus-5-5')).toBe('live');
    for (const other of ['fable-5-2', 'gpt-6-astra', 'kimi-k3']) {
      expect(e.get(`model_efficiency.${other}`)).toEqual({ kind: 'none', reason: { kind: 'other-model', model: other } });
    }
  });

  it('gives a rate behind a switch no effect while the switch is off, and an effect while it is on', () => {
    const off = effects({ overrides: { 'toggles.clean_break': 0, 'toggles.include_adjacent': 0 } });
    expect(off.get('clean_break_discount')).toEqual({ kind: 'none', reason: { kind: 'switch', toggle: 'clean_break' } });
    for (const path of ADJACENT) {
      expect(off.get(path), path).toEqual({ kind: 'none', reason: { kind: 'switch', toggle: 'include_adjacent' } });
    }
    const on = effects({ overrides: { 'toggles.clean_break': 1, 'toggles.include_adjacent': 1 } });
    expect(kind(on, 'clean_break_discount')).toBe('live');
    for (const path of ADJACENT) expect(kind(on, path), path).not.toBe('none');
  });

  it('gives a share of a token category no effect while the sliders that make those tokens are 0', () => {
    // The Naive scenario writes nothing to the cache.
    const naive = effects({ scenario: 'naive' });
    expect(naive.get('long_cache_write_share')).toEqual({ kind: 'none', reason: { kind: 'moot', by: ['cache_write_per_output'] } });
    const astra = effects({ scenario: 'naive', model: 'gpt-6-astra' });
    expect(astra.get('long_context_share.cache_write')).toEqual({ kind: 'none', reason: { kind: 'moot', by: ['cache_write_per_output'] } });
    expect(astra.get('long_context_share.cache_read')).toEqual({ kind: 'none', reason: { kind: 'moot', by: ['cache_read_per_output'] } });
    // Naive reads the source once, so uncached input is not 0.
    expect(kind(astra, 'long_context_share.uncached')).not.toBe('none');
    const both = effects({ scenario: 'naive', model: 'gpt-6-astra', overrides: { source_read_passes: 0 } });
    expect(both.get('long_context_share.uncached')).toEqual({
      kind: 'none',
      reason: { kind: 'moot', by: ['uncached_per_output', 'source_read_passes'] },
    });
  });

  it('gives the weight of a difficulty no effect when no work in the estimate is of that difficulty', () => {
    // The fixture's headline has no glue features.
    const e = effects();
    expect(e.get('difficulty.glue')).toEqual({ kind: 'none', reason: { kind: 'difficulty' } });
    expect(kind(e, 'difficulty.standard')).toBe('live');
  });

  it('gives a slider whose reach the printed figure does not show a small effect, with the reach at each end', () => {
    const e = effects();
    const now = headline({});
    const upo = e.get('uncached_per_output');
    expect(upo?.kind).toBe('small');
    if (upo?.kind !== 'small') return;
    expect(upo.from).toBeLessThan(0);
    expect(upo.to).toBeGreaterThan(0);
    expect(upo.to).toBeLessThan(0.001);

    // At 0 in the default scenario, so one end is where it is now.
    const passes = e.get('source_read_passes');
    expect(passes).toEqual({ kind: 'small', from: 0, to: (headline({ source_read_passes: 5 }) - now) / now });
  });

  it('marks a slider live when the printed figure changes at an end', () => {
    const e = effects();
    for (const path of ['expansion', 'overhead', 'cache_read_per_output', 'difficulty.hard']) expect(kind(e, path), path).toBe('live');
  });

  it('with the estimate set to $0 by one slider, leaves that slider live and every other without effect', () => {
    // A Rust factor of 0 leaves no work to write or to read, so nothing else can move the estimate.
    const overrides = { rust_factor: 0 };
    expect(estimate(report, 'rust', defaults.model, resolveParams(report, defaults.scenario, overrides)).headline.usd).toBe(0);
    const e = effects({ target: 'rust', overrides });
    expect(kind(e, 'rust_factor')).toBe('live');
    for (const [path, effect] of e) if (path !== 'rust_factor') expect(effect.kind, path).toBe('none');
    // Nothing but the reader's own combination explains these.
    for (const path of ['overhead', 'source_read_passes', 'difficulty.hard', 'model_efficiency.opus-5-5', 'sloc_equivalent_bytes_per_line']) {
      expect(e.get(path), path).toEqual({ kind: 'none', reason: { kind: 'other' } });
    }
  });
});

describe('on the compact report', () => {
  it('gives every slider the state, reach and reason it has on the full report, for every selection', () => {
    const compact = compactReport(report);
    const toggles = Object.keys(report.assumptions.toggles);
    let compared = 0;
    for (const scenario of Object.keys(report.assumptions.scenarios)) {
      for (let bits = 0; bits < 2 ** toggles.length; bits++) {
        const overrides = Object.fromEntries(toggles.map((id, i) => [`toggles.${id}`, (bits >> i) & 1]));
        for (const target of TARGETS) {
          for (const { id: model } of report.models) {
            const s = { target, model, scenario, overrides };
            expect(effectsDiffer(effects(s, compact), effects(s)), JSON.stringify(s)).toEqual([]);
            compared += 1;
          }
        }
      }
    }
    expect(compared).toBe(192);
  });

  it('compares reaches to the noise of the headline, not to their own size', () => {
    const small = (from: number, to: number) => new Map<string, Effect>([['x', { kind: 'small', from, to }]]);
    // A tiny reach that differs only by summation order is the same reach.
    expect(effectsDiffer(small(0, 1e-8), small(0, 1e-8 + 1e-15))).toEqual([]);
    expect(effectsDiffer(small(-2e-8, 0), small(-2e-8 - 3e-15, 0))).toEqual([]);
    // Reaches that really differ do not compare equal, however small.
    expect(effectsDiffer(small(0, 1e-5), small(0, 2e-5))).toEqual(['x']);
    expect(effectsDiffer(small(0, 0.001), small(0, 0.0011))).toEqual(['x']);
  });

  it('reports a slider whose state, reach or reason differs', () => {
    const live: Effect = { kind: 'live' };
    const small: Effect = { kind: 'small', from: 0, to: 0.0017 };
    const a = new Map<string, Effect>([
      ['x', live],
      ['y', small],
      ['z', { kind: 'none', reason: { kind: 'other' } }],
    ]);
    const b = new Map<string, Effect>([
      ['x', small],
      ['y', { kind: 'small', from: 0, to: 0.0018 }],
      ['z', { kind: 'none', reason: { kind: 'difficulty' } }],
    ]);
    expect(effectsDiffer(a, a)).toEqual([]);
    expect(effectsDiffer(a, new Map([...a].map(([k, e]) => [k, e.kind === 'small' ? { ...e, to: e.to * (1 + 1e-12) } : e])))).toEqual([]);
    expect(effectsDiffer(a, b)).toEqual(['x', 'y', 'z']);
  });
});

describe('smallReach', () => {
  it.each([
    ['both ends past the printed floor', -0.00072, 0.0029, { kind: 'between', from: -0.00072, to: 0.0029 }],
    ['one end where it is now', 0, 0.0017, { kind: 'up-to', change: 0.0017 }],
    ['one end where it is now, downwards', -0.003, 0, { kind: 'up-to', change: -0.003 }],
    ['one end below the printed floor', -0.00006, 0.00023, { kind: 'up-to', change: 0.00023 }],
    ['both ends below the printed floor', -0.00001, 0.00002, { kind: 'within' }],
    ['one end where it is now and the other below the floor', 0, 0.00001, { kind: 'within' }],
  ] as const)('reads %s', (_, from, to, reach) => {
    expect(smallReach(from, to)).toEqual(reach);
  });
});

describe('checkEffectReasons', () => {
  it('finds a specific reason for every slider without effect, and an effect wherever a reason says there is none', () => {
    expect(checkEffectReasons(report)).toEqual([]);
  });

  it('reports a slider the model gives no effect that no rule explains', () => {
    // A price sheet that charges the same for both cache-write lifetimes leaves their split nothing to do.
    const flat: Report = {
      ...report,
      models: report.models.map((m) =>
        m.id === 'kimi-k3' ? { ...m, usd_per_mtok: { ...m.usd_per_mtok, cache_write_long: m.usd_per_mtok.cache_write_short } } : m,
      ),
    };
    const problems = checkEffectReasons(flat);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.every((p) => p.includes('kimi-k3') && p.includes('long_cache_write_share'))).toBe(true);
  });
});
