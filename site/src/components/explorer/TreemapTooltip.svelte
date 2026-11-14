<!--
  The figures of the cell under the pointer or the focus, exactly. It only
  repeats what the table holds, so it is hidden from screen readers; the
  cell's own accessible name carries the short figures.
-->
<script lang="ts">
  import { type Row, costPerThousandLines } from '../../lib/explorer';
  import { countExact, percent, usd, usdExact } from '../../lib/format';
  import { DIFFICULTY_LABELS, KIND_LABELS, SCOPE_LABELS } from '../../lib/labels';

  interface Props {
    row: Row;
    groupName: string | null;
    /** The point to sit beside, in the map's coordinates. */
    x: number;
    y: number;
    frameWidth: number;
    frameHeight: number;
  }

  let { row, groupName, x, y, frameWidth, frameHeight }: Props = $props();

  let width = $state(0);
  let height = $state(0);

  const GAP = 14;
  const left = $derived(x + GAP + width <= frameWidth ? x + GAP : Math.max(0, x - GAP - width));
  const top = $derived(y + GAP + height <= frameHeight ? y + GAP : Math.max(0, y - GAP - height));

  const per = $derived(costPerThousandLines(row.perLine));
  const notPorted = $derived(row.parts.find((p) => p.scope === 'not-ported')?.code ?? 0);
  const shown = $derived(row.kind === 'component' ? row.parts.find((p) => p.scope === 'shown') : undefined);
</script>

<div class="tip" style:left="{left}px" style:top="{top}px" bind:offsetWidth={width} bind:offsetHeight={height} aria-hidden="true">
  <p class="value">{row.figures.usd > 0 ? usdExact(row.figures.usd) : 'No cost'}</p>
  <p class="name">{row.name}</p>
  {#if groupName}<p class="group">{groupName}</p>{/if}
  <dl>
    <dt>Code lines</dt>
    <dd>{countExact(row.figures.code)}</dd>
    {#if per !== null}
      <dt>Per 1,000 lines</dt>
      <dd>{usd(per)}</dd>
    {/if}
    <dt>Of the headline</dt>
    <dd>{percent(row.share)}</dd>
    {#if row.scope}
      <dt>Scope</dt>
      <dd>{SCOPE_LABELS[row.scope]}</dd>
    {/if}
    {#if row.featureKind && row.difficulty}
      <dt>Kind</dt>
      <dd>{KIND_LABELS[row.featureKind]}, {DIFFICULTY_LABELS[row.difficulty].toLowerCase()}</dd>
    {/if}
    {#if shown}
      <dt>Shown separately</dt>
      <dd>{usdExact(shown.usd)}</dd>
    {/if}
    {#if notPorted > 0 && row.kind === 'component'}
      <dt>Not ported</dt>
      <dd>{countExact(notPorted)} lines</dd>
    {/if}
  </dl>
</div>

<style>
  .tip {
    position: absolute;
    z-index: 2;
    width: max-content;
    max-width: min(18rem, 80%);
    padding: var(--space-2) var(--space-3);
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.18);
    font-size: var(--text-sm);
    line-height: 1.4;
    pointer-events: none;
  }

  p {
    margin: 0;
  }

  .value {
    font-size: var(--text-base);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .name {
    font-weight: 600;
  }

  .group {
    color: var(--text-muted);
  }

  dl {
    display: grid;
    grid-template-columns: auto auto;
    gap: 0 var(--space-3);
    margin: var(--space-2) 0 0;
  }

  dt {
    color: var(--text-muted);
  }

  dd {
    margin: 0;
    text-align: end;
    font-variant-numeric: tabular-nums;
  }
</style>
