<!-- One headline figure: a label, the value and a line on what it counts. Use inside a <dl>. -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    label: string;
    note?: string;
    children: Snippet;
  }

  let { label, note, children }: Props = $props();
</script>

<div class="tile">
  <dt>{label}</dt>
  <dd class="value">{@render children()}</dd>
  {#if note}
    <dd class="note">{note}</dd>
  {/if}
</div>

<style>
  .tile {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-4);
    background: var(--page);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    min-width: 0;
  }

  dt {
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  dd {
    margin: 0;
  }

  .value {
    font-size: var(--text-xl);
    font-weight: 600;
    line-height: 1.15;
  }

  .note {
    font-size: var(--text-sm);
    color: var(--text-muted);
    line-height: 1.4;
  }
</style>
