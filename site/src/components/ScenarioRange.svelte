<!--
  How far the estimate moves: the low, central and high scenarios as
  published, on one linear scale from $0, with the band between low and
  high and the selected one marked, and each reference scenario as a
  labelled tick, not an outcome. The published figures are the one basis
  here and in the headline's range sentence; with overrides, the selected
  scenario's own figure is a separate accent dot. Scenarios are placed by
  role, never by id. Below the chart, every scenario as a row that selects
  it, with its figure and description: the chart's text equivalent.
-->
<script lang="ts">
  import type { Derived, ScenarioTotal } from '../lib/derived.svelte';
  import { usd } from '../lib/format';
  import { TARGET_LABELS } from '../lib/report';
  import { linearScale } from '../lib/scale';
  import type { AppState } from '../lib/state';
  import Amount from './Amount.svelte';
  import Section from './Section.svelte';

  interface Props {
    d: Derived;
    selection: AppState;
    onselect: (next: AppState) => void;
  }

  let { d, selection, onselect }: Props = $props();

  const ROLE_TAGS: Record<string, string> = {
    low: 'Low',
    central: 'Central',
    high: 'High',
    reference: 'Reference: not an outcome',
  };
  const NOT_AN_OUTCOME = 'a reference point, not an outcome';

  const range = $derived(d.range);
  /** The scenarios drawn as outcomes: placed by role, then any without one. */
  const outcomes = $derived(
    [range.low, range.central, range.high, ...range.unplaced].filter((s): s is ScenarioTotal => s !== undefined),
  );
  /**
   * Every other figure label, left to right, sits a line higher, so labels
   * of scenarios close together on a narrow screen never overlap.
   */
  const raised = $derived(
    new Set([...outcomes].sort((a, b) => a.preset.usd - b.preset.usd).flatMap((s, i) => (i % 2 === 1 ? [s.id] : []))),
  );
  /** The selected scenario with the reader's changes, drawn as its own mark. */
  const yours = $derived(d.scenarioTotals.find((s) => s.custom));
  const scale = $derived(linearScale(d.scenarioTotals.flatMap((s) => [s.preset.usd, s.cost.usd])));
  const pct = (v: number) => `${scale.position(v) * 100}%`;
  const describe = (s: ScenarioTotal) => `${s.label} ${usd(s.preset.usd)}${s.current ? ' (selected)' : ''}`;
  const chartLabel = $derived(
    [
      range.low && range.high
        ? `As published, from ${usd(range.low.preset.usd)} (${range.low.label}) to ${usd(range.high.preset.usd)} (${range.high.label})`
        : '',
      outcomes.map(describe).join(', '),
      ...range.references.map((s) => `${s.label}: ${usd(s.preset.usd)}, ${NOT_AN_OUTCOME}`),
      yours ? `${yours.label} with your changes: ${usd(yours.cost.usd)}` : '',
    ]
      .filter(Boolean)
      .join('. '),
  );
</script>

<Section id="scenarios" title="How far it moves">
  {#snippet lede()}
    Porting Ceph to {TARGET_LABELS[d.target]} at {d.model.name}'s prices under each scenario as published, on one scale
    from $0.{#if range.low && range.high}{' '}The band runs from the low scenario to the high one; neither end is a limit.{/if}{#if yours}{' '}The
      accent dot is {yours.label} with your changes.{/if} Choose a scenario to see the whole report under it.
  {/snippet}

  {#if d.changedCount > 0}
    <p class="kept">
      Your {d.changedCount === 1 ? 'changed assumption stays' : `${d.changedCount} changed assumptions stay`} in place when you
      choose another scenario, except where that scenario already sets the same value: such a change is dropped. So a
      scenario's figure may then differ from the published one in its row.
    </p>
  {/if}

  <div class="chart" role="img" aria-label={chartLabel}>
    <div class="plot">
      {#each scale.ticks as t (t)}
        <span class="grid" style:left={pct(t)}></span>
      {/each}
      {#if range.low && range.high}
        <span class="band" style:left={pct(range.low.preset.usd)} style:right="calc(100% - {pct(range.high.preset.usd)})"
        ></span>
      {/if}
      {#each outcomes as s (s.id)}
        <span class="dot" class:current={s.current} class:published={s.custom} style:left={pct(s.preset.usd)}></span>
        <span
          class="figure"
          class:current={s.current}
          class:raised={raised.has(s.id)}
          style:left={pct(s.preset.usd)}>{usd(s.preset.usd)}</span
        >
      {/each}
      {#each range.references as s (s.id)}
        <span class="reference" class:current={s.current} style:left={pct(s.preset.usd)}></span>
      {/each}
      {#if yours}
        <span class="dot yours" style:left={pct(yours.cost.usd)}></span>
      {/if}
    </div>
    <div class="ticks">
      {#each scale.ticks as t (t)}
        <span style:left={pct(t)}>{usd(t)}</span>
      {/each}
    </div>
    {#each range.references as s (s.id)}
      <p class="reference-label" class:current={s.current}>
        <span class="tick-mark"></span>{s.label}: {usd(s.preset.usd)} — {NOT_AN_OUTCOME}
      </p>
    {/each}
  </div>

  <ol class="rows">
    {#each d.scenarioTotals as s (s.id)}
      <li class:current={s.current}>
        <button
          type="button"
          class="pick"
          aria-pressed={s.current}
          onclick={() => onselect({ ...selection, scenario: s.id })}
        >
          {s.label}
        </button>
        {#if s.role !== undefined && Object.hasOwn(ROLE_TAGS, s.role)}
          <span class="role">{ROLE_TAGS[s.role]}</span>
        {/if}
        <div class="value">
          <span class="amount"><Amount value={s.cost.usd} kind="usd" spellExact /></span>
          {#if s.custom}
            <span class="custom">your changes; published <Amount value={s.preset.usd} kind="usd" spellExact /></span>
          {/if}
        </div>
        <p class="description">{s.description}</p>
      </li>
    {/each}
  </ol>
</Section>

<style>
  .kept {
    margin: 0 0 var(--space-4);
    padding: var(--space-2) var(--space-3);
    border-inline-start: 3px solid var(--accent);
    background: var(--accent-wash);
    font-size: var(--text-sm);
  }

  .chart {
    /* Room either side for a figure centred on a mark at either end. */
    padding-inline: 1.75rem;
    margin-bottom: var(--space-5);
  }

  .plot {
    position: relative;
    height: 4.75rem;
  }

  .plot::before {
    content: '';
    position: absolute;
    inset: auto 0 0.75rem;
    height: 1px;
    background: var(--baseline);
  }

  .grid {
    position: absolute;
    top: 0;
    bottom: 0.75rem;
    width: 1px;
    background: var(--grid);
  }

  .band {
    position: absolute;
    bottom: calc(0.75rem - 4px);
    height: 8px;
    border-radius: 999px;
    background: var(--accent);
    opacity: 0.3;
  }

  .dot {
    position: absolute;
    bottom: 0.75rem;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--text-faint);
    box-shadow: 0 0 0 2px var(--surface);
    transform: translate(-50%, 50%);
  }

  .dot.current {
    width: 16px;
    height: 16px;
    background: var(--accent);
  }

  /* The selected scenario as published, when the reader's changes move it: a ring. */
  .dot.published {
    background: var(--surface);
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  /* The selected scenario with the reader's changes. */
  .dot.yours {
    width: 12px;
    height: 12px;
    background: var(--accent);
  }

  .figure {
    position: absolute;
    bottom: 1.6rem;
    transform: translateX(-50%);
    font-size: var(--text-sm);
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .figure.raised {
    bottom: 2.85rem;
  }

  .figure.current {
    color: var(--text);
    font-weight: 700;
  }

  /* A reference scenario: a thin tick through the axis, not a dot. */
  .reference {
    position: absolute;
    bottom: calc(0.75rem - 8px);
    width: 2px;
    height: 16px;
    background: var(--text-muted);
    transform: translateX(-50%);
  }

  .reference.current {
    background: var(--accent);
  }

  .ticks {
    position: relative;
    height: 1.25rem;
    font-size: var(--text-sm);
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .ticks span {
    position: absolute;
    transform: translateX(-50%);
  }

  .reference-label {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    margin: var(--space-2) 0 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .reference-label.current {
    color: var(--text);
  }

  .tick-mark {
    flex: none;
    width: 2px;
    height: 0.9em;
    align-self: center;
    background: currentColor;
  }

  .rows {
    margin: 0;
    padding: 0;
    list-style: none;
    border-top: 1px solid var(--grid);
  }

  li {
    position: relative;
    display: grid;
    grid-template-columns: auto 1fr auto;
    grid-template-areas:
      'pick role value'
      'description description value';
    column-gap: var(--space-3);
    align-items: baseline;
    padding: var(--space-3);
    border-bottom: 1px solid var(--grid);
  }

  li.current {
    background: var(--accent-wash);
  }

  li:hover:not(.current) {
    background: light-dark(rgb(11 11 11 / 0.03), rgb(255 255 255 / 0.04));
  }

  .pick {
    grid-area: pick;
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
  }

  .pick:focus-visible {
    outline: none;
  }

  .pick:focus-visible::after {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }

  .role {
    grid-area: role;
    justify-self: start;
    font-size: var(--text-sm);
    color: var(--text-muted);
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

  .description {
    grid-area: description;
    margin: var(--space-1) 0 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
    line-height: 1.45;
  }

  @media (max-width: 719px) {
    li {
      grid-template-columns: 1fr auto;
      grid-template-areas:
        'pick value'
        'role value'
        'description description';
    }
  }
</style>
