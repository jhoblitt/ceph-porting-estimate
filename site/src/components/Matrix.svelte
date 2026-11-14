<!--
  The headline for every model's price sheet and every target, under the
  current scenario and overrides. One row per model, so any number of
  models fits a phone's width; one column per target. Only one model's
  token use was measured: its row says so, and every other row says it is
  that model's token counts on this model's price sheet, with the
  break-even that would make the two cost the same. Cells are not shaded:
  the figures are not a ranking of models. WASM is drawn behind the others,
  with a note on what its figure leaves out. The table is its own text
  equivalent; choosing a cell sets both the target and the model.
-->
<script lang="ts">
  import type { Derived } from '../lib/derived.svelte';
  import { paramValue, percent, usd, usdExact } from '../lib/format';
  import type { Model } from '../lib/report';
  import { TARGETS, type Target } from '../lib/report';
  import type { AppState } from '../lib/state';
  import { targetText } from '../lib/targets';
  import Amount from './Amount.svelte';
  import InfoPopover from './InfoPopover.svelte';
  import Section from './Section.svelte';

  interface Props {
    d: Derived;
    selection: AppState;
    onselect: (next: AppState) => void;
  }

  let { d, selection, onselect }: Props = $props();

  /** Closer to 1 than this, a break-even is "the same token counts". */
  const SAME = 0.0005;
  /** Below this factor, "N% fewer" would round to 100%. */
  const TINY = 0.01;

  const models = $derived(d.report.models);
  const measured = $derived(d.measuredModel);
  const targets = $derived(TARGETS.map((t) => ({ id: t, ...targetText(t, d.params) })));

  /** What a row's figures are: measured, or the measured model's token counts on this price sheet. */
  function basis(m: Model): string {
    if (!measured) return `Token counts priced at ${m.name}'s list prices.`;
    if (m.id === measured.id) {
      const project = d.calibration.projectName;
      const shared = d.sameVolumes ? '; every row uses these token counts' : '';
      return `Token use measured with this model${project ? `, on ${project}` : ''}${shared}.`;
    }
    const ratio = d.volumeRatios.get(m.id) ?? 1;
    const scaled = ratio === 1 ? '' : ` × ${paramValue(ratio)} (the model efficiency you set)`;
    return `${measured.name}'s token counts${scaled} at ${m.name}'s list prices.`;
  }

  /** The break-even against the measured model, as a hypothetical; empty where there is none. */
  function breakEven(m: Model): string {
    if (!measured || m.id === measured.id) return '';
    const f = d.breakEvens.get(m.id);
    if (f === null || f === undefined) return '';
    const same = (d.volumeRatios.get(m.id) ?? 1) === 1;
    const work = same ? 'for the same work' : 'than this row assumes';
    if (Math.abs(f - 1) < SAME) return `It would cost the same as ${measured.name} at the same token counts.`;
    if (f < TINY) {
      const of = same ? 'the tokens for the same work' : 'the tokens this row assumes';
      return `It would cost the same as ${measured.name} only if it needed less than 1% of ${of}.`;
    }
    const by = f < 1 ? `${percent(1 - f)} fewer` : `${percent(f - 1)} more`;
    return `It would cost the same as ${measured.name} if it needed ${by} tokens ${work}.`;
  }

  function choose(target: Target, model: string) {
    onselect({ ...selection, target, model });
  }
</script>

<Section id="matrix" title="The same work on each price sheet">
  {#snippet lede()}
    The headline under {d.scenario.label}{d.customised ? ' with your changes' : ''}, for each model's price sheet and each
    target language. Choose a cell to make it the current pair.
  {/snippet}

  <table>
    <caption class="visually-hidden">Headline cost by model and target</caption>
    <thead>
      <tr>
        <td></td>
        {#each targets as t (t.id)}
          <th scope="col" class:secondary={t.secondary}>
            <span class="target">{t.name}</span>
            {#if t.basis}<span class="basis">{t.basis}</span>{/if}
            {#if t.note}
              <InfoPopover label="About the {t.name} figures"><p>{t.note}</p></InfoPopover>
            {/if}
          </th>
        {/each}
      </tr>
    </thead>
    {#each models as m (m.id)}
      {@const isMeasured = measured?.id === m.id}
      {@const line = basis(m)}
      {@const even = breakEven(m)}
      <tbody class:measured={isMeasured}>
        <tr>
          <th scope="row">
            <span class="model">{m.name}</span>
            {#if measured}<span class="status">{isMeasured ? 'Measured' : 'Price sheet only'}</span>{/if}
          </th>
          {#each targets as t (t.id)}
            {@const cost = d.matrixCell(t.id, m.id).usd}
            {@const current = t.id === d.target && m.id === d.modelId}
            <td class:secondary={t.secondary}>
              <button
                type="button"
                class="cell"
                class:current
                aria-pressed={current}
                aria-label="{t.name} with {m.name}: {usd(cost)}, model output {usdExact(cost)}. {line}"
                onclick={() => choose(t.id, m.id)}
              >
                <span class="amount"><Amount value={cost} kind="usd" /></span>
                {#if current}<span class="mark">Selected</span>{/if}
              </button>
            </td>
          {/each}
        </tr>
        <tr class="note">
          <td colspan={targets.length + 1}>{line}{even ? ` ${even}` : ''}</td>
        </tr>
      </tbody>
    {/each}
  </table>

  <p class="caption">
    {#if d.sameVolumes}The rows differ because the price sheets do, above all the price of re-read context.{:else}The rows
      differ because the price sheets do and because of the model efficiencies you set.{/if} This is not a measurement of
    which model would port Ceph most cheaply{#if measured}: only {measured.name}'s token use was measured, and how many
      tokens any other model would need for the same work is not known{/if}.
  </p>
</Section>

<style>
  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    table-layout: fixed;
    font-variant-numeric: tabular-nums;
  }

  thead td {
    width: 11rem;
  }

  thead th {
    padding: 0 var(--space-1) var(--space-2);
    vertical-align: bottom;
    text-align: center;
    font-weight: 400;
    line-height: 1.3;
  }

  .target {
    display: block;
    font-weight: 600;
  }

  .basis {
    font-size: 0.75rem;
    color: var(--text-muted);
    line-height: 1.3;
  }

  thead th.secondary .target {
    color: var(--text-muted);
  }

  tbody th {
    padding: var(--space-3) var(--space-2) var(--space-1) 0;
    text-align: start;
    vertical-align: middle;
    font-weight: 400;
  }

  tbody + tbody tr:first-child > * {
    border-top: 1px solid var(--grid);
  }

  .model {
    display: block;
    font-weight: 600;
    line-height: 1.3;
  }

  .status {
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .measured .status {
    color: var(--accent);
    font-weight: 600;
  }

  td {
    padding: var(--space-3) var(--space-1) var(--space-1);
  }

  .cell {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 3.5rem;
    padding: var(--space-2) var(--space-1);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    cursor: pointer;
  }

  .secondary .cell {
    border-style: dashed;
    color: var(--text-muted);
  }

  .cell:hover {
    background: var(--accent-wash);
  }

  .cell.current {
    background: var(--accent-wash);
    color: var(--text);
    outline: 3px solid var(--accent);
    outline-offset: 1px;
  }

  .cell.current:focus-visible {
    outline-color: var(--focus);
  }

  .amount {
    font-size: var(--text-lg);
    font-weight: 600;
  }

  .secondary .amount {
    font-weight: 500;
  }

  .mark {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .note td {
    padding: 0 0 var(--space-3);
    font-size: var(--text-sm);
    color: var(--text-muted);
    line-height: 1.45;
  }

  .caption {
    margin: var(--space-4) 0 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  @media (max-width: 719px) {
    thead td {
      width: 6.5rem;
    }

    tbody th {
      padding-inline-end: var(--space-1);
    }

    .model {
      font-size: var(--text-sm);
    }

    .status {
      font-size: 0.75rem;
    }

    .amount {
      font-size: var(--text-base);
    }

    .cell {
      min-height: 3rem;
      padding-inline: 0;
    }
  }

  @media (forced-colors: active) {
    .cell.current {
      outline-color: Highlight;
    }
  }
</style>
