// Everything the Methods and Calibration pages compute, under the published
// scenario with no reader overrides: the pages document the estimate as
// published, while the report page recomputes it as the reader adjusts it.
// Dollars and tokens come from the cost model; this module only chooses
// what to ask it and sums line counts. The views do no arithmetic.

import { type GroupEstimate, type Params, type Tokens, cephSloc, estimate, existingTestRatio, matrix, resolveParams } from '../model';
import { difficultyClass, newTestRatio, targetFactor, usdByCategory } from '../model/cost';
import {
  DEPENDENCIES_COMPONENT_ID,
  type Difficulty,
  type Feature,
  type Model,
  type Report,
  type Strategy,
  TARGETS,
  TARGET_LABELS,
  type Target,
  type TokenCategory,
} from '../report';
import { cardinal, list, multiplier, percent, rate, signedPercent } from '../format';
import { DEFAULT_TARGET } from '../state';
import { type Calibration, parseCalibration } from './calibration';
import { type Interpretation, interpretation } from './interpretation';
import { type BackTest, type EarlyRead, type PhaseFacts, backTest, goReadEarly, goReadSentence, phaseTable, scenarioPhases } from './phases';
import { ROLES, type Role, roleOf } from './scenarios';
import {
  type Effect,
  type Limitation,
  VARIANT,
  cacheMissEffect,
  limitations,
  securityHookEffect,
  smallestIsLast,
  variantContext,
} from './variants';

export interface LineSplit {
  headline: number;
  shown: number;
  notPorted: number;
  total: number;
}

export interface DependencyTotals {
  /** Dependencies per strategy for this target. */
  strategies: Record<Strategy, number>;
  /** Dependencies whose strategy leaves work (bindings or port). */
  withWork: number;
  /** Σ sloc_equivalent over those. */
  lines: number;
}

export type GroupFacts = LineSplit & { id: string; name: string; usd: number };

export interface LongContextEffect {
  id: string;
  name: string;
  threshold: number;
  /** Headline dollars by target with the central scenario's long-context shares. */
  baseline: Record<Target, number>;
  /** The same with every share at rgw-go's measured share over the threshold, the upper case. */
  withShares: Record<Target, number>;
}

/** An effect as the page prints it: one signed figure, or a signed range; a zero effect is no change. */
export function effectLabel(e: Effect | null): string {
  if (!e) return 'Not sized';
  if (e.low === 0 && e.high === 0) return 'No change';
  return e.low === e.high ? signedPercent(e.low) : `${signedPercent(e.low)} to ${signedPercent(e.high)}`;
}

const PUSH: Record<'raises' | 'lowers' | 'either' | 'none', [string, string]> = {
  raises: ['pushes it up', 'push it up'],
  lowers: ['pushes it down', 'push it down'],
  either: ['could move it either way', 'could move it either way'],
  none: ['does not move it', 'do not move it'],
};

/**
 * The items the model cannot size, by the direction each declares, as one
 * sentence: "Of the items that cannot be sized, X push it up, Y pushes it
 * down and Z could move it either way." Null when every item is sized.
 */
export function unsizedSentence(items: readonly Limitation[]): string | null {
  const unsized = items.filter((l) => !l.effect);
  if (unsized.length === 0) return null;
  const clauses = (['raises', 'lowers', 'either', 'none'] as const).flatMap((d) => {
    const these = unsized.filter((l) => l.declared === d);
    if (these.length === 0) return [];
    const plural = these.length > 1 || these.some((l) => l.plural);
    return [`${list(these.map((l) => l.phrase))} ${PUSH[d][plural ? 1 : 0]}`];
  });
  const joined = clauses.length > 1 ? `${clauses.slice(0, -1).join('; ')}; and ${clauses.at(-1)}` : clauses[0];
  return `Of the items that cannot be sized, ${joined}.`;
}

export type LimitationFacts = Limitation & { label: string };

export interface ScenarioFacts {
  id: string;
  label: string;
  role: Role | null;
  /** Headline dollars for the quoted target and the measured model. */
  usd: number;
}

export interface PortCost {
  id: string;
  name: string;
  usd: number;
  /** usd ÷ lines of product Go. */
  perProductLine: number;
}

export interface ProseFacts {
  scenario: { id: string; label: string };
  /** The selection the pages quote single figures for: Go, and the model rgw-go was measured on. */
  target: { id: Target; name: string };
  model: { id: string; name: string };
  /** Every scenario in report order, and the ones with each role. */
  scenarios: ScenarioFacts[];
  role: Partial<Record<Role, ScenarioFacts>>;
  /** Each limitation in the order the page lists it, with its computed effect on the quoted headline. */
  limitations: LimitationFacts[];
  limitation: Record<string, LimitationFacts>;
  /** How many sized limitations can only raise the figure, only lower it, or move it either way; and how many are not sized. */
  limitationCounts: { raises: number; lowers: number; either: number; notSized: number };
  /** The unsized items by the direction each declares, as a sentence; null when every item is sized. */
  unsized: string | null;
  hasUnsized: boolean;
  /** Bytes per token, listed last, is also the smallest of the sized effects. */
  smallestIsLast: boolean;
  /** The largest rise, over models with long-context prices, from billing rgw-go's share of long prompts at them, for the quoted target. */
  longContextRise: number | null;
  /** Labels of the scenarios that bill rgw-go's measured long-prompt shares exactly. */
  longContextScenarios: string[];
  hasLongContextScenario: boolean;
  /** Which scenarios bill long prompts, and how, as a sentence. */
  longContextSentence: string;
  /** "as the X scenario does" / "as the X and Y scenarios do", for the scenarios that bill the measured shares. */
  longContextAs: string;
  /** Some model has long-context prices, and some scenario bills rgw-go's shares at them; or none does. */
  longContextBilled: boolean;
  longContextUnbilled: boolean;
  /** How coverage reaches each scenario's figure, as a sentence. */
  coverageSentence: string;
  /** The closing judgement: whether it is made, and its computed clauses. */
  judgement: Judgement;
  /** The variants' own settings, which the prose quotes. */
  variant: typeof VARIANT;
  /** The headline with a share of cache reads billed as uncached input (variant.cacheMiss). */
  cacheMiss: number;
  /** The headline with the security-review hook counted as port work, when the data has that row. */
  securityHook: number | null;
  phases: PhaseFacts[];
  /** Calibrate on the low scenario's phase, predict the high scenario's; null without both. */
  backTest: BackTest | null;
  hasBackTest: boolean;
  /** The earlier phase's rates under-predicted the later phase's output. */
  backTestUnder: boolean;
  /** The earlier phase's rates over-predicted it. */
  backTestOver: boolean;
  /** Output and cache-read tokens per Go byte added, in the back-test's two phases and over all phases. */
  rates: Record<'early' | 'late' | 'all', { outputPerGoByte: number; cacheReadPerGoByte: number }> | null;
  /** Every sized limitation that can only lower the figure is a choice a port could make. */
  lowersAreChoices: boolean;
  /** The report has both a low and a high scenario. */
  hasLowHigh: boolean;
  /** Some dependency carries the size of its own submodules apart from the ones nested in them. */
  hasSubmoduleOwn: boolean;
  /** The scenario with the high role turns on the work around the port. */
  highIncludesAdjacent: boolean;
  targetNames: string[];
  /** Groups, components and features that hold at least one counted file; every dependency. */
  counts: { groups: number; components: number; features: number; dependencies: number };
  /** Ceph's own code lines (no comments or blanks), by scope. */
  lines: LineSplit;
  /** Groups that hold code, in report order, with their headline dollars for the quoted target and model. */
  linesByGroup: GroupFacts[];
  /** The rows of groups that hold headline code, by id: a figure for a group the headline does not cost fails to resolve. */
  group: Record<string, GroupFacts>;
  /** Share of Ceph's headline code lines in each language the counter named, by language. */
  headlineLanguageShare: Record<string, number>;
  tests: {
    /** R: test tokens Ceph's headline already has per product token. */
    existing: number;
    /** T */
    target: number;
    /** T_new = max(0, T − R) */
    toWrite: number;
  };
  /** Headline code lines and share of headline output tokens per difficulty class, for the quoted target. */
  byDifficulty: { difficulty: Difficulty; lines: number; output: number }[];
  /** Shares of Ceph's headline code lines and of headline output tokens rated hard or extreme. */
  aboveStandard: { lines: number; output: number };
  dependencies: Record<Target, DependencyTotals>;
  /** Headline dollars by target and model id. */
  headline: Record<Target, Record<string, number>>;
  /** Headline dollars for the quoted target and model. */
  quotedHeadline: number;
  /** F[wasm] = rust_factor × wasm_overhead */
  wasmFactor: number;
  /** Each model with long-context prices, priced with the measured shares and with every share at zero. */
  longContext: LongContextEffect[];
  /** Some model in the report has long-context prices. */
  hasLongContext: boolean;
  /** Every model has the same model-efficiency factor, so models differ only in their price sheets. */
  sameModelEfficiency: boolean;
  /**
   * The difficulty classes, with multipliers, of the headline features that
   * claim qa/tasks/ (Python tasks) and qa/workunits/ (shell workunits).
   */
  qa: { tasks: string[]; workunits: string[] };
  /** Every model's longer-lived cache write costs more than its shorter-lived one. */
  longerCacheWriteCostsMore: boolean;
  /** Vendored submodules whose commit was not present locally, so whose size is unknown. */
  submodules: {
    /** Names of the dependencies with a listed submodule that could not be counted. */
    unavailable: string[];
    anyUnavailable: boolean;
    /** Submodules nested inside counted ones that could not be counted. */
    nestedUnavailable: number;
    anyNestedUnavailable: boolean;
  };
  /**
   * Headline dollars for the quoted target and model at the expansion each
   * coverage gives: low coverage means a larger E and a larger cost.
   */
  byCoverage: { low: number; central: number; high: number };
  port: {
    /** All four categories, in tokens. */
    tokens: number;
    cacheReadShare: number;
    /** Calls over the long-context threshold ÷ all calls, from the second aggregation. */
    callsOverThreshold: number;
    /** By model id, in report order. */
    cost: Record<string, PortCost>;
    costs: PortCost[];
  };
  /** The break-evens, the scale-up and the cost shares the front page quotes, for the quoted target and model. */
  interpretation: Interpretation;
  /** Phases whose Go is read on a day before their tokens end, as sentences; null when there are none. */
  goReadSentence: string | null;
  hasGoReadSentence: boolean;
  /** The back-test's later phase, when its Go is read before its tokens end; within a day, or further apart. */
  backTestLateRead: EarlyRead | null;
  backTestLateReadSlight: boolean;
  backTestLateReadFar: boolean;
  /** The cache-write note's count of subagents and the port row's; null unless the data gives both. */
  subagents: { note: number; port: number } | null;
  /** Both counts are given and differ. */
  subagentsDiffer: boolean;
  /** The review role's agent count and the session's count of review passes; null unless the data gives both. */
  reviewCounts: { agents: number; passes: number } | null;
  /** Both counts are given and differ. */
  reviewCountsDiffer: boolean;
  /** Some model says which page each of its prices was read from. */
  hasPriceSources: boolean;
}

const LONG_CONTEXT_CATEGORIES: readonly TokenCategory[] = ['uncached', 'cache_write', 'cache_read', 'output'];
const DIFFICULTIES: readonly Difficulty[] = ['config', 'glue', 'standard', 'hard', 'extreme'];
const ABOVE_STANDARD: ReadonlySet<Difficulty> = new Set(['hard', 'extreme']);

function split(sloc: { headline: number; shown: number; notPorted: number }): LineSplit {
  return { ...sloc, total: sloc.headline + sloc.shown + sloc.notPorted };
}

function linesByGroup(report: Report, root: GroupEstimate): GroupFacts[] {
  const groupOf = new Map(report.components.map((c) => [c.id, c.group]));
  const rows = report.groups.map((g) => ({ id: g.id, name: g.name, headline: 0, shown: 0, notPorted: 0, total: 0, usd: 0 }));
  for (const c of root.children) {
    if (c.kind === 'feature' || c.id === DEPENDENCIES_COMPONENT_ID) continue;
    const row = rows.find((r) => r.id === groupOf.get(c.id));
    if (!row) throw new Error(`prose facts: component ${c.id} names no known group`);
    row.headline += c.headline.sloc.code;
    row.shown += c.shown.sloc.code;
    row.notPorted += c.notPorted.sloc.code;
    row.total = row.headline + row.shown + row.notPorted;
    row.usd += c.headline.usd;
  }
  return rows;
}

function headlineLanguageShare(report: Report): Record<string, number> {
  const lines = new Map<string, number>();
  let total = 0;
  for (const c of report.components) {
    for (const f of c.features) {
      if (f.scope !== 'headline') continue;
      for (const [lang, counts] of Object.entries(f.langs)) {
        lines.set(lang, (lines.get(lang) ?? 0) + counts.code);
        total += counts.code;
      }
    }
  }
  return Object.fromEntries([...lines].map(([lang, n]) => [lang, total > 0 ? n / total : 0]));
}

const holdsFiles = (f: Feature) => Object.values(f.langs).some((l) => l.files > 0);

/**
 * Per difficulty class, in the cost model's order: Ceph's headline code
 * lines and the share of headline output tokens, dependency work included.
 */
function byDifficulty(root: GroupEstimate): ProseFacts['byDifficulty'] {
  const rows = new Map(DIFFICULTIES.map((d) => [d, { difficulty: d, lines: 0, output: 0 }]));
  for (const c of root.children) {
    if (c.kind === 'feature') continue;
    for (const f of c.children) {
      if (f.kind !== 'feature' || f.scope !== 'headline') continue;
      const row = rows.get(difficultyClass(f.featureKind, f.difficulty));
      if (!row) continue;
      row.output += f.tokens.output;
      if (c.id !== DEPENDENCIES_COMPONENT_ID) row.lines += f.sloc.code;
    }
  }
  const total = root.headline.tokens.output;
  return [...rows.values()].map((r) => ({ ...r, output: total > 0 ? r.output / total : 0 }));
}

function dependencyTotals(report: Report): Record<Target, DependencyTotals> {
  const totals = (target: Target): DependencyTotals => {
    const strategies: Record<Strategy, number> = { native: 0, bindings: 0, port: 0, drop: 0 };
    let withWork = 0;
    let lines = 0;
    for (const d of report.dependencies) {
      const t = d.targets[target];
      strategies[t.strategy] += 1;
      if (t.strategy === 'bindings' || t.strategy === 'port') {
        withWork += 1;
        lines += t.sloc_equivalent;
      }
    }
    return { strategies, withWork, lines };
  };
  return Object.fromEntries(TARGETS.map((t) => [t, totals(t)])) as Record<Target, DependencyTotals>;
}

function usdOnly(m: ReturnType<typeof matrix>): Record<Target, Record<string, number>> {
  return Object.fromEntries(
    TARGETS.map((t) => [t, Object.fromEntries(Object.entries(m[t]).map(([id, cost]) => [id, cost.usd]))]),
  ) as Record<Target, Record<string, number>>;
}

function longContext(report: Report, scenarioId: string, headline: Record<Target, Record<string, number>>): LongContextEffect[] {
  const models = report.models.filter((m) => m.long_context !== null);
  if (models.length === 0) return [];
  const shares = parseCalibration(report.calibration).measurement_detail.prompt_size_tokens.share_over_threshold;
  const upper = Object.fromEntries(LONG_CONTEXT_CATEGORIES.map((cat) => [`long_context_share.${cat}`, shares[cat]]));
  const withShares = usdOnly(matrix(report, resolveParams(report, scenarioId, upper)));
  const pick = (m: Record<Target, Record<string, number>>, id: string) =>
    Object.fromEntries(TARGETS.map((t) => [t, m[t][id] as number])) as Record<Target, number>;
  return models.map((model) => ({
    id: model.id,
    name: model.name,
    threshold: model.long_context?.threshold_tokens ?? 0,
    baseline: pick(headline, model.id),
    withShares: pick(withShares, model.id),
  }));
}

/** "standard (1×)" for each class among headline features with a glob under `prefix`, in class order. */
function qaClasses(report: Report, params: Params, prefix: string): string[] {
  const found = new Set<Difficulty>();
  for (const c of report.components) {
    for (const f of c.features) {
      if (f.scope === 'headline' && f.globs.some((g) => g.startsWith(prefix))) found.add(difficultyClass(f.kind, f.difficulty));
    }
  }
  return DIFFICULTIES.filter((d) => found.has(d)).map((d) => `${d} (${multiplier(params.difficulty[d])})`);
}

function submodules(report: Report): ProseFacts['submodules'] {
  const sized = report.dependencies.filter((d) => d.submodule_size !== null);
  const unavailable = sized.filter((d) => d.submodule_size?.available === false).map((d) => d.name);
  const nestedUnavailable = sized.reduce((n, d) => n + (d.submodule_size?.unavailable_nested ?? 0), 0);
  return {
    unavailable,
    anyUnavailable: unavailable.length > 0,
    nestedUnavailable,
    anyNestedUnavailable: nestedUnavailable > 0,
  };
}

/** The port row of the calibration, priced on one model's sheet by the cost model. */
export function portCost(model: Model, params: Params, calibration: Calibration): number {
  const row = calibration.measurement.port;
  const tokens: Tokens = {
    uncached: row.uncached * 1e6,
    cacheWrite: row.cache_write * 1e6,
    cacheRead: row.cache_read * 1e6,
    output: row.output * 1e6,
  };
  const usd = usdByCategory(model, params, tokens);
  return usd.uncached + usd.cacheWrite + usd.cacheRead + usd.output;
}

function ratesOf(phases: PhaseFacts[], test: BackTest | null): ProseFacts['rates'] {
  if (!test) return null;
  const at = (phase: number | 'all') => {
    const p = phases.find((x) => x.phase === phase);
    if (!p || p.outputPerGoByte === null || p.cacheReadPerGoByte === null) return null;
    return { outputPerGoByte: p.outputPerGoByte, cacheReadPerGoByte: p.cacheReadPerGoByte };
  };
  const early = at(test.early);
  const late = at(test.late);
  const all = at('all');
  return early && late && all ? { early, late, all } : null;
}

const SHARE_KEYS = ['uncached', 'cacheWrite', 'cacheRead', 'output'] as const;

/** A scenario label list as the subject of a sentence: "the X scenario" or "the X and Y scenarios". */
function scenariosNoun(labels: readonly string[]): string {
  return `the ${list([...labels])} scenario${labels.length > 1 ? 's' : ''}`;
}

/**
 * The scenarios that bill some share of tokens at long-context prices, split
 * into those that bill exactly rgw-go's measured shares and the rest, with a
 * sentence saying so and a phrase for "as … does".
 */
export function longContextScenarios(
  report: Report,
  measured: Tokens,
): { exact: string[]; other: string[]; sentence: string | null; as: string } {
  const exact: string[] = [];
  const other: string[] = [];
  for (const [id, sc] of Object.entries(report.assumptions.scenarios)) {
    const s = resolveParams(report, id).longContextShare;
    if (!SHARE_KEYS.some((k) => s[k] > 0)) continue;
    (SHARE_KEYS.every((k) => near(s[k], measured[k])) ? exact : other).push(sc.label);
  }
  const parts: string[] = [];
  if (exact.length > 0) {
    const verb = exact.length > 1 ? 'apply' : 'applies';
    parts.push(`${capital(scenariosNoun(exact))} ${verb} these shares unchanged to every model with long-context prices.`);
  }
  if (other.length > 0) {
    const verb = other.length > 1 ? 'bill' : 'bills';
    parts.push(`${capital(scenariosNoun(other))} ${verb} other shares at those prices.`);
  }
  const as = exact.length > 0 ? `as ${scenariosNoun(exact)} ${exact.length > 1 ? 'do' : 'does'}` : '';
  return { exact, other, sentence: parts.length > 0 ? parts.join(' ') : null, as };
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Relative tolerance of `cephest check` for a value derived from calibration.yaml (derivedTolerancePct, 0.1%). */
const DERIVED_TOLERANCE = 1e-3;

function near(got: number, want: number): boolean {
  return Math.abs(got - want) <= Math.abs(want) * DERIVED_TOLERANCE;
}

type CoverageEnd = 'low' | 'value' | 'high';

/** Where a scenario mapped to each coverage end takes its expansion, as a phrase. */
const END_WORDS: Record<CoverageEnd, string> = {
  low: 'at the bottom of the coverage range',
  value: 'at the coverage value itself',
  high: 'at the top of the coverage range',
};

/**
 * How the coverage assumption reaches the figures, built from the data:
 * every estimated figure under the central scenario through E; each
 * scenario the data maps to a coverage end uses the expansion at that end;
 * one that keeps the central expansion follows coverage; one that reads the
 * source follows it less than in proportion; and what does not depend on it
 * at all. A scenario that overrides E sets it independently only when the
 * data maps no scenario to an end, which `cephest check` accepts.
 *
 * Throws on shapes `cephest check` rejects (a scaled E; an override the
 * mapping leaves out), and on a central scenario whose figures would not
 * all be inversely proportional to coverage: the first sentence, and the
 * pages' other statements about the central scenario, would be false.
 */
export function coverageSentence(report: Report): string {
  const coverage = (
    report.calibration as { coverage?: Partial<Record<CoverageEnd, number>> & { scenario_end?: Record<string, CoverageEnd> } }
  ).coverage;
  const ends = coverage?.scenario_end;
  const centralId = report.assumptions.default_scenario;
  const follow: string[] = [];
  const atEnd: string[] = [];
  const independent: string[] = [];
  const reading: { label: string; withInput: boolean }[] = [];
  for (const [id, sc] of Object.entries(report.assumptions.scenarios)) {
    const overrides = (sc.overrides ?? {}) as Record<string, number>;
    if ('expansion' in ((sc.scale ?? {}) as Record<string, number>)) {
      throw new Error(`scenarios.${id}.scale.expansion: the expansion is set only by an override at a coverage end, as cephest check requires`);
    }
    const end = ends?.[id];
    const overridden = 'expansion' in overrides;
    if (overridden && ends !== undefined && end === undefined) {
      throw new Error(`scenarios.${id}.overrides.expansion names no coverage end in calibration.coverage.scenario_end, as cephest check requires`);
    }
    const p = resolveParams(report, id);
    if (id === centralId) {
      if (overridden && end !== 'value') {
        const at = end === undefined ? 'no coverage end' : `coverage.${end}`;
        throw new Error(`the central scenario "${id}" takes its expansion at ${at}, so its figures are not inversely proportional to the coverage value`);
      }
      if (p.sourceReadPasses > 0) {
        throw new Error(`the central scenario "${id}" reads the source, so its figures are not inversely proportional to coverage`);
      }
      continue;
    }
    if (overridden) {
      if (end === undefined) independent.push(sc.label);
      else {
        const at = coverage?.[end];
        const centralToo = end === 'value' ? ', as the central scenario does' : '';
        atEnd.push(`${scenariosNoun([sc.label])} uses the expansion ${END_WORDS[end]}${at === undefined ? '' : ` (${percent(at)})`}${centralToo}`);
      }
      continue;
    }
    if (p.sourceReadPasses > 0) {
      const withInput = p.uncachedPerOutput > 0 || p.cacheWritePerOutput > 0 || p.cacheReadPerOutput > 0;
      reading.push({ label: sc.label, withInput });
      continue;
    }
    follow.push(sc.label);
  }
  const sentences: string[] = [
    'Under the central scenario every estimated token and dollar figure is inversely proportional to it, through the expansion E.',
  ];
  if (follow.length > 0) sentences.push(`So is every such figure under ${scenariosNoun(follow)}.`);
  if (atEnd.length > 0) sentences.push(`${capital(list(atEnd))}.`);
  if (independent.length > 0) {
    sentences.push(`${capital(scenariosNoun(independent))} ${independent.length > 1 ? 'set their' : 'sets its'} expansion independently of coverage.`);
  }
  for (const r of reading) {
    const input = r.withInput ? ', and so is the input that follows the output' : '';
    sentences.push(
      `Under ${scenariosNoun([r.label])} the output is inversely proportional to it, as under the central scenario${input}; the read of the source is not, so that scenario's figure moves less than in proportion.`,
    );
  }
  sentences.push(
    "The cost of rgw-go's own port, priced from its measured tokens, and the figures computed from rgw-go's phases alone, the back-test and the phase rates, do not depend on it; " +
      'nor do ratios between figures estimated under the central scenario, such as the break-evens and the shares of the estimated dollars that re-read context and test code make up.',
  );
  return sentences.join(' ');
}

export interface Judgement {
  /** The judgement is made: see `judgement`. */
  made: boolean;
  /** Output per Go byte added in each phase, in order, with the phases, as a phrase: "2.06, 2.70 and 3.71 output tokens per byte in phases 0, 1 and 2". */
  rates: string;
  /** The latest phase, and the all-phases output per Go byte. */
  latest: number;
  average: number;
  /** The latest phase's Go is read before its tokens end: within a day, further apart (and how far), or not at all. */
  readSlight: boolean;
  readFar: boolean;
  readDays: number;
  readOnTime: boolean;
  /** It is made and there are sized items that can only lower the figure. */
  lowers: boolean;
  /** How many of the either-way ranges have ends this report chose, as a sentence; '' when none has. */
  ranges: string;
  hasRanges: boolean;
  /** The unsized items, declared as lowering, that are not choices; '' when there are none. */
  against: string;
  hasAgainst: boolean;
  /** Counts behind `ranges`. */
  either: number;
  chosen: number;
}

/**
 * Why the either-way ranges are not evidence of direction: how many have
 * ends this report chose. Nothing when none has, since the reason would
 * not hold.
 */
function rangesSentence(either: number, chosen: number): string {
  if (chosen === 0) return '';
  if (either === 1) return "The range above that goes either way is not offered as evidence of direction: its ends are this report's choice.";
  const lead = 'The ranges above that go either way are not offered as evidence of direction:';
  if (chosen === either) return `${lead} ${either === 2 ? 'both' : `all ${cardinal(either)}`} have ends this report chose.`;
  return `${lead} ${cardinal(chosen)} of the ${cardinal(either)} ${chosen === 1 ? 'has' : 'have'} ends this report chose.`;
}

/**
 * The closing judgement. Its premise is measured: it is made only when
 * rgw-go's output per byte of Go added rose in every phase so far, in
 * order, and the latest phase's rate is above the all-phases rate, so that
 * the work still to be done need only run above the average so far for the
 * finished rate to end higher; when the back-test exists (the test of the
 * calibration the passage names); and when no sized item that can only
 * lower the figure is anything but a choice a port could make. The ranges
 * are not evidence of direction; the count of those with ends this report
 * chose says why.
 */
export function judgement(
  items: readonly Limitation[],
  table: readonly PhaseFacts[],
  test: BackTest | null,
  reads: readonly EarlyRead[] = [],
): Judgement {
  const rows = table.filter((p): p is PhaseFacts & { phase: number } => p.phase !== 'all');
  const perByte = rows.map((p) => p.outputPerGoByte);
  const average = table.find((p) => p.phase === 'all')?.outputPerGoByte ?? null;
  const latest = rows.at(-1);
  const latestRate = perByte.at(-1) ?? null;
  const rising =
    rows.length >= 2 && perByte.every((r, i) => r !== null && (i === 0 || r > (perByte[i - 1] as number)));
  const aboveAverage = latestRate !== null && average !== null && latestRate > average;
  const sized = items.filter((l) => l.effect);
  const lowering = sized.filter((l) => l.direction === 'lowers');
  const made = test !== null && rising && aboveAverage && lowering.every((l) => l.choice);
  const either = sized.filter((l) => l.direction === 'either');
  const chosen = either.filter((l) => l.ends === 'chosen').length;
  const ranges = made ? rangesSentence(either.length, chosen) : '';
  const cut = items.filter((l) => !l.effect && l.declared === 'lowers' && !l.choice);
  const against =
    made && cut.length > 0
      ? cut.length === 1
        ? 'What cuts the other way: the unsized item above that pushes the figure down, which is not a choice a port could make.'
        : 'What cuts the other way: the unsized items above that push the figure down, which are not choices a port could make.'
      : '';
  const read = made && latest ? reads.find((r) => r.phase === latest.phase) : undefined;
  return {
    made,
    rates: made
      ? `${list(perByte.map((r) => rate(r as number)))} output tokens per byte in phases ${list(rows.map((p) => String(p.phase)))}`
      : '',
    latest: made && latest ? latest.phase : 0,
    average: made && average !== null ? average : 0,
    readSlight: read !== undefined && read.days === 1,
    readFar: read !== undefined && read.days > 1,
    readDays: read?.days ?? 0,
    readOnTime: made && read === undefined,
    lowers: made && lowering.length > 0,
    ranges,
    hasRanges: ranges !== '',
    against,
    hasAgainst: against !== '',
    either: either.length,
    chosen,
  };
}

/** A count written with thousands separators in data text, as a number. */
function countIn(text: string | undefined, pattern: RegExp): number | null {
  const m = text?.match(pattern);
  return m?.[1] === undefined ? null : Number(m[1].replaceAll(',', ''));
}

/**
 * The two counts of subagents the data records: the session's approximate
 * one in the cache-write note ("about N subagents") and the port row's own
 * (its scope, "… + N subagents"). Null unless both are found.
 */
export function subagentCounts(c: Calibration): { note: number; port: number } | null {
  const note = countIn(c.measurement_detail.cache_write_by_call?.note, /\babout (\d[\d,]*) subagents\b/);
  const port = countIn(c.measurement.port.scope, /\b(\d[\d,]*) subagents\b/);
  return note === null || port === null ? null : { note, port };
}

/**
 * The two review counts the data records: the agents in the role row the
 * review share prices (its scope, "review (N agents)") and the session's
 * count of review passes. Null unless both are found.
 */
export function reviewCounts(c: Calibration): { agents: number; passes: number } | null {
  const scope = (c as { derived: { sanity_opus_5_5_usd?: { review_share?: { role_scope?: unknown } } } }).derived
    .sanity_opus_5_5_usd?.review_share?.role_scope;
  const agents = countIn(typeof scope === 'string' ? scope : undefined, /\((\d[\d,]*) agents\)/);
  const passes = c.measurement.review_passes;
  return agents === null || typeof passes !== 'number' ? null : { agents, passes };
}

/**
 * The model rgw-go was measured on, which every quoted figure uses. A report
 * whose calibration.measurement.model_id is missing or names no priced model
 * cannot be described (cephest check rejects it too), so this throws.
 */
export function measuredModel(report: Report, calibration: Calibration): Model {
  const id = (calibration.measurement as { model_id?: unknown }).model_id;
  if (typeof id !== 'string' || id === '') throw new Error('calibration.measurement.model_id is missing');
  const m = report.models.find((x) => x.id === id);
  if (!m) throw new Error(`calibration.measurement.model_id "${id}" names no model the report prices`);
  return m;
}

/** Computes every figure the prose pages quote. Throws on calibration data it cannot read. */
export function proseFacts(report: Report): ProseFacts {
  const calibration = parseCalibration(report.calibration);
  const scenarioId = report.assumptions.default_scenario;
  const scenario = report.assumptions.scenarios[scenarioId];
  if (!scenario) throw new Error(`prose facts: no scenario "${scenarioId}"`);
  const params = resolveParams(report, scenarioId);
  const model = measuredModel(report, calibration);
  const target = DEFAULT_TARGET;
  const ctx = variantContext(report, scenarioId, target, model.id);
  const limits: LimitationFacts[] = limitations(ctx).map((l) => ({ ...l, label: effectLabel(l.effect) }));
  const sized = limits.filter((l) => l.effect);
  const measuredShares = calibration.measurement_detail.prompt_size_tokens.share_over_threshold;
  const lcBy = longContextScenarios(report, {
    uncached: measuredShares.uncached,
    cacheWrite: measuredShares.cache_write,
    cacheRead: measuredShares.cache_read,
    output: measuredShares.output,
  });
  const lcScenarios = lcBy.exact;
  const scenarioFacts: ScenarioFacts[] = Object.entries(report.assumptions.scenarios).map(([id, sc]) => ({
    id,
    label: sc.label,
    role: roleOf(sc) ?? null,
    usd: estimate(report, target, model.id, resolveParams(report, id)).headline.usd,
  }));
  const goBpt = report.assumptions.bytes_per_token['go']?.value ?? report.assumptions.bytes_per_token.default.value;
  const phases = phaseTable(calibration, goBpt);
  const which = scenarioPhases(report, calibration);
  const test = which ? backTest(phases, which.early, which.late, model, params) : null;

  const root = estimate(report, target, model.id, params);
  const own = cephSloc(root);
  const allGroups = linesByGroup(report, root);
  const groups = allGroups.filter((g) => g.total > 0);
  const headlineGroups = allGroups.filter((g) => g.headline > 0);
  const difficulty = byDifficulty(root);
  const above = difficulty.filter((d) => ABOVE_STANDARD.has(d.difficulty));
  const costs = matrix(report, params);
  const headline = usdOnly(costs);
  const lc = longContext(report, scenarioId, headline);

  const R = existingTestRatio(report, params);
  const row = calibration.measurement.port;
  const portTokens = (row.uncached + row.cache_write + row.cache_read + row.output) * 1e6;
  const productLines = calibration.sizes.rgw_go.product_go.lines;
  const portCosts = report.models.map((m) => {
    const usd = portCost(m, params, calibration);
    return { id: m.id, name: m.name, usd, perProductLine: usd / productLines };
  });
  const sameModelEfficiency = report.models.every((m) => params.modelEfficiency[m.id] === params.modelEfficiency[model.id]);
  const atExpansion = (E: number) => estimate(report, target, model.id, resolveParams(report, scenarioId, { expansion: E })).headline.usd;
  const E = calibration.derived.expansion;
  const prompt = calibration.measurement_detail;
  const subagents = subagentCounts(calibration);
  const reviews = reviewCounts(calibration);
  const reads = goReadEarly(calibration);
  const lateRead = (test && reads.find((r) => r.phase === test.late)) ?? null;

  return {
    scenario: { id: scenarioId, label: scenario.label },
    target: { id: target, name: TARGET_LABELS[target] },
    model: { id: model.id, name: model.name },
    scenarios: scenarioFacts,
    role: Object.fromEntries(
      ROLES.flatMap((r) => {
        const f = scenarioFacts.find((x) => x.role === r);
        return f ? [[r, f]] : [];
      }),
    ),
    limitations: limits,
    limitation: Object.fromEntries(limits.map((l) => [l.id, l])),
    limitationCounts: {
      raises: sized.filter((l) => l.direction === 'raises').length,
      lowers: sized.filter((l) => l.direction === 'lowers').length,
      either: sized.filter((l) => l.direction === 'either').length,
      notSized: limits.length - sized.length,
    },
    unsized: unsizedSentence(limits),
    hasUnsized: sized.length < limits.length,
    smallestIsLast: smallestIsLast(limits),
    longContextRise: lc.length > 0 ? Math.max(...lc.map((m) => m.withShares[target] / m.baseline[target] - 1)) : null,
    longContextScenarios: lcScenarios,
    hasLongContextScenario: lcScenarios.length > 0,
    longContextSentence: lcBy.sentence ?? 'No scenario in this report bills these shares.',
    longContextAs: lcBy.as,
    coverageSentence: coverageSentence(report),
    judgement: judgement(limits, phases, test, reads),
    longContextBilled: lc.length > 0 && lcScenarios.length > 0,
    longContextUnbilled: lc.length > 0 && lcScenarios.length === 0,
    variant: VARIANT,
    cacheMiss: cacheMissEffect(ctx, VARIANT.cacheMiss),
    securityHook: securityHookEffect(ctx),
    phases,
    backTest: test,
    hasBackTest: test !== null,
    backTestUnder: test !== null && test.outputGap < 0,
    backTestOver: test !== null && test.outputGap > 0,
    rates: ratesOf(phases, test),
    lowersAreChoices: sized.filter((l) => l.direction === 'lowers').every((l) => l.choice),
    hasLowHigh: scenarioFacts.some((x) => x.role === 'low') && scenarioFacts.some((x) => x.role === 'high'),
    hasSubmoduleOwn: report.dependencies.some((d) => (d as { submodule_own?: unknown }).submodule_own),
    highIncludesAdjacent: Object.values(report.assumptions.scenarios).some(
      (s) => roleOf(s) === 'high' && s.toggles?.include_adjacent === true,
    ),
    targetNames: TARGETS.map((t) => TARGET_LABELS[t]),
    counts: {
      groups: groups.length,
      components: report.components.filter((c) => c.features.some(holdsFiles)).length,
      features: report.components.reduce((n, c) => n + c.features.filter(holdsFiles).length, 0),
      dependencies: report.dependencies.length,
    },
    lines: split({ headline: own.headline.code, shown: own.shown.code, notPorted: own.notPorted.code }),
    linesByGroup: groups,
    group: Object.fromEntries(headlineGroups.map((g) => [g.id, g])),
    headlineLanguageShare: headlineLanguageShare(report),
    tests: { existing: R, target: params.testRatio, toWrite: newTestRatio(params, R) },
    byDifficulty: difficulty,
    aboveStandard: {
      lines: above.reduce((n, d) => n + d.lines, 0) / own.headline.code,
      output: above.reduce((n, d) => n + d.output, 0),
    },
    dependencies: dependencyTotals(report),
    headline,
    quotedHeadline: root.headline.usd,
    wasmFactor: targetFactor(params, 'wasm'),
    longContext: lc,
    hasLongContext: lc.length > 0,
    sameModelEfficiency,
    submodules: submodules(report),
    qa: { tasks: qaClasses(report, params, 'qa/tasks/'), workunits: qaClasses(report, params, 'qa/workunits/') },
    longerCacheWriteCostsMore: report.models.every((m) => m.usd_per_mtok.cache_write_long > m.usd_per_mtok.cache_write_short),
    byCoverage: { low: atExpansion(E.at_low_coverage), central: atExpansion(E.central), high: atExpansion(E.at_high_coverage) },
    port: {
      tokens: portTokens,
      cacheReadShare: (row.cache_read * 1e6) / portTokens,
      callsOverThreshold: prompt.prompt_size_tokens.calls_over_threshold / prompt.calls,
      cost: Object.fromEntries(portCosts.map((c) => [c.id, c])),
      costs: portCosts,
    },
    interpretation: interpretation(report, costs[target], root, params, sameModelEfficiency),
    goReadSentence: goReadSentence(reads),
    hasGoReadSentence: reads.length > 0,
    backTestLateRead: lateRead,
    backTestLateReadSlight: lateRead !== null && lateRead.days === 1,
    backTestLateReadFar: lateRead !== null && lateRead.days > 1,
    subagents,
    subagentsDiffer: subagents !== null && subagents.note !== subagents.port,
    reviewCounts: reviews,
    reviewCountsDiffer: reviews !== null && reviews.agents !== reviews.passes,
    hasPriceSources: report.models.some((m) => (m.price_sources?.length ?? 0) > 0),
  };
}
