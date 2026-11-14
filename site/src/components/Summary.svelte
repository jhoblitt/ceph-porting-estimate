<!--
  The answer first: one sentence with one number for the current target,
  model and scenario, how far the other scenarios move it, what the dollars
  and tokens are made of, and what the headline covers.
-->
<script lang="ts">
  import { CATEGORY_META, categoryParts } from '../lib/categories';
  import type { Derived } from '../lib/derived.svelte';
  import { list, percent, usd } from '../lib/format';
  import { TARGET_LABELS } from '../lib/report';
  import Amount from './Amount.svelte';
  import ScopeNote from './ScopeNote.svelte';
  import SegmentedBar from './SegmentedBar.svelte';
  import StatTile from './StatTile.svelte';

  interface Props {
    d: Derived;
  }

  let { d }: Props = $props();

  const headline = $derived(d.root.headline);
  const current = $derived(d.scenarioTotals.find((s) => s.current));
  const others = $derived(d.scenarioTotals.filter((s) => !s.current));
  const changed = $derived(d.changedCount);
  const otherFigures = $derived(list(others.map((s) => `${usd(s.cost.usd)} (${s.label})`)));

  const categoryList = list(CATEGORY_META.map((c) => c.label.toLowerCase()));
  const allTokensNote = `${categoryList.charAt(0).toUpperCase()}${categoryList.slice(1)}.`;

  const parts = $derived(
    categoryParts(d.dollarShares, (c) => ({
      text: usd(headline.usdByCategory[c.key]),
      title: `${c.label}: ${usd(headline.usdByCategory[c.key])} (${percent(d.dollarShares[c.key])})`,
    })),
  );
</script>

<section class="summary" aria-labelledby="summary-title">
  <h2 id="summary-title" class="visually-hidden">The estimate</h2>

  <div class="top">
    <div class="answer-block">
      <p class="answer">
        <span class="lead">
          Porting Ceph to <strong>{TARGET_LABELS[d.target]}</strong> with <strong>{d.model.name}</strong> would cost about
        </span>
        <span class="hero"><Amount value={headline.usd} kind="usd" /></span>
        <span class="tail">
          in model API charges, under the <strong>{d.scenario.label}</strong> scenario{#if changed > 0}{' '}with
            {changed === 1 ? 'one assumption' : `${changed} assumptions`} changed{/if}.
        </span>
      </p>

      <p class="spread">
        {#if current?.custom}
          The scenario as published puts it at <Amount value={current.preset.usd} kind="usd" />.
        {/if}
        The estimate is rough: {others.length === 1 ? 'the other scenario puts' : 'the other scenarios put'} the same port at
        {otherFigures}.
      </p>
    </div>

    <div class="made-of">
      <h3>Dollar split</h3>
      <SegmentedBar label="Headline cost by token category" {parts} size="thin" />
      <ul class="legend">
        {#each CATEGORY_META as c (c.key)}
          <li>
            <span class="swatch" style:background="var(--series-{c.series})" aria-hidden="true"></span>
            <span class="name">{c.label}</span>
            <span class="figure"><Amount value={headline.usdByCategory[c.key]} kind="usd" spellExact /></span>
            <span class="share">{percent(d.dollarShares[c.key])}</span>
          </li>
        {/each}
      </ul>
    </div>
  </div>

  <dl class="tiles">
    <StatTile label="Ceph code in the headline" note="Lines of Ceph's own code the port covers, without comments or blank lines.">
      <Amount value={d.scope.ceph.headline.code} kind="count" unit="lines" /> <span class="unit">lines</span>
    </StatTile>
    <StatTile label="Source tokens" note="That code, and the dependency work, as the model reads it.">
      <Amount value={headline.sourceTokens} kind="tokens" />
    </StatTile>
    <StatTile label="Output tokens" note="What the model writes: code, tests, reviews and rework.">
      <Amount value={headline.tokens.output} kind="tokens" />
    </StatTile>
    <StatTile label="Cache-read tokens" note="Context the model re-reads on every call.">
      <Amount value={headline.tokens.cacheRead} kind="tokens" />
    </StatTile>
    <StatTile label="All tokens" note={allTokensNote}>
      <Amount value={d.tokenTotal} kind="tokens" />
    </StatTile>
  </dl>

  <ScopeNote {d} />
</section>

<style>
  .summary {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .top {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    align-items: end;
    gap: var(--space-5) var(--space-7);
  }

  .answer-block {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .answer {
    margin: 0;
    max-width: 44rem;
    font-size: var(--text-lg);
    line-height: 1.35;
  }

  .answer > span {
    display: block;
  }

  .hero {
    margin: var(--space-2) 0 var(--space-1);
    font-size: var(--text-hero);
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1;
  }

  .spread {
    margin: 0;
    color: var(--text-muted);
  }

  .made-of {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    max-width: 44rem;
  }

  h3 {
    margin: 0;
    font-size: var(--text-base);
  }

  .legend {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3) var(--space-5);
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--text-sm);
  }

  .legend li {
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: var(--space-2);
    align-items: baseline;
  }

  .swatch {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    align-self: center;
  }

  .name {
    color: var(--text-muted);
  }

  .figure {
    grid-column: 2;
    font-size: var(--text-base);
    font-weight: 600;
  }

  .share {
    grid-column: 2;
    color: var(--text-muted);
  }

  .unit {
    font-size: var(--text-base);
    font-weight: 500;
    color: var(--text-muted);
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(10rem, 100%), 1fr));
    gap: var(--space-3);
    margin: 0;
  }

  @media (max-width: 959px) {
    .top {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (max-width: 719px) {
    .tiles {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
