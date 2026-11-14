<script lang="ts">
  import { type Report, TARGETS, TARGET_LABELS, type Target } from '../lib/report';
  import { revealAssumptions } from '../lib/reveal';
  import type { AppState } from '../lib/state';
  import Segmented from './Segmented.svelte';

  interface Props {
    report: Report;
    selection: AppState;
    onchange: (next: AppState) => void;
    /** How many assumptions the reader has changed (Derived.changedCount). */
    changed: number;
  }

  let { report, selection, onchange, changed }: Props = $props();

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
  <div class="scenario">
    <Segmented
      legend="Scenario"
      name="scenario"
      options={scenarios}
      value={selection.scenario}
      onchange={(scenario) => onchange({ ...selection, scenario })}
    />
    {#if changed > 0}
      <button type="button" class="custom" onclick={() => revealAssumptions()}>
        Custom: {changed === 1 ? 'one assumption' : `${changed} assumptions`} changed
      </button>
    {/if}
  </div>
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

  .scenario {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--space-2) var(--space-3);
  }

  .custom {
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--accent);
    border-radius: 999px;
    font-size: var(--text-sm);
    font-weight: 600;
    line-height: 1.75;
    background: var(--accent-wash);
    color: var(--text);
    font-family: inherit;
    cursor: pointer;
  }

  .custom:hover {
    text-decoration: underline;
  }

  @media (width < 720px) {
    .controls {
      flex-direction: column;
      padding: var(--space-4);
    }

    .scenario {
      align-items: stretch;
      flex-direction: column;
    }

    .custom {
      align-self: flex-start;
    }
  }
</style>
