import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/report.json';
import { canonicalOverrides, withOverride, withoutOverride } from './overrides';
import { parseReport } from './report';

const report = parseReport(fixture);

describe('withOverride', () => {
  it('stores a value that differs from the scenario', () => {
    expect(withOverride({}, 'overhead', 12, 10.939)).toEqual({ overhead: 12 });
  });

  it('drops a value equal to the scenario, leaving the others', () => {
    expect(withOverride({ overhead: 12, expansion: 2 }, 'overhead', 10.939, 10.939)).toEqual({ expansion: 2 });
  });

  it('treats a value within rounding of the scenario as equal', () => {
    expect(withOverride({}, 'difficulty.glue', 0.1 + 0.2 + 0.2, 0.5)).toEqual({});
  });

  it('clamps a typed value to what the model uses', () => {
    expect(withOverride({}, 'overhead', -5, 4.1)).toEqual({ overhead: 0 });
    expect(withOverride({}, 'long_context_share.output', 1.5, 0.3)).toEqual({ 'long_context_share.output': 1 });
  });

  it('drops a clamped value that lands on the scenario', () => {
    expect(withOverride({}, 'long_context_share.output', 1.5, 1)).toEqual({});
    expect(withOverride({}, 'source_read_passes', -2, 0)).toEqual({});
  });

  it('does not change the object it was given', () => {
    const before = { overhead: 12 };
    withOverride(before, 'expansion', 3, 1.2);
    expect(before).toEqual({ overhead: 12 });
  });

  it('removes one override', () => {
    expect(withoutOverride({ overhead: 12, expansion: 2 }, 'overhead')).toEqual({ expansion: 2 });
  });
});

describe('canonicalOverrides', () => {
  it('keeps overrides that differ from the scenario', () => {
    expect(canonicalOverrides(report, 'calibrated', { overhead: 2, 'toggles.clean_break': 1 })).toEqual({
      overhead: 2,
      'toggles.clean_break': 1,
    });
  });

  it("drops overrides equal to the scenario's own values, toggles included", () => {
    // pessimistic sets difficulty.hard to 2 and turns include_adjacent on.
    expect(
      canonicalOverrides(report, 'pessimistic', { 'difficulty.hard': 2, 'toggles.include_adjacent': 1, expansion: 1.5 }),
    ).toEqual({ expansion: 1.5 });
  });

  it('compares against the scaled scenario value', () => {
    // pessimistic scales overhead 4.1 by 1.1971, phase 2's rate over all phases'.
    expect(canonicalOverrides(report, 'pessimistic', { overhead: 4.1 * 1.1971 })).toEqual({});
  });

  it('clamps to what the model uses', () => {
    expect(canonicalOverrides(report, 'calibrated', { overhead: -5, 'long_context_share.cache_read': 3 })).toEqual({
      overhead: 0,
      'long_context_share.cache_read': 1,
    });
  });
});
