// The shape of report.json, written by `cephest rollup`. Keys mirror the
// JSON exactly (snake_case); see docs/cost-model.md for what each means.

export const TARGETS = ['go', 'rust', 'wasm'] as const;
export type Target = (typeof TARGETS)[number];
export const TARGET_LABELS: Record<Target, string> = { go: 'Go', rust: 'Rust', wasm: 'WASM' };

export type Scope = 'headline' | 'shown' | 'not-ported';
export type Kind = 'product' | 'test' | 'config';
export type Difficulty = 'config' | 'glue' | 'standard' | 'hard' | 'extreme';
export type Strategy = 'native' | 'bindings' | 'port' | 'drop';
export type TokenCategory = 'uncached' | 'cache_write' | 'cache_read' | 'output';
export type ToggleId = 'include_adjacent' | 'clean_break';

/** Every number that is an assumption or a measurement. */
export interface Quantity {
  value: number;
  measured: boolean;
  /** A URL, a repository file, or the literal "assumption". */
  source: string;
  reason: string;
}

export interface Ceph {
  repo: string;
  rev: string;
  commit_date: string;
}

export interface LineCounts {
  files: number;
  code: number;
  comment: number;
  blank: number;
  bytes: number;
}

export interface Feature {
  id: string;
  name: string;
  description: string;
  globs: string[];
  scope: Scope;
  kind: Kind;
  difficulty: Difficulty;
  why: string;
  /** Keyed by language name as the counter reports it. */
  langs: Record<string, LineCounts>;
}

/** A top-level area of Ceph (RADOS core, RGW, CephFS, …) that components belong to. */
export interface Group {
  id: string;
  name: string;
  description: string;
}

export interface Component {
  id: string;
  name: string;
  description: string;
  /** The id of the group the component belongs to. */
  group: string;
  root: string[];
  features: Feature[];
}

export interface SubmoduleSize extends LineCounts {
  available: boolean;
  /** Nested submodules that could not be counted. */
  unavailable_nested: number;
}

export interface DependencyTarget {
  strategy: Strategy;
  package: string | null;
  sloc_equivalent: number;
  difficulty: Difficulty;
  note: string;
}

export interface Dependency {
  id: string;
  name: string;
  used_for: string;
  /** Paths in the ceph tree; empty for a system dependency. */
  submodules: string[];
  submodule_size: SubmoduleSize | null;
  /** The listed submodules' own files, without their nested submodules. */
  submodule_own: SubmoduleSize | null;
  targets: Record<Target, DependencyTarget>;
}

/** USD per million tokens. */
export interface Prices {
  input: number;
  cache_write_short: number;
  cache_write_long: number;
  cache_read: number;
  output: number;
}

export interface LongContextPrices extends Prices {
  threshold_tokens: number;
}

export interface Model {
  id: string;
  name: string;
  vendor: string;
  source: string;
  /** YYYY-MM-DD */
  read_on: string;
  usd_per_mtok: Prices;
  /** Display labels for the two cache-write lifetimes, e.g. "5m" and "1h". */
  cache_write_ttl: { short: string; long: string };
  long_context: LongContextPrices | null;
}

export interface Params {
  expansion: Quantity;
  test_ratio: Quantity;
  overhead: Quantity;
  uncached_per_output: Quantity;
  cache_write_per_output: Quantity;
  cache_read_per_output: Quantity;
  source_read_passes: Quantity;
  difficulty: Record<Difficulty, Quantity>;
  rust_factor: Quantity;
  wasm_overhead: Quantity;
  clean_break_discount: Quantity;
  long_cache_write_share: Quantity;
  long_context_share: Record<TokenCategory, Quantity>;
  /** Keyed by model id. */
  model_efficiency: Record<string, Quantity>;
  sloc_equivalent_bytes_per_line: Quantity;
  adjacent_uplift: Record<TokenCategory, Quantity>;
}

export type Toggles = Record<ToggleId, boolean>;

/**
 * What a scenario stands for in the range: its low, central and high
 * outcomes, or a reference point that is not an outcome.
 */
export const SCENARIO_ROLES = ['low', 'central', 'high', 'reference'] as const;
export type ScenarioRole = (typeof SCENARIO_ROLES)[number];

export interface Scenario {
  label: string;
  description: string;
  /** Absent in data older than the roles; the views then show the scenario without placing it in the range. */
  role?: ScenarioRole;
  /** Dotted param path → replacement value. */
  overrides?: Record<string, number>;
  /** Dotted param path → factor applied to the baseline value. */
  scale?: Record<string, number>;
  toggles?: Partial<Toggles>;
}

export interface Assumptions {
  bytes_per_token: Record<string, Quantity> & { default: Quantity };
  params: Params;
  toggles: Toggles;
  scenarios: Record<string, Scenario>;
  default_scenario: string;
}

export interface Report {
  ceph: Ceph;
  /** In display order; rollup may end it with a synthetic `unclassified` group. */
  groups: Group[];
  components: Component[];
  dependencies: Dependency[];
  models: Model[];
  assumptions: Assumptions;
  /** Free-form; the calibration page owns its interpretation. */
  calibration: Record<string, unknown>;
}

/**
 * The id of the synthetic component the cost model files dependency work
 * under; its feature ids are dependency ids.
 */
export const DEPENDENCIES_COMPONENT_ID = 'dependencies';

export function cephCommitUrl(ceph: Ceph): string {
  return `https://github.com/${ceph.repo}/commit/${ceph.rev}`;
}

export function shortSha(rev: string): string {
  return rev.slice(0, 7);
}

/** The calendar day of a commit date as the committer wrote it. */
export function commitDay(commitDate: string): string {
  return /^\d{4}-\d{2}-\d{2}/.exec(commitDate)?.[0] ?? commitDate;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function hasIds(v: unknown): boolean {
  return Array.isArray(v) && v.every((e) => isObject(e) && typeof e['id'] === 'string');
}

/**
 * Checks the parts of the report the shell depends on and returns it typed.
 * The rest of the shape is trusted: rollup writes it from validated data.
 */
export function parseReport(raw: unknown): Report {
  const fail = (what: string): never => {
    throw new Error(`report.json: ${what}`);
  };
  if (!isObject(raw)) return fail('not an object');
  const { ceph, groups, components, dependencies, models, assumptions } = raw;
  if (!isObject(ceph) || typeof ceph['rev'] !== 'string' || typeof ceph['repo'] !== 'string') {
    fail('ceph.repo and ceph.rev must be strings');
  }
  if (!hasIds(groups)) fail('groups must be a list of objects with ids');
  const groupIds = new Set((groups as { id: string }[]).map((g) => g.id));
  if (!hasIds(components)) fail('components must be a list of objects with ids');
  for (const c of components as Record<string, unknown>[]) {
    if (!hasIds(c['features'])) fail(`component ${String(c['id'])}: features must have ids`);
    const group = c['group'];
    if (typeof group !== 'string' || !groupIds.has(group)) fail(`component ${String(c['id'])}: group must name a group`);
  }
  if (!hasIds(dependencies)) fail('dependencies must be a list of objects with ids');
  if (!hasIds(models) || (models as unknown[]).length === 0) fail('models must be a non-empty list');
  if (!isObject(assumptions) || !isObject(assumptions['scenarios']) || !isObject(assumptions['params'])) {
    fail('assumptions.params and assumptions.scenarios must be objects');
  }
  return raw as unknown as Report;
}

// A glob rather than an import, so typechecking and unit tests do not need
// the generated file; vite.config.ts refuses to build without it.
const generated = import.meta.glob<unknown>('../generated/report.json', { import: 'default' });

/** Loads the report the build generated into src/generated/. */
export async function loadReport(): Promise<Report> {
  const load = generated['../generated/report.json'];
  if (!load) throw new Error('report.json: not generated; run `make site-dev-data` or `make site-build`');
  return parseReport(await load());
}
