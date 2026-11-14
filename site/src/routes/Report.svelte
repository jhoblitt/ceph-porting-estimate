<!-- The estimate. The views (headline figures, matrix, treemap, table, sliders) mount in #views. -->
<script lang="ts">
  import { DEPENDENCIES_COMPONENT_ID, type Report, TARGET_LABELS } from '../lib/report';
  import type { AppState } from '../lib/state';
  import SelectionControls from '../components/SelectionControls.svelte';

  interface Props {
    report: Report;
    selection: AppState;
    onselect: (next: AppState) => void;
  }

  let { report, selection, onselect }: Props = $props();

  const model = $derived(report.models.find((m) => m.id === selection.model));
  const scenario = $derived(report.assumptions.scenarios[selection.scenario]);
  const pathNames = $derived.by(() => {
    const [componentId, featureId] = selection.path;
    if (componentId === undefined) return [];
    const component = report.components.find((c) => c.id === componentId);
    if (component) {
      const feature = component.features.find((f) => f.id === featureId);
      return feature ? [component.name, feature.name] : [component.name];
    }
    if (componentId !== DEPENDENCIES_COMPONENT_ID) return [];
    const dependency = report.dependencies.find((d) => d.id === featureId);
    return dependency ? ['Dependencies', dependency.name] : ['Dependencies'];
  });
  const overrideCount = $derived(Object.keys(selection.overrides).length);
</script>

<div class="intro">
  <h1>Porting estimate</h1>
  <p class="lede">
    What it would cost, in tokens and US dollars, to port Ceph with an agentic coding model.
  </p>
</div>

<SelectionControls {report} {selection} onchange={onselect} />

<section id="views" class="views" aria-label="Estimate">
  <dl class="selection">
    <div>
      <dt>Target</dt>
      <dd>{TARGET_LABELS[selection.target]}</dd>
    </div>
    <div>
      <dt>Model</dt>
      <dd>{model?.name ?? selection.model}</dd>
    </div>
    <div>
      <dt>Scenario</dt>
      <dd>{scenario?.label ?? selection.scenario}</dd>
    </div>
    <div>
      <dt>Showing</dt>
      <dd>{['ceph', ...pathNames].join(' › ')}</dd>
    </div>
    <div>
      <dt>Components</dt>
      <dd class="num">{report.components.length}</dd>
    </div>
    <div>
      <dt>Adjusted assumptions</dt>
      <dd class="num">{overrideCount}</dd>
    </div>
  </dl>
  <p class="pending">The cost views are on their way.</p>
</section>

<style>
  .intro h1 {
    margin-bottom: var(--space-2);
  }

  .lede {
    margin: 0;
    font-size: var(--text-lg);
    color: var(--text-muted);
  }

  .views {
    padding: var(--space-6);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .selection {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: var(--space-5);
    margin: 0 0 var(--space-5);
  }

  dt {
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  dd {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 600;
  }

  .pending {
    margin: 0;
    color: var(--text-muted);
  }

  @media (max-width: 719px) {
    .views {
      padding: var(--space-5);
    }

    .selection {
      grid-template-columns: 1fr;
    }
  }
</style>
