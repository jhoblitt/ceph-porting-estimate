// Builds the estimate tree: features under components under a root, with
// dependency work as a synthetic component, and the target × model matrix.

import {
  DEPENDENCIES_COMPONENT_ID,
  type Dependency,
  type Difficulty,
  type Feature,
  type Kind,
  type Model,
  type Report,
  type Scope,
  TARGETS,
  type Target,
} from '../report';
import {
  addSloc,
  bytesPerToken,
  difficultyClass,
  featureTokens,
  newTestRatio,
  slocOf,
  sourceTokens,
  sumTokens,
  targetFactor,
  usdByCategory,
  zeroSloc,
  zeroTokens,
} from './cost';
import {
  CATEGORIES,
  type CephSloc,
  type Cost,
  type FeatureEstimate,
  type GroupEstimate,
  type Params,
  type Sloc,
} from './types';

/** What the formulas need beyond the feature itself, fixed for one estimate. */
type Context = {
  params: Params;
  target: Target;
  model: Model;
  /** M[model] */
  M: number;
  /** R */
  R: number;
  /** C when clean_break is on, else 1 */
  C: number;
};

/** A feature or a dependency, reduced to what the formulas read. */
type WorkItem = {
  id: string;
  name: string;
  scope: Scope;
  kind: Kind;
  difficulty: Difficulty;
  sloc: Sloc;
  /** S */
  S: number;
};

/**
 * R = Σ S over headline tests ÷ Σ S over headline product code, from raw
 * source tokens; dependencies are not features and do not enter it. 0 when
 * there is no headline product code.
 */
export function existingTestRatio(report: Report, params: Params): number {
  let test = 0;
  let product = 0;
  for (const component of report.components) {
    for (const f of component.features) {
      if (f.scope !== 'headline') continue;
      if (f.kind === 'test') test += sourceTokens(f.langs, params);
      else if (f.kind === 'product') product += sourceTokens(f.langs, params);
    }
  }
  return product > 0 ? test / product : 0;
}

function context(report: Report, target: Target, modelId: string, params: Params): Context {
  const model = report.models.find((m) => m.id === modelId);
  if (!model) throw new Error(`cost model: unknown model "${modelId}"`);
  const M = Object.hasOwn(params.modelEfficiency, modelId) ? params.modelEfficiency[modelId] : undefined;
  if (M === undefined) throw new Error(`cost model: no model_efficiency for model "${modelId}"`);
  const R = existingTestRatio(report, params);
  return { params, target, model, M, R, C: params.toggles.cleanBreak ? params.cleanBreakDiscount : 1 };
}

function featureItem(f: Feature, params: Params): WorkItem {
  const { id, name, scope, kind, difficulty } = f;
  return { id, name, scope, kind, difficulty, sloc: slocOf(f.langs), S: sourceTokens(f.langs, params) };
}

/** Dependency work: S = sloc_equivalent × B ÷ bpt[cpp]; native and drop carry none. */
function dependencyItem(d: Dependency, ctx: Context): WorkItem {
  const t = d.targets[ctx.target];
  const lines = t.strategy === 'bindings' || t.strategy === 'port' ? t.sloc_equivalent : 0;
  const bytes = lines * ctx.params.slocEquivalentBytesPerLine;
  return {
    id: d.id,
    name: d.name,
    scope: 'headline',
    kind: 'product',
    difficulty: t.difficulty,
    sloc: { files: 0, code: lines, comment: 0, blank: 0, bytes },
    S: bytes / bytesPerToken(ctx.params, 'cpp'),
  };
}

function featureEstimate(item: WorkItem, ctx: Context): FeatureEstimate {
  const { params } = ctx;
  const factors = {
    difficulty: params.difficulty[difficultyClass(item.kind, item.difficulty)],
    target: targetFactor(params, ctx.target),
    expansion: params.expansion,
    newTestRatio: item.kind === 'product' ? newTestRatio(params, ctx.R) : 0,
    overhead: params.overhead,
    modelEfficiency: ctx.M,
    cleanBreak: ctx.C,
  };
  const tokens = item.scope === 'not-ported' ? zeroTokens() : featureTokens(item.S, factors, params);
  const usd = usdByCategory(ctx.model, params, tokens);
  return {
    kind: 'feature',
    id: item.id,
    name: item.name,
    scope: item.scope,
    featureKind: item.kind,
    difficulty: item.difficulty,
    sloc: item.sloc,
    factors,
    sourceTokens: item.S,
    tokens,
    usd: sumTokens(usd),
    usdByCategory: usd,
  };
}

type Part = Cost & { sloc: Sloc };

function zeroPart(): Part {
  return { sourceTokens: 0, tokens: zeroTokens(), usd: 0, usdByCategory: zeroTokens(), sloc: zeroSloc() };
}

function addPart(into: Part, from: Part): void {
  into.sourceTokens += from.sourceTokens;
  into.usd += from.usd;
  for (const cat of CATEGORIES) {
    into.tokens[cat] += from.tokens[cat];
    into.usdByCategory[cat] += from.usdByCategory[cat];
  }
  addSloc(into.sloc, from.sloc);
}

function group(kind: GroupEstimate['kind'], id: string, name: string, children: GroupEstimate['children']): GroupEstimate {
  const g: GroupEstimate = {
    kind,
    id,
    name,
    sloc: zeroSloc(),
    headline: zeroPart(),
    shown: zeroPart(),
    notPorted: { sloc: zeroSloc() },
    children,
  };
  for (const c of children) {
    addSloc(g.sloc, c.sloc);
    if (c.kind !== 'feature') {
      addPart(g.headline, c.headline);
      addPart(g.shown, c.shown);
      addSloc(g.notPorted.sloc, c.notPorted.sloc);
    } else if (c.scope === 'not-ported') {
      addSloc(g.notPorted.sloc, c.sloc);
    } else {
      addPart(c.scope === 'headline' ? g.headline : g.shown, c);
    }
  }
  return g;
}

/**
 * The estimate tree for one target and model: the report's components in
 * order, then the `dependencies` component with one feature per dependency.
 * Throws on a model the report or params do not know.
 */
export function estimate(report: Report, target: Target, modelId: string, params: Params): GroupEstimate {
  const ctx = context(report, target, modelId, params);
  const components = report.components.map((c) =>
    group('component', c.id, c.name, c.features.map((f) => featureEstimate(featureItem(f, params), ctx))),
  );
  const dependencies = group(
    'component',
    DEPENDENCIES_COMPONENT_ID,
    'Dependencies',
    report.dependencies.map((d) => featureEstimate(dependencyItem(d, ctx), ctx)),
  );
  return group('root', 'root', 'Ceph', [...components, dependencies]);
}

/**
 * A root's line counts over the report's own components only, leaving out
 * the dependency-equivalent lines under the `dependencies` component: the
 * size of Ceph itself.
 */
export function cephSloc(root: GroupEstimate): CephSloc {
  const own: CephSloc = { sloc: zeroSloc(), headline: zeroSloc(), shown: zeroSloc(), notPorted: zeroSloc() };
  for (const c of root.children) {
    if (c.kind === 'feature' || c.id === DEPENDENCIES_COMPONENT_ID) continue;
    addSloc(own.sloc, c.sloc);
    addSloc(own.headline, c.headline.sloc);
    addSloc(own.shown, c.shown.sloc);
    addSloc(own.notPorted, c.notPorted.sloc);
  }
  return own;
}

/** Headline totals for every target and every model in the report. */
export function matrix(report: Report, params: Params): Record<Target, Record<string, Cost>> {
  const row = (target: Target): Record<string, Cost> =>
    Object.fromEntries(
      report.models.map((m) => {
        const { sourceTokens, tokens, usd, usdByCategory } = estimate(report, target, m.id, params).headline;
        return [m.id, { sourceTokens, tokens, usd, usdByCategory }];
      }),
    );
  return Object.fromEntries(TARGETS.map((t) => [t, row(t)])) as Record<Target, Record<string, Cost>>;
}
