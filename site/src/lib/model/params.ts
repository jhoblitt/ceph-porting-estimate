// Resolves assumptions.yaml into the numbers the cost model applies:
// baseline → scenario overrides and scale → scenario toggles → user overrides.

import type { Params as ParamsData, Quantity, Report, Scenario, ToggleId, Toggles } from '../report';
import type { ParamInfo, Params, Tokens } from './types';

const TOGGLE_IDS: readonly ToggleId[] = ['include_adjacent', 'clean_break'];
const TOGGLE_PATHS = new Map<string, ToggleId>(TOGGLE_IDS.map((id) => [`toggles.${id}`, id]));

// What a reader sees for each param; docs/cost-model.md gives the symbols.
const LABELS = new Map<string, string>([
  ['expansion', 'Target code tokens per source token'],
  ['test_ratio', 'Test code per product code in the finished port'],
  ['overhead', 'Output tokens per token of finished code'],
  ['uncached_per_output', 'Uncached input tokens per output token'],
  ['cache_write_per_output', 'Cache-write tokens per output token'],
  ['cache_read_per_output', 'Cache-read tokens per output token'],
  ['source_read_passes', 'Extra uncached reads of the source'],
  ['difficulty', 'Difficulty'],
  ['rust_factor', 'Rust effort relative to Go'],
  ['wasm_overhead', 'WASM effort relative to Rust'],
  ['clean_break_discount', 'Share of output kept with a clean break'],
  ['long_cache_write_share', 'Share of cache writes at the longer lifetime'],
  ['long_context_share', 'Billed at long-context prices'],
  ['model_efficiency', 'Token use relative to the calibration model'],
  ['sloc_equivalent_bytes_per_line', 'Bytes per line of dependency work'],
  ['adjacent_uplift', 'Work around the port, per token of the port'],
]);

function isQuantity(node: unknown): node is Quantity {
  return typeof node === 'object' && node !== null && typeof (node as { value?: unknown }).value === 'number';
}

/** Every quantity under assumptions.params by dotted path, in document order. */
function quantities(params: ParamsData): Map<string, Quantity> {
  const found = new Map<string, Quantity>();
  const walk = (node: unknown, path: string): void => {
    if (isQuantity(node)) found.set(path, node);
    else if (typeof node === 'object' && node !== null) {
      for (const [key, child] of Object.entries(node)) walk(child, path === '' ? key : `${path}.${key}`);
    }
  };
  walk(params, '');
  return found;
}

/**
 * The scenario, checked against the baseline. Unlike a reader's override, a
 * preset's figures are published, so bad preset data throws rather than
 * being dropped into a quietly wrong number.
 */
function scenarioOf(report: Report, id: string, baseline: Map<string, Quantity>): Scenario {
  const scenarios = report.assumptions.scenarios;
  if (!Object.hasOwn(scenarios, id)) throw new Error(`cost model: unknown scenario "${id}"`);
  const scenario = scenarios[id] as Scenario;
  const fail = (what: string): never => {
    throw new Error(`cost model: scenario "${id}" ${what}`);
  };
  const overrides = scenario.overrides ?? {};
  const scale = scenario.scale ?? {};
  for (const [path, value] of Object.entries(overrides)) {
    if (!baseline.has(path)) fail(`overrides unknown param "${path}"`);
    if (!Number.isFinite(value)) fail(`overrides "${path}" with a non-finite value`);
    if (Object.hasOwn(scale, path)) fail(`both overrides and scales "${path}"`);
  }
  for (const [path, factor] of Object.entries(scale)) {
    if (!baseline.has(path)) fail(`scales unknown param "${path}"`);
    if (!Number.isFinite(factor)) fail(`scales "${path}" by a non-finite factor`);
  }
  for (const key of Object.keys(scenario.toggles ?? {})) {
    if (!(TOGGLE_IDS as readonly string[]).includes(key)) fail(`sets unknown toggle "${key}"`);
  }
  return scenario;
}

/** The baseline with a checked scenario's overrides (replace) and scale (× the baseline value) applied. */
function scenarioValues(baseline: Map<string, Quantity>, scenario: Scenario): Map<string, number> {
  const values = new Map([...baseline].map(([path, q]) => [path, q.value]));
  for (const [path, value] of Object.entries(scenario.overrides ?? {})) values.set(path, value);
  for (const [path, factor] of Object.entries(scenario.scale ?? {})) {
    values.set(path, (baseline.get(path) as Quantity).value * factor);
  }
  return values;
}

/** True for a share (λ, σ), which the model holds between 0 and 1. */
export function isShare(path: string): boolean {
  return path === 'long_cache_write_share' || path.startsWith('long_context_share.');
}

/** Every param is at least 0; a share is also at most 1. */
export function clamp(path: string, value: number): number {
  return isShare(path) ? Math.min(1, Math.max(0, value)) : Math.max(0, value);
}

function bytesPerToken(data: Report['assumptions']['bytes_per_token']): Record<string, number> {
  if (!Object.hasOwn(data, 'default')) throw new Error('cost model: bytes_per_token has no default');
  return Object.fromEntries(
    Object.entries(data).map(([lang, q]) => {
      if (!(Number.isFinite(q.value) && q.value > 0)) {
        throw new Error(`cost model: bytes_per_token.${lang} must be a positive number`);
      }
      return [lang, q.value];
    }),
  );
}

function build(values: Map<string, number>, toggles: Toggles, report: Report): Params {
  const get = (path: string): number => {
    const v = values.get(path);
    if (v === undefined) throw new Error(`cost model: assumptions.params has no ${path}`);
    return v;
  };
  const perCategory = (prefix: string): Tokens => ({
    uncached: get(`${prefix}.uncached`),
    cacheWrite: get(`${prefix}.cache_write`),
    cacheRead: get(`${prefix}.cache_read`),
    output: get(`${prefix}.output`),
  });
  const efficiencyPrefix = 'model_efficiency.';
  return {
    bytesPerToken: bytesPerToken(report.assumptions.bytes_per_token),
    expansion: get('expansion'),
    testRatio: get('test_ratio'),
    overhead: get('overhead'),
    uncachedPerOutput: get('uncached_per_output'),
    cacheWritePerOutput: get('cache_write_per_output'),
    cacheReadPerOutput: get('cache_read_per_output'),
    sourceReadPasses: get('source_read_passes'),
    difficulty: {
      config: get('difficulty.config'),
      glue: get('difficulty.glue'),
      standard: get('difficulty.standard'),
      hard: get('difficulty.hard'),
      extreme: get('difficulty.extreme'),
    },
    rustFactor: get('rust_factor'),
    wasmOverhead: get('wasm_overhead'),
    cleanBreakDiscount: get('clean_break_discount'),
    longCacheWriteShare: get('long_cache_write_share'),
    longContextShare: perCategory('long_context_share'),
    // fromEntries defines own properties, so no model id can reach the prototype.
    modelEfficiency: Object.fromEntries(
      [...values].filter(([path]) => path.startsWith(efficiencyPrefix)).map(([path, v]) => [path.slice(efficiencyPrefix.length), v]),
    ),
    slocEquivalentBytesPerLine: get('sloc_equivalent_bytes_per_line'),
    adjacentUplift: perCategory('adjacent_uplift'),
    toggles: { includeAdjacent: toggles.include_adjacent, cleanBreak: toggles.clean_break },
  };
}

/**
 * The params for a scenario, with the reader's overrides on top. Override
 * keys are dotted snake_case paths under assumptions.params, or
 * `toggles.<id>` with a value above 0 meaning on. Unknown paths and
 * non-finite values are ignored. Throws on an unknown scenario or bad
 * scenario data.
 */
export function resolveParams(report: Report, scenarioId: string, overrides: Record<string, number> = {}): Params {
  const baseline = quantities(report.assumptions.params);
  const scenario = scenarioOf(report, scenarioId, baseline);
  const values = scenarioValues(baseline, scenario);
  const toggles: Toggles = { ...report.assumptions.toggles, ...scenario.toggles };
  for (const [path, value] of Object.entries(overrides)) {
    if (!Number.isFinite(value)) continue;
    const toggle = TOGGLE_PATHS.get(path);
    if (toggle) toggles[toggle] = value > 0;
    else if (values.has(path)) values.set(path, value);
  }
  for (const [path, value] of values) values.set(path, clamp(path, value));
  return build(values, toggles, report);
}

function label(path: string, report: Report): string {
  const humanize = (key: string) => key.replaceAll('_', ' ');
  const dot = path.indexOf('.');
  const head = dot === -1 ? path : path.slice(0, dot);
  const base = LABELS.get(head) ?? humanize(head);
  if (dot === -1) return base;
  const leaf = path.slice(dot + 1);
  const leafLabel = head === 'model_efficiency' ? (report.models.find((m) => m.id === leaf)?.name ?? leaf) : humanize(leaf);
  return `${base}: ${leafLabel}`;
}

/** Every adjustable quantity under assumptions.params, in document order. Throws as resolveParams does. */
export function describeParams(report: Report, scenarioId: string): ParamInfo[] {
  const baseline = quantities(report.assumptions.params);
  const values = scenarioValues(baseline, scenarioOf(report, scenarioId, baseline));
  return [...baseline].map(([path, q]) => ({
    path,
    label: label(path, report),
    baseline: q.value,
    scenario: clamp(path, values.get(path) ?? q.value),
    measured: q.measured,
    source: q.source,
    reason: q.reason,
  }));
}
