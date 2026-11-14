<!--
  Headline cost for every target and model under the current scenario and
  overrides, shaded on the sequential scale by cost (log, cheapest to
  dearest). The table is its own text equivalent. Choosing a cell sets both
  the target and the model.
-->
<script lang="ts">
  import type { Derived } from '../lib/derived.svelte';
  import { usd, usdExact } from '../lib/format';
  import { TARGETS, TARGET_LABELS, type Target } from '../lib/report';
  import { positiveRange, sequentialStep } from '../lib/scale';
  import type { AppState } from '../lib/state';
  import Amount from './Amount.svelte';
  import Section from './Section.svelte';

  interface Props {
    d: Derived;
    selection: AppState;
    onselect: (next: AppState) => void;
  }

  let { d, selection, onselect }: Props = $props();

  /** --seq-1 … --seq-7 in tokens.css. */
  const STEPS = 7;

  const models = $derived(d.report.models);
  const costs = $derived(TARGETS.flatMap((t) => models.map((m) => d.matrixCell(t, m.id).usd)));
  /** The shading spans the positive cells only, so one $0 cell does not flatten the rest. */
  const range = $derived(positiveRange(costs));
  const anyUnshaded = $derived(costs.some((c) => !(c > 0)));
  const step = (v: number) => (range ? sequentialStep(v, range.min, range.max, STEPS) : 0);

  function choose(target: Target, model: string) {
    onselect({ ...selection, target, model });
  }
</script>

<Section id="matrix" title="Every target and model">
  {#snippet lede()}
    The headline under {d.scenario.label}{d.customised ? ' with your changes' : ''}, for each target language and model.
    Choose a cell to make it the current pair.
  {/snippet}

  <div class="scroll">
    <table>
      <caption class="visually-hidden">Headline cost by target and model</caption>
      <thead>
        <tr>
          <td></td>
          {#each models as m (m.id)}
            <th scope="col">{m.name}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each TARGETS as t (t)}
          <tr>
            <th scope="row">{TARGET_LABELS[t]}</th>
            {#each models as m (m.id)}
              {@const cost = d.matrixCell(t, m.id).usd}
              {@const s = step(cost)}
              {@const current = t === d.target && m.id === d.modelId}
              <td>
                <button
                  type="button"
                  class="cell"
                  class:current
                  class:unshaded={s === 0}
                  aria-pressed={current}
                  aria-label="{TARGET_LABELS[t]} with {m.name}: {usd(cost)}, exactly {usdExact(cost)}"
                  style:background={s > 0 ? `var(--seq-${s})` : undefined}
                  style:color={s > 0 ? `var(--seq-ink-${s})` : undefined}
                  onclick={() => choose(t, m.id)}
                >
                  <span class="amount"><Amount value={cost} kind="usd" /></span>
                  {#if current}<span class="mark">Selected</span>{/if}
                </button>
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  {#if range}
    <div class="legend">
      <span class="key" aria-hidden="true">
        <span>{usd(range.min)}</span>
        <span class="ramp">
          {#each Array.from({ length: STEPS }, (_, i) => i + 1) as i (i)}
            <span style:background="var(--seq-{i})"></span>
          {/each}
        </span>
        <span>{usd(range.max)}</span>
      </span>
      <p class="note">
        Shades run from the cheapest cell, {usd(range.min)}, to the dearest, {usd(range.max)}, and step by ratio rather than
        difference.{#if anyUnshaded}{' '}A
          cell that costs nothing is left unshaded.{/if}
      </p>
    </div>
  {/if}
</Section>

<style>
  .scroll {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 8px;
    table-layout: fixed;
  }

  th {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text-muted);
    text-align: start;
    padding: var(--space-1) var(--space-2);
  }

  thead th {
    text-align: center;
  }

  tbody th {
    width: 5rem;
    color: var(--text);
  }

  td {
    padding: 0;
  }

  .cell {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 4.5rem;
    padding: var(--space-2);
    border: 0;
    border-radius: var(--radius-sm);
    font: inherit;
    cursor: pointer;
  }

  .cell.unshaded {
    background: var(--surface);
    color: var(--text);
    box-shadow: inset 0 0 0 1px var(--border-strong);
  }

  .cell:hover {
    filter: brightness(1.08);
  }

  .cell.current {
    outline: 3px solid var(--text);
    outline-offset: 2px;
  }

  .cell.current:focus-visible {
    outline-color: var(--focus);
  }

  .amount {
    font-size: var(--text-lg);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .mark {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .legend {
    margin-top: var(--space-4);
    font-size: var(--text-sm);
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .key {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    margin-bottom: var(--space-2);
  }

  .ramp {
    display: inline-flex;
    gap: 2px;
  }

  .ramp span {
    width: 1.25rem;
    height: 0.75rem;
  }

  .ramp span:first-child {
    border-radius: 2px 0 0 2px;
  }

  .ramp span:last-child {
    border-radius: 0 2px 2px 0;
  }

  .note {
    margin: 0;
  }

  @media (max-width: 719px) {
    tbody th {
      width: 3.5rem;
      padding-inline: 0;
    }

    .amount {
      font-size: var(--text-base);
    }

    .cell {
      min-height: 3.75rem;
      padding: var(--space-1);
    }
  }

  @media (forced-colors: active) {
    .cell {
      border: 1px solid ButtonText;
    }
  }
</style>
