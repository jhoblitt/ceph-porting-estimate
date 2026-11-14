<!--
  Where the dollars go, for every model at the current target. One bar splits
  the token volumes as shares, so a reader sees that nearly all tokens are
  cache reads. Below it, one dollar bar per model on a common dollar scale
  (the dearest model's total is the full width), so bar lengths compare
  directly and the reader sees how each price sheet turns the same volumes
  into a different total. The table below carries every exact figure.
-->
<script lang="ts">
  import { CATEGORY_META, categoryParts } from '../lib/categories';
  import type { Derived } from '../lib/derived.svelte';
  import { count, countExact, list, percent, tokens, usd, usdExact } from '../lib/format';
  import { TARGET_LABELS } from '../lib/report';
  import Amount from './Amount.svelte';
  import Section from './Section.svelte';
  import SegmentedBar from './SegmentedBar.svelte';

  interface Props {
    d: Derived;
  }

  let { d }: Props = $props();

  const volumes = $derived(d.root.headline.tokens);
  const tokenParts = $derived(
    categoryParts(d.tokenShares, (c) => ({
      text: percent(d.tokenShares[c.key]),
      title: `${c.label}: ${tokens(volumes[c.key])} tokens (${percent(d.tokenShares[c.key])})`,
    })),
  );
  const bars = $derived(
    d.dollarBars.map((b) => ({
      ...b,
      parts: categoryParts(b.shares, (c) => ({
        text: usd(b.cost.usdByCategory[c.key]),
        title: `${c.label}: ${usd(b.cost.usdByCategory[c.key])}`,
      })),
    })),
  );
  const pct = (at: number) => `${at * 100}%`;

  /** From this share of re-read context up, the figure moves almost in proportion to its prices. */
  const PROPORTIONAL = 0.8;

  /** "55% of uncached input, 74.8% of cache writes, …" */
  function longContextShares(s: typeof volumes): string {
    return list(CATEGORY_META.map((c) => `${percent(s[c.key])} of ${c.label.toLowerCase()}`));
  }
</script>

<Section id="categories" title="Where the dollars go">
  {#snippet lede()}
    Porting to {TARGET_LABELS[d.target]}, by token category.
    {#if d.sameVolumes}
      Every model is priced on the same token volumes, so the dollar bars differ only by price sheet.
    {:else}
      Model efficiency has been changed, so the models need different token volumes; the token bar shows {d.model.name}'s.
    {/if}
  {/snippet}

  {#if d.cacheShare !== null || d.testShare !== null}
    <p class="reading">
      {#if d.cacheShare !== null}
        Re-read context, the cache reads and writes, is about {percent(d.cacheShare)} of {d.cacheShareModel.name}'s
        figure{#if d.cacheShare >= PROPORTIONAL}, so the estimate moves almost in proportion to those two prices and to how
          large the prompts are{/if}.
      {/if}
      {#if d.testShare !== null}
        Test code, new tests and ported ones, is about {percent(d.testShare)} of the headline.
      {/if}
    </p>
  {/if}

  <ul class="legend" aria-label="Token categories">
    {#each CATEGORY_META as c (c.key)}
      <li><span class="swatch" style:background="var(--series-{c.series})" aria-hidden="true"></span>{c.label}</li>
    {/each}
  </ul>

  <h3>Token volumes, as shares of all tokens</h3>
  <div class="row volumes">
    <SegmentedBar label="Tokens by category, as shares" parts={tokenParts} />
    <div class="total"><Amount value={d.tokenTotal} kind="tokens" /> tokens</div>
  </div>

  <h3>Dollars by model, on one scale</h3>
  <div class="dollars">
    {#each bars as b (b.model.id)}
      <div class="row model" class:current={b.model.id === d.modelId} aria-current={b.model.id === d.modelId ? 'true' : undefined}>
        <div class="name">
          <span class="title">{b.model.name}</span>
          <span class="sub">{b.model.vendor}</span>
        </div>
        <div class="track">
          {#each d.dollarAxis as t (t.value)}
            <span class="grid" style:left={pct(t.at)} aria-hidden="true"></span>
          {/each}
          <SegmentedBar label="{b.model.name}, dollars by category" parts={b.parts} length={b.length} />
          <span class="end" style:left={pct(b.length)}><Amount value={b.cost.usd} kind="usd" /></span>
        </div>
      </div>
    {/each}
    <div class="row axis" aria-hidden="true">
      <div></div>
      <div class="track ticks">
        {#each d.dollarAxis as t (t.value)}
          <span style:left={pct(t.at)}>{usd(t.value)}</span>
        {/each}
      </div>
    </div>
  </div>

  {#each d.longContext as lc (lc.model.id)}
    <p class="note">
      {lc.model.name} charges higher prices for calls with more than {count(lc.threshold)} tokens of context. {#if Object.values(lc.shares).some((s) => s > 0)}The
        estimate bills {longContextShares(lc.shares)} at those prices{:else}Here the estimate bills none of its tokens at those
        prices{/if}; the shares are under Pricing mix in the assumptions.
    </p>
  {/each}

  <details>
    <summary>Show the exact figures as a table</summary>
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th scope="col"></th>
            {#each CATEGORY_META as c (c.key)}<th scope="col">{c.label}</th>{/each}
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Tokens{d.sameVolumes ? '' : `, ${d.model.name}`}</th>
            {#each CATEGORY_META as c (c.key)}<td>{countExact(volumes[c.key])}</td>{/each}
            <td>{countExact(d.tokenTotal)}</td>
          </tr>
          {#each d.byModel as { model, cost } (model.id)}
            <tr>
              <th scope="row">{model.name}</th>
              {#each CATEGORY_META as c (c.key)}<td>{usdExact(cost.usdByCategory[c.key])}</td>{/each}
              <td>{usdExact(cost.usd)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </details>
</Section>

<style>
  .reading {
    margin: 0 0 var(--space-5);
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-5);
    margin: 0 0 var(--space-5);
    padding: 0;
    list-style: none;
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .legend li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .swatch {
    width: 12px;
    height: 12px;
    border-radius: 3px;
  }

  h3 {
    margin: 0 0 var(--space-2);
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text-muted);
  }

  .volumes {
    display: grid;
    grid-template-columns: 1fr 9rem;
    gap: var(--space-4);
    align-items: center;
    margin-bottom: var(--space-6);
  }

  .total {
    text-align: end;
    font-size: var(--text-lg);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .dollars {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .model,
  .axis {
    display: grid;
    grid-template-columns: 11rem 1fr;
    gap: var(--space-4);
    align-items: center;
  }

  .model {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius);
  }

  .model.current {
    background: var(--accent-wash);
  }

  .axis {
    padding-inline: var(--space-3);
  }

  .name {
    display: flex;
    flex-direction: column;
    line-height: 1.3;
  }

  .title {
    font-weight: 600;
  }

  .sub {
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  /* The full width is the dearest model's total; the reserve on the right holds its end label. */
  .track {
    position: relative;
    isolation: isolate;
    margin-right: 5.5rem;
    min-height: 28px;
    display: flex;
    align-items: center;
  }

  .grid {
    position: absolute;
    z-index: -1;
    top: -0.5rem;
    bottom: -0.5rem;
    width: 1px;
    background: var(--grid);
  }

  .end {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    padding-left: var(--space-2);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .ticks {
    min-height: 1.5rem;
    font-size: var(--text-sm);
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .ticks span {
    position: absolute;
    transform: translateX(-50%);
  }

  .ticks span:first-child {
    transform: none;
  }

  .note {
    margin: var(--space-5) 0 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  details {
    margin-top: var(--space-4);
    font-size: var(--text-sm);
  }

  summary {
    cursor: pointer;
    color: var(--accent);
  }

  .scroll {
    overflow-x: auto;
    margin-top: var(--space-3);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }

  th,
  td {
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--grid);
    text-align: end;
    white-space: nowrap;
  }

  th[scope='row'] {
    text-align: start;
    font-weight: 600;
  }

  thead th {
    color: var(--text-muted);
    font-weight: 600;
  }

  @media (max-width: 719px) {
    .volumes {
      grid-template-columns: 1fr;
      gap: var(--space-2);
    }

    .total {
      text-align: start;
    }

    .model,
    .axis {
      grid-template-columns: 1fr;
      gap: var(--space-2);
    }

    .model {
      padding-inline: var(--space-2);
    }

    .axis {
      padding-inline: var(--space-2);
    }

    .axis > div:first-child {
      display: none;
    }

    .track {
      margin-right: 4.5rem;
    }

    /* Every other tick label, so the labels do not run together; the gridlines stay. */
    .ticks span:nth-child(even) {
      display: none;
    }
  }
</style>
