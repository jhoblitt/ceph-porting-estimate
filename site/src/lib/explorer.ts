// What the explorer shows at one level of the estimate tree: the rows of its
// table (components under their groups at the root, features under a
// component), their figures in the scope the reader chose, subtotals, shares
// of the headline and cost per line. Everything here is read off the model's
// output; the views add no arithmetic of their own.

import type { FeatureEstimate, GroupEstimate, Params } from './model';
import { DEPENDENCIES_COMPONENT_ID, type Difficulty, type Kind, type Report, type Scope } from './report';
import { positiveRange } from './scale';

/** Which work the explorer counts: the headline, that plus what is shown separately, or every line. */
export type ScopeMode = 'headline' | 'costed' | 'all';
/** What a treemap cell's area stands for. */
export type AreaMode = 'code' | 'cost';

/** The group the explorer files the synthetic dependency component under; groups are presentation only. */
export const DEPENDENCY_GROUP_ID = 'dependency-work';
const DEPENDENCY_GROUP = {
  name: 'Dependencies',
  description:
    'Bindings and ports of the libraries Ceph builds on, for the current target. Its lines are lines of work, not Ceph code.',
};
const DEPENDENCY_ROW_NAME = 'Dependency work';

export interface Figures {
  /** Code lines; for dependency work, lines of work. */
  code: number;
  sourceTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  usd: number;
}

/** The share of a row in one scope: a treemap cell draws one block per part. */
export interface Part {
  scope: Scope;
  code: number;
  usd: number;
  /** Dollars per code line; null when nothing in the part is costed. */
  perLine: number | null;
}

export interface Row {
  id: string;
  name: string;
  kind: 'component' | 'feature';
  figures: Figures;
  /** figures.usd ÷ the headline cost of the whole estimate. */
  share: number;
  /** The share as a bar length, 0 to 1, on a scale where the level's largest row is 1. */
  bar: number;
  /** Dollars per costed code line; lines that are not ported do not dilute it. Null when nothing is costed. */
  perLine: number | null;
  /** The row's parts by scope, in headline, shown, not-ported order; parts with nothing in them are left out. */
  parts: Part[];
  /** Features in scope that match files (a component), or 1 (a feature). */
  features: number;
  /** A feature's own scope, kind and difficulty. */
  scope?: Scope;
  featureKind?: Kind;
  difficulty?: Difficulty;
}

export interface RowGroup {
  id: string;
  name: string;
  description: string;
  rows: Row[];
  /** Of every row in the group, whatever a filter shows. */
  subtotal: Figures;
  share: number;
}

export interface Level {
  /** Null at the root. */
  componentId: string | null;
  /** At the root, the report's groups in order, then the dependency work; at a component, one group of its features. */
  groups: RowGroup[];
  total: Figures;
  share: number;
  /** The headline cost of the whole estimate, which every share divides by. */
  headlineUsd: number;
}

const SCOPES: Record<ScopeMode, readonly Scope[]> = {
  headline: ['headline'],
  costed: ['headline', 'shown'],
  all: ['headline', 'shown', 'not-ported'],
};

export function inScope(mode: ScopeMode, scope: Scope): boolean {
  return SCOPES[mode].includes(scope);
}

/**
 * False for a feature whose globs match no file at this commit, and for a
 * dependency that needs no work for the target: neither is listed or counted.
 */
export function hasContent(f: FeatureEstimate): boolean {
  return f.sloc.files > 0 || f.sloc.code > 0;
}

function zeroFigures(): Figures {
  return { code: 0, sourceTokens: 0, outputTokens: 0, cacheReadTokens: 0, usd: 0 };
}

function addFigures(into: Figures, from: Figures): Figures {
  into.code += from.code;
  into.sourceTokens += from.sourceTokens;
  into.outputTokens += from.outputTokens;
  into.cacheReadTokens += from.cacheReadTokens;
  into.usd += from.usd;
  return into;
}

function perLine(usd: number, code: number): number | null {
  return code > 0 && usd > 0 ? usd / code : null;
}

const shareOf = (usd: number, headline: number) => (headline > 0 ? usd / headline : 0);

function isComponent(c: GroupEstimate['children'][number]): c is GroupEstimate {
  return c.kind !== 'feature';
}

function componentRow(c: GroupEstimate, mode: ScopeMode, headlineUsd: number): Row | null {
  const parts: Part[] = [];
  const figures = zeroFigures();
  for (const scope of SCOPES[mode]) {
    if (scope === 'not-ported') continue;
    const cost = scope === 'headline' ? c.headline : c.shown;
    addFigures(figures, {
      code: cost.sloc.code,
      sourceTokens: cost.sourceTokens,
      outputTokens: cost.tokens.output,
      cacheReadTokens: cost.tokens.cacheRead,
      usd: cost.usd,
    });
    parts.push({ scope, code: cost.sloc.code, usd: cost.usd, perLine: perLine(cost.usd, cost.sloc.code) });
  }
  const rowPerLine = perLine(figures.usd, figures.code);
  if (inScope(mode, 'not-ported')) {
    figures.code += c.notPorted.sloc.code;
    parts.push({ scope: 'not-ported', code: c.notPorted.sloc.code, usd: 0, perLine: null });
  }
  if (figures.code <= 0 && figures.usd <= 0) return null;
  const features = c.children.filter((f) => f.kind === 'feature' && hasContent(f) && inScope(mode, f.scope)).length;
  return {
    id: c.id,
    name: c.id === DEPENDENCIES_COMPONENT_ID ? DEPENDENCY_ROW_NAME : c.name,
    kind: 'component',
    figures,
    share: shareOf(figures.usd, headlineUsd),
    bar: 0,
    perLine: rowPerLine,
    parts: parts.filter((p) => p.code > 0 || p.usd > 0),
    features,
  };
}

function featureRow(f: FeatureEstimate, headlineUsd: number): Row {
  const ported = f.scope !== 'not-ported';
  const figures: Figures = ported
    ? {
        code: f.sloc.code,
        sourceTokens: f.sourceTokens,
        outputTokens: f.tokens.output,
        cacheReadTokens: f.tokens.cacheRead,
        usd: f.usd,
      }
    : { ...zeroFigures(), code: f.sloc.code };
  const p = ported ? perLine(f.usd, f.sloc.code) : null;
  return {
    id: f.id,
    name: f.name,
    kind: 'feature',
    figures,
    share: shareOf(figures.usd, headlineUsd),
    bar: 0,
    perLine: p,
    parts: [{ scope: f.scope, code: figures.code, usd: figures.usd, perLine: p }],
    features: 1,
    scope: f.scope,
    featureKind: f.featureKind,
    difficulty: f.difficulty,
  };
}

function rowGroup(id: string, name: string, description: string, rows: Row[], headlineUsd: number): RowGroup {
  const subtotal = rows.reduce((s, r) => addFigures(s, r.figures), zeroFigures());
  return { id, name, description, rows, subtotal, share: shareOf(subtotal.usd, headlineUsd) };
}

function level(componentId: string | null, groups: RowGroup[], headlineUsd: number): Level {
  const rows = groups.flatMap((g) => g.rows);
  const max = Math.max(0, ...rows.map((r) => r.share));
  for (const r of rows) r.bar = max > 0 ? r.share / max : 0;
  const total = groups.reduce((s, g) => addFigures(s, g.subtotal), zeroFigures());
  return { componentId, groups, total, share: shareOf(total.usd, headlineUsd), headlineUsd };
}

/**
 * The explorer's level for a path: the root when `componentId` is null, else
 * that component's features. A component the tree lacks gives an empty level.
 */
export function explorerLevel(report: Report, root: GroupEstimate, componentId: string | null, mode: ScopeMode): Level {
  const headlineUsd = root.headline.usd;
  const components = root.children.filter(isComponent);

  if (componentId !== null) {
    const c = components.find((x) => x.id === componentId);
    if (!c) return level(componentId, [], headlineUsd);
    const rows = c.children
      .filter((f): f is FeatureEstimate => f.kind === 'feature' && hasContent(f) && inScope(mode, f.scope))
      .map((f) => featureRow(f, headlineUsd));
    const info = report.components.find((x) => x.id === c.id);
    const name = c.id === DEPENDENCIES_COMPONENT_ID ? DEPENDENCY_ROW_NAME : c.name;
    return level(componentId, [rowGroup(c.id, name, info?.description ?? DEPENDENCY_GROUP.description, rows, headlineUsd)], headlineUsd);
  }

  const groupOf = new Map(report.components.map((c) => [c.id, c.group]));
  const byGroup = new Map<string, Row[]>(report.groups.map((g) => [g.id, []]));
  const dependencyRows: Row[] = [];
  for (const c of components) {
    const row = componentRow(c, mode, headlineUsd);
    if (!row) continue;
    if (c.id === DEPENDENCIES_COMPONENT_ID) dependencyRows.push(row);
    else byGroup.get(groupOf.get(c.id) ?? '')?.push(row);
  }
  const groups = report.groups
    .map((g) => rowGroup(g.id, g.name, g.description, byGroup.get(g.id) ?? [], headlineUsd))
    .filter((g) => g.rows.length > 0);
  if (dependencyRows.length > 0) {
    groups.push(rowGroup(DEPENDENCY_GROUP_ID, DEPENDENCY_GROUP.name, DEPENDENCY_GROUP.description, dependencyRows, headlineUsd));
  }
  return level(null, groups, headlineUsd);
}

const MODE_ORDER: readonly ScopeMode[] = ['headline', 'costed', 'all'];

/** The wider of two scope modes. */
export function widerMode(a: ScopeMode, b: ScopeMode): ScopeMode {
  return MODE_ORDER.indexOf(a) >= MODE_ORDER.indexOf(b) ? a : b;
}

function modeFor(scope: Scope): ScopeMode {
  return scope === 'headline' ? 'headline' : scope === 'shown' ? 'costed' : 'all';
}

/**
 * The narrowest scope mode in which the path's component and feature are
 * drawn, so a link to something outside the headline opens where it shows.
 * A path the tree does not hold needs nothing.
 */
export function requiredMode(root: GroupEstimate, path: readonly string[]): ScopeMode {
  const [componentId, featureId] = path;
  const c = root.children.filter(isComponent).find((x) => x.id === componentId);
  if (!c) return 'headline';
  let mode: ScopeMode =
    c.headline.sloc.code > 0 || c.headline.usd > 0 ? 'headline' : c.shown.sloc.code > 0 || c.shown.usd > 0 ? 'costed' : 'all';
  const f = c.children.find((x): x is FeatureEstimate => x.kind === 'feature' && x.id === featureId);
  if (f) mode = widerMode(mode, modeFor(f.scope));
  return mode;
}

export interface ScopeFigures {
  code: number;
  usd: number;
  share: number;
}

export interface ComponentScopes {
  headline: ScopeFigures;
  shown: ScopeFigures;
  notPorted: { code: number };
  /** Features that match files, in any scope. */
  features: number;
}

/** A component's lines and cost in each scope, with shares of the headline; null for an id the tree lacks. */
export function componentScopes(root: GroupEstimate, componentId: string): ComponentScopes | null {
  const c = root.children.filter(isComponent).find((x) => x.id === componentId);
  if (!c) return null;
  const headline = root.headline.usd;
  const figures = (part: GroupEstimate['headline']): ScopeFigures => ({
    code: part.sloc.code,
    usd: part.usd,
    share: shareOf(part.usd, headline),
  });
  return {
    headline: figures(c.headline),
    shown: figures(c.shown),
    notPorted: { code: c.notPorted.sloc.code },
    features: c.children.filter((f) => f.kind === 'feature' && hasContent(f)).length,
  };
}

/** The unit the explorer quotes cost per line in: a cent a line reads better as $10 per 1,000 lines. */
export const LINES_PER_UNIT = 1000;

export function costPerThousandLines(perLine: number | null): number | null {
  return perLine === null ? null : perLine * LINES_PER_UNIT;
}

/** The cheapest and dearest cost per line among the level's parts, or null when nothing is costed. */
export function perLineRange(l: Level): { min: number; max: number } | null {
  return positiveRange(l.groups.flatMap((g) => g.rows.flatMap((r) => r.parts.map((p) => p.perLine ?? 0))));
}

export type SortKey = 'name' | 'code' | 'sourceTokens' | 'outputTokens' | 'cacheReadTokens' | 'usd' | 'share';
export interface Sort {
  key: SortKey;
  dir: 'asc' | 'desc';
}

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

function sortValue(r: Row, key: Exclude<SortKey, 'name'>): number {
  return key === 'share' ? r.share : r.figures[key];
}

/** A sorted copy; ties go by name, A to Z. */
export function sortRows(rows: readonly Row[], sort: Sort): Row[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  const byName = (a: Row, b: Row) => collator.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return [...rows].sort((a, b) => {
    if (sort.key === 'name') return sign * byName(a, b);
    const d = sortValue(a, sort.key) - sortValue(b, sort.key);
    return d !== 0 ? sign * d : byName(a, b);
  });
}

/** Text a filter matches against: trimmed and folded, so "  OSD " finds "OSD (classic)". */
function needle(query: string): string {
  return query.trim().toLocaleLowerCase('en');
}

export function matchesFilter(name: string, query: string): boolean {
  const q = needle(query);
  return q === '' || name.toLocaleLowerCase('en').includes(q);
}

/** The groups with only the rows whose name contains the text; empty groups are dropped and subtotals kept whole. */
export function filterGroups(groups: RowGroup[], query: string): RowGroup[] {
  if (needle(query) === '') return groups;
  return groups
    .map((g) => ({ ...g, rows: g.rows.filter((r) => matchesFilter(r.name, query)) }))
    .filter((g) => g.rows.length > 0);
}

export type ChainKey =
  | 'source'
  | 'difficulty'
  | 'target'
  | 'expansion'
  | 'newTests'
  | 'overhead'
  | 'modelEfficiency'
  | 'cleanBreak'
  | 'adjacent';

/** One step from a feature's size to its output tokens: the factor applied and the running value. */
export interface ChainStep {
  key: ChainKey;
  /** Null for the starting size. */
  factor: number | null;
  value: number;
}

/**
 * The multiplications docs/cost-model.md applies to a feature's source
 * tokens, in order, ending at its output tokens. Empty for a feature that is
 * not ported, which costs nothing.
 */
export function factorChain(f: FeatureEstimate, params: Params): ChainStep[] {
  if (f.scope === 'not-ported') return [];
  const x = f.factors;
  const factors: [ChainKey, number][] = [
    ['difficulty', x.difficulty],
    ['target', x.target],
    ['expansion', x.expansion],
    ['newTests', 1 + x.newTestRatio],
    ['overhead', x.overhead],
    ['modelEfficiency', x.modelEfficiency],
    ['cleanBreak', x.cleanBreak],
  ];
  if (params.toggles.includeAdjacent) factors.push(['adjacent', 1 + params.adjacentUplift.output]);
  const steps: ChainStep[] = [{ key: 'source', factor: null, value: f.sourceTokens }];
  let value = f.sourceTokens;
  for (const [key, factor] of factors) {
    value *= factor;
    steps.push({ key, factor, value });
  }
  return steps;
}
