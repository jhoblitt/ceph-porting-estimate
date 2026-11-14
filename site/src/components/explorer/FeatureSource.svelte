<!--
  Where a feature's code is: its lines by language, and its path globs, each
  linked to that place in ceph/ceph at the commit the counts come from.
-->
<script lang="ts">
  import { countExact } from '../../lib/format';
  import { languageLabel } from '../../lib/labels';
  import { globLink } from '../../lib/links';
  import type { Ceph, LineCounts } from '../../lib/report';

  interface Props {
    ceph: Ceph;
    langs: Record<string, LineCounts>;
    globs: string[];
    /** Heading for the paths, e.g. "Paths" or "Vendored submodules". */
    pathsTitle: string;
  }

  let { ceph, langs, globs, pathsTitle }: Props = $props();

  const rows = $derived(Object.entries(langs).sort(([a, x], [b, y]) => y.code - x.code || (a < b ? -1 : 1)));
</script>

{#if rows.length > 0}
  <div class="block">
    <h4>Code by language</h4>
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th scope="col">Language</th>
            <th scope="col">Files</th>
            <th scope="col">Code</th>
            <th scope="col">Comment</th>
            <th scope="col">Blank</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as [lang, c] (lang)}
            <tr>
              <th scope="row">{languageLabel(lang)}</th>
              <td>{countExact(c.files)}</td>
              <td>{countExact(c.code)}</td>
              <td>{countExact(c.comment)}</td>
              <td>{countExact(c.blank)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
{/if}

{#if globs.length > 0}
  <div class="block">
    <h4>{pathsTitle}</h4>
    <ul class="globs">
      {#each globs as g (g)}
        {@const link = globLink(ceph, g)}
        <li>
          {#if link}
            <a href={link.href} rel="noopener noreferrer" title="Open {link.path} in {ceph.repo}"><code>{g}</code></a>
          {:else}
            <code>{g}</code> <span class="muted">(no single place to link)</span>
          {/if}
        </li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .block + .block {
    margin-top: var(--space-5);
  }

  h4 {
    margin: 0 0 var(--space-2);
    font-size: var(--text-sm);
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .scroll {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }

  th,
  td {
    padding: var(--space-1) var(--space-2);
    text-align: end;
    border-bottom: 1px solid var(--grid);
    white-space: nowrap;
  }

  thead th {
    font-weight: 600;
    color: var(--text-muted);
    border-bottom-color: var(--baseline);
  }

  th:first-child {
    text-align: start;
  }

  tbody th {
    font-weight: 400;
  }

  .globs {
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--text-sm);
  }

  .globs li {
    padding: 2px 0;
    overflow-wrap: anywhere;
  }

  code {
    font-family: var(--font-num);
    font-size: 0.9em;
  }

  .muted {
    color: var(--text-muted);
  }
</style>
