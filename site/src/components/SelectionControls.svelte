<script lang="ts">
  import { type Report, TARGETS, TARGET_LABELS, type Target } from '../lib/report';
  import type { AppState } from '../lib/state';
  import Segmented from './Segmented.svelte';

  interface Props {
    report: Report;
    selection: AppState;
    onchange: (next: AppState) => void;
  }

  let { report, selection, onchange }: Props = $props();

  const targets = TARGETS.map((t) => ({ value: t, label: TARGET_LABELS[t] }));
  const models = $derived(report.models.map((m) => ({ value: m.id, label: m.name })));
  const scenarios = $derived(
    Object.entries(report.assumptions.scenarios).map(([id, s]) => ({ value: id, label: s.label })),
  );
</script>

<section class="controls" aria-label="Selection">
  <Segmented
    legend="Target"
    name="target"
    options={targets}
    value={selection.target}
    onchange={(target: Target) => onchange({ ...selection, target })}
  />
  <Segmented
    legend="Model"
    name="model"
    options={models}
    value={selection.model}
    onchange={(model) => onchange({ ...selection, model })}
  />
  <Segmented
    legend="Scenario"
    name="scenario"
    options={scenarios}
    value={selection.scenario}
    onchange={(scenario) => onchange({ ...selection, scenario })}
  />
</section>

<style>
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-5) var(--space-6);
    padding: var(--space-5);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  @media (max-width: 719px) {
    .controls {
      flex-direction: column;
      padding: var(--space-4);
    }
  }
</style>
