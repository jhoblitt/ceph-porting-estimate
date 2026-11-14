<!--
  The current target and model under every scenario, on a log scale: the
  naive figure sits more than two orders of magnitude below the others, and
  a linear axis would flatten it into the left edge. Each row selects its
  scenario. With overrides, the current row shows the custom figure beside
  the published one.
-->
<script lang="ts">
  import type { Derived } from '../lib/derived.svelte';
  import { usd } from '../lib/format';
  import { TARGET_LABELS } from '../lib/report';
  import { logScale } from '../lib/scale';
  import type { AppState } from '../lib/state';
  import Amount from './Amount.svelte';
  import Section from './Section.svelte';

  interface Props {
    d: Derived;
    selection: AppState;
    onselect: (next: AppState) => void;
  }

  let { d, selection, onselect }: Props = $props();

  const rows = $derived([...d.scenarioTotals].sort((a, b) => a.preset.usd - b.preset.usd));
  const scale = $derived(logScale(d.scenarioTotals.flatMap((s) => [s.preset.usd, s.cost.usd])));
  const pct = (v: number) => `${scale.position(v) * 100}%`;
  const anyOffScale = $derived(d.scenarioTotals.some((s) => !scale.onScale(s.cost.usd) || !scale.onScale(s.preset.usd)));
</script>

<Section id="scenarios" title="How much it moves">
  {#snippet lede()}
    Porting Ceph to {TARGET_LABELS[d.target]} with {d.model.name} under each scenario. Choose one to see the whole report
    under it.
  {/snippet}

  {#if d.changedCount > 0}
    <p class="kept">
      Your {d.changedCount === 1 ? 'changed assumption stays' : `${d.changedCount} changed assumptions stay`} in place when you
      choose another scenario, so its figure may then differ from the published one shown on its row.
    </p>
  {/if}

  <ol class="rows">
    {#each rows as s (s.id)}
      <li class:current={s.current}>
        <button
          type="button"
          class="pick"
          aria-pressed={s.current}
          onclick={() => onselect({ ...selection, scenario: s.id })}
        >
          {s.label}
        </button>
        <p class="description">{s.description}</p>
        <div class="track" aria-hidden="true">
          {#each scale.ticks as t (t)}
            <span class="grid" style:left={pct(t)}></span>
          {/each}
          {#if s.custom && scale.onScale(s.preset.usd) && scale.onScale(s.cost.usd)}
            <span
              class="link"
              style:left={pct(Math.min(s.preset.usd, s.cost.usd))}
              style:right="calc(100% - {pct(Math.max(s.preset.usd, s.cost.usd))})"
            ></span>
          {/if}
          {#if s.custom}
            {#if scale.onScale(s.preset.usd)}
              <span class="dot published" style:left={pct(s.preset.usd)}></span>
            {:else}
              <span class="off-scale published"></span>
            {/if}
          {/if}
          {#if scale.onScale(s.cost.usd)}
            <span class="dot" style:left={pct(s.cost.usd)}></span>
          {:else}
            <span class="off-scale"></span>
          {/if}
        </div>
        <div class="value">
          <span class="amount"><Amount value={s.cost.usd} kind="usd" spellExact /></span>
          {#if s.custom}
            <span class="custom">custom; published <Amount value={s.preset.usd} kind="usd" spellExact /></span>
          {/if}
        </div>
      </li>
    {/each}
  </ol>

  <div class="axis" aria-hidden="true">
    <div class="ticks">
      {#each scale.ticks as t, i (t)}
        <span
          class:first={i === 0}
          class:last={i === scale.ticks.length - 1}
          style:left={pct(t)}>{usd(t)}</span
        >
      {/each}
    </div>
  </div>
  <p class="caption">
    Log scale: each gridline is ten times the one before it. The filled dot is the figure in effect.{#if anyOffScale}{' '}A
      log scale has no place for $0, so a figure of $0 is marked by an arrow at the left edge.{/if}
  </p>
</Section>

<style>
  .rows {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    position: relative;
    display: grid;
    grid-template-columns: minmax(10rem, 16rem) 1fr 9rem;
    grid-template-areas:
      'pick track value'
      'description track value';
    column-gap: var(--space-5);
    align-items: center;
    padding: var(--space-3) var(--space-3);
    border-radius: var(--radius);
  }

  li + li {
    margin-top: var(--space-1);
  }

  li.current {
    background: var(--accent-wash);
  }

  li:hover:not(.current) {
    background: light-dark(rgb(11 11 11 / 0.03), rgb(255 255 255 / 0.04));
  }

  .pick {
    grid-area: pick;
    justify-self: start;
    padding: 0;
    border: 0;
    background: none;
    color: var(--text);
    font: inherit;
    font-weight: 600;
    text-align: start;
    cursor: pointer;
  }

  /* The whole row is the button's hit target. */
  .pick::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: var(--radius);
  }

  .pick:focus-visible {
    outline: none;
  }

  .pick:focus-visible::after {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  .description {
    grid-area: description;
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
    line-height: 1.45;
  }

  .track {
    grid-area: track;
    position: relative;
    height: 2rem;
  }

  .track::before {
    content: '';
    position: absolute;
    inset: 50% 0 auto;
    height: 1px;
    background: var(--baseline);
  }

  .grid {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--grid);
  }

  .link {
    position: absolute;
    top: calc(50% - 1px);
    height: 2px;
    background: var(--accent);
    opacity: 0.5;
  }

  .dot {
    position: absolute;
    top: 50%;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--text-faint);
    box-shadow: 0 0 0 2px var(--surface);
    transform: translate(-50%, -50%);
  }

  .current .dot {
    background: var(--accent);
  }

  .current .dot.published {
    background: var(--surface);
    border: 2px solid var(--accent);
  }

  /* Above the row's hit target, so the figures keep their hover titles. */
  .value {
    grid-area: value;
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    text-align: end;
  }

  .amount {
    font-size: var(--text-lg);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .custom {
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .axis {
    display: grid;
    grid-template-columns: minmax(10rem, 16rem) 1fr 9rem;
    column-gap: var(--space-5);
    padding-inline: var(--space-3);
  }

  .ticks {
    grid-column: 2;
    position: relative;
    height: 1.5rem;
    font-size: var(--text-sm);
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .ticks span {
    position: absolute;
    top: 0.25rem;
    transform: translateX(-50%);
  }

  .ticks span.first {
    transform: none;
  }

  .ticks span.last {
    transform: translateX(-100%);
  }

  /* A value a log scale cannot place ($0): an arrow pointing off the left edge. */
  .off-scale {
    position: absolute;
    top: 50%;
    left: -12px;
    width: 0;
    height: 0;
    border-block: 7px solid transparent;
    border-inline-end: 10px solid var(--text-faint);
    transform: translateY(-50%);
  }

  .current .off-scale {
    border-inline-end-color: var(--accent);
  }

  .current .off-scale.published {
    opacity: 0.5;
  }

  .kept {
    margin: 0 0 var(--space-4);
    padding: var(--space-2) var(--space-3);
    border-inline-start: 3px solid var(--accent);
    background: var(--accent-wash);
    font-size: var(--text-sm);
  }

  .caption {
    margin: var(--space-3) 0 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  @media (max-width: 719px) {
    li {
      grid-template-columns: 1fr auto;
      grid-template-areas:
        'pick value'
        'track track'
        'description description';
      row-gap: var(--space-1);
    }

    .axis {
      grid-template-columns: 1fr;
    }

    .ticks {
      grid-column: 1;
    }
  }
</style>
