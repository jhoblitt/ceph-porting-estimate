import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/report.json';
import {
  SLIDER_STEPS,
  fromSlider,
  groupParams,
  provenance,
  sliderRange,
  toSlider,
  toggleText,
} from './assumptions';
import { type ParamInfo, describeParams } from './model';
import { parseReport } from './report';

const report = parseReport(fixture);
const info = describeParams(report, 'calibrated');

function param(path: string, baseline: number, scenario = baseline): ParamInfo {
  return { path, label: path, baseline, scenario, measured: false, source: 'assumption', reason: '' };
}

describe('groupParams', () => {
  const groups = groupParams(info);
  const byId = new Map(groups.map((g) => [g.id, g.params.map((p) => p.path)]));

  it('puts every param in exactly one group', () => {
    const all = groups.flatMap((g) => g.params.map((p) => p.path));
    expect(all.sort()).toEqual(info.map((p) => p.path).sort());
  });

  it('groups the params by what they describe', () => {
    expect(byId.get('measured')).toEqual([
      'expansion',
      'test_ratio',
      'overhead',
      'uncached_per_output',
      'cache_write_per_output',
      'cache_read_per_output',
      'source_read_passes',
    ]);
    expect(byId.get('difficulty')).toEqual([
      'difficulty.config',
      'difficulty.glue',
      'difficulty.standard',
      'difficulty.hard',
      'difficulty.extreme',
    ]);
    expect(byId.get('target')).toEqual(['rust_factor', 'wasm_overhead']);
    expect(byId.get('pricing')).toEqual([
      'long_cache_write_share',
      'long_context_share.uncached',
      'long_context_share.cache_write',
      'long_context_share.cache_read',
      'long_context_share.output',
    ]);
    expect(byId.get('models')).toEqual([
      'model_efficiency.fable-5-2',
      'model_efficiency.opus-5-5',
      'model_efficiency.gpt-6-astra',
      'model_efficiency.kimi-k3',
    ]);
    expect(byId.get('other')).toEqual([
      'clean_break_discount',
      'sloc_equivalent_bytes_per_line',
      'adjacent_uplift.uncached',
      'adjacent_uplift.cache_write',
      'adjacent_uplift.cache_read',
      'adjacent_uplift.output',
    ]);
  });

  it('files a param it does not know under other, so a new YAML param still appears', () => {
    const groups = groupParams([...info, param('brand_new', 2)]);
    expect(groups.at(-1)?.params.at(-1)?.path).toBe('brand_new');
  });

  it("orders the model-efficiency params as the report lists the models", () => {
    const shuffled = [...info].reverse();
    const ids = report.models.map((m) => m.id);
    const models = groupParams(shuffled, ids).find((g) => g.id === 'models');
    expect(models?.params.map((p) => p.path)).toEqual(ids.map((id) => `model_efficiency.${id}`));
  });

  it('describes each group by what it is for, not by what it holds or how it was measured', () => {
    for (const g of groupParams(info)) expect(`${g.title} ${g.description}`).not.toMatch(/measured on|rgw-go/i);
  });

  it('says what the difficulty scale is relative to, which is not standard code', () => {
    const difficulty = groupParams(info).find((g) => g.id === 'difficulty');
    expect(difficulty?.description).toMatch(/relative to the average line of the code the measured port ported/);
    expect(difficulty?.description).not.toMatch(/relative to standard/);
  });

  it('leaves out empty groups', () => {
    expect(groupParams([param('rust_factor', 1.15)]).map((g) => g.id)).toEqual(['target']);
  });
});

describe('sliderRange', () => {
  it('runs a share from 0 to 1 on a linear track, with the baseline marked', () => {
    expect(sliderRange(param('long_context_share.output', 0.699), 0.699)).toEqual({ lo: 0, hi: 1, scale: 'linear', baselineAt: 0.699 });
    expect(sliderRange(param('long_cache_write_share', 0.07), 0.07)).toEqual({ lo: 0, hi: 1, scale: 'linear', baselineAt: 0.07 });
  });

  it('runs the clean-break discount, the share of output kept, from 0 to 1', () => {
    expect(sliderRange(param('clean_break_discount', 0.6), 0.6)).toMatchObject({ lo: 0, hi: 1, scale: 'linear' });
  });

  it.each([
    ['overhead', 10.939],
    ['cache_read_per_output', 1248.91],
    ['difficulty.hard', 1.5],
    ['rust_factor', 1.15],
    ['uncached_per_output', 0.007776],
  ])('runs %s from a quarter of its baseline to four times it on a log track, baseline in the middle', (path, value) => {
    const r = sliderRange(param(path, value), value);
    expect(r.scale).toBe('log');
    expect(r.lo).toBeCloseTo(value / 4, 12);
    expect(r.hi).toBeCloseTo(value * 4, 12);
    expect(r.baselineAt).toBeCloseTo(0.5, 12);
  });

  it('widens the track to reach the scenario value', () => {
    const r = sliderRange(param('overhead', 10.939, 1), 1);
    expect(r.lo).toBe(1);
    expect(r.hi).toBeCloseTo(10.939 * 4, 12);
    expect(r.baselineAt).toBeGreaterThan(0.5);
  });

  it('widens the track to reach a typed value beyond the usual range', () => {
    expect(sliderRange(param('overhead', 10), 700).hi).toBe(700);
    expect(sliderRange(param('overhead', 10), 0.5).lo).toBe(0.5);
  });

  it('gives a param with a zero baseline a linear track from 0', () => {
    const r = sliderRange(param('source_read_passes', 0), 0);
    expect(r).toMatchObject({ lo: 0, scale: 'linear', baselineAt: 0 });
    expect(r.hi).toBeGreaterThan(0);
    expect(sliderRange(param('source_read_passes', 0, 1), 1).hi).toBeGreaterThanOrEqual(4);
  });
});

describe('slider positions', () => {
  const log = sliderRange(param('overhead', 10.939), 10.939);
  const linear = sliderRange(param('long_context_share.output', 0.699), 0.699);

  it('puts the baseline at the mark and the ends at the ends', () => {
    expect(toSlider(log, 10.939)).toBeCloseTo(SLIDER_STEPS / 2, 9);
    expect(toSlider(log, log.lo)).toBeCloseTo(0, 9);
    expect(toSlider(log, log.hi)).toBeCloseTo(SLIDER_STEPS, 9);
    expect(toSlider(linear, 0.699)).toBeCloseTo(699, 9);
  });

  it('reads the baseline back exactly at the mark, so returning to it drops the override', () => {
    expect(fromSlider(log, SLIDER_STEPS / 2, [10.939])).toBe(10.939);
    expect(fromSlider(linear, 699, [0.699])).toBe(0.699);
  });

  it('snaps to any of the given values within half a step', () => {
    expect(fromSlider(log, toSlider(log, 2) + 0.4, [10.939, 2])).toBe(2);
  });

  it('reads the ends as a quarter and four times the baseline, to three significant figures', () => {
    expect(fromSlider(log, 0, [])).toBe(2.73);
    expect(fromSlider(log, SLIDER_STEPS, [])).toBe(43.8);
    expect(fromSlider(linear, 0, [])).toBe(0);
    expect(fromSlider(linear, SLIDER_STEPS, [])).toBe(1);
  });

  it('round-trips a value to within the rounding', () => {
    for (const v of [3, 7.5, 12, 30]) expect(fromSlider(log, toSlider(log, v), []) / v).toBeCloseTo(1, 2);
  });

  it('puts 0 at the left end of a log track, which cannot place it', () => {
    expect(toSlider(log, 0)).toBe(0);
  });
});

describe('provenance', () => {
  it.each([
    [{ measured: true, source: 'calibration.yaml' }, 'rgw-go', 'Measured on rgw-go'],
    [{ measured: true, source: 'data/calibration.yaml' }, undefined, 'Measured on the calibration port'],
    [{ measured: true, source: 'data/generated/sloc.json' }, 'rgw-go', 'Measured on Ceph'],
    [{ measured: true, source: 'https://example.com' }, 'rgw-go', 'Measured'],
    [{ measured: false, source: 'calibration.yaml' }, 'rgw-go', 'Assumed'],
    [{ measured: false, source: 'assumption' }, 'rgw-go', 'Assumed'],
  ])('%j from %s → %s', (q, project, want) => {
    expect(provenance(q, project)).toBe(want);
  });
});

describe('toggleText', () => {
  it('names each toggle the report has', () => {
    for (const id of Object.keys(report.assumptions.toggles)) {
      const t = toggleText(id);
      expect(t.label).not.toBe('');
      expect(t.description).not.toBe('');
    }
  });

  it('falls back to the id for a toggle it does not know', () => {
    expect(toggleText('new_switch').label).toBe('New switch');
  });
});
