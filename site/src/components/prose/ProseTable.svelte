<!--
  A table from lib/prose/tables.ts. It scrolls sideways inside its own box on
  a narrow screen rather than widening the page; the box is focusable so a
  keyboard can scroll it too.
-->
<script lang="ts">
  import type { Cell, Table } from '../../lib/prose/tables';

  interface Props {
    table: Table;
  }

  let { table }: Props = $props();

  const id = $props.id();
</script>

{#snippet cell(c: Cell)}
  {#if typeof c === 'string'}
    {c}
  {:else if c.href}
    <a href={c.href}>{#if c.code}<code>{c.text}</code>{:else}{c.text}{/if}</a>
  {:else if c.code}
    <code>{c.text}</code>
  {:else}
    {c.text}
  {/if}
{/snippet}

<figure class="prose-table">
  <!-- A labelled region that scrolls must take focus, or a keyboard cannot scroll it. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="scroll" role="region" aria-labelledby="{id}-caption" tabindex="0">
    <table>
      <caption id="{id}-caption">{table.caption}</caption>
      <thead>
        <tr>
          {#each table.columns as col (col.label)}
            <th scope="col" class:numeric={col.numeric} class:wide={col.wide}>{col.label}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each table.rows as row, r (r)}
          <tr class:strong={row.strong} class:indent={row.indent}>
            {#each row.cells as c, i (i)}
              {#if i === 0 && table.rowHeaders !== false}
                <th scope="row" class:numeric={table.columns[i]?.numeric}>{@render cell(c)}</th>
              {:else}
                <td class:numeric={table.columns[i]?.numeric} class:wide={table.columns[i]?.wide}>{@render cell(c)}</td>
              {/if}
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if table.note}
    <figcaption>{table.note}</figcaption>
  {/if}
</figure>
