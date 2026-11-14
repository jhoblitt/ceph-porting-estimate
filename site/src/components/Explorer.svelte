<!--
  The drill-down: all of Ceph, a component, a feature. The URL's path is the
  place, so back, forward and a shared link land on the same view; the map's
  area, the scope and the table's sort and filter are the reader's own and
  stay on the page. Every figure comes from lib/explorer.ts.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import type { Derived } from '../lib/derived.svelte';
  import {
    type AreaMode,
    type Row,
    type ScopeMode,
    type Sort,
    explorerLevel,
    perLineRange,
    requiredMode,
    widerMode,
  } from '../lib/explorer';
  import { count, percent, usd } from '../lib/format';
  import { SCOPE_MODE_LABELS } from '../lib/labels';
  import type { FeatureEstimate, GroupEstimate } from '../lib/model';
  import { DEPENDENCIES_COMPONENT_ID } from '../lib/report';
  import type { AppState, WriteOptions } from '../lib/state';
  import Section from './Section.svelte';
  import Segmented from './Segmented.svelte';
  import Breadcrumb, { type Crumb } from './explorer/Breadcrumb.svelte';
  import LevelTable from './explorer/LevelTable.svelte';
  import Treemap from './explorer/Treemap.svelte';
  import TreemapLegend from './explorer/TreemapLegend.svelte';

  interface Props {
    d: Derived;
    selection: AppState;
    onselect: (next: AppState, opts?: WriteOptions) => void;
  }

  let { d, selection, onselect }: Props = $props();

  const DEPENDENCY_GROUP_NAME = 'Dependencies';

  let area = $state<AreaMode>('code');
  let chosenMode = $state<ScopeMode>('headline');
  let query = $state('');
  let sort = $state<Sort>({ key: 'usd', dir: 'desc' });
  let hoverId = $state<string | null>(null);
  let treemap: Treemap | undefined = $state();

  const path = $derived(selection.path);
  const componentId = $derived(path[0] ?? null);
  const featureId = $derived(path[1] ?? null);
  /** A link to something outside the chosen scope widens it, so the place it names is drawn. */
  const mode = $derived(widerMode(chosenMode, requiredMode(d.root, path)));

  const level = $derived(explorerLevel(d.report, d.root, componentId, mode));
  const rootLevel = $derived(componentId === null ? level : explorerLevel(d.report, d.root, null, mode));
  const range = $derived(perLineRange(level));

  const component = $derived(
    d.root.children.find((c): c is GroupEstimate => c.kind !== 'feature' && c.id === componentId),
  );
  const componentInfo = $derived(d.report.components.find((c) => c.id === componentId));
  const isDependencies = $derived(componentId === DEPENDENCIES_COMPONENT_ID);
  const groupId = $derived(componentInfo?.group ?? null);
  const groupName = $derived(
    isDependencies ? DEPENDENCY_GROUP_NAME : (d.report.groups.find((g) => g.id === groupId)?.name ?? ''),
  );
  const componentName = $derived(level.groups[0]?.name ?? component?.name ?? '');

  const feature = $derived(
    component?.children.find((f): f is FeatureEstimate => f.kind === 'feature' && f.id === featureId),
  );

  type Focus = { cell: string | null } | null;

  /** Moves to a place, then puts focus where the reader's attention goes. */
  async function go(next: string[], focus: Focus) {
    onselect({ ...selection, path: next });
    await tick();
    if (!focus) return;
    await treemap?.focusCell(focus.cell);
  }

  function open(row: Row) {
    if (componentId === null) void go([row.id], { cell: null });
    else if (row.id === featureId) void go([componentId], { cell: row.id });
    else void go([componentId, row.id], null);
  }

  function up() {
    if (componentId === null) return;
    if (featureId !== null) void go([componentId], { cell: featureId });
    else void go([], { cell: componentId });
  }

  function setMode(m: ScopeMode) {
    chosenMode = m;
    // Narrowing the scope past the current place goes up to where it is still drawn.
    if (widerMode(m, requiredMode(d.root, path)) === m) return;
    if (componentId !== null && widerMode(m, requiredMode(d.root, [componentId])) === m) void go([componentId], null);
    else void go([], null);
  }

  const crumbs: Crumb[] = $derived.by(() => {
    const list: Crumb[] = [{ key: 'root', label: 'Ceph', go: () => void go([], { cell: componentId }) }];
    if (componentId === null) return list;
    const firstOfGroup = rootLevel.groups.find((g) => g.rows.some((r) => r.id === componentId))?.rows[0]?.id ?? null;
    list.push({ key: 'group', label: groupName, kind: 'group', go: () => void go([], { cell: firstOfGroup }) });
    list.push({ key: 'component', label: componentName, kind: 'component', go: () => void go([componentId], { cell: featureId }) });
    if (feature) list.push({ key: 'feature', label: feature.name, kind: 'feature', go: () => {} });
    return list;
  });

  const levelNoun = $derived(componentId === null ? 'Ceph' : componentName);
  const mapLabel = $derived(
    componentId === null
      ? `Map of Ceph's components by ${area === 'code' ? 'code lines' : 'cost'}, grouped by area`
      : `Map of the features of ${componentName} by ${area === 'code' ? 'code lines' : 'cost'}`,
  );
  const scopeWords: Record<ScopeMode, string> = {
    headline: 'in the headline',
    costed: 'costed, including what is shown separately',
    all: 'in every scope',
  };
</script>

<Section id="explorer" title="Explore by component">
  {#snippet lede()}
    Every part of Ceph, sized by its code and shaded by what a line of it costs to port. Choose a component to see its
    features, and a feature to see how its cost is built.
  {/snippet}

  <div class="controls">
    <Segmented
      legend="Area shows"
      name="explorer-area"
      options={[
        { value: 'code', label: 'Code lines' },
        { value: 'cost', label: 'Cost' },
      ]}
      value={area}
      onchange={(v) => (area = v)}
    />
    <Segmented
      legend="Include"
      name="explorer-scope"
      options={(['headline', 'costed', 'all'] as const).map((value) => ({ value, label: SCOPE_MODE_LABELS[value] }))}
      value={mode}
      onchange={setMode}
    />
  </div>

  <div class="where">
    <Breadcrumb {crumbs} />
    <p class="level-total">
      <strong>{usd(level.total.usd)}</strong> for {count(level.total.code)} lines {scopeWords[mode]}{#if componentId !== null},
        {percent(level.share)} of the headline{:else}, dependency work included{/if}
    </p>
  </div>

  <Treemap
    bind:this={treemap}
    {level}
    {rootLevel}
    {area}
    {range}
    selectedId={featureId}
    highlightId={hoverId}
    {query}
    label={mapLabel}
    onopen={open}
    onhover={(id) => (hoverId = id)}
    onup={up}
  />
  <TreemapLegend {area} {mode} {range} />

  <div class="table">
    <h3>{componentId === null ? 'Every component' : `The features of ${levelNoun}`}</h3>
    <LevelTable
      {level}
      caption={componentId === null ? 'Components by group' : `Features of ${componentName}`}
      bind:sort
      bind:query
      selectedId={featureId}
      highlightId={hoverId}
      onopen={open}
      onhover={(id) => (hoverId = id)}
    />
  </div>
</Section>

<style>
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4) var(--space-6);
    margin-bottom: var(--space-4);
  }

  .where {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-1) var(--space-4);
    min-height: 2.5rem;
    margin-bottom: var(--space-2);
  }

  .level-total {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .level-total strong {
    color: var(--text);
    font-size: var(--text-base);
  }

  .table {
    margin-top: var(--space-6);
  }

  .table h3 {
    margin-bottom: var(--space-3);
    font-size: var(--text-base);
  }
</style>
