<!--
  A whole split into parts. Tall: each part prints its figure where it fits
  (a container query hides it where it does not). Thin: no text, for a bar
  beside a list that already gives the figures. Either way the bar's
  accessible name lists every part, and hovering a part shows its title.
  `length` draws the bar as a fraction of the full width, so bars sharing a
  scale compare by length; parts split that length by their weights.
-->
<script lang="ts">
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
</script>

<div class="bar {size}" role="img" aria-label={name} style:width="{length * 100}%">
  {#each parts as part (part.key)}
    {#if part.share > 0}
      <div class="part" style:flex-grow={part.share} style:background="var(--series-{part.series})" title={part.title}>
        {#if size === 'tall'}
          <span>{part.text}</span>
        {/if}
      </div>
    {/if}
  {/each}
</div>

<style>
  .bar {
    display: flex;
    gap: 2px;
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
    flex-basis: 0;
    flex-shrink: 1;
    min-width: 2px;
    container-type: inline-size;
    display: flex;
    align-items: center;
  }

  .tall .part {
    border-radius: 4px;
  }

  .thin .part:first-child {
    border-start-start-radius: 4px;
    border-end-start-radius: 4px;
  }

  .thin .part:last-child {
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
