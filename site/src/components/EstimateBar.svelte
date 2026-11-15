<!--
  The estimate, kept on screen once the hero figure is scrolled past: a
  strip pinned to the top of the viewport with the figure as the hero prints
  it, the selection it is for and, once an assumption is changed, how far
  the figure is from the scenario as published and the panel's reset. It is
  fixed, so it takes no room and showing it shifts nothing; while it is on
  the page, scroll padding keeps a focused control clear of it. Screen
  readers hear a new figure once, when the change settles (lib/settle.ts),
  not while a slider moves; the strip itself is not a live region.
-->
<script lang="ts">
  import { onDestroy, tick, untrack } from 'svelte';
  import type { Derived } from '../lib/derived.svelte';
  import { signedPercent, usd } from '../lib/format';
  import { TARGET_LABELS } from '../lib/report';
  import { focusEstimate, revealEstimate } from '../lib/reveal';
  import { settle } from '../lib/settle';
  import type { AppState, WriteOptions } from '../lib/state';
  import Amount from './Amount.svelte';

  interface Props {
    d: Derived;
    selection: AppState;
    onselect: (next: AppState, opts?: WriteOptions) => void;
    /** True while the hero figure is scrolled past; the bar shows only then. */
    show: boolean;
  }

  let { d, selection, onselect, show }: Props = $props();

  const figure = $derived(d.root.headline.usd);
  const changed = $derived(d.changedCount);
  /** The change from the scenario as published, printed; none against a published $0, which has no percentage. */
  const change = $derived.by(() => {
    const fraction = d.fromPublished?.change;
    return fraction === undefined || fraction === null ? undefined : signedPercent(fraction);
  });
  const message = $derived(`Estimate ${usd(figure)}${change ? `, ${change} vs. published` : ''}.`);

  let announcement = $state('');
  const announcer = settle(
    untrack(() => message),
    (m) => (announcement = m),
    { target: window },
  );
  $effect(() => announcer.push(message));
  onDestroy(announcer.stop);

  let height = $state(0);
  $effect(() => {
    const root = document.documentElement;
    root.style.scrollPaddingTop = `calc(${height}px + var(--space-3))`;
    return () => root.style.removeProperty('scroll-padding-top');
  });

  // Before the bar goes inert: an inert bar would drop the focus inside it to the page's body.
  let bar = $state<HTMLElement>();
  $effect.pre(() => {
    if (!show && bar?.contains(document.activeElement)) focusEstimate();
  });

  let back = $state<HTMLButtonElement>();
  async function reset() {
    onselect({ ...selection, overrides: {} });
    // The reset goes with what it resets; keep focus in the bar rather than lose it to the page.
    await tick();
    back?.focus();
  }
</script>

<div
  class="estimate-bar"
  data-estimate-bar
  data-shown={show}
  inert={!show}
  bind:this={bar}
  bind:offsetHeight={height}
>
  <div class="inner">
    <div class="line">
      <p class="figure"><Amount value={figure} kind="usd" /></p>
      {#if change}<p class="change">{change} vs. published</p>{/if}
    </div>
    <div class="line">
      <p class="selection">
        <span class="target">{TARGET_LABELS[d.target]}</span>
        <span class="part model" title={d.model.name}>{d.model.name}</span>
        <span class="part scenario" title={d.scenario.label}>{d.scenario.label}</span>
      </p>
      {#if changed > 0}
        <button type="button" class="reset" onclick={reset}>Reset all ({changed})</button>
      {/if}
      <button type="button" class="back" title="Back to the estimate" bind:this={back} onclick={() => revealEstimate()}>
        <span aria-hidden="true">↑</span><span class="back-words">Back to the estimate</span>
      </button>
    </div>
  </div>
</div>
<p class="visually-hidden" role="status">{announcement}</p>

<style>
  .estimate-bar {
    position: fixed;
    inset: 0 0 auto;
    z-index: 10;
    background: var(--surface);
    border-bottom: 1px solid var(--border-strong);
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.08);
    transform: translateY(-100%);
    visibility: hidden;
    /* Hidden only once it has slid away. */
    transition:
      transform 0.15s ease-in,
      visibility 0s linear 0.15s;
  }

  .estimate-bar[data-shown='true'] {
    transform: none;
    visibility: visible;
    transition: transform 0.15s ease-out;
  }

  .inner {
    display: flex;
    align-items: center;
    gap: var(--space-2) var(--space-4);
    max-width: var(--content-max);
    margin: 0 auto;
    padding: var(--space-2) var(--space-5);
  }

  /* One row on a wide screen; two lines on a phone. */
  .line {
    display: contents;
  }

  p {
    margin: 0;
  }

  .figure {
    font-size: var(--text-xl);
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.2;
  }

  .change {
    flex: none;
    padding: 0 var(--space-2);
    border: 1px solid var(--accent);
    border-radius: 999px;
    background: var(--accent-wash);
    font-size: var(--text-sm);
    font-weight: 600;
    white-space: nowrap;
  }

  /*
   * One line, whatever the names: they give up width before the bar grows.
   * The scenario goes first, down to its separator and an ellipsis, since
   * the end of a model's name is what tells the models apart. A grid, not
   * flex: flex would shave every name a little, and the ellipsis would then
   * take the model's last characters.
   */
  .selection {
    display: grid;
    grid-template-columns: auto minmax(0, max-content) minmax(2rem, 1fr);
    min-width: 0;
    margin-inline-end: auto;
    color: var(--text-muted);
    font-size: var(--text-sm);
    white-space: nowrap;
  }

  .part {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .part::before {
    content: '·' / '';
    padding-inline: var(--space-2);
  }

  button {
    flex: none;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: var(--text-sm);
    line-height: 1.5;
    cursor: pointer;
    white-space: nowrap;
  }

  button:hover {
    background: var(--accent-wash);
  }

  .back-words {
    margin-inline-start: var(--space-1);
  }

  /*
   * A phone: two short lines. The figure and its change; then the selection,
   * which shortens rather than wraps, the reset and the way back as an arrow.
   */
  @media (width < 720px) {
    .inner {
      flex-direction: column;
      align-items: stretch;
      gap: var(--space-1);
      padding: var(--space-1) var(--space-4);
    }

    .line {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .figure {
      font-size: var(--text-lg);
    }

    /* 24px tall, the smallest target WCAG 2.2 asks for, so the lines stay short. */
    button {
      padding-block: 1px;
      line-height: 1.25rem;
    }

    .back {
      min-width: 2rem;
      padding-inline: var(--space-2);
    }

    .back-words {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .estimate-bar,
    .estimate-bar[data-shown='true'] {
      transition: none;
    }
  }

  @media print {
    .estimate-bar {
      display: none;
    }
  }
</style>
