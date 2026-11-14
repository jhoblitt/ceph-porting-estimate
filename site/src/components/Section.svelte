<!-- A card for one view: a heading a link can focus, an optional lede, and the view. -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** The element id; the heading's is `<id>-title`. */
    id: string;
    title: string;
    lede?: Snippet;
    children?: Snippet;
  }

  let { id, title, lede, children }: Props = $props();
</script>

<section {id} class="card" aria-labelledby="{id}-title">
  <header>
    <h2 id="{id}-title" tabindex="-1">{title}</h2>
    {#if lede}
      <p class="lede">{@render lede()}</p>
    {/if}
  </header>
  {@render children?.()}
</section>

<style>
  .card {
    padding: var(--space-6);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    scroll-margin-top: var(--space-4);
  }

  header {
    margin-bottom: var(--space-5);
  }

  h2 {
    font-size: var(--text-lg);
    margin-bottom: var(--space-2);
  }

  h2:focus {
    outline: none;
  }

  .lede {
    margin: 0;
    color: var(--text-muted);
  }

  @media (width < 720px) {
    .card {
      padding: var(--space-5) var(--space-4);
    }
  }
</style>
