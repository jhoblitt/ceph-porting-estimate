// What a reader needs to interpret the figure, derived from model outputs:
// how far the measured port is scaled up, what a model column would need
// to match the measured model, how much of the bill is re-read context and
// how much is test code, and where each scenario sits in the range. Pure
// functions over the model's outputs; Derived wires them to the selection.

import { type Cost, type GroupEstimate, type Params, describeParams, estimate, resolveParams } from './model';
import type { Report, ScenarioRole, Target } from './report';

export interface CalibrationFacts {
  /** The model whose token use was measured, when the data names one the report lists. */
  measuredModelId?: string;
  /** Output tokens of the measured port. */
  portOutputTokens?: number;
  /** The share of the measured component the port covers, 0 to 1. */
  coverage?: number;
  /** The calibration project, e.g. "rgw-go". */
  projectName?: string;
}

function field(node: unknown, key: string): unknown {
  return typeof node === 'object' && node !== null && Object.hasOwn(node, key)
    ? (node as Record<string, unknown>)[key]
    : undefined;
}

function finite(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** calibration.yaml states volumes in millions unless its `unit` says otherwise. */
const UNITS: Record<string, number> = { 'millions of tokens': 1e6, tokens: 1 };
const DEFAULT_UNIT = 'millions of tokens';

/**
 * The facts the front page quotes from the free-form calibration data.
 * Anything missing or of an unexpected shape is left out, so a view can
 * fall back rather than print a wrong number or a wrong name.
 */
export function calibrationFacts(report: Report): CalibrationFacts {
  const c = report.calibration;
  const facts: CalibrationFacts = {};
  const measurement = field(c, 'measurement');

  const modelId = field(measurement, 'model_id');
  if (typeof modelId === 'string' && report.models.some((m) => m.id === modelId)) facts.measuredModelId = modelId;

  const unit = field(measurement, 'unit') ?? DEFAULT_UNIT;
  const scale = typeof unit === 'string' && Object.hasOwn(UNITS, unit) ? UNITS[unit] : undefined;
  const output = finite(field(field(measurement, 'port'), 'output'));
  if (scale !== undefined && output !== undefined && output > 0) facts.portOutputTokens = output * scale;

  const coverage = finite(field(field(c, 'coverage'), 'value'));
  if (coverage !== undefined && coverage > 0 && coverage <= 1) facts.coverage = coverage;

  const name = field(field(c, 'project'), 'name');
  if (typeof name === 'string' && name !== '') facts.projectName = name;
  return facts;
}

/**
 * The factor on a model's token counts at which its cost would equal the
 * measured model's: 0.85 means it would have to need 15% fewer tokens, 1.2
 * that it could need 20% more. Null when either cost is not positive.
 */
export function breakEven(measured: Cost, other: Cost): number | null {
  if (!(measured.usd > 0 && other.usd > 0 && Number.isFinite(measured.usd) && Number.isFinite(other.usd))) return null;
  return measured.usd / other.usd;
}

/** How many times the measured port's output the headline's output is. */
export function scaleUp(headlineOutput: number, portOutput: number | undefined): number | undefined {
  if (portOutput === undefined || !(portOutput > 0) || !(headlineOutput > 0) || !Number.isFinite(headlineOutput)) {
    return undefined;
  }
  return headlineOutput / portOutput;
}

/** Cache reads and cache writes, re-read context, as a share of a cost's dollars. */
export function cacheTrafficShare(cost: Cost): number | null {
  if (!(cost.usd > 0)) return null;
  return (cost.usdByCategory.cacheRead + cost.usdByCategory.cacheWrite) / cost.usd;
}

/**
 * Test code as a share of the headline dollars: every ported test feature,
 * and in each product feature the share of its output that is new tests,
 * T_new ÷ (1 + T_new). Reading the source (the W × p part of uncached input)
 * is not test work and is left out. Null for a cost of zero.
 */
export function testCodeShare(root: GroupEstimate, params: Params): number | null {
  if (!(root.headline.usd > 0)) return null;
  let test = 0;
  const walk = (node: GroupEstimate) => {
    for (const child of node.children) {
      if (child.kind !== 'feature') {
        walk(child);
        continue;
      }
      if (child.scope !== 'headline') continue;
      if (child.featureKind === 'test') {
        test += child.usd;
      } else if (child.featureKind === 'product') {
        const f = child.factors;
        const t = f.newTestRatio;
        // Uncached input is out × u + W × p; only the first part follows output.
        const perW = f.expansion * (1 + t) * f.overhead * f.modelEfficiency * f.cleanBreak * params.uncachedPerOutput;
        const followsOutput = perW + params.sourceReadPasses > 0 ? perW / (perW + params.sourceReadPasses) : 0;
        const reading = child.usdByCategory.uncached * (1 - followsOutput);
        test += ((child.usd - reading) * t) / (1 + t);
      }
    }
  };
  walk(root);
  return test / root.headline.usd;
}

export interface Range<T> {
  low?: T;
  central?: T;
  high?: T;
  /** Scenarios drawn as reference marks, not outcomes. */
  references: T[];
  /** Scenarios with no role, or a second one with a role already taken; selectable, but not placed. */
  unplaced: T[];
}

const OUTCOME_ROLES: ReadonlySet<string> = new Set(['low', 'central', 'high']);

/**
 * The scenarios placed by role, in the order given; the first of each
 * outcome role wins. A role this code does not know (data newer than the
 * site) is unplaced, so the scenario is still drawn and listed.
 */
export function scenarioRange<T extends { role?: ScenarioRole }>(scenarios: readonly T[]): Range<T> {
  const range: Range<T> = { references: [], unplaced: [] };
  for (const s of scenarios) {
    const role = s.role as string | undefined;
    if (role === 'reference') range.references.push(s);
    else if (role !== undefined && OUTCOME_ROLES.has(role) && range[role as 'low' | 'central' | 'high'] === undefined) {
      range[role as 'low' | 'central' | 'high'] = s;
    } else range.unplaced.push(s);
  }
  return range;
}

/** Params that act only while a switch is on (docs/cost-model.md: C and A[cat]). */
const TOGGLE_PARAMS: Record<string, (path: string) => boolean> = {
  clean_break: (path) => path === 'clean_break_discount',
  include_adjacent: (path) => path.startsWith('adjacent_uplift.'),
};

/** The switch a param acts under, if it acts only while one is on. */
export function toggleOf(path: string): string | undefined {
  return Object.keys(TOGGLE_PARAMS).find((id) => TOGGLE_PARAMS[id]?.(path));
}

const TOGGLE_PREFIX = 'toggles.';

/**
 * The params at 0 in effect that, set to 0 on their own (the scenario's
 * values and the switches in effect otherwise), make the headline of this
 * target and model $0, and do not at a positive value.
 */
export function zeroingParams(
  report: Report,
  scenarioId: string,
  target: Target,
  modelId: string,
  overrides: Record<string, number>,
): string[] {
  const toggles = Object.fromEntries(Object.entries(overrides).filter(([k]) => k.startsWith(TOGGLE_PREFIX)));
  const headline = (extra: Record<string, number>) =>
    estimate(report, target, modelId, resolveParams(report, scenarioId, { ...toggles, ...extra })).headline.usd;
  const out: string[] = [];
  for (const p of describeParams(report, scenarioId)) {
    const value = overrides[p.path] ?? p.scenario;
    if (value !== 0) continue;
    if (headline({ [p.path]: 0 }) !== 0) continue;
    const reference = p.baseline > 0 ? p.baseline : 1;
    if (headline({ [p.path]: reference }) > 0) out.push(p.path);
  }
  return out;
}
