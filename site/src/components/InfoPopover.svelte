<!--
  A small "i" button that opens a note in place. Built on the native popover
  attribute, so Escape and a click outside close it and focus returns to the
  button. Where the browser supports anchor positioning the note sits under
  the button; elsewhere it opens centred on screen.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** The button's accessible name, e.g. "About cache-read tokens per output token". */
    label: string;
    children: Snippet;
  }

  let { label, children }: Props = $props();

  const id = $props.id();
  const popoverId = `${id}-info`;
  const anchor = `--${id}-anchor`;
</script>

<button type="button" class="info" popovertarget={popoverId} aria-label={label} title={label} style:anchor-name={anchor}>
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5" />
    <circle cx="8" cy="4.75" r="1" fill="currentColor" />
    <path d="M8 7.25v4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
  </svg>
</button>
<div id={popoverId} class="note" popover="auto" style:position-anchor={anchor}>
  {@render children()}
</div>

<style>
  .info {
    display: inline-grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    vertical-align: middle;
  }

  .info:hover {
    color: var(--accent);
    background: var(--accent-wash);
  }

  .note {
    width: min(24rem, calc(100vw - 2 * var(--space-4)));
    padding: var(--space-4);
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.18);
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  .note :global(p) {
    margin: 0 0 var(--space-2);
  }

  .note :global(p:last-child) {
    margin-bottom: 0;
  }

  @supports (position-area: bottom) {
    .note {
      inset: auto;
      margin: var(--space-1) 0 0;
      position-area: bottom span-left;
      position-try-fallbacks:
        flip-inline,
        flip-block,
        flip-block flip-inline;
    }
  }
</style>
