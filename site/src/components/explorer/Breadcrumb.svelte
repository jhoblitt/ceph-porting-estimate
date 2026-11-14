<!--
  Where the explorer is: Ceph › group › component › feature. Every item but
  the last goes back up; the last is the current place.
-->
<script lang="ts" module>
  export interface Crumb {
    key: string;
    label: string;
    /** What the item is, read before its name: "group", "component" or "feature". */
    kind?: string;
    go: () => void;
  }
</script>

<script lang="ts">
  interface Props {
    crumbs: Crumb[];
  }

  let { crumbs }: Props = $props();
</script>

<nav class="crumbs" aria-label="Explorer location">
  <ol>
    {#each crumbs as c, i (c.key)}
      <li>
        {#if i < crumbs.length - 1}
          <button type="button" onclick={c.go}>
            {#if c.kind}<span class="visually-hidden">{c.kind}: </span>{/if}{c.label}
          </button>
          <span class="sep" aria-hidden="true">›</span>
        {:else}
          <span class="current" aria-current="location">
            {#if c.kind}<span class="visually-hidden">{c.kind}: </span>{/if}{c.label}
          </span>
        {/if}
      </li>
    {/each}
  </ol>
</nav>

<style>
  ol {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--text-base);
  }

  li {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
  }

  button {
    padding: var(--space-1) var(--space-2);
    margin-inline-start: calc(-1 * var(--space-2));
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--accent);
    font: inherit;
    text-decoration: underline;
    text-underline-offset: 0.2em;
    cursor: pointer;
  }

  li:not(:first-child) button {
    margin-inline-start: 0;
  }

  button:hover {
    background: var(--accent-wash);
  }

  .sep {
    color: var(--text-faint);
    padding-inline: var(--space-1);
  }

  .current {
    padding: var(--space-1) var(--space-2);
    font-weight: 700;
  }
</style>
