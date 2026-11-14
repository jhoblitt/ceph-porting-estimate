// The one place the reader's selection becomes model output. Views read from
// a Derived and never call the cost model themselves. Each output is a rune,
// so it recomputes only when what it depends on changes: a new target does
// not re-resolve params, a new override does not re-describe the scenario.

import {
  type CephSloc,
  type Cost,
  type GroupEstimate,
  type ParamInfo,
  type Params,
  type Tokens,
  cephSloc,
  describeParams,
  estimate,
  existingTestRatio,
  matrix,
  resolveParams,
} from './model';
import { shares, totalTokens } from './categories';
import { linearTicks } from './scale';
import {
  DEPENDENCIES_COMPONENT_ID,
  type Model,
  type Report,
  type Scenario,
  type Target,
  type ToggleId,
} from './report';
import { type AppState, toggleKey } from './state';

/** The headline cost of the current target and model under one scenario. */
export interface ScenarioTotal {
  id: string;
  label: string;
  description: string;
  /** The scenario the reader has selected. */
  current: boolean;
  /** The current scenario with the reader's overrides on top. */
  custom: boolean;
  /** The scenario as published. */
  preset: Cost;
  /** What the reader sees: `preset`, or for a custom current scenario the overridden cost. */
  cost: Cost;
}

export interface ToggleInfo {
  id: ToggleId;
  /** The override key, e.g. `toggles.clean_break`. */
  key: string;
  /** The value the scenario sets. */
  scenario: boolean;
  /** The value in effect, after the reader's override. */
  value: boolean;
}

export interface ScopeSummary {
  /** Ceph's own lines, without dependency work. */
  ceph: CephSloc;
  /** The synthetic component holding dependency work for the current target. */
  dependencies: GroupEstimate | undefined;
  /** How many dependencies need bindings or a port for the current target. */
  dependenciesWithWork: number;
  /** Components with work that is costed but kept out of the headline, in report order. */
  shown: { id: string; name: string }[];
  /** Lines that are not ported, by group, largest first; groups with none are left out. */
  notPortedByGroup: { id: string; name: string; code: number }[];
}

/** Overrides in a stable order, so equal contents give an equal key. */
function overridesKey(overrides: Record<string, number>): string {
  return JSON.stringify(Object.entries(overrides).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

function headlineCost(root: GroupEstimate): Cost {
  const { sourceTokens, tokens, usd, usdByCategory } = root.headline;
  return { sourceTokens, tokens, usd, usdByCategory };
}

export class Derived {
  readonly report: Report;
  readonly #selection: () => AppState;

  /**
   * @param selection returns the current selection; reading it must be
   *   reactive (a prop, a $state, or a store read with `$`).
   */
  constructor(report: Report, selection: () => AppState) {
    this.report = report;
    this.#selection = selection;
  }

  readonly target: Target = $derived.by(() => this.#selection().target);
  readonly modelId: string = $derived.by(() => this.#selection().model);
  readonly scenarioId: string = $derived.by(() => this.#selection().scenario);
  readonly #overridesKey: string = $derived.by(() => overridesKey(this.#selection().overrides));
  /** The reader's overrides; a new object only when their contents change. */
  readonly overrides: Record<string, number> = $derived(
    Object.fromEntries(JSON.parse(this.#overridesKey) as [string, number][]),
  );
  readonly customised: boolean = $derived(this.#overridesKey !== '[]');

  readonly model: Model = $derived.by(() => {
    const m = this.report.models.find((x) => x.id === this.modelId);
    if (!m) throw new Error(`unknown model "${this.modelId}"`);
    return m;
  });
  readonly scenario: Scenario = $derived.by(() => {
    if (!Object.hasOwn(this.report.assumptions.scenarios, this.scenarioId)) {
      throw new Error(`unknown scenario "${this.scenarioId}"`);
    }
    return this.report.assumptions.scenarios[this.scenarioId] as Scenario;
  });

  readonly params: Params = $derived.by(() => resolveParams(this.report, this.scenarioId, this.overrides));
  /** Every adjustable param with its baseline and scenario value; independent of overrides. */
  readonly paramInfo: ParamInfo[] = $derived.by(() => describeParams(this.report, this.scenarioId));
  /** The estimate tree for the current target and model. */
  readonly root: GroupEstimate = $derived.by(() => estimate(this.report, this.target, this.modelId, this.params));
  /** Headline cost for every target and model under the current params. */
  readonly matrix: Record<Target, Record<string, Cost>> = $derived.by(() => matrix(this.report, this.params));
  /** R: tests Ceph already has, per product token, in the headline scope. */
  readonly existingTestRatio: number = $derived.by(() => existingTestRatio(this.report, this.params));

  /** The headline cost of one target and model; throws on a pair the matrix lacks rather than reading it as $0. */
  matrixCell(target: Target, modelId: string): Cost {
    const row = this.matrix[target];
    const cost = row && Object.hasOwn(row, modelId) ? row[modelId] : undefined;
    if (!cost) throw new Error(`matrix: no cost for ${target} with model "${modelId}"`);
    return cost;
  }

  /** How many assumptions the reader has changed; overrides are canonical, so each is a real change. */
  readonly changedCount: number = $derived(Object.keys(this.overrides).length);

  /** All headline tokens of the current target and model, and each category's share of them. */
  readonly tokenTotal: number = $derived.by(() => totalTokens(this.root.headline.tokens));
  readonly tokenShares: Tokens = $derived.by(() => shares(this.root.headline.tokens));
  /** Each category's share of the headline dollars. */
  readonly dollarShares: Tokens = $derived.by(() => shares(this.root.headline.usdByCategory));

  /** The largest headline total among the models at the current target: the common scale of the dollar bars. */
  readonly maxModelUsd: number = $derived.by(() => Math.max(0, ...this.byModel.map((m) => m.cost.usd)));

  /**
   * One bar per model on that common scale: `length` is its total ÷ the
   * largest, and each segment its category's dollars ÷ the largest, so bar
   * and segment lengths compare directly across models.
   */
  readonly dollarBars: { model: Model; cost: Cost; length: number; segments: Tokens; shares: Tokens }[] = $derived.by(() => {
    const max = this.maxModelUsd;
    const of = (v: number) => (max > 0 ? v / max : 0);
    return this.byModel.map(({ model, cost }) => ({
      model,
      cost,
      length: of(cost.usd),
      /** Each category's share of this bar, for laying out its parts within its length. */
      shares: shares(cost.usdByCategory),
      segments: {
        uncached: of(cost.usdByCategory.uncached),
        cacheWrite: of(cost.usdByCategory.cacheWrite),
        cacheRead: of(cost.usdByCategory.cacheRead),
        output: of(cost.usdByCategory.output),
      },
    }));
  });

  /** Round dollar ticks for the bars' common scale, each with its place along it (0 to 1). */
  readonly dollarAxis: { value: number; at: number }[] = $derived.by(() => {
    const max = this.maxModelUsd;
    return linearTicks(max).map((value) => ({ value, at: max > 0 ? value / max : 0 }));
  });

  /** Every model's headline cost at the current target, in report order. */
  readonly byModel: { model: Model; cost: Cost }[] = $derived.by(() =>
    this.report.models.map((model) => ({ model, cost: this.matrix[this.target][model.id] as Cost })),
  );

  /** Each scenario as published, for the current target and model; overrides play no part. */
  readonly #presets: Map<string, Cost> = $derived.by(() =>
    new Map(
      Object.keys(this.report.assumptions.scenarios).map((id) => [
        id,
        headlineCost(estimate(this.report, this.target, this.modelId, resolveParams(this.report, id))),
      ]),
    ),
  );

  /** The headline cost under each scenario, in report order; overrides apply to the current one only. */
  readonly scenarioTotals: ScenarioTotal[] = $derived.by(() => {
    const custom = headlineCost(this.root);
    return Object.entries(this.report.assumptions.scenarios).map(([id, s]) => {
      const preset = this.#presets.get(id) as Cost;
      const current = id === this.scenarioId;
      const isCustom = current && this.customised;
      return {
        id,
        label: s.label,
        description: s.description,
        current,
        custom: isCustom,
        preset,
        cost: isCustom ? custom : preset,
      };
    });
  });

  readonly toggles: ToggleInfo[] = $derived.by(() => {
    const scenarioToggles = this.scenario.toggles ?? {};
    return (Object.keys(this.report.assumptions.toggles) as ToggleId[]).map((id) => {
      const key = toggleKey(id);
      const scenario = scenarioToggles[id] ?? this.report.assumptions.toggles[id];
      const override = this.overrides[key];
      return { id, key, scenario, value: override === undefined ? scenario : override > 0 };
    });
  });

  readonly scope: ScopeSummary = $derived.by(() => {
    const components = new Map(this.report.components.map((c) => [c.id, c]));
    const groups = new Map(this.report.groups.map((g) => [g.id, { id: g.id, name: g.name, code: 0 }]));
    const shown: ScopeSummary['shown'] = [];
    let dependencies: GroupEstimate | undefined;
    for (const child of this.root.children) {
      if (child.kind === 'feature') continue;
      if (child.id === DEPENDENCIES_COMPONENT_ID) {
        dependencies = child;
        continue;
      }
      if (child.shown.sloc.code > 0) shown.push({ id: child.id, name: child.name });
      const group = groups.get(components.get(child.id)?.group ?? '');
      if (group) group.code += child.notPorted.sloc.code;
    }
    const notPortedByGroup = [...groups.values()].filter((g) => g.code > 0).sort((a, b) => b.code - a.code);
    const dependenciesWithWork = dependencies?.children.filter((c) => c.sloc.code > 0).length ?? 0;
    return { ceph: cephSloc(this.root), dependencies, dependenciesWithWork, shown, notPortedByGroup };
  });

  /** Each param's value in effect, by dotted path: the reader's override, else the scenario's. */
  readonly values: Map<string, number> = $derived(
    new Map(this.paramInfo.map((p) => [p.path, this.overrides[p.path] ?? p.scenario])),
  );

  /** True when every model in the report needs the same tokens, so the comparison is price sheets alone. */
  readonly sameVolumes: boolean = $derived.by(() => {
    const efficiencies = this.report.models.map((m) => this.params.modelEfficiency[m.id]);
    return efficiencies.every((e) => e === efficiencies[0]);
  });

  /** For each model with long-context prices: its threshold and the share of each category billed at them. */
  readonly longContext: { model: Model; threshold: number; shares: Tokens }[] = $derived.by(() =>
    this.report.models.flatMap((model) =>
      model.long_context
        ? [{ model, threshold: model.long_context.threshold_tokens, shares: this.params.longContextShare }]
        : [],
    ),
  );
}
