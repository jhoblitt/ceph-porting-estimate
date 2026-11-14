<!--
  The libraries Ceph builds on: what the current target does with each, the
  work that leaves and its cost from the estimate, and every target's plan
  for comparison without changing the page's target.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { STRATEGIES, bindingsText, dependencySummary } from '../lib/dependencies';
  import type { Derived } from '../lib/derived.svelte';
  import { countExact, list, percent, usd, usdExact } from '../lib/format';
  import { STRATEGY_LABELS, STRATEGY_MEANINGS } from '../lib/labels';
  import { DEPENDENCIES_COMPONENT_ID, type Strategy, TARGET_LABELS } from '../lib/report';
  import type { AppState, WriteOptions } from '../lib/state';
  import Section from './Section.svelte';
  import DependencyTable from './dependencies/DependencyTable.svelte';

  interface Props {
    d: Derived;
    selection: AppState;
    onselect: (next: AppState, opts?: WriteOptions) => void;
  }

  let { d, selection, onselect }: Props = $props();

  const summary = $derived(dependencySummary(d.report, d.root, d.target));
  const targetName = $derived(TARGET_LABELS[d.target]);
  const withWork = $derived(summary.rows.filter((r) => r.lines > 0).length);

  const COUNT_WORDS: Record<Strategy, (n: number) => string> = {
    native: (n) => `${n} covered natively`,
    bindings: (n) => `${n} used through bindings`,
    port: (n) => `${n} ported`,
    drop: (n) => `${n} dropped`,
  };
  const counts = $derived(list(summary.counts.filter((c) => c.count > 0).map((c) => COUNT_WORDS[c.strategy](c.count))));

  /** "For libnbd and FoundationDB, used through bindings, the data counts no lines of work." */
  const withoutWork = $derived(
    STRATEGIES.flatMap((strategy) => {
      const names = summary.withoutWork.filter((x) => x.strategy === strategy).map((x) => x.name);
      if (names.length === 0) return [];
      const how = strategy === 'bindings' ? 'used through bindings' : 'ported';
      return [`For ${list(names)}, ${how}, the data counts no lines of work.`];
    }).join(' '),
  );

  async function explore(id: string) {
    onselect({ ...selection, path: [DEPENDENCIES_COMPONENT_ID, id] });
    await tick();
    const heading = document.getElementById('explorer-detail-title');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    heading?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    heading?.focus({ preventScroll: true });
  }
</script>

<Section id="dependencies" title="Dependencies">
  {#snippet lede()}
    The libraries Ceph builds on, and what a port to {targetName} does with each. Only bindings and ports leave work to
    cost; it counts in the headline.
  {/snippet}

  <div class="totals">
    <p class="counts">
      For {targetName}, of {summary.rows.length} dependencies: {counts}.
    </p>
    <p class="work">
      Bindings and ports leave
      <strong title={`${countExact(summary.lines)} lines`}>{countExact(summary.lines)} lines</strong>
      of work on {withWork} of them, costing <strong title="Model output: {usdExact(summary.usd)}">{usd(summary.usd)}</strong>,
      {percent(summary.share)} of the headline.{#if withoutWork}{' '}{withoutWork}{/if}
    </p>
  </div>

  <p class="bindings">{bindingsText(targetName, summary.bindings)}</p>

  <dl class="strategies">
    {#each STRATEGIES as s (s)}
      <div>
        <dt>{STRATEGY_LABELS[s]}</dt>
        <dd>{STRATEGY_MEANINGS[s].charAt(0).toUpperCase()}{STRATEGY_MEANINGS[s].slice(1)}.</dd>
      </div>
    {/each}
  </dl>

  <DependencyTable rows={summary.rows} target={d.target} onexplore={explore} />
</Section>

<style>
  .totals {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-bottom: var(--space-4);
  }

  .totals p {
    margin: 0;
  }

  .work strong {
    font-variant-numeric: tabular-nums;
  }

  .bindings {
    margin: 0 0 var(--space-5);
    padding: var(--space-2) var(--space-3);
    border-inline-start: 3px solid var(--accent);
    background: var(--accent-wash);
  }

  .strategies {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: var(--space-2) var(--space-5);
    margin: 0 0 var(--space-5);
    font-size: var(--text-sm);
  }

  dt {
    font-weight: 600;
  }

  dd {
    margin: 0;
    color: var(--text-muted);
  }
</style>
