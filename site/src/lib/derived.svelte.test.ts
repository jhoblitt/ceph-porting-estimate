// @vitest-environment jsdom
// jsdom makes vitest compile runes for the client, where $derived memoises.
import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/report.json';
import { Derived } from './derived.svelte';
import { type Effect, paramEffects } from './effects';
import { testCodeShare } from './interpret';
import { describeParams, estimate, matrix, resolveParams } from './model';
import { parseReport } from './report';
import { type AppState, defaultState } from './state';

const report = parseReport(fixture);

/** A Derived over a reactive selection the test can change. */
function setup(patch: Partial<AppState> = {}) {
  let selection = $state<AppState>({ ...defaultState(report), ...patch });
  const d = new Derived(report, () => selection);
  return {
    d,
    set(next: Partial<AppState>) {
      selection = { ...selection, ...next };
    },
  };
}

/** Reads every output, so the next change can be compared against these exact objects. */
function snapshot(d: Derived) {
  return {
    params: d.params,
    root: d.root,
    matrix: d.matrix,
    paramInfo: d.paramInfo,
    scenarioTotals: d.scenarioTotals,
    toggles: d.toggles,
  };
}

describe('Derived', () => {
  it('turns the selection into the model outputs', () => {
    const { d } = setup({ target: 'rust', model: 'fable-5-2', scenario: 'pessimistic', overrides: { overhead: 3 } });
    const params = resolveParams(report, 'pessimistic', { overhead: 3 });
    expect(d.params).toEqual(params);
    expect(d.root).toEqual(estimate(report, 'rust', 'fable-5-2', params));
    expect(d.matrix).toEqual(matrix(report, params));
    expect(d.paramInfo).toEqual(describeParams(report, 'pessimistic'));
    expect(d.model.id).toBe('fable-5-2');
    expect(d.scenario.label).toBe('Pessimistic');
  });

  it('on a new target, recomputes the estimate and the scenario totals only', () => {
    const { d, set } = setup();
    const before = snapshot(d);
    set({ target: 'wasm' });
    expect(d.params).toBe(before.params);
    expect(d.matrix).toBe(before.matrix);
    expect(d.paramInfo).toBe(before.paramInfo);
    expect(d.toggles).toBe(before.toggles);
    expect(d.root).not.toBe(before.root);
    expect(d.root.headline.usd).toBeGreaterThan(before.root.headline.usd);
    expect(d.scenarioTotals).not.toBe(before.scenarioTotals);
  });

  it('on a new model, recomputes the estimate and the scenario totals only', () => {
    const { d, set } = setup();
    const before = snapshot(d);
    set({ model: 'gpt-6-astra' });
    expect(d.params).toBe(before.params);
    expect(d.matrix).toBe(before.matrix);
    expect(d.paramInfo).toBe(before.paramInfo);
    expect(d.root).not.toBe(before.root);
    expect(d.root.headline.usd).toBeCloseTo(d.matrix.go['gpt-6-astra']!.usd, 6);
    expect(d.scenarioTotals).not.toBe(before.scenarioTotals);
  });

  it('on a new scenario, recomputes everything that depends on params', () => {
    const { d, set } = setup();
    const before = snapshot(d);
    set({ scenario: 'naive' });
    expect(d.params).not.toBe(before.params);
    expect(d.paramInfo).not.toBe(before.paramInfo);
    expect(d.root.headline.usd).toBeLessThan(before.root.headline.usd);
    expect(d.matrix).not.toBe(before.matrix);
    expect(d.scenarioTotals.find((s) => s.current)?.id).toBe('naive');
  });

  it('on an override, recomputes params and costs but not the scenario description', () => {
    const { d, set } = setup();
    const before = snapshot(d);
    set({ overrides: { overhead: 20 } });
    expect(d.paramInfo).toBe(before.paramInfo);
    expect(d.params).not.toBe(before.params);
    expect(d.params.overhead).toBe(20);
    expect(d.root.headline.usd).toBeGreaterThan(before.root.headline.usd);
    expect(d.matrix.go['opus-5-5']!.usd).toBeCloseTo(d.root.headline.usd, 6);
  });

  it('ignores a new overrides object with the same contents', () => {
    const { d, set } = setup({ overrides: { overhead: 20, expansion: 2 } });
    const before = snapshot(d);
    set({ overrides: { expansion: 2, overhead: 20 } });
    expect(d.params).toBe(before.params);
    expect(d.root).toBe(before.root);
    expect(d.matrix).toBe(before.matrix);
  });

  it('scenarioTotals applies the overrides to the current scenario only', () => {
    const { d, set } = setup();
    const presets = d.scenarioTotals.map((s) => s.preset.usd);
    set({ overrides: { overhead: 20 } });
    const totals = d.scenarioTotals;
    expect(totals.map((s) => s.id)).toEqual(Object.keys(report.assumptions.scenarios));
    expect(totals.map((s) => s.preset.usd)).toEqual(presets);
    for (const s of totals) {
      if (s.id === 'calibrated') {
        expect(s.current).toBe(true);
        expect(s.custom).toBe(true);
        expect(s.cost.usd).toBeCloseTo(d.root.headline.usd, 6);
        expect(s.cost.usd).toBeGreaterThan(s.preset.usd);
      } else {
        expect(s.current).toBe(false);
        expect(s.custom).toBe(false);
        expect(s.cost).toBe(s.preset);
      }
    }
  });

  it('scenarioTotals marks nothing custom without overrides', () => {
    const { d } = setup();
    for (const s of d.scenarioTotals) {
      expect(s.custom).toBe(false);
      expect(s.cost).toBe(s.preset);
    }
    expect(d.customised).toBe(false);
  });

  describe('fromPublished', () => {
    /** The current scenario as published, computed apart from the Derived under test. */
    const published = (scenario = 'calibrated') =>
      estimate(report, 'go', 'opus-5-5', resolveParams(report, scenario)).headline.usd;

    it('reports no difference with nothing changed', () => {
      const { d } = setup();
      expect(d.fromPublished).toBeUndefined();
    });

    it('gives the published figure and a positive change for a change that raises the figure', () => {
      const { d, set } = setup();
      set({ overrides: { overhead: 20 } });
      const p = published();
      expect(d.fromPublished?.published).toBe(p);
      expect(d.fromPublished?.change).toBeGreaterThan(0);
      expect(d.fromPublished?.change).toBeCloseTo((d.root.headline.usd - p) / p, 12);
    });

    it('gives a negative change for a change that lowers the figure', () => {
      const { d } = setup({ overrides: { overhead: 1 } });
      const p = published();
      expect(d.fromPublished?.change).toBeLessThan(0);
      expect(d.fromPublished?.change).toBeCloseTo((d.root.headline.usd - p) / p, 12);
    });

    it('gives no change, but still a difference, for a change that leaves the figure as it was', () => {
      // The discount acts only while the clean break is on, and the scenario has it off.
      const { d } = setup({ overrides: { clean_break_discount: 0.5 } });
      expect(d.customised).toBe(true);
      expect(d.fromPublished).toEqual({ published: published(), change: 0 });
    });

    it('measures the selected target and model against their own published figure, and follows a new selection', () => {
      const { d, set } = setup({ target: 'rust', model: 'fable-5-2', overrides: { overhead: 20 } });
      const own = (target: 'rust' | 'wasm', model: string) =>
        estimate(report, target, model, resolveParams(report, 'calibrated')).headline.usd;
      expect(d.fromPublished?.published).toBe(own('rust', 'fable-5-2'));
      expect(d.fromPublished?.published).not.toBe(published());
      expect(d.fromPublished?.change).toBeCloseTo((d.root.headline.usd - own('rust', 'fable-5-2')) / own('rust', 'fable-5-2'), 12);
      set({ target: 'wasm', model: 'gpt-6-astra' });
      expect(d.fromPublished?.published).toBe(own('wasm', 'gpt-6-astra'));
      expect(d.fromPublished?.change).toBeCloseTo((d.root.headline.usd - own('wasm', 'gpt-6-astra')) / own('wasm', 'gpt-6-astra'), 12);
    });

    it('measures a reference scenario against itself as published', () => {
      const { d } = setup({ scenario: 'naive', overrides: { overhead: 20 } });
      const p = published('naive');
      expect(d.fromPublished?.published).toBe(p);
      expect(d.fromPublished?.change).toBeCloseTo((d.root.headline.usd - p) / p, 12);
    });

    it('gives no percentage against a published figure of $0', () => {
      const naive = report.assumptions.scenarios['naive']!;
      const zeroed = { ...naive, overrides: { ...naive.overrides, expansion: 0, source_read_passes: 0 } };
      const other = { ...report, assumptions: { ...report.assumptions, scenarios: { ...report.assumptions.scenarios, zeroed } } };
      const d = new Derived(other, () => ({ ...defaultState(other), scenario: 'zeroed', overrides: { overhead: 20 } }));
      expect(d.fromPublished).toEqual({ published: 0, change: null });
    });
  });

  it('reports each toggle with its scenario value and the value in effect', () => {
    const { d, set } = setup({ scenario: 'pessimistic' });
    expect(d.toggles).toEqual([
      { id: 'include_adjacent', key: 'toggles.include_adjacent', scenario: true, value: true },
      { id: 'clean_break', key: 'toggles.clean_break', scenario: false, value: false },
    ]);
    set({ overrides: { 'toggles.include_adjacent': 0, 'toggles.clean_break': 1 } });
    expect(d.toggles.map((t) => [t.id, t.value])).toEqual([
      ['include_adjacent', false],
      ['clean_break', true],
    ]);
    expect(d.params.toggles).toEqual({ includeAdjacent: false, cleanBreak: true });
    expect(d.customised).toBe(true);
  });

  it('summarises the scope from the estimate', () => {
    const { d } = setup();
    const { scope } = d;
    expect(scope.ceph.headline.code).toBe(186_204 + 1_210 + 41_388 + 52_310 + 4_022 + 148_920 + 97_644 + 98_204 + 30_112 + 61_022 + 1_000);
    expect(scope.ceph.notPorted.code).toBe(188);
    expect(scope.dependencies?.headline.sloc.code).toBe(6_000);
    expect(scope.dependenciesWithWork).toBe(1);
    expect(scope.shown.map((c) => c.name)).toEqual(['Integration suites']);
    expect(scope.notPortedByGroup).toEqual([{ id: 'rados', name: 'RADOS core', code: 188 }]);
  });

  it('gives each param its value in effect', () => {
    const { d, set } = setup({ scenario: 'pessimistic' });
    expect(d.values.get('difficulty.hard')).toBe(2);
    expect(d.values.get('overhead')).toBeCloseTo(4.1 * 1.1971, 12);
    set({ overrides: { 'difficulty.hard': 2.5 } });
    expect(d.values.get('difficulty.hard')).toBe(2.5);
    expect(d.values.size).toBe(d.paramInfo.length);
  });

  it('says whether every model is priced on the same token volumes', () => {
    const { d, set } = setup();
    expect(d.sameVolumes).toBe(true);
    set({ overrides: { 'model_efficiency.gpt-6-astra': 1.3 } });
    expect(d.sameVolumes).toBe(false);
  });

  it('lists the long-context billing of models that have long-context prices', () => {
    const { d } = setup({ scenario: 'pessimistic' });
    expect(d.longContext).toEqual([
      {
        model: report.models[2],
        threshold: 272_000,
        shares: { uncached: 0.55, cacheWrite: 0.748, cacheRead: 0.797, output: 0.699 },
      },
    ]);
  });

  it('draws the per-model dollar bars on one scale, so their lengths are in proportion to the totals', () => {
    const { d, set } = setup();
    set({ target: 'rust' });
    const bars = d.dollarBars;
    const totals = bars.map((b) => b.cost.usd);
    const max = Math.max(...totals);
    expect(d.maxModelUsd).toBe(max);
    for (const b of bars) {
      expect(b.length).toBeCloseTo(b.cost.usd / max, 12);
      const segmentSum = b.segments.uncached + b.segments.cacheWrite + b.segments.cacheRead + b.segments.output;
      expect(segmentSum).toBeCloseTo(b.length, 12);
      expect(b.segments.cacheRead).toBeCloseTo(b.cost.usdByCategory.cacheRead / max, 12);
      // Within the bar, each segment's share of the bar is its share of the model's dollars.
      expect(b.shares.cacheRead * b.length).toBeCloseTo(b.segments.cacheRead, 12);
    }
    expect(Math.max(...bars.map((b) => b.length))).toBe(1);
    // Two bars' lengths stand in the ratio of their totals.
    expect(bars[0]!.length / bars[2]!.length).toBeCloseTo(totals[0]! / totals[2]!, 12);
    // The axis ticks sit on the same scale.
    for (const t of d.dollarAxis) expect(t.at).toBeCloseTo(t.value / max, 12);
    expect(d.dollarAxis[0]).toEqual({ value: 0, at: 0 });
    expect(d.dollarAxis.at(-1)!.at).toBeLessThanOrEqual(1);
  });

  it('gives empty bars rather than NaN when every model costs nothing', () => {
    const { d } = setup({ scenario: 'naive', overrides: { expansion: 0, source_read_passes: 0 } });
    expect(d.maxModelUsd).toBe(0);
    for (const b of d.dollarBars) {
      expect(b.length).toBe(0);
      expect(Object.values(b.segments)).toEqual([0, 0, 0, 0]);
    }
  });

  it('gives the token and dollar splits of the headline', () => {
    const { d } = setup();
    const t = d.root.headline.tokens;
    expect(d.tokenTotal).toBeCloseTo(t.uncached + t.cacheWrite + t.cacheRead + t.output, 3);
    expect(d.tokenShares.cacheRead).toBeCloseTo(t.cacheRead / d.tokenTotal, 12);
    const u = d.root.headline.usdByCategory;
    expect(d.dollarShares.output).toBeCloseTo(u.output / d.root.headline.usd, 12);
  });

  it('counts the changed assumptions once', () => {
    const { d, set } = setup();
    expect(d.changedCount).toBe(0);
    set({ overrides: { overhead: 2, 'toggles.clean_break': 1 } });
    expect(d.changedCount).toBe(2);
  });

  it('reads a matrix cell, and fails loudly on one the matrix lacks', () => {
    const { d } = setup();
    expect(d.matrixCell('wasm', 'gpt-6-astra')).toBe(d.matrix.wasm['gpt-6-astra']);
    expect(() => d.matrixCell('go', 'gpt-2')).toThrow(/gpt-2/);
  });

  it('names the measured model and each model\'s break-even against it at the current target', () => {
    const { d, set } = setup({ target: 'rust' });
    expect(d.measuredModel?.id).toBe('opus-5-5');
    expect(d.breakEvens.get('opus-5-5')).toBe(1);
    const astra = d.breakEvens.get('gpt-6-astra')!;
    expect(astra).toBeLessThan(1);
    expect(astra * d.matrix.rust['gpt-6-astra']!.usd).toBeCloseTo(d.matrix.rust['opus-5-5']!.usd, 6);
    // A model that costs less could need more tokens.
    set({ overrides: { 'model_efficiency.kimi-k3': 0.5 } });
    expect(d.breakEvens.get('kimi-k3')).toBeGreaterThan(1);
    expect(d.volumeRatios.get('kimi-k3')).toBe(0.5);
    expect(d.volumeRatios.get('gpt-6-astra')).toBe(1);
  });

  it('has no measured model or break-evens when the data names none it knows', () => {
    const other = { ...report, calibration: { measurement: { model_id: 'gpt-2' } } };
    const d = new Derived(other, () => defaultState(other));
    expect(d.measuredModel).toBeUndefined();
    expect(d.breakEvens.size).toBe(0);
    expect(d.cacheShareModel.id).toBe(d.modelId);
  });

  it('scales the measured port up to the headline by output tokens', () => {
    const { d } = setup();
    expect(d.scaleUp).toBeCloseTo(d.root.headline.tokens.output / 9.471e6, 12);
  });

  it("gives the measured model's cache-traffic share, whichever model is selected", () => {
    const { d, set } = setup();
    const opus = d.matrix.go['opus-5-5']!;
    set({ model: 'gpt-6-astra' });
    expect(d.cacheShareModel.id).toBe('opus-5-5');
    expect(d.cacheShare).toBeCloseTo((opus.usdByCategory.cacheRead + opus.usdByCategory.cacheWrite) / opus.usd, 12);
  });

  it('gives the test-code share of the headline', () => {
    const { d } = setup();
    expect(d.testShare).toBeCloseTo(testCodeShare(d.root, d.params)!, 12);
  });

  it('places the scenarios by role', () => {
    const { d } = setup();
    expect(d.range.low?.id).toBe('optimistic');
    expect(d.range.central?.id).toBe('calibrated');
    expect(d.range.high?.id).toBe('pessimistic');
    expect(d.range.references.map((s) => s.id)).toEqual(['naive']);
    expect(d.range.central?.current).toBe(true);
    expect(d.scenarioTotals.map((s) => s.role)).toEqual(['low', 'central', 'high', 'reference']);
  });

  it('keeps every scenario when one has no role', () => {
    const { optimistic, ...rest } = report.assumptions.scenarios;
    const { role: _role, ...noRole } = optimistic!;
    const other = { ...report, assumptions: { ...report.assumptions, scenarios: { optimistic: noRole, ...rest } } };
    const d = new Derived(other, () => defaultState(other));
    expect(d.range.low).toBeUndefined();
    expect(d.range.high?.id).toBe('pessimistic');
    expect(d.range.unplaced.map((s) => s.id)).toEqual(['optimistic']);
  });

  it('names a param that alone zeroes the estimate, and one that has no effect where it is', () => {
    const { d, set } = setup();
    set({ overrides: { expansion: 0, test_ratio: 0.1 } });
    expect(d.paramNotes.get('expansion')).toEqual({ kind: 'zeroes' });
    expect(d.existingTestRatio).toBeGreaterThan(0.1);
    expect(d.paramNotes.get('test_ratio')).toEqual({ kind: 'below', threshold: d.existingTestRatio });
    expect(d.paramNotes.has('overhead')).toBe(false);
  });

  it("gives each slider its effect on the headline, as the full report's model does, and follows the selection", () => {
    const { d, set } = setup();
    // The derived layer evaluates a compact report, so a small effect's reach may differ in its last bits.
    const rounded = (effects: Map<string, Effect>) =>
      [...effects].map(([path, e]) =>
        e.kind === 'small' ? [path, { ...e, from: e.from.toPrecision(9), to: e.to.toPrecision(9) }] : [path, e],
      );
    const onFull = (s: Partial<AppState>) => {
      const sel = { ...defaultState(report), ...s };
      return paramEffects({
        report,
        scenarioId: sel.scenario,
        target: sel.target,
        modelId: sel.model,
        overrides: sel.overrides,
        info: describeParams(report, sel.scenario),
      });
    };
    expect(rounded(d.paramEffects)).toEqual(rounded(onFull({})));
    expect(d.paramEffects.get('clean_break_discount')).toEqual({ kind: 'none', reason: { kind: 'switch', toggle: 'clean_break' } });
    const next = { target: 'wasm' as const, model: 'gpt-6-astra', scenario: 'pessimistic', overrides: { 'toggles.clean_break': 1 } };
    set(next);
    expect(rounded(d.paramEffects)).toEqual(rounded(onFull(next)));
    expect(d.paramEffects.get('clean_break_discount')?.kind).toBe('live');
  });

  it('gives each component shown outside the headline its cost', () => {
    const { d } = setup();
    expect(d.scope.shown.map((c) => c.id)).toEqual(['qa']);
    expect(d.scope.shown[0]!.usd).toBeCloseTo(d.root.shown.usd, 9);
  });

  it('lists every model at the current target', () => {
    const { d, set } = setup();
    set({ target: 'rust' });
    expect(d.byModel.map((m) => m.model.id)).toEqual(['fable-5-2', 'opus-5-5', 'gpt-6-astra', 'kimi-k3']);
    for (const m of d.byModel) expect(m.cost).toBe(d.matrix.rust[m.model.id]);
  });
});
