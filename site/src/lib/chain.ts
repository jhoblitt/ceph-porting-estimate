// The words around a feature's chain from size to cost that depend on the
// data and on the parameters in effect: what the difficulty factor is
// relative to (the baseline scale is normalised to the calibration project's
// ported mix, docs/cost-model.md "Difficulty normalisation"), and what input
// a feature's output brings (proportional at measured ratios, by choice, plus
// any reading of the source; docs/cost-model.md "Why this shape" and
// "Formulas"). Every sentence is worded from the values in effect and from
// how they differ from the baseline, never from a scenario's id, so it holds
// under any scenario, override or switch.

import { decimal, list, paramValue, percent } from './format';
import type { ParamInfo, Params } from './model';
import type { Difficulty, Report } from './report';

const CLASSES: readonly Difficulty[] = ['config', 'glue', 'standard', 'hard', 'extreme'];

export interface DifficultyScale {
  /** Each class's weight relative to the others, before normalising. */
  relative: Record<Difficulty, number>;
  /** That scale's average over what the calibration project ported. */
  mean: number;
  project?: string;
}

function field(node: unknown, key: string): unknown {
  return typeof node === 'object' && node !== null && Object.hasOwn(node, key)
    ? (node as Record<string, unknown>)[key]
    : undefined;
}

const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

function projectName(report: Report): string {
  const name = field(field(report.calibration, 'project'), 'name');
  return typeof name === 'string' ? name : '';
}

/** The relative scale and its mean from `calibration.ported_mix`; null when the data has no usable one. */
export function difficultyScale(report: Report): DifficultyScale | null {
  const mix = field(report.calibration, 'ported_mix');
  const mean = field(mix, 'mean_relative_difficulty');
  const rel = field(mix, 'relative_difficulty');
  if (!positive(mean)) return null;
  const relative = {} as Record<Difficulty, number>;
  for (const c of CLASSES) {
    const v = field(rel, c);
    if (!positive(v)) return null;
    relative[c] = v;
  }
  const project = projectName(report);
  return { relative, mean, ...(project !== '' ? { project } : {}) };
}

/** Where a parameter's value in effect comes from. */
export type Origin = 'baseline' | 'scenario' | 'yours';

/** A reader's override wins; otherwise the scenario, where it moved the value off the baseline. */
export function paramOrigin(path: string, info: readonly ParamInfo[], overrides: Record<string, number>): Origin {
  if (Object.hasOwn(overrides, path)) return 'yours';
  const p = info.find((x) => x.path === path);
  return p && p.scenario !== p.baseline ? 'scenario' : 'baseline';
}

export interface DifficultyText {
  /** The factor in effect, e.g. "× 1.2827". */
  factor: string;
  /** What the baseline scale is relative to, and who moved the factor off it; empty when there is nothing to say. */
  detail: string;
  /** The chain step's note. */
  step: string;
}

const CLASS_WORDS: Record<Difficulty, string> = {
  config: 'configuration',
  glue: 'glue',
  standard: 'standard',
  hard: 'hard',
  extreme: 'extreme',
};

/** "You set" or "This scenario sets", for whoever moved a value off its baseline. */
function setter(origins: readonly Origin[]): string {
  if (origins.every((o) => o === 'yours')) return 'You set';
  if (origins.every((o) => o === 'scenario')) return 'This scenario sets';
  return 'This scenario and your changes set';
}

/**
 * The difficulty factor of class `cls` in effect, and what it means. The
 * baseline scale is described as the data gives it; a factor moved off the
 * baseline says who moved it.
 */
export function difficultyText(report: Report, cls: Difficulty, factor: number, origin: Origin): DifficultyText {
  const baseline = report.assumptions.params.difficulty[cls].value;
  const moved = factor === baseline ? '' : `${setter([origin])} × ${decimal(factor)} instead.`;
  const scale = difficultyScale(report);
  if (!scale) {
    return {
      factor: `× ${decimal(factor)}`,
      detail: moved ? `The baseline is × ${decimal(baseline)}. ${moved}` : '',
      step: 'Work per line for this difficulty class.',
    };
  }
  const what = scale.project ? `what ${scale.project} ported` : 'what the calibration project ported';
  const r = scale.relative;
  const detail =
    `On the baseline scale 1 is the average work per line of ${what}: the classes are weighed against one another, ` +
    `from configuration ${decimal(r.config)} to extreme ${decimal(r.extreme)} with standard ${decimal(r.standard)}, and ` +
    `each is divided by that mix's average, ${paramValue(scale.mean)}, which makes ${CLASS_WORDS[cls]} × ${decimal(baseline)}.`;
  return {
    factor: `× ${decimal(factor)}`,
    detail: moved ? `${detail} ${moved}` : detail,
    step: `Work per line for this class, where 1 is the baseline average of ${what}.`,
  };
}

const RATIOS = [
  ['uncached_per_output', 'uncachedPerOutput'],
  ['cache_write_per_output', 'cacheWritePerOutput'],
  ['cache_read_per_output', 'cacheReadPerOutput'],
] as const;

/** "your ratios", "this scenario's ratios", or both, for the ratios moved off the baseline. */
function whoseRatios(origins: readonly Origin[]): string {
  if (origins.every((o) => o === 'yours')) return 'your ratios';
  if (origins.every((o) => o === 'scenario')) return "this scenario's ratios";
  return "this scenario's ratios with your changes";
}

/**
 * What input a feature's output brings under the parameters in effect: the
 * part proportional to output (a modelling choice, at ratios measured on the
 * calibration project unless moved), any uncached reading of the source on
 * top (W × p, which does not follow output), and the work around the port
 * when that switch is on.
 */
export function inputText(report: Report, params: Params, modelName: string, origin: (path: string) => Origin): string {
  const P = report.assumptions.params;
  const project = projectName(report);
  const now = RATIOS.map(([, key]) => params[key]);
  const base = RATIOS.map(([path]) => P[path].value);
  const measured = RATIOS.every(([path]) => P[path].measured);
  const baselineWords = !measured
    ? 'the baseline ratios'
    : project
      ? `the ratios measured over the whole of ${project}`
      : 'the measured ratios';
  const changed = RATIOS.flatMap(([path], i) => (now[i] !== base[i] ? [origin(path)] : []));
  const [u, w, r] = now.map(paramValue) as [string, string, string];
  const [bu, bw, br] = base.map(paramValue) as [string, string, string];
  const baseline = `${baselineWords.charAt(0).toUpperCase()}${baselineWords.slice(1)} are ${bu}, ${bw} and ${br}.`;

  const parts: string[] = [];
  const proportional = now.some((v) => v > 0);
  if (proportional) {
    const at = changed.length > 0 ? whoseRatios(changed) : baselineWords;
    parts.push(
      `Input is taken as proportional to output, at ${at}: each output token brings ${u} uncached, ${w} cache-write and ${r} cache-read tokens.`,
    );
    if (changed.length > 0) parts.push(baseline);
    parts.push('That input grows in proportion to output is a modelling choice, not a measurement.');
  } else {
    const who = changed.length > 0 ? setter(changed).toLowerCase() : 'the data sets';
    parts.push(`No input follows output here: ${who} the uncached, cache-write and cache-read ratios to 0.`);
    if (changed.length > 0) parts.push(baseline);
  }
  const p = params.sourceReadPasses;
  if (p > 0) {
    const times = p === 1 ? 'once' : `${paramValue(p)} times`;
    parts.push(
      `Uncached input ${proportional ? 'also includes' : 'is'} reading the source ${times}, as the tokens after difficulty and the target language, which does not grow with output.`,
    );
  }
  if (params.toggles.includeAdjacent) {
    // Only a category that is there to grow is said to: under a scenario with no cache traffic, none is.
    const A = params.adjacentUplift;
    const [nu, nw, nr] = now as [number, number, number];
    const grows = [
      ...(nu > 0 || p > 0 ? [`uncached input by ${percent(A.uncached)}`] : []),
      ...(nw > 0 ? [`cache writes by ${percent(A.cacheWrite)}`] : []),
      ...(nr > 0 ? [`cache reads by ${percent(A.cacheRead)}`] : []),
    ];
    if (grows.length > 0) {
      const which = grows.length === 1 ? 'its input grows' : 'each input category grows by its own share';
      parts.push(
        `With the work around the port included, ${which}: ${list(grows)}, as output did by ${percent(A.output)} above.`,
      );
    }
  }
  parts.push(`${modelName}'s price sheet turns the four into dollars.`);
  return parts.join(' ');
}
