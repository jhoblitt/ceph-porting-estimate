// The reader's selection, kept in the URL hash so any view can be linked:
//
//   #/<route>?target=rust&model=fable-5-2&scenario=naive&path=rgw/rgw-core&o.difficulty.hard=2
//
// <route> is empty for the report, `methods` or `calibration`. `path` is the
// drill-down, `o.<dotted param path>` an override of an assumption and
// `o.toggles.<id>=0|1` of a toggle. `section` names a heading on a prose
// page. Parsing never throws: what is unknown or malformed falls back to its
// default.

import { type Readable, writable } from 'svelte/store';
import { canonicalOverrides } from './overrides';
import { DEPENDENCIES_COMPONENT_ID, type Report, TARGETS, type Target, type ToggleId } from './report';

export const ROUTES = ['report', 'methods', 'calibration'] as const;
export type Route = (typeof ROUTES)[number];

export const DEFAULT_TARGET: Target = 'go';
export const DEFAULT_MODEL = 'opus-5-5';
export const DEFAULT_SCENARIO = 'calibrated';

export interface AppState {
  route: Route;
  target: Target;
  model: string;
  scenario: string;
  /** [], [componentId] or [componentId, featureId]. */
  path: string[];
  /**
   * Dotted param path, e.g. `difficulty.hard`, → value; or `toggles.<id>` →
   * 0 or 1.
   */
  overrides: Record<string, number>;
  /** A heading id on a prose page, which the page scrolls to; absent elsewhere. */
  section?: string;
}

/** The hash's fields as written, before validation against the report. */
export interface RawState {
  route: string;
  target?: string;
  model?: string;
  scenario?: string;
  section?: string;
  path: string[];
  overrides: Record<string, string>;
}

/** The heading ids each prose page has; a section the page does not have is dropped. */
export type SectionIds = Partial<Record<Route, ReadonlySet<string>>>;

const OVERRIDE_PREFIX = 'o.';
const DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i;

/** A query component decoded as URLSearchParams decodes it, or null for a broken escape. */
function decodeComponent(s: string): string | null {
  try {
    return decodeURIComponent(s.replaceAll('+', ' '));
  } catch {
    return null;
  }
}

/**
 * The `path` parameter's segments. They are split on a literal slash before
 * each is decoded, so an id holding an escaped slash stays one segment;
 * URLSearchParams would decode the whole value first. A broken escape drops
 * the path rather than guessing at it.
 */
function pathSegments(query: string): string[] {
  for (const part of query.split('&')) {
    const eq = part.indexOf('=');
    if (eq === -1 || decodeComponent(part.slice(0, eq)) !== 'path') continue;
    const value = part.slice(eq + 1);
    if (value === '') return [];
    const segments = value.split('/').map(decodeComponent);
    return segments.every((s): s is string => s !== null) ? segments : [];
  }
  return [];
}

export function parseHash(hash: string): RawState {
  const body = hash.startsWith('#') ? hash.slice(1) : hash;
  const q = body.indexOf('?');
  const route = (q === -1 ? body : body.slice(0, q)).replace(/^\/+|\/+$/g, '');
  const params = new URLSearchParams(q === -1 ? '' : body.slice(q + 1));

  const raw: RawState = { route, path: [], overrides: {} };
  for (const key of ['target', 'model', 'scenario', 'section'] as const) {
    const value = params.get(key);
    if (value !== null) raw[key] = value;
  }
  raw.path = pathSegments(q === -1 ? '' : body.slice(q + 1));

  const overrides = new Map<string, string>();
  for (const [key, value] of params) {
    const param = key.slice(OVERRIDE_PREFIX.length);
    if (key.startsWith(OVERRIDE_PREFIX) && param !== '' && !overrides.has(param)) {
      overrides.set(param, value);
    }
  }
  // fromEntries defines own properties, so a `__proto__` key stays inert.
  raw.overrides = Object.fromEntries(overrides);
  return raw;
}

export function defaultState(report: Report): AppState {
  const models = report.models.map((m) => m.id);
  const scenarios = report.assumptions.scenarios;
  let scenario = DEFAULT_SCENARIO;
  if (!Object.hasOwn(scenarios, scenario)) {
    scenario = Object.hasOwn(scenarios, report.assumptions.default_scenario)
      ? report.assumptions.default_scenario
      : (Object.keys(scenarios)[0] ?? DEFAULT_SCENARIO);
  }
  return {
    route: 'report',
    target: DEFAULT_TARGET,
    model: models.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : (models[0] ?? DEFAULT_MODEL),
    scenario,
    path: [],
    overrides: {},
  };
}

function isRoute(s: string): s is Route {
  return (ROUTES as readonly string[]).includes(s);
}

function isTarget(s: string | undefined): s is Target {
  return (TARGETS as readonly (string | undefined)[]).includes(s);
}

function featureIds(report: Report, componentId: string): string[] | undefined {
  const component = report.components.find((c) => c.id === componentId);
  if (component) return component.features.map((f) => f.id);
  if (componentId === DEPENDENCIES_COMPONENT_ID && report.dependencies.length > 0) {
    return report.dependencies.map((d) => d.id);
  }
  return undefined;
}

function validPath(path: string[], report: Report): string[] {
  const [componentId, featureId] = path;
  if (!componentId) return [];
  const features = featureIds(report, componentId);
  if (!features) return [];
  if (featureId === undefined || !features.includes(featureId)) return [componentId];
  return [componentId, featureId];
}

/** True when the dotted path names a single quantity in `params`. */
function isQuantityPath(params: unknown, dotted: string): boolean {
  let node = params;
  for (const key of dotted.split('.')) {
    if (typeof node !== 'object' || node === null || !Object.hasOwn(node, key)) return false;
    node = (node as Record<string, unknown>)[key];
  }
  return (
    typeof node === 'object' &&
    node !== null &&
    typeof (node as Record<string, unknown>)['value'] === 'number'
  );
}

const TOGGLE_PREFIX = 'toggles.';

/** The override key for a toggle, e.g. `toggles.clean_break`; its value is 0 (off) or 1 (on). */
export function toggleKey(id: ToggleId): string {
  return `${TOGGLE_PREFIX}${id}`;
}

function isToggleKey(key: string, report: Report): boolean {
  return key.startsWith(TOGGLE_PREFIX) && Object.hasOwn(report.assumptions.toggles, key.slice(TOGGLE_PREFIX.length));
}

function validOverrides(raw: Record<string, string>, report: Report): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, text] of Object.entries(raw)) {
    if (!DECIMAL.test(text)) continue;
    const value = Number(text);
    if (isToggleKey(key, report)) {
      if (value === 0 || value === 1) out[key] = value;
    } else if (isQuantityPath(report.assumptions.params, key) && Number.isFinite(value)) {
      out[key] = value;
    }
  }
  return out;
}

export function validateState(raw: RawState, report: Report, sections: SectionIds = {}): AppState {
  const d = defaultState(report);
  const { model } = raw;
  const scenario =
    raw.scenario !== undefined && Object.hasOwn(report.assumptions.scenarios, raw.scenario) ? raw.scenario : d.scenario;
  const route = raw.route === '' || !isRoute(raw.route) ? 'report' : raw.route;
  const state: AppState = {
    route,
    target: isTarget(raw.target) ? raw.target : d.target,
    model: model !== undefined && report.models.some((m) => m.id === model) ? model : d.model,
    scenario,
    path: validPath(raw.path, report),
    overrides: canonicalOverrides(report, scenario, validOverrides(raw.overrides, report)),
  };
  if (raw.section !== undefined && sections[route]?.has(raw.section)) state.section = raw.section;
  return state;
}

export function stateFromHash(hash: string, report: Report, sections: SectionIds = {}): AppState {
  return validateState(parseHash(hash), report, sections);
}

/**
 * The canonical hash for a state. Target, model and scenario are always
 * written so a shared link keeps its meaning if a default changes.
 */
export function hashFromState(state: AppState): string {
  const enc = encodeURIComponent;
  const parts = [`target=${enc(state.target)}`, `model=${enc(state.model)}`, `scenario=${enc(state.scenario)}`];
  if (state.path.length > 0) parts.push(`path=${state.path.map(enc).join('/')}`);
  for (const key of Object.keys(state.overrides).sort()) {
    parts.push(`${OVERRIDE_PREFIX}${enc(key)}=${enc(String(state.overrides[key]))}`);
  }
  if (state.section !== undefined) parts.push(`section=${enc(state.section)}`);
  return `#/${state.route === 'report' ? '' : state.route}?${parts.join('&')}`;
}

/**
 * The hash of a page, keeping the reader's selection but never a section:
 * a section names a heading on the page it was set on, and another page
 * might have a heading with the same id.
 */
export function routeHash(state: AppState, route: Route): string {
  const { section: _, ...rest } = state;
  return hashFromState({ ...rest, route });
}

/** Where the store reads and writes the hash; a fake in tests. */
export interface HashLocation {
  read(): string;
  /** Write the hash as a new history entry. */
  push(hash: string): void;
  /** Write the hash over the current history entry. */
  replace(hash: string): void;
  /** Call `onChange` when the hash changes by navigation; returns a stop function. */
  listen(onChange: () => void): () => void;
}

export function windowHashLocation(win: Window): HashLocation {
  return {
    read: () => win.location.hash,
    push: (hash) => win.history.pushState(null, '', hash),
    replace: (hash) => win.history.replaceState(null, '', hash),
    listen: (onChange) => {
      // Back and forward over pushState entries fire popstate; a typed or
      // clicked hash fires hashchange. The store ignores the duplicate.
      win.addEventListener('hashchange', onChange);
      win.addEventListener('popstate', onChange);
      return () => {
        win.removeEventListener('hashchange', onChange);
        win.removeEventListener('popstate', onChange);
      };
    },
  };
}

export interface WriteOptions {
  /** Overwrite the current history entry, e.g. while a slider moves. */
  replace?: boolean;
}

export interface StateStore extends Readable<AppState> {
  set(next: AppState, opts?: WriteOptions): void;
  update(fn: (current: AppState) => AppState, opts?: WriteOptions): void;
  /** Stop following navigation. */
  destroy(): void;
}

/**
 * A store of the validated state, synchronised with the hash both ways. It
 * notifies only when the canonical hash changes.
 */
export function createStateStore(report: Report, loc: HashLocation, sections: SectionIds = {}): StateStore {
  const fromHash = (hash: string) => stateFromHash(hash, report, sections);
  let current = fromHash(loc.read());
  let currentHash = hashFromState(current);
  if (loc.read() !== currentHash) loc.replace(currentHash);
  const inner = writable(current);

  const accept = (next: AppState, hash: string) => {
    current = next;
    currentHash = hash;
    inner.set(next);
  };

  const write = (next: AppState, opts?: WriteOptions) => {
    const valid = fromHash(hashFromState(next));
    const hash = hashFromState(valid);
    if (hash === currentHash) return;
    if (opts?.replace) loc.replace(hash);
    else loc.push(hash);
    accept(valid, hash);
  };

  const stop = loc.listen(() => {
    const read = loc.read();
    const next = fromHash(read);
    const hash = hashFromState(next);
    if (read !== hash) loc.replace(hash);
    if (hash !== currentHash) accept(next, hash);
  });

  return {
    subscribe: inner.subscribe,
    set: write,
    update: (fn, opts) => write(fn(current), opts),
    destroy: stop,
  };
}
