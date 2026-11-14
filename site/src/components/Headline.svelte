<!--
  The answer, and directly under it what the answer is and is not: one
  figure for the current target, model and scenario; one sentence on what
  it includes and what it rests on; one on how far assumptions the report
  already considers move it. Every number is computed; for a model other
  than the measured one, the sentence says it is the measured model's token
  counts on that model's price sheet.
-->
<script lang="ts">
  import type { Derived } from '../lib/derived.svelte';
  import { paramValue, magnitude, percent, times } from '../lib/format';
  import { TARGET_LABELS } from '../lib/report';
  import { type AppState, hashFromState } from '../lib/state';
  import Amount from './Amount.svelte';

  interface Props {
    d: Derived;
    selection: AppState;
  }

  let { d, selection }: Props = $props();

  /** Below this, "scaled up N times" would not read as a scale-up; say "extrapolated" instead. */
  const MIN_SCALE_UP = 1.5;

  const headline = $derived(d.root.headline);
  const current = $derived(d.scenarioTotals.find((s) => s.current));
  const changed = $derived(d.changedCount);
  const measured = $derived(d.measuredModel);
  const isMeasured = $derived(measured?.id === d.modelId);
  const volumeRatio = $derived(d.volumeRatios.get(d.modelId) ?? 1);
  const isReference = $derived(d.scenario.role === 'reference');
  const low = $derived(d.range.low);
  const high = $derived(d.range.high);
  const calibrationHref = $derived(hashFromState({ ...selection, route: 'calibration' }));
  const methodsHref = $derived(hashFromState({ ...selection, route: 'methods' }));
  const coverage = $derived(d.calibration.coverage);
  const scaleUp = $derived(d.scaleUp);
  /** A $0 headline: some value in effect removes all the work. */
  const isZero = $derived(!(headline.usd > 0));
  /** The reader's changes put the figure outside the published range. */
  const outside = $derived(
    d.customised &&
      ((low !== undefined && headline.usd < low.preset.usd) || (high !== undefined && headline.usd > high.preset.usd)),
  );
</script>

<p class="answer">
  <span class="lead">
    {#if measured && !isMeasured}
      <strong>{measured.name}</strong>'s token counts for porting Ceph to <strong>{TARGET_LABELS[d.target]}</strong>{#if volumeRatio !== 1},
        times {paramValue(volumeRatio)} for the model efficiency you set{/if}, billed at <strong>{d.model.name}</strong>'s list prices,
      come to about
    {:else if measured}
      Porting Ceph to <strong>{TARGET_LABELS[d.target]}</strong> with <strong>{d.model.name}</strong> would cost about
    {:else}
      Porting Ceph to <strong>{TARGET_LABELS[d.target]}</strong>, billed at <strong>{d.model.name}</strong>'s list prices, would
      cost about
    {/if}
  </span>
  <span class="hero"><Amount value={headline.usd} kind="usd" /></span>
  <span class="tail">
    in model API charges, under the <strong>{d.scenario.label}</strong> scenario{#if changed > 0}{' '}with
      {changed === 1 ? 'one assumption' : `${changed} assumptions`} changed{/if}.
  </span>
</p>

<p class="caveat">
  {#if isReference}
    This is a reference point, not an outcome. It is the model API bill alone, at list prices, and
    <a href={methodsHref}>it is not evidence that the result would work</a>.
  {:else}
    This is the model API bill alone, at list prices, {#if scaleUp !== undefined && scaleUp >= MIN_SCALE_UP}scaled up
      about {times(scaleUp)} times from{:else}extrapolated from{/if}
    <a href={calibrationHref}>one unfinished port</a>{#if coverage !== undefined}{' '}of roughly {percent(coverage)} of one Ceph
      component{/if}; it does not include people, human review, CI, test clusters or time, and
    <a href={methodsHref}>it is not evidence that the result would work</a>.
  {/if}
</p>

<!-- The range is always the low and high scenarios as published: the same basis as the range chart. -->
{#snippet span()}
  {#if low && high}about <Amount value={low.preset.usd} kind="usd" spellExact /> to about
    <Amount value={high.preset.usd} kind="usd" spellExact />{:else if high}up to about
    <Amount value={high.preset.usd} kind="usd" spellExact />{:else if low}about
    <Amount value={low.preset.usd} kind="usd" spellExact /> or more{/if}{#if d.customised}{' '}as published{/if}
{/snippet}

<p class="spread">
  {#if current?.custom}
    The scenario as published puts it at <Amount value={current.preset.usd} kind="usd" spellExact />.
  {/if}
  {#if isReference || isZero}
    {#if isZero && !isReference}
      At $0 this is not an estimate: a value in the assumptions removes the work.
    {/if}
    {#if low || high}
      Assumptions of the size this report already considers put the same port at {@render span()}.
    {/if}
  {:else}
    Read this as {magnitude(headline.usd)}, not as a quote{#if low && high}: assumptions of the size this report already
      considers move it from {@render span()}, and neither is a limit{:else if high}: assumptions of the size this report
      already considers move it {@render span()}, and that is not a limit{:else if low}: assumptions of the size this report
      already considers put it at {@render span()}, and that is not a limit{/if}.{#if outside}{' '}Your changes take this
      figure outside that range.{/if}
  {/if}
</p>

<style>
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

  .caveat {
    margin: 0;
    max-width: 44rem;
    padding-inline-start: var(--space-3);
    border-inline-start: 3px solid var(--text);
    font-weight: 500;
  }

  .spread {
    margin: 0;
    color: var(--text-muted);
  }
</style>
