import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/report.json';
import { type Origin, difficultyScale, difficultyText, inputText, paramOrigin } from './chain';
import { describeParams, resolveParams } from './model';
import { type Difficulty, type Report, parseReport } from './report';

const report = parseReport(fixture);

/** The fixture with the calibration's ported mix, as the real data has it. */
function withMix(mix: unknown = {}): Report {
  return {
    ...report,
    calibration: {
      ...report.calibration,
      ported_mix: {
        relative_difficulty: { config: 0.1, glue: 0.5, standard: 1, hard: 1.5, extreme: 2 },
        mean_relative_difficulty: 1.1694,
        ...(mix as object),
      },
    },
  };
}

/** Everything the detail needs for one scenario, with a reader's overrides on top. */
function under(r: Report, scenario: string, overrides: Record<string, number> = {}) {
  const params = resolveParams(r, scenario, overrides);
  const info = describeParams(r, scenario);
  const origin = (path: string): Origin => paramOrigin(path, info, overrides);
  const difficulty = (cls: Difficulty) => difficultyText(r, cls, params.difficulty[cls], origin(`difficulty.${cls}`));
  return { params, origin, difficulty, input: () => inputText(r, params, 'Claude Opus 5.5', origin) };
}

const NORMALISED =
  "On the baseline scale 1 is the average work per line of what rgw-go ported: the classes are weighed against one another, from configuration 0.1 to extreme 2 with standard 1, and each is divided by that mix's average, 1.17, which makes";

describe('difficultyScale', () => {
  it('reads the relative scale, its mean over the ported mix and the project', () => {
    expect(difficultyScale(withMix())).toEqual({
      relative: { config: 0.1, glue: 0.5, standard: 1, hard: 1.5, extreme: 2 },
      mean: 1.1694,
      project: 'rgw-go',
    });
  });

  it('is null without a usable mix', () => {
    expect(difficultyScale(report)).toBeNull();
    expect(difficultyScale(withMix({ mean_relative_difficulty: 0 }))).toBeNull();
    expect(difficultyScale(withMix({ relative_difficulty: { standard: 'one' } }))).toBeNull();
  });
});

describe('paramOrigin', () => {
  it('names a reader override first, then a scenario that moved the value', () => {
    const info = describeParams(report, 'pessimistic');
    expect(paramOrigin('difficulty.hard', info, {})).toBe('scenario');
    expect(paramOrigin('difficulty.hard', info, { 'difficulty.hard': 2.5 })).toBe('yours');
    expect(paramOrigin('difficulty.standard', info, {})).toBe('baseline');
  });
});

describe('difficultyText', () => {
  it('describes the baseline scale under the central scenario', () => {
    const t = under(withMix(), 'calibrated').difficulty('hard');
    expect(t.factor).toBe(`× ${report.assumptions.params.difficulty.hard.value}`);
    expect(t.detail).toBe(`${NORMALISED} hard × ${report.assumptions.params.difficulty.hard.value}.`);
    expect(t.step).toBe('Work per line for this class, where 1 is the baseline average of what rgw-go ported.');
  });

  it('says a scenario moved the factor, under the optimistic and pessimistic scenarios', () => {
    const optimistic = under(withMix(), 'optimistic');
    const hard = optimistic.params.difficulty.hard;
    expect(optimistic.difficulty('hard').factor).toBe(`× ${Number(hard.toPrecision(6))}`);
    expect(optimistic.difficulty('hard').detail).toMatch(/which makes hard × 1\.5\. This scenario sets × 1\.24995 instead\.$/);
    expect(optimistic.difficulty('standard').detail).not.toMatch(/instead/);
    expect(under(withMix(), 'pessimistic').difficulty('extreme').detail).toMatch(/This scenario sets × 3 instead\.$/);
  });

  it('says every class is moved under the naive scenario, configuration included', () => {
    const naive = under(withMix(), 'naive');
    expect(naive.difficulty('config').factor).toBe('× 1');
    expect(naive.difficulty('config').detail).toMatch(/which makes configuration × 0\.1\. This scenario sets × 1 instead\.$/);
  });

  it('says the reader moved it, over a scenario', () => {
    const t = under(withMix(), 'pessimistic', { 'difficulty.hard': 2.5 }).difficulty('hard');
    expect(t.factor).toBe('× 2.5');
    expect(t.detail).toMatch(/You set × 2\.5 instead\.$/);
  });

  it('falls back to the factor and the baseline without a mix', () => {
    expect(under(report, 'calibrated').difficulty('hard')).toEqual({
      factor: '× 1.5',
      detail: '',
      step: 'Work per line for this difficulty class.',
    });
    expect(under(report, 'pessimistic').difficulty('hard').detail).toBe('The baseline is × 1.5. This scenario sets × 2 instead.');
  });
});

describe('inputText', () => {
  it('words input as a modelling choice at the measured ratios under the central scenario', () => {
    expect(under(report, 'calibrated').input()).toBe(
      "Input is taken as proportional to output, at the ratios measured over the whole of rgw-go: each output token brings 0.0078 uncached, 25.3 cache-write and 1,250 cache-read tokens. That input grows in proportion to output is a modelling choice, not a measurement. Claude Opus 5.5's price sheet turns the four into dollars.",
    );
  });

  it('says when the scenario has moved the ratios (optimistic)', () => {
    expect(under(report, 'optimistic').input()).toBe(
      "Input is taken as proportional to output, at this scenario's ratios: each output token brings 0.0078 uncached, 25.3 cache-write and 937 cache-read tokens. The ratios measured over the whole of rgw-go are 0.0078, 25.3 and 1,250. That input grows in proportion to output is a modelling choice, not a measurement. Claude Opus 5.5's price sheet turns the four into dollars.",
    );
  });

  it('adds the work around the port when that switch is on (pessimistic)', () => {
    expect(under(report, 'pessimistic').input()).toMatch(
      /With the work around the port included, each input category grows by its own share: uncached input by 14%, cache writes by 16%, and cache reads by 9%, as output did by 30% above\. Claude Opus 5\.5's price sheet/,
    );
  });

  it('under the naive scenario, says no input follows output and uncached input is the source read once', () => {
    expect(under(report, 'naive').input()).toBe(
      "No input follows output here: this scenario sets the uncached, cache-write and cache-read ratios to 0. The ratios measured over the whole of rgw-go are 0.0078, 25.3 and 1,250. Uncached input is reading the source once, as the tokens after difficulty and the target language, which does not grow with output. Claude Opus 5.5's price sheet turns the four into dollars.",
    );
  });

  it('says "your ratios" when the reader moved them, and counts their source reads', () => {
    const text = under(report, 'calibrated', { cache_read_per_output: 600, source_read_passes: 2 }).input();
    expect(text).toMatch(/^Input is taken as proportional to output, at your ratios: each output token brings 0\.0078 uncached, 25\.3 cache-write and 600 cache-read tokens\./);
    expect(text).toContain('Uncached input also includes reading the source 2 times');
    expect(under(report, 'optimistic', { cache_write_per_output: 10 }).input()).toMatch(
      /at this scenario's ratios with your changes:/,
    );
  });

  it('under the naive scenario with the work around the port, says only uncached input grows', () => {
    const text = under(report, 'naive', { 'toggles.include_adjacent': 1 }).input();
    expect(text).toContain('With the work around the port included, its input grows: uncached input by 14%, as output did by 30% above.');
    expect(text).not.toMatch(/cache writes by|cache reads by/);
  });

  it('is unchanged by a clean break, which scales output and not the ratios', () => {
    const plain = under(report, 'calibrated').input();
    expect(under(report, 'calibrated', { 'toggles.clean_break': 1 }).input()).toBe(plain);
  });

  it('names no project the data does not', () => {
    expect(under({ ...report, calibration: {} }, 'calibrated').input()).toMatch(
      /^Input is taken as proportional to output, at the measured ratios:/,
    );
  });
});
