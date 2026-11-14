<!--
  A whole split into parts. Tall: each part prints its figure where it fits
  (a container query hides it where it does not). Thin: no text, for a bar
  beside a list that already gives the figures. Either way the bar's
  accessible name lists every part, and hovering a part shows its title.
  `length` draws the bar as a fraction of the full width, so bars sharing a
  scale compare by length. Each part sits at its true position (lib/bar.ts);
  the gap between parts is drawn inside the later part in the surface
  colour (--bar-gap, the card surface unless the parent sets it), so no gap
  or minimum width ever lengthens a bar or shifts a boundary.
-->
<script lang="ts">
  import { segmentGeometry } from '../lib/bar';
  import type { Part } from '../lib/categories';

  interface Props {
    label: string;
    parts: Part[];
    size?: 'tall' | 'thin';
    /** 0 to 1 of the full width; 1 by default. */
    length?: number;
  }

  let { label, parts, size = 'tall', length = 1 }: Props = $props();

  const name = $derived(`${label}: ${parts.map((p) => p.title).join('; ')}`);
  const segments = $derived(segmentGeometry(parts, length));
  const pct = (x: number) => `${x * 100}%`;
</script>

<div class="bar {size}" role="img" aria-label={name}>
  {#each segments as { part, start, width }, i (part.key)}
    <div
      class="part"
      class:first={i === 0}
      class:last={i === segments.length - 1}
      style:left={pct(start)}
      style:width={pct(width)}
      style:background="var(--series-{part.series})"
      title={part.title}
    >
      {#if size === 'tall'}
        <span>{part.text}</span>
      {/if}
    </div>
  {/each}
</div>

<style>
  .bar {
    position: relative;
    width: 100%;
    min-width: 0;
  }

  .tall {
    height: 28px;
  }

  .thin {
    height: 8px;
  }

  .part {
    position: absolute;
    top: 0;
    bottom: 0;
    container-type: inline-size;
    display: flex;
    align-items: center;
  }

  /* The separator: inside the part, on its leading edge. */
  .part:not(.first) {
    box-shadow: inset 2px 0 0 var(--bar-gap, var(--surface));
  }

  .tall .part {
    border-radius: 4px;
  }

  .thin .part.first {
    border-start-start-radius: 4px;
    border-end-start-radius: 4px;
  }

  .thin .part.last {
    border-start-end-radius: 4px;
    border-end-end-radius: 4px;
  }

  .part:hover {
    filter: brightness(1.1);
  }

  span {
    padding-inline: var(--space-2);
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--on-series);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  @container (max-width: 4.5rem) {
    span {
      display: none;
    }
  }

  @media (forced-colors: active) {
    .part {
      border: 1px solid CanvasText;
    }
  }
</style>
