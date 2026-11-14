import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/report.json';
import { percent } from './format';
import {
  breakEven,
  breakEvenSentence,
  cacheTrafficShare,
  calibrationFacts,
  scaleUp,
  scenarioRange,
  testCodeShare,
  toggleOf,
  zeroingParams,
} from './interpret';
import { type Cost, describeParams, estimate, matrix, resolveParams } from './model';
import { type Report, type ScenarioRole, parseReport } from './report';

const report = parseReport(fixture);

function withCalibration(calibration: Record<string, unknown>): Report {
  return { ...report, calibration };
}

function cost(usd: number, byCategory: Partial<Cost['usdByCategory']> = {}): Cost {
  const usdByCategory = { uncached: 0, cacheWrite: 0, cacheRead: 0, output: usd, ...byCategory };
  return { sourceTokens: 0, tokens: { uncached: 0, cacheWrite: 0, cacheRead: 0, output: 0 }, usd, usdByCategory };
}

describe('calibrationFacts', () => {
  it('reads the measured model, the port output, the coverage and the project name', () => {
    expect(calibrationFacts(report)).toEqual({
      measuredModelId: 'opus-5-5',
      portOutputTokens: 9.471e6,
      coverage: 0.4,
      projectName: 'rgw-go',
    });
  });

  it('leaves out a measured model the report does not list', () => {
    const r = withCalibration({ measurement: { model_id: 'gpt-2' } });
    expect(calibrationFacts(r).measuredModelId).toBeUndefined();
  });

  it('gives nothing for a calibration it cannot read', () => {
    expect(calibrationFacts(withCalibration({}))).toEqual({});
    expect(
      calibrationFacts(withCalibration({ measurement: 'x', coverage: { value: 'high' }, project: { name: 3 } })),
    ).toEqual({});
  });

  it('reads token volumes in the unit the measurement states, and none in a unit it does not know', () => {
    const port = { output: 45.01 };
    expect(calibrationFacts(withCalibration({ measurement: { port } })).portOutputTokens).toBe(45.01e6);
    expect(calibrationFacts(withCalibration({ measurement: { unit: 'tokens', port } })).portOutputTokens).toBe(45.01);
    expect(calibrationFacts(withCalibration({ measurement: { unit: 'kilobytes', port } })).portOutputTokens).toBeUndefined();
  });

  it('ignores a coverage outside 0 to 1', () => {
    expect(calibrationFacts(withCalibration({ coverage: { value: 37 } })).coverage).toBeUndefined();
  });
});

describe('breakEven', () => {
  const go = matrix(report, resolveParams(report, 'calibrated')).go;

  it('is exactly 1 for the measured model against itself', () => {
    expect(breakEven(go['opus-5-5']!, go['opus-5-5']!)).toBe(1);
  });

  it('is the share of its tokens a dearer model would have to need to cost the same', () => {
    const f = breakEven(go['opus-5-5']!, go['gpt-6-astra']!);
    expect(f).toBeLessThan(1);
    expect(f! * go['gpt-6-astra']!.usd).toBeCloseTo(go['opus-5-5']!.usd, 6);
  });

  it('is above 1 for a model that costs less', () => {
    expect(breakEven(cost(300), cost(200))).toBeCloseTo(1.5, 12);
  });

  it('has none when either cost is zero or not a number', () => {
    expect(breakEven(cost(0), cost(200))).toBeNull();
    expect(breakEven(cost(300), cost(0))).toBeNull();
    expect(breakEven(cost(Number.NaN), cost(200))).toBeNull();
  });
});

describe('breakEvenSentence', () => {
  it('words a break-even for a model priced on the same token counts', () => {
    expect(breakEvenSentence('M', 0.85)).toBe(`It would cost the same as M if it needed ${percent(0.15)} fewer tokens for the same work.`);
    expect(breakEvenSentence('M', 1.2)).toBe(`It would cost the same as M if it needed ${percent(0.2)} more tokens for the same work.`);
    expect(breakEvenSentence('M', 1.0001)).toBe('It would cost the same as M at the same token counts.');
    expect(breakEvenSentence('M', 0.004)).toBe('It would cost the same as M only if it needed less than 1% of the tokens for the same work.');
  });

  it('words it against the counts a row assumes when a model efficiency scales them', () => {
    expect(breakEvenSentence('M', 0.85, false)).toBe(`It would cost the same as M if it needed ${percent(0.15)} fewer tokens than this row assumes.`);
    expect(breakEvenSentence('M', 0.004, false)).toBe('It would cost the same as M only if it needed less than 1% of the tokens this row assumes.');
    expect(breakEvenSentence('M', 1.0001, false)).toBe('It would cost the same as M at the same token counts.');
  });
});

describe('scaleUp', () => {
  it('is the headline output over the measured port output', () => {
    expect(scaleUp(720e6, 45e6)).toBeCloseTo(16, 12);
  });

  it('has none without a positive port output or headline', () => {
    expect(scaleUp(720e6, undefined)).toBeUndefined();
    expect(scaleUp(720e6, 0)).toBeUndefined();
    expect(scaleUp(0, 45e6)).toBeUndefined();
    expect(scaleUp(Number.NaN, 45e6)).toBeUndefined();
  });
});

describe('cacheTrafficShare', () => {
  it('is cache reads and writes as a share of the dollars', () => {
    expect(cacheTrafficShare(cost(100, { cacheRead: 60, cacheWrite: 30, output: 10 }))).toBeCloseTo(0.9, 12);
  });

  it('is about 95% of the measured model at the calibrated ratios', () => {
    const opus = matrix(report, resolveParams(report, 'calibrated')).go['opus-5-5']!;
    expect(cacheTrafficShare(opus)).toBeGreaterThan(0.9);
    expect(cacheTrafficShare(opus)).toBeLessThan(1);
  });

  it('has none for a cost of zero', () => {
    expect(cacheTrafficShare(cost(0))).toBeNull();
  });
});

describe('testCodeShare', () => {
  it('counts ported tests whole and the new-test part of each product feature', () => {
    const params = resolveParams(report, 'calibrated');
    const root = estimate(report, 'go', 'opus-5-5', params);
    let test = 0;
    for (const c of root.children) {
      if (c.kind === 'feature') continue;
      for (const f of c.children) {
        if (f.kind !== 'feature' || f.scope !== 'headline') continue;
        if (f.featureKind === 'test') test += f.usd;
        if (f.featureKind === 'product') test += (f.usd * f.factors.newTestRatio) / (1 + f.factors.newTestRatio);
      }
    }
    expect(testCodeShare(root, params)).toBeCloseTo(test / root.headline.usd, 12);
    expect(testCodeShare(root, params)).toBeGreaterThan(0.3);
  });

  it('leaves out reading the source, which is not test work', () => {
    // One product feature of 1M source tokens, no existing tests, opus at $4 per million input.
    const component = {
      ...report.components[0]!,
      features: [{ ...report.components[0]!.features[0]!, langs: { cpp: { files: 1, code: 1, comment: 0, blank: 0, bytes: 3.6e6 } }, difficulty: 'standard' as const }],
    };
    const r: Report = { ...report, components: [component], dependencies: [] };
    const params = resolveParams(r, 'calibrated', { source_read_passes: 1, test_ratio: 1 });
    const root = estimate(r, 'go', 'opus-5-5', params);
    const reading = (1e6 * 1 * 4) / 1e6;
    expect(testCodeShare(root, params)).toBeCloseTo((0.5 * (root.headline.usd - reading)) / root.headline.usd, 9);
  });

  it('has none for a cost of zero', () => {
    const params = resolveParams(report, 'calibrated', { expansion: 0 });
    expect(testCodeShare(estimate(report, 'go', 'opus-5-5', params), params)).toBeNull();
  });
});

describe('scenarioRange', () => {
  const s = (id: string, role?: ScenarioRole): { id: string; role?: ScenarioRole } => (role ? { id, role } : { id });

  it('places each scenario by its role', () => {
    const r = scenarioRange([s('opt', 'low'), s('cal', 'central'), s('pes', 'high'), s('naive', 'reference')]);
    expect(r.low?.id).toBe('opt');
    expect(r.central?.id).toBe('cal');
    expect(r.high?.id).toBe('pes');
    expect(r.references.map((x) => x.id)).toEqual(['naive']);
    expect(r.unplaced).toEqual([]);
  });

  it('leaves a missing role empty', () => {
    const r = scenarioRange([s('cal', 'central'), s('pes', 'high'), s('naive', 'reference')]);
    expect(r.low).toBeUndefined();
    expect(r.central?.id).toBe('cal');
    expect(r.high?.id).toBe('pes');
  });

  it('places nothing without roles, and keeps every scenario', () => {
    const r = scenarioRange([s('a'), s('b'), s('c')]);
    expect([r.low, r.central, r.high]).toEqual([undefined, undefined, undefined]);
    expect(r.unplaced.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps a scenario with a role it does not know unplaced, not lost', () => {
    const odd = { id: 'odd', role: 'middle' as ScenarioRole };
    const r = scenarioRange([s('cal', 'central'), odd]);
    expect(r.unplaced.map((x) => x.id)).toEqual(['odd']);
    expect(Object.keys(r).sort()).toEqual(['central', 'references', 'unplaced']);
  });

  it('places the first of two scenarios with one role and keeps the second unplaced', () => {
    const r = scenarioRange([s('a', 'low'), s('b', 'low')]);
    expect(r.low?.id).toBe('a');
    expect(r.unplaced.map((x) => x.id)).toEqual(['b']);
  });
});

describe('toggleOf', () => {
  it('names the switch a param acts under', () => {
    expect(toggleOf('clean_break_discount')).toBe('clean_break');
    expect(toggleOf('adjacent_uplift.output')).toBe('include_adjacent');
    expect(toggleOf('overhead')).toBeUndefined();
  });

  it('names only switches the report has', () => {
    for (const p of describeParams(report, 'calibrated')) {
      const t = toggleOf(p.path);
      if (t !== undefined) expect(Object.keys(report.assumptions.toggles)).toContain(t);
    }
  });
});

describe('zeroingParams', () => {
  const zeroing = (overrides: Record<string, number>, scenario = 'calibrated') =>
    zeroingParams(report, scenario, 'go', 'opus-5-5', overrides);

  it('names a param that on its own makes the estimate $0', () => {
    expect(zeroing({ expansion: 0 })).toEqual(['expansion']);
    expect(zeroing({ expansion: 0, overhead: 0 })).toEqual(['expansion', 'overhead']);
  });

  it('does not name a param at 0 that leaves a cost', () => {
    expect(zeroing({ 'difficulty.hard': 0, cache_read_per_output: 0 })).toEqual([]);
    expect(zeroing({})).toEqual([]);
  });

  it('follows the switches in effect', () => {
    expect(zeroing({ clean_break_discount: 0 })).toEqual([]);
    expect(zeroing({ clean_break_discount: 0, 'toggles.clean_break': 1 })).toEqual(['clean_break_discount']);
  });
});
