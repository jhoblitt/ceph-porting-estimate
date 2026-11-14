// The dependency table: each library Ceph builds on, what the current target
// does with it, and what that work costs in the estimate. Costs come from the
// model's synthetic `dependencies` component; nothing is recomputed here.

import type { FeatureEstimate, GroupEstimate } from './model';
import {
  DEPENDENCIES_COMPONENT_ID,
  type Difficulty,
  type Report,
  type Strategy,
  TARGETS,
  type Target,
} from './report';

/** The order strategies are counted and explained in: least work first, then what is left behind. */
export const STRATEGIES: readonly Strategy[] = ['native', 'bindings', 'port', 'drop'];

export interface TargetPlan {
  target: Target;
  current: boolean;
  strategy: Strategy;
  package: string | null;
  /** Lines of work the strategy leaves; zero for native and drop, which the model does not cost. */
  lines: number;
  difficulty: Difficulty;
  /** The reasoning, verbatim. */
  note: string;
}

export interface DependencyRow {
  id: string;
  name: string;
  usedFor: string;
  /** The current target's plan. */
  strategy: Strategy;
  package: string | null;
  lines: number;
  difficulty: Difficulty;
  note: string;
  /** The estimate's cost of the work for the current target and model. */
  usd: number;
  /** usd ÷ the headline cost. */
  share: number;
  /** Every target's plan, in target order. */
  targets: TargetPlan[];
  /** Paths of the vendored submodules in the ceph tree; empty for a system library. */
  submodules: string[];
  /** The vendored code's size; null where the data has none. */
  submodule: { code: number; files: number; nestedUnavailable: number } | null;
}

export interface DependencySummary {
  /** Dearest first, then by name. */
  rows: DependencyRow[];
  /** Every strategy, in STRATEGIES order, with how many dependencies the current target gives it. */
  counts: { strategy: Strategy; count: number }[];
  /** Lines of work over every dependency. */
  lines: number;
  usd: number;
  share: number;
}

const workLines = (strategy: Strategy, lines: number) => (strategy === 'bindings' || strategy === 'port' ? lines : 0);

export function dependencySummary(report: Report, root: GroupEstimate, target: Target): DependencySummary {
  const component = root.children.find(
    (c): c is GroupEstimate => c.kind !== 'feature' && c.id === DEPENDENCIES_COMPONENT_ID,
  );
  const costs = new Map(
    (component?.children ?? []).filter((c): c is FeatureEstimate => c.kind === 'feature').map((f) => [f.id, f]),
  );
  const headline = root.headline.usd;
  const share = (usd: number) => (headline > 0 ? usd / headline : 0);

  const rows = report.dependencies.map((d): DependencyRow => {
    const plan = d.targets[target];
    const cost = costs.get(d.id);
    const size = d.submodule_size;
    return {
      id: d.id,
      name: d.name,
      usedFor: d.used_for,
      strategy: plan.strategy,
      package: plan.package,
      lines: cost?.sloc.code ?? workLines(plan.strategy, plan.sloc_equivalent),
      difficulty: plan.difficulty,
      note: plan.note,
      usd: cost?.usd ?? 0,
      share: share(cost?.usd ?? 0),
      targets: TARGETS.map((t) => {
        const p = d.targets[t];
        return {
          target: t,
          current: t === target,
          strategy: p.strategy,
          package: p.package,
          lines: workLines(p.strategy, p.sloc_equivalent),
          difficulty: p.difficulty,
          note: p.note,
        };
      }),
      submodules: d.submodules,
      submodule:
        size && size.available ? { code: size.code, files: size.files, nestedUnavailable: size.unavailable_nested } : null,
    };
  });
  rows.sort((a, b) => b.usd - a.usd || a.name.localeCompare(b.name, 'en'));

  const counts = STRATEGIES.map((strategy) => ({ strategy, count: rows.filter((r) => r.strategy === strategy).length }));
  const usd = component?.headline.usd ?? 0;
  return { rows, counts, lines: rows.reduce((s, r) => s + r.lines, 0), usd, share: share(usd) };
}
