// The dependency table: each library Ceph builds on, what the current target
// does with it, and what that work costs in the estimate. Costs come from the
// model's synthetic `dependencies` component; nothing is recomputed here.

import { count, countExact, list } from './format';
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
  /** The vendored code's size with the submodules nested in it; null where the data has none. */
  submodule: { code: number; files: number; nestedUnavailable: number } | null;
  /** The listed submodules' own size, without what is nested in them; null where the data has none. */
  own: { code: number; files: number } | null;
}

/** A dependency named in a sentence. */
export interface NamedDependency {
  id: string;
  name: string;
}

export interface DependencySummary {
  /** Dearest first, then by name. */
  rows: DependencyRow[];
  /** Every strategy, in STRATEGIES order, with how many dependencies the current target gives it. */
  counts: { strategy: Strategy; count: number }[];
  /** The dependencies the current target uses through bindings, in report order. */
  bindings: NamedDependency[];
  /** Bindings and ports for the current target that leave no lines of work, in report order. */
  withoutWork: (NamedDependency & { strategy: Strategy })[];
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
    const own = d.submodule_own;
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
      own: own && own.available ? { code: own.code, files: own.files } : null,
    };
  });
  rows.sort((a, b) => b.usd - a.usd || a.name.localeCompare(b.name, 'en'));

  const counts = STRATEGIES.map((strategy) => ({ strategy, count: rows.filter((r) => r.strategy === strategy).length }));
  const usd = component?.headline.usd ?? 0;
  const inOrder = report.dependencies.map((d) => rows.find((r) => r.id === d.id) as DependencyRow);
  return {
    rows,
    counts,
    bindings: inOrder.filter((r) => r.strategy === 'bindings').map(({ id, name }) => ({ id, name })),
    withoutWork: inOrder
      .filter((r) => (r.strategy === 'bindings' || r.strategy === 'port') && r.lines === 0)
      .map(({ id, name, strategy }) => ({ id, name, strategy })),
    lines: rows.reduce((s, r) => s + r.lines, 0),
    usd,
    share: share(usd),
  };
}

export interface VendoredText {
  /** The size, e.g. "128k lines in 1,000 files of its own; 2.31M lines in 9,000 files with the submodules nested in it". */
  text: string;
  /** What the size leaves out, or that nothing is vendored; empty when there is nothing to add. */
  note: string;
}

const size = (code: number, files: number) => `${count(code)} lines in ${countExact(files)} files`;

/** A dependency's vendored size in words: its own code, and with what is nested in it where that differs. */
export function vendoredText(row: DependencyRow): VendoredText {
  const nested = row.submodule;
  const own = row.own;
  const n = nested?.nestedUnavailable ?? 0;
  const note = n > 0 ? `${n === 1 ? 'One nested submodule' : `${n} nested submodules`} could not be counted.` : '';
  if (own === null) {
    if (nested) return { text: `${size(nested.code, nested.files)} with the submodules nested in it`, note };
    return { text: 'Not available', note: row.submodules.length === 0 ? 'Not vendored: a system library.' : '' };
  }
  if (nested && (nested.code !== own.code || nested.files !== own.files)) {
    return { text: `${size(own.code, own.files)} of its own; ${size(nested.code, nested.files)} with the submodules nested in it`, note };
  }
  return { text: `${size(own.code, own.files)} of its own`, note };
}

/**
 * What "used through bindings" means for a target, with that target's list
 * from the data. A binding may run either way, and a plan may keep only part
 * of what an entry names (Rust's python3-saml plan keeps xmlsec1 and replaces
 * the Python package), so the sentence says only what is true of every such
 * plan and sends the reader to each entry's own plan for which code that is.
 */
export function bindingsText(targetName: string, bindings: readonly NamedDependency[]): string {
  if (bindings.length === 0) return `A ${targetName} port built to this estimate uses no dependency through bindings.`;
  return (
    `Used through bindings means a ${targetName} port built to this estimate still relies on existing code that it does ` +
    'not rewrite, reached across a language boundary. Which code that is, and what the port replaces, is in each ' +
    `entry's plan in the table below. For ${targetName} these are ${list(bindings.map((b) => b.name))}.`
  );
}
