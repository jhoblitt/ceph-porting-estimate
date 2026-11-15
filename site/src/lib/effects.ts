// Which assumption sliders move the headline, for the selection and values
// as they are now. The cost model decides: each param is set to the two ends
// of its slider and the headline compared with the current one (every param
// is monotone in the model, so the two ends cover the range). Rules then
// explain a slider that has no effect, and checkEffectReasons holds the two
// together on the real data at every build, so a rule cannot drift from the
// model without failing it.

import { compactReport, sameHeadline } from './compact';
import { SLIDER_STEPS, fromSlider, sliderRange } from './assumptions';
import { belowPercentFloor, usd } from './format';
import { toggleOf } from './interpret';
import {
  CATEGORIES,
  type Category,
  type Cost,
  type GroupEstimate,
  type ParamInfo,
  type Params,
  describeParams,
  estimate,
  resolveParams,
} from './model';
import { difficultyClass, targetFactor } from './model/cost';
import { type Difficulty, TARGETS, type Report, type Target, type ToggleId } from './report';
import { defaultState } from './state';

/** Why a slider has no effect on the headline. */
export type NoEffectReason =
  /** It is a factor of other targets only. */
  | { kind: 'target'; target: Target; appliesTo: Target[] }
  /** It sets a long-context share, and the model has no long-context prices. */
  | { kind: 'long-context'; model: string }
  /** It is another model's token use, which changes only that model's figures. */
  | { kind: 'other-model'; model: string }
  /** It acts only while this switch is on, and the switch is off. */
  | { kind: 'switch'; toggle: ToggleId }
  /** It weighs work of one difficulty, and the estimate has none of that difficulty. */
  | { kind: 'difficulty' }
  /** It prices a token category that these sliders, all at 0, leave empty. */
  | { kind: 'moot'; by: string[] }
  /** Nothing but the reader's own combination of values explains it. */
  | { kind: 'other' };

/** What moving a slider across its range does to the headline. */
export type Effect =
  /** The printed headline changes at one end or the other. */
  | { kind: 'live' }
  /**
   * The headline changes, but prints the same at both ends as now. `from`
   * and `to` are the smaller and the larger change across the range, as
   * fractions of the headline (one is 0 when an end is the current value).
   */
  | { kind: 'small'; from: number; to: number }
  /** The headline is the same everywhere in the range. */
  | { kind: 'none'; reason: NoEffectReason };

export interface EffectQuery {
  /** The report to evaluate: the full one, or its compactReport. */
  report: Report;
  scenarioId: string;
  target: Target;
  modelId: string;
  overrides: Record<string, number>;
  /** The params with sliders, as describeParams lists them. */
  info: readonly ParamInfo[];
}

/** The model evaluated with a param at one end of its slider. */
interface End {
  params: Params;
  headline: Cost;
}

interface Probe {
  value: number;
  ends: [End, End];
}

interface Probes {
  query: EffectQuery;
  params: Params;
  root: GroupEstimate;
  headline: Cost;
  byPath: Map<string, Probe>;
}

function probe(q: EffectQuery): Probes {
  const evaluate = (overrides: Record<string, number>): End & { root: GroupEstimate } => {
    const params = resolveParams(q.report, q.scenarioId, overrides);
    const root = estimate(q.report, q.target, q.modelId, params);
    return { params, root, headline: root.headline };
  };
  const now = evaluate(q.overrides);
  const byPath = new Map<string, Probe>();
  for (const info of q.info) {
    const value = q.overrides[info.path] ?? info.scenario;
    const range = sliderRange(info, value);
    const snaps = [info.baseline, info.scenario];
    const end = (position: number): End => {
      const v = fromSlider(range, position, snaps);
      return v === value ? now : evaluate({ ...q.overrides, [info.path]: v });
    };
    byPath.set(info.path, { value, ends: [end(0), end(SLIDER_STEPS)] });
  }
  return { query: q, params: now.params, root: now.root, headline: now.headline, byPath };
}

/** The difficulty classes of the headline work that has any size. */
function classesOfWork(root: GroupEstimate): Set<Difficulty> {
  const found = new Set<Difficulty>();
  const walk = (node: GroupEstimate) => {
    for (const child of node.children) {
      if (child.kind !== 'feature') walk(child);
      else if (child.scope === 'headline' && child.sourceTokens > 0) {
        found.add(difficultyClass(child.featureKind, child.difficulty));
      }
    }
  };
  walk(root);
  return found;
}

function classify(p: Probe, now: Cost): 'none' | 'small' | 'live' {
  const values = p.ends.map((e) => e.headline.usd);
  if (values.every((v) => v === now.usd)) return 'none';
  // At $0 a change has no proportion, and any change prints differently anyway.
  if (now.usd > 0 && values.every((v) => usd(v) === usd(now.usd))) return 'small';
  return 'live';
}

const differs = <K extends string>(a: Record<K, number>, b: Record<K, number>, keys: readonly K[]) =>
  keys.filter((k) => a[k] !== b[k]);

/** The token category a param prices, if it prices one alone. */
function categoryOf(p: Probe): Category | undefined {
  const [lo, hi] = p.ends.map((e) => e.params) as [Params, Params];
  if (lo.longCacheWriteShare !== hi.longCacheWriteShare) return 'cacheWrite';
  return (
    differs(lo.longContextShare, hi.longContextShare, CATEGORIES)[0] ??
    differs(lo.adjacentUplift, hi.adjacentUplift, CATEGORIES)[0]
  );
}

/**
 * A switch's key in the resolved Params.toggles, which model/params.ts
 * spells in camelCase (include_adjacent → includeAdjacent). A key that
 * missed would read as off and give a reason to a slider the model moves,
 * which checkEffectReasons reports.
 */
const paramsToggle = (id: ToggleId) => id.replace(/_(\w)/g, (_, c: string) => c.toUpperCase()) as keyof Params['toggles'];

/** The reason a rule gives for a param to have no effect, or undefined where no rule applies. */
function ruleReason(path: string, probes: Probes): NoEffectReason | undefined {
  const { query: q, byPath } = probes;
  const p = byPath.get(path);
  if (!p) return undefined;
  const [lo, hi] = p.ends.map((e) => e.params) as [Params, Params];

  const appliesTo = TARGETS.filter((t) => targetFactor(lo, t) !== targetFactor(hi, t));
  if (appliesTo.length > 0 && !appliesTo.includes(q.target)) return { kind: 'target', target: q.target, appliesTo };

  const model = q.report.models.find((m) => m.id === q.modelId);
  if (model && !model.long_context && differs(lo.longContextShare, hi.longContextShare, CATEGORIES).length > 0) {
    return { kind: 'long-context', model: q.modelId };
  }

  const models = q.report.models.map((m) => m.id);
  const ownedBy = differs(lo.modelEfficiency, hi.modelEfficiency, models);
  if (ownedBy.length > 0 && !ownedBy.includes(q.modelId)) return { kind: 'other-model', model: ownedBy[0] as string };

  const toggle = toggleOf(path) as ToggleId | undefined;
  if (toggle && !probes.params.toggles[paramsToggle(toggle)]) return { kind: 'switch', toggle };

  const weighs = differs(lo.difficulty, hi.difficulty, Object.keys(lo.difficulty) as Difficulty[]);
  if (weighs.length > 0) {
    const present = classesOfWork(probes.root);
    if (!weighs.some((c) => present.has(c))) return { kind: 'difficulty' };
  }

  const category = categoryOf(p);
  if (category && probes.headline.tokens[category] === 0) {
    const by = [...byPath]
      .filter(([, o]) => o.value === 0 && o.ends.some((e) => e.headline.tokens[category] > 0))
      .map(([other]) => other);
    if (by.length > 0) return { kind: 'moot', by };
  }
  return undefined;
}

function effectsOf(probes: Probes): Map<string, Effect> {
  const effects = new Map<string, Effect>();
  for (const [path, p] of probes.byPath) {
    const state = classify(p, probes.headline);
    if (state === 'none') {
      effects.set(path, { kind: 'none', reason: ruleReason(path, probes) ?? { kind: 'other' } });
    } else if (state === 'small') {
      const changes = p.ends.map((e) => (e.headline.usd - probes.headline.usd) / probes.headline.usd);
      effects.set(path, { kind: 'small', from: Math.min(...changes), to: Math.max(...changes) });
    } else {
      effects.set(path, { kind: 'live' });
    }
  }
  return effects;
}

/** How a small effect's reach reads, given what a percentage prints. */
export type Reach =
  /** Both ends move the headline by less than the smallest percentage printed. */
  | { kind: 'within' }
  /** One end leaves it where it is, or moves it by less than that; the other moves it by `change`. */
  | { kind: 'up-to'; change: number }
  /** Each end moves it by a printable amount. */
  | { kind: 'between'; from: number; to: number };

/** The reach of a small effect's `from` and `to`, leaving out an end too small to print. */
export function smallReach(from: number, to: number): Reach {
  const printed = (x: number) => x !== 0 && !belowPercentFloor(x);
  if (printed(from) && printed(to)) return { kind: 'between', from, to };
  if (printed(from)) return { kind: 'up-to', change: from };
  if (printed(to)) return { kind: 'up-to', change: to };
  return { kind: 'within' };
}

/** Each param's effect on the headline across its slider, by dotted path, in `info` order. */
export function paramEffects(q: EffectQuery): Map<string, Effect> {
  return effectsOf(probe(q));
}

/**
 * Closer than this, two reaches differ only by rounding. A reach is already a
 * fraction of the headline, so the noise between two summation orders is about
 * the same absolute size (near 1e-15) whatever the reach; a bound relative to
 * the reach would call two tiny reaches different on noise alone. It is the
 * same order as sameHeadline's.
 */
const REACH_ROUNDING = 1e-9;

const sameReach = (a: number, b: number) => Math.abs(a - b) <= REACH_ROUNDING;

/** The paths, in `a`'s order, whose state, reach (to rounding) or reason differs between two sets of effects. */
export function effectsDiffer(a: ReadonlyMap<string, Effect>, b: ReadonlyMap<string, Effect>): string[] {
  const same = (x: Effect | undefined, y: Effect | undefined): boolean => {
    if (!x || !y || x.kind !== y.kind) return false;
    if (x.kind === 'small' && y.kind === 'small') return sameReach(x.from, y.from) && sameReach(x.to, y.to);
    return JSON.stringify(x) === JSON.stringify(y);
  };
  const paths = [...a.keys(), ...[...b.keys()].filter((p) => !a.has(p))];
  return paths.filter((p) => !same(a.get(p), b.get(p)));
}

/**
 * Every disagreement between the model and the rules on this report, for
 * each target, model, scenario and setting of the switches with no other
 * change: a slider the model gives no effect that no rule explains, a slider
 * a rule says has no effect that the model moves, and a selection where the
 * compact report's headline is not the full report's. For each scenario at
 * the default target and model with its own switches, it also compares every
 * slider's effect on the compact report with its effect on the full one,
 * which tests the compact report at every probe end, not only where the
 * selection sits. Empty when they agree.
 */
export function checkEffectReasons(report: Report): string[] {
  const compact = compactReport(report);
  const toggles = Object.keys(report.assumptions.toggles);
  const switchSettings = Array.from({ length: 2 ** toggles.length }, (_, bits) =>
    Object.fromEntries(toggles.map((id, i) => [`toggles.${id}`, (bits >> i) & 1])),
  );
  const problems: string[] = [];
  const defaults = defaultState(report);
  for (const scenarioId of Object.keys(report.assumptions.scenarios)) {
    const info = describeParams(report, scenarioId);
    const at = { scenarioId, target: defaults.target, modelId: defaults.model, overrides: {}, info };
    for (const path of effectsDiffer(paramEffects({ ...at, report: compact }), paramEffects({ ...at, report }))) {
      problems.push(`${at.target}, ${at.modelId}, ${scenarioId}: ${path} has another effect on the compact report than on the full one`);
    }
    for (const overrides of switchSettings) {
      const params = resolveParams(report, scenarioId, overrides);
      for (const target of TARGETS) {
        for (const { id: modelId } of report.models) {
          const where = `${target}, ${modelId}, ${scenarioId}, ${JSON.stringify(overrides)}`;
          const probes = probe({ report: compact, scenarioId, target, modelId, overrides, info });
          const full = estimate(report, target, modelId, params).headline.usd;
          if (!sameHeadline(probes.headline.usd, full)) {
            problems.push(`${where}: the compact report gives ${probes.headline.usd}, the full report ${full}`);
          }
          for (const [path, p] of probes.byPath) {
            const none = classify(p, probes.headline) === 'none';
            const reason = ruleReason(path, probes);
            if (none && !reason) problems.push(`${where}: ${path} has no effect, and no rule says why`);
            if (!none && reason) problems.push(`${where}: ${path} moves the estimate, but a rule says "${reason.kind}"`);
          }
        }
      }
    }
  }
  return problems;
}
