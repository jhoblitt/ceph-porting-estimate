import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/report.json';
import { groupParams, sliderRange, toggleText } from './assumptions';
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
    expect(byId.get('models')).toEqual(['model_efficiency.fable-5-2', 'model_efficiency.opus-5-5', 'model_efficiency.gpt-6-astra']);
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

  it('leaves out empty groups', () => {
    expect(groupParams([param('rust_factor', 1.15)]).map((g) => g.id)).toEqual(['target']);
  });
});

describe('sliderRange', () => {
  it('runs a share from 0 to 1', () => {
    expect(sliderRange(param('long_context_share.output', 0.699), 0.699)).toEqual({ min: 0, max: 1, step: 0.001 });
    expect(sliderRange(param('long_cache_write_share', 0.07), 0.07)).toEqual({ min: 0, max: 1, step: 0.001 });
  });

  it('runs the clean-break discount, the share of output kept, from 0 to 1', () => {
    expect(sliderRange(param('clean_break_discount', 0.6), 0.6)).toEqual({ min: 0, max: 1, step: 0.001 });
  });

  it.each([
    ['overhead', 10.939, 50, 0.05],
    ['cache_read_per_output', 1248.91, 5000, 5],
    ['difficulty.hard', 1.5, 10, 0.01],
    ['rust_factor', 1.15, 5, 0.005],
    ['uncached_per_output', 0.007776, 0.05, 0.00005],
  ])('runs %s from 0 to a few times its value', (path, value, max, step) => {
    const r = sliderRange(param(path, value), value);
    expect(r.min).toBe(0);
    expect(r.max).toBeCloseTo(max, 12);
    expect(r.step).toBeCloseTo(step, 12);
  });

  it('reaches the scenario value when the scenario raises it', () => {
    expect(sliderRange(param('difficulty.config', 0.1, 1), 1).max).toBeGreaterThanOrEqual(1);
  });

  it('reaches a typed value beyond the usual range', () => {
    expect(sliderRange(param('overhead', 10), 700).max).toBeGreaterThanOrEqual(700);
  });

  it('gives a param with a zero baseline a usable range', () => {
    const r = sliderRange(param('source_read_passes', 0), 0);
    expect(r.max).toBeGreaterThan(0);
    expect(r.step).toBeGreaterThan(0);
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
