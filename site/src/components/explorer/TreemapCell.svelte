<!--
  One treemap cell: a button over the cell's parts, each part shaded by its
  cost per line, hatched when it is not ported, and outlined with dots when
  it is costed but kept out of the headline. The label prints only what fits;
  the accessible name always carries the figures.
-->
<script lang="ts">
  import type { AreaMode, Row } from '../../lib/explorer';
  import { count, usd } from '../../lib/format';
  import type { Scope } from '../../lib/report';
  import type { CellBox, LabelFit } from '../../lib/treemap';

  interface Props {
    cell: CellBox;
    row: Row;
    /** The --seq-N step of each part by scope; 0 for a part with no cost. */
    steps: Partial<Record<Scope, number>>;
    fit: LabelFit;
    area: AreaMode;
    name: string;
    active: boolean;
    selected: boolean;
    highlighted: boolean;
    dimmed: boolean;
    onactivate: (event: MouseEvent) => void;
    /** `visible` when the browser shows a focus ring, i.e. not after a click. */
    onfocus: (visible: boolean) => void;
    onhover: (hovering: boolean, event: PointerEvent) => void;
  }

  let { cell, row, steps, fit, area, name, active, selected, highlighted, dimmed, onactivate, onfocus, onhover }: Props =
    $props();

  /** The label sits on the first, largest part, so it takes that part's ink. */
  const firstScope = $derived(cell.parts[0]?.scope);
  const inkStep = $derived(firstScope ? (steps[firstScope] ?? 0) : 0);
  const figure = $derived(
    area === 'cost' ? usd(row.figures.usd) : `${count(row.figures.code)} lines`,
  );
</script>

<button
  type="button"
  class="cell"
  class:selected
  class:highlighted
  class:dimmed
  data-cell={cell.id}
  tabindex={active ? 0 : -1}
  aria-label={name}
  aria-current={selected ? 'true' : undefined}
  style:left="{cell.rect.x}px"
  style:top="{cell.rect.y}px"
  style:width="{cell.rect.w}px"
  style:height="{cell.rect.h}px"
  onclick={onactivate}
  onfocus={(e) => onfocus(e.currentTarget.matches(':focus-visible'))}
  onpointerenter={(e) => onhover(true, e)}
  onpointermove={(e) => onhover(true, e)}
  onpointerleave={(e) => onhover(false, e)}
>
  {#each cell.parts as part (part.scope)}
    {@const step = steps[part.scope] ?? 0}
    <span
      class="part {part.scope}"
      class:unshaded={step === 0 && part.scope !== 'not-ported'}
      style:left="{part.rect.x - cell.rect.x}px"
      style:top="{part.rect.y - cell.rect.y}px"
      style:width="{part.rect.w}px"
      style:height="{part.rect.h}px"
      style:background={step > 0 ? `var(--seq-${step})` : undefined}
      aria-hidden="true"
    ></span>
  {/each}
  {#if fit.lines > 0}
    <span
      class="label"
      class:on-hatch={firstScope === 'not-ported' || inkStep === 0}
      style:color={inkStep > 0 && firstScope !== 'not-ported' ? `var(--seq-ink-${inkStep})` : undefined}
      aria-hidden="true"
    >
      <span class="name" class:wrap={fit.lines > 1} style:-webkit-line-clamp={fit.lines}>{row.name}</span>
      {#if fit.figure}<span class="figure">{figure}</span>{/if}
    </span>
  {/if}
</button>

<style>
  .cell {
    position: absolute;
    display: block;
    margin: 0;
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition:
      left 0.3s ease,
      top 0.3s ease,
      width 0.3s ease,
      height 0.3s ease,
      opacity 0.2s;
  }

  .part {
    position: absolute;
    border-radius: 2px;
    transition:
      left 0.3s ease,
      top 0.3s ease,
      width 0.3s ease,
      height 0.3s ease,
      background-color 0.3s;
  }

  /* Costed but outside the headline: the cost shade, ringed with dots. */
  .part.shown {
    outline: 2px dotted var(--text);
    outline-offset: -3px;
  }

  /* Not ported: no cost, so no shade from the cost scale. */
  .part.not-ported {
    background: repeating-linear-gradient(-45deg, var(--grid) 0 3px, var(--page) 3px 7px);
    box-shadow: inset 0 0 0 1px var(--baseline);
  }

  .part.unshaded {
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--border-strong);
  }

  .label {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    padding: 4px 6px;
    overflow: hidden;
    line-height: 1.25;
    pointer-events: none;
  }

  .label.on-hatch {
    color: var(--text);
  }

  .label.on-hatch .name {
    align-self: flex-start;
    max-width: 100%;
    padding: 0 3px;
    margin-inline-start: -3px;
    border-radius: 2px;
    background: var(--page);
  }

  .name,
  .figure {
    flex: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .name {
    font-size: 0.8125rem;
    font-weight: 600;
    line-height: 1.25;
  }

  /* A long name wraps by word, clamped to the lines labelFit found room for. */
  .name.wrap {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    white-space: normal;
  }

  .figure {
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    opacity: 0.9;
  }

  /* Rings drawn above the parts, so focus and selection show on every shade. */
  .cell::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 3px;
    pointer-events: none;
  }

  .cell:hover::after,
  .cell.highlighted::after {
    box-shadow: inset 0 0 0 2px var(--text);
  }

  .cell.selected::after {
    box-shadow:
      inset 0 0 0 3px var(--text),
      inset 0 0 0 5px var(--surface);
  }

  .cell:focus-visible {
    outline: none;
  }

  .cell:focus-visible::after {
    box-shadow:
      inset 0 0 0 3px var(--focus),
      inset 0 0 0 5px var(--surface);
  }

  .cell.dimmed {
    opacity: 0.22;
  }

  @media (prefers-reduced-motion: reduce) {
    .cell,
    .part {
      transition: none;
    }
  }

  @media (forced-colors: active) {
    .part {
      border: 1px solid CanvasText;
    }

    .cell:focus-visible::after,
    .cell.selected::after {
      outline: 3px solid Highlight;
      outline-offset: -3px;
    }
  }
</style>
