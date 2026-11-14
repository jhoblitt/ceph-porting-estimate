<!-- What the map's area, shades, hatching and dotted rings mean, for the level on screen. -->
<script lang="ts">
  import { type AreaMode, type ScopeMode, costPerThousandLines } from '../../lib/explorer';
  import { usd } from '../../lib/format';
  import { SHADE_STEPS } from '../../lib/treemap';

  interface Props {
    area: AreaMode;
    mode: ScopeMode;
    range: { min: number; max: number } | null;
  }

  let { area, mode, range }: Props = $props();

  const low = $derived(range ? costPerThousandLines(range.min) : null);
  const high = $derived(range ? costPerThousandLines(range.max) : null);
</script>

<div class="legend">
  <p class="area">
    <strong>Area</strong>
    {area === 'code' ? 'code lines' : 'cost in dollars'}{#if area === 'cost' && mode === 'all'}; code that is not ported costs
      nothing, so it has no area{/if}.
  </p>
  {#if low !== null && high !== null}
    <div class="item">
      <strong>Shade</strong>
      <span class="key" aria-hidden="true">
        <span>{usd(low)}</span>
        <span class="ramp">
          {#each Array.from({ length: SHADE_STEPS }, (_, i) => i + 1) as i (i)}
            <span style:background="var(--seq-{i})"></span>
          {/each}
        </span>
        <span>{usd(high)}</span>
      </span>
      <span>
        cost per 1,000 code lines, from {usd(low)} to {usd(high)} at this level; shades step by ratio.
      </span>
    </div>
  {/if}
  {#if mode !== 'headline'}
    <div class="item">
      <span class="swatch shown" aria-hidden="true"></span>
      <span><strong>Dotted ring</strong> costed, but shown separately: not in the headline.</span>
    </div>
  {/if}
  {#if mode === 'all'}
    <div class="item">
      <span class="swatch not-ported" aria-hidden="true"></span>
      <span><strong>Hatched</strong> not ported: a port reuses or replaces it, so it costs nothing and takes no shade.</span>
    </div>
  {/if}
  <p class="hint">A cell too small for its name shows it, with its figures, on hover or focus.</p>
</div>

<style>
  .legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-5);
    margin-top: var(--space-3);
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  p {
    margin: 0;
  }

  strong {
    color: var(--text);
    font-weight: 600;
  }

  .item {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
  }

  .key {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-variant-numeric: tabular-nums;
  }

  .ramp {
    display: inline-flex;
    gap: 2px;
  }

  .ramp span {
    width: 1.1rem;
    height: 0.75rem;
  }

  .ramp span:first-child {
    border-radius: 2px 0 0 2px;
  }

  .ramp span:last-child {
    border-radius: 0 2px 2px 0;
  }

  .swatch {
    flex: none;
    width: 1.5rem;
    height: 0.9rem;
    border-radius: 2px;
  }

  .swatch.shown {
    background: var(--seq-3);
    outline: 2px dotted var(--text);
    outline-offset: -3px;
  }

  .swatch.not-ported {
    background: var(--hatch-not-ported);
    box-shadow: inset 0 0 0 1px var(--baseline);
  }

  .hint {
    flex-basis: 100%;
  }
</style>
