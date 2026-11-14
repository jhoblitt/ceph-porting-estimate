// The limitations' sizes. Each variant changes one thing the Methods page
// names and runs the cost model again; the effect is the change in the
// headline for Go on the measured model under the central scenario, as a
// fraction. Nothing here is new model arithmetic: a variant is a parameter
// override, a copy of the report with something changed, or (for the
// Python expansion, as the adversarial review's script does) the model's
// own per-feature output rescaled with the test credit held fixed.

import { type Params, type Tokens, describeParams, estimate, existingTestRatio, resolveParams, sumTokens } from '../model';
import { bytesPerToken, sourceTokens, usdByCategory } from '../model/cost';
import type { FeatureEstimate } from '../model/types';
import type { Report, Target } from '../report';
import { parseCalibration } from './calibration';
import { type Role, scenarioWithRole } from './scenarios';

/** A signed change in the headline, as a fraction; `low` ≤ `high`, equal for a single variant. */
export interface Effect {
  low: number;
  high: number;
}

/** Which way a limitation moves the figure; `none` when it does not move this one. */
export type Direction = 'raises' | 'lowers' | 'either' | 'none';

export interface Limitation {
  id: string;
  /** Null when the model has no parameter for it and the review sized it with arithmetic the model does not have. */
  effect: Effect | null;
  /** From the effect when it is sized, else as declared. */
  direction: Direction;
  /** The direction the limitation declares, sized or not. */
  declared: Direction;
  /** A choice a port could make, as against a finding about the method or the measurement. */
  choice: boolean;
  /** What it is, as a noun phrase a computed sentence can list. */
  phrase: string;
  /** The phrase takes a plural verb. */
  plural: boolean;
  /** Whether the ends of its range come from a measurement or are chosen by this report (a multiplier or a judgement). */
  ends: Ends;
}

/** Where a range's ends come from. */
export type Ends = 'measured' | 'chosen';

/** The variants' own settings, which the prose quotes. */
export const VARIANT = Object.freeze({
  /** Cache reads per output token, the low and high ends tried. */
  cacheReadLow: 0.5,
  cacheReadHigh: 1.5,
  /** Share of cache reads billed as uncached input. */
  cacheMiss: 0.02,
  /** The measured model's cache-read price, a quarter lower and half as much again. */
  priceLow: 0.75,
  priceHigh: 1.5,
  /** Python and Cython expanding this much more than C++. */
  pythonLow: 1.5,
  pythonHigh: 2,
  /** Dependency work this many times what the data says. */
  bindingsLow: 2,
  bindingsHigh: 5,
  /** Every bytes-per-token value but C++'s and Go's, scaled. */
  bptLow: 0.75,
  bptHigh: 1.25,
});

interface Ctx {
  report: Report;
  scenarioId: string;
  target: Target;
  modelId: string;
  params: Params;
  base: number;
}

function headline(report: Report, ctx: Ctx, overrides: Record<string, number> = {}): number {
  return estimate(report, ctx.target, ctx.modelId, resolveParams(report, ctx.scenarioId, overrides)).headline.usd;
}

function change(ctx: Ctx, usd: number): number {
  return usd / ctx.base - 1;
}

function span(a: number, b: number): Effect {
  return { low: Math.min(a, b), high: Math.max(a, b) };
}

function direction(e: Effect): Direction {
  if (e.low === 0 && e.high === 0) return 'none';
  if (e.low >= 0 && e.high > 0) return 'raises';
  if (e.high <= 0 && e.low < 0) return 'lowers';
  return 'either';
}

/** The central scenario's value of a param path, after its overrides and scale. */
function scenarioValue(ctx: Ctx, path: string): number {
  const p = describeParams(ctx.report, ctx.scenarioId).find((x) => x.path === path);
  if (!p) throw new Error(`variants: no param ${path}`);
  return p.scenario;
}

/**
 * The values another scenario (by role) gives these paths where it differs
 * from the central one, by override or scale; null when there is no such
 * scenario or it changes none of them.
 */
function withScales(ctx: Ctx, role: Role, paths: readonly string[]): Record<string, number> | null {
  const id = scenarioWithRole(ctx.report, role);
  if (!id) return null;
  const theirs = new Map(describeParams(ctx.report, id).map((p) => [p.path, p.scenario]));
  const out: Record<string, number> = {};
  for (const path of paths) {
    const v = theirs.get(path);
    if (v !== undefined && v !== scenarioValue(ctx, path)) out[path] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function roleRange(ctx: Ctx, paths: readonly string[]): Effect | null {
  const low = withScales(ctx, 'low', paths);
  const high = withScales(ctx, 'high', paths);
  if (!low || !high) return null;
  return span(change(ctx, headline(ctx.report, ctx, low)), change(ctx, headline(ctx.report, ctx, high)));
}

const HARNESS = ['overhead', 'cache_read_per_output', 'cache_write_per_output'] as const;
const DIFFICULTY = ['difficulty.config', 'difficulty.glue', 'difficulty.standard', 'difficulty.hard', 'difficulty.extreme'] as const;

function cacheTraffic(ctx: Ctx): Effect {
  const r = scenarioValue(ctx, 'cache_read_per_output');
  return span(
    change(ctx, headline(ctx.report, ctx, { cache_read_per_output: r * VARIANT.cacheReadLow })),
    change(ctx, headline(ctx.report, ctx, { cache_read_per_output: r * VARIANT.cacheReadHigh })),
  );
}

/** The headline with a share of its cache-read tokens billed as uncached input, priced by the model's own price function. */
export function cacheMissEffect(ctx: Ctx, share: number): number {
  const root = estimate(ctx.report, ctx.target, ctx.modelId, ctx.params);
  const model = ctx.report.models.find((m) => m.id === ctx.modelId);
  if (!model) throw new Error(`variants: no model ${ctx.modelId}`);
  const t = root.headline.tokens;
  const moved: Tokens = { ...t, uncached: t.uncached + share * t.cacheRead, cacheRead: (1 - share) * t.cacheRead };
  return change(ctx, sumTokens(usdByCategory(model, ctx.params, moved)));
}

function coverage(ctx: Ctx): Effect {
  const e = parseCalibration(ctx.report.calibration).derived.expansion;
  return span(
    change(ctx, headline(ctx.report, ctx, { expansion: e.at_high_coverage })),
    change(ctx, headline(ctx.report, ctx, { expansion: e.at_low_coverage })),
  );
}

function withHeadlineTests(report: Report, scope: 'not-ported'): Report {
  const r = structuredClone(report);
  for (const c of r.components) for (const f of c.features) if (f.scope === 'headline' && f.kind === 'test') f.scope = scope;
  return r;
}

/** Existing tests not ported, the full ratio written new (what rgw-go did); and ported with the full ratio written as well. */
function tests(ctx: Ctx): Effect {
  const unported = headline(withHeadlineTests(ctx.report, 'not-ported'), ctx);
  const R = existingTestRatio(ctx.report, ctx.params);
  const both = headline(ctx.report, ctx, { test_ratio: ctx.params.testRatio + R });
  return span(change(ctx, unported), change(ctx, both));
}

function priceCell(ctx: Ctx): Effect {
  const at = (k: number) => {
    const r = structuredClone(ctx.report);
    const m = r.models.find((x) => x.id === ctx.modelId);
    if (!m) throw new Error(`variants: no model ${ctx.modelId}`);
    m.usd_per_mtok.cache_read *= k;
    if (m.long_context) m.long_context.cache_read *= k;
    return change(ctx, headline(r, ctx));
  };
  return span(at(VARIANT.priceLow), at(VARIANT.priceHigh));
}

const PYTHON = new Set(['python', 'cython']);

/** Python and Cython expanding k times what C++ does, with the test credit held fixed: each feature's cost grows with its Python share. */
function pythonAt(ctx: Ctx, k: number): number {
  const root = estimate(ctx.report, ctx.target, ctx.modelId, ctx.params);
  const langs = new Map(ctx.report.components.flatMap((c) => c.features.map((f) => [`${c.id}/${f.id}`, f.langs] as const)));
  let usd = root.headline.usd;
  for (const c of root.children) {
    if (c.kind === 'feature') continue;
    for (const f of c.children as FeatureEstimate[]) {
      const fl = langs.get(`${c.id}/${f.id}`);
      if (f.scope !== 'headline' || !fl || f.sourceTokens <= 0) continue;
      let py = 0;
      for (const [lang, counts] of Object.entries(fl)) if (PYTHON.has(lang)) py += counts.bytes / bytesPerToken(ctx.params, lang);
      usd += f.usd * (k - 1) * (py / f.sourceTokens);
    }
  }
  return change(ctx, usd);
}

function python(ctx: Ctx): Effect {
  return span(pythonAt(ctx, VARIANT.pythonLow), pythonAt(ctx, VARIANT.pythonHigh));
}

function oneOsd(ctx: Ctx): Effect | null {
  if (!ctx.report.groups.some((g) => g.id === 'crimson')) return null;
  const r = structuredClone(ctx.report);
  for (const c of r.components) if (c.group === 'crimson') for (const f of c.features) if (f.scope === 'headline') f.scope = 'not-ported';
  const e = change(ctx, headline(r, ctx));
  return { low: e, high: e };
}

const LONG_CONTEXT = ['uncached', 'cache_write', 'cache_read', 'output'] as const;

/**
 * The quoted model's figure with rgw-go's measured share of long prompts
 * billed at its long-context prices; null when no model in the report has
 * such prices. Zero for a quoted model without them.
 */
function longPrompts(ctx: Ctx): Effect | null {
  if (!ctx.report.models.some((m) => m.long_context)) return null;
  const shares = parseCalibration(ctx.report.calibration).measurement_detail.prompt_size_tokens.share_over_threshold;
  const upper = Object.fromEntries(LONG_CONTEXT.map((cat) => [`long_context_share.${cat}`, shares[cat]]));
  const e = change(ctx, headline(ctx.report, ctx, upper));
  return { low: e, high: e };
}

function toggle(ctx: Ctx, key: string): Effect {
  const e = change(ctx, headline(ctx.report, ctx, { [`toggles.${key}`]: 1 }));
  return { low: e, high: e };
}

function bindings(ctx: Ctx): Effect {
  const b = scenarioValue(ctx, 'sloc_equivalent_bytes_per_line');
  return span(
    change(ctx, headline(ctx.report, ctx, { sloc_equivalent_bytes_per_line: b * VARIANT.bindingsLow })),
    change(ctx, headline(ctx.report, ctx, { sloc_equivalent_bytes_per_line: b * VARIANT.bindingsHigh })),
  );
}

const KEEP_BPT = new Set(['cpp', 'go']);

function bytesPerTokenRange(ctx: Ctx): Effect {
  const at = (k: number) => {
    const r = structuredClone(ctx.report);
    for (const [lang, q] of Object.entries(r.assumptions.bytes_per_token)) if (!KEEP_BPT.has(lang)) q.value *= k;
    return change(ctx, headline(r, ctx));
  };
  return span(at(VARIANT.bptLow), at(VARIANT.bptHigh));
}

/** Counting the security-review hook, which reviews rgw-go's own commits, as port work: the port ratios recomputed with its row folded in. */
export function securityHookEffect(ctx: Ctx): number | null {
  const c = parseCalibration(ctx.report.calibration);
  const hook = c.measurement.adjacent.find((row) => /security/i.test(row.scope));
  if (!hook) return null;
  const port = c.measurement.port;
  const output = port.output + hook.output;
  const surviving = c.derived.surviving_go_tokens;
  return change(
    ctx,
    headline(ctx.report, ctx, {
      overhead: (output * 1e6) / surviving,
      uncached_per_output: (port.uncached + (hook.uncached ?? 0)) / output,
      cache_write_per_output: (port.cache_write + hook.cache_write) / output,
      cache_read_per_output: (port.cache_read + hook.cache_read) / output,
    }),
  );
}

interface Definition {
  id: string;
  /** The way it moves the figure where it applies: the only direction an unsized item has, and a check on a sized one's. */
  push: Direction;
  choice: boolean;
  phrase: string;
  plural?: boolean;
  /** Where its ends come from: rgw-go's measurements, or a multiplier or judgement this report chose. */
  ends: Ends;
  /** Its effect; null where the model cannot size it. */
  size: ((ctx: Ctx) => Effect | null) | null;
  /** Left off the list where it does not apply to the report; listed by default. */
  applies?: (ctx: Ctx) => boolean;
}

/** The one place each limitation declares its direction and whether it is a choice. Unsized ones are listed in this order. */
const DEFINITIONS: readonly Definition[] = [
  { id: 'cache-traffic', ends: 'chosen', push: 'either', choice: false, phrase: 'cache traffic per output token', size: cacheTraffic },
  { id: 'unfinished', ends: 'measured', push: 'either', choice: false, phrase: 'the unfinished port', size: (ctx) => roleRange(ctx, HARNESS) },
  { id: 'coverage', ends: 'chosen', push: 'either', choice: false, phrase: 'coverage', size: coverage },
  { id: 'difficulty', ends: 'chosen', push: 'either', choice: false, phrase: 'the difficulty classes', plural: true, size: (ctx) => roleRange(ctx, DIFFICULTY) },
  { id: 'tests', ends: 'chosen', push: 'raises', choice: false, phrase: 'the credit for existing tests', size: tests },
  { id: 'price-cell', ends: 'chosen', push: 'either', choice: false, phrase: 'the cache-read price', size: priceCell },
  { id: 'python', ends: 'chosen', push: 'raises', choice: false, phrase: "Python's expansion", size: python },
  { id: 'osds', ends: 'chosen', push: 'lowers', choice: true, phrase: 'porting one OSD', size: oneOsd },
  { id: 'clean-break', ends: 'chosen', push: 'lowers', choice: true, phrase: 'a clean break', size: (ctx) => toggle(ctx, 'clean_break') },
  { id: 'adjacent', ends: 'measured', push: 'raises', choice: false, phrase: 'the work around the port', size: (ctx) => toggle(ctx, 'include_adjacent') },
  { id: 'bindings', ends: 'chosen', push: 'raises', choice: false, phrase: 'dependency work', size: bindings },
  {
    id: 'long-prompts',
    ends: 'measured',
    push: 'raises',
    choice: false,
    phrase: 'long prompts at long-context prices',
    plural: true,
    size: longPrompts,
    applies: (ctx) => ctx.report.models.some((m) => m.long_context),
  },
  { id: 'scale-up', ends: 'chosen', push: 'raises', choice: false, phrase: 'integration, qualification and upstream change', plural: true, size: null },
  {
    id: 'release-floors',
    ends: 'chosen',
    push: 'lowers',
    choice: false,
    phrase: 'two release floors and a workflow still being worked out',
    plural: true,
    size: null,
  },
  { id: 'other-models', ends: 'chosen', push: 'none', choice: false, phrase: "other models' token use", size: null },
  { id: 'billing', ends: 'chosen', push: 'either', choice: false, phrase: 'the billing basis', size: null },
];

/** Listed last whatever its size; whether it is also the smallest is computed (`smallestIsLast`). */
const LAST: Definition = { id: 'bytes-per-token', ends: 'chosen', push: 'either', choice: false, phrase: 'bytes per token', size: bytesPerTokenRange };

/** Every limitation id a file may exist for, whether or not it applies to a given report. */
export const LIMITATION_IDS: readonly string[] = [...DEFINITIONS, LAST].map((d) => d.id);

export function variantContext(report: Report, scenarioId: string, target: Target, modelId: string): Ctx {
  const params = resolveParams(report, scenarioId);
  const base = estimate(report, target, modelId, params).headline.usd;
  return { report, scenarioId, target, modelId, params, base };
}

const magnitude = (e: Effect) => Math.max(Math.abs(e.low), Math.abs(e.high));

/** Every limitation that applies, with its effect: sized ones largest first, then those that cannot be sized, then bytes per token. */
export function limitations(ctx: Ctx): Limitation[] {
  const run = (d: Definition): Limitation => {
    const effect = d.size ? d.size(ctx) : null;
    return {
      id: d.id,
      effect,
      direction: effect ? direction(effect) : d.push,
      declared: d.push,
      choice: d.choice,
      phrase: d.phrase,
      plural: d.plural ?? false,
      ends: d.ends,
    };
  };
  const all = DEFINITIONS.filter((d) => d.applies?.(ctx) ?? true).map(run);
  const sized = all.filter((l) => l.effect).sort((a, b) => magnitude(b.effect as Effect) - magnitude(a.effect as Effect));
  return [...sized, ...all.filter((l) => !l.effect), run(LAST)];
}

/** True when the last item, bytes per token, is sized and no other sized item moves the figure less. */
export function smallestIsLast(list: readonly Limitation[]): boolean {
  const last = list.at(-1);
  if (!last?.effect) return false;
  const others = list.slice(0, -1).filter((l) => l.effect);
  return others.every((l) => magnitude(l.effect as Effect) >= magnitude(last.effect as Effect));
}
