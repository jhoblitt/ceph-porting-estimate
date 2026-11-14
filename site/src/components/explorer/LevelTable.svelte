<!--
  The map's level as a table: its text equivalent, and a view in its own
  right. Exact figures, sortable by any column, filtered by name. At the root
  the components sit under their groups with a subtotal each; the total is
  of every row, whatever the filter hides. Choosing a row is choosing its cell.
-->
<script lang="ts">
  import { type TestComponentNote, testNoteText } from '../../lib/counterfactual';
  import { type Level, type Row, type Sort, type SortKey, filterGroups, sortRows } from '../../lib/explorer';
  import { countExact, percent, usdExact } from '../../lib/format';
  import { DIFFICULTY_LABELS, KIND_LABELS, SCOPE_LABELS } from '../../lib/labels';

  interface Props {
    level: Level;
    /** What the rows are, for the caption: "Components" or "Features of OSD (classic)". */
    caption: string;
    sort: Sort;
    query: string;
    selectedId: string | null;
    highlightId: string | null;
    /** What leaving out each component of ported tests would do to the headline. */
    testNotes: Map<string, TestComponentNote>;
    onopen: (row: Row) => void;
    onhover: (id: string | null) => void;
  }

  let {
    level,
    caption,
    sort = $bindable(),
    query = $bindable(),
    selectedId,
    highlightId,
    testNotes,
    onopen,
    onhover,
  }: Props = $props();

  const atRoot = $derived(level.componentId === null);
  const groups = $derived(filterGroups(level.groups, query).map((g) => ({ ...g, rows: sortRows(g.rows, sort) })));
  const shownRows = $derived(groups.reduce((n, g) => n + g.rows.length, 0));
  const allRows = $derived(level.groups.reduce((n, g) => n + g.rows.length, 0));
  const noun = $derived(atRoot ? 'components' : 'features');

  const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
    { key: 'name', label: 'Name', numeric: false },
    { key: 'code', label: 'Code lines', numeric: true },
    { key: 'sourceTokens', label: 'Source tokens', numeric: true },
    { key: 'outputTokens', label: 'Output tokens', numeric: true },
    { key: 'cacheReadTokens', label: 'Cache-read tokens', numeric: true },
    { key: 'usd', label: 'Cost', numeric: true },
    { key: 'share', label: 'Share of headline', numeric: true },
  ];

  function sortBy(key: SortKey) {
    sort = sort.key === key ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' };
  }

  const ariaSort = (key: SortKey) =>
    sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined;

  function tags(r: Row): string {
    if (r.kind === 'component') return r.features === 1 ? '1 feature' : `${r.features} features`;
    const parts = [r.featureKind ? KIND_LABELS[r.featureKind] : '', r.difficulty ? DIFFICULTY_LABELS[r.difficulty].toLowerCase() : ''];
    return parts.filter(Boolean).join(', ');
  }
</script>

<div class="toolbar">
  <label class="filter">
    <span>Filter {noun} by name</span>
    <input type="search" bind:value={query} placeholder={atRoot ? 'e.g. OSD' : 'e.g. peering'} autocomplete="off" />
  </label>
  <p class="count" aria-live="polite">
    {#if shownRows === allRows}{allRows} {noun}{:else}{shownRows} of {allRows} {noun}{/if}
  </p>
</div>

<div class="scroll">
  <table>
    <caption>
      <span class="visually-hidden">{caption}, with code lines, tokens, cost and share of the headline.</span>
      Code lines are counted from Ceph's source{atRoot ? '; for the dependency work, they are lines of work the data assumes' : ''}.
      Token and dollar columns are model output, not measurements, printed in full.
    </caption>
    <thead>
      <tr>
        {#each COLUMNS as col (col.key)}
          <th scope="col" class:numeric={col.numeric} aria-sort={ariaSort(col.key)}>
            <button type="button" onclick={() => sortBy(col.key)}>
              {col.label}
              <span class="arrow" aria-hidden="true">{sort.key === col.key ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
            </button>
          </th>
        {/each}
      </tr>
    </thead>
    {#each groups as g (g.id)}
      <tbody>
        {#if atRoot}
          <tr class="group-row">
            <th scope="rowgroup">{g.name}</th>
            <td>{countExact(g.subtotal.code)}</td>
            <td>{countExact(g.subtotal.sourceTokens)}</td>
            <td>{countExact(g.subtotal.outputTokens)}</td>
            <td>{countExact(g.subtotal.cacheReadTokens)}</td>
            <td>{usdExact(g.subtotal.usd)}</td>
            <td>{percent(g.share)}</td>
          </tr>
        {/if}
        {#each g.rows as r (r.id)}
          {@const notPorted = r.scope === 'not-ported'}
          <tr
            class:selected={r.id === selectedId}
            class:highlighted={r.id === highlightId}
            onpointerenter={() => onhover(r.id)}
            onpointerleave={() => onhover(null)}
          >
            <th scope="row">
              <button
                type="button"
                class="open"
                aria-current={r.id === selectedId ? 'true' : undefined}
                onclick={() => onopen(r)}
              >
                {r.name}
              </button>
              <span class="tags">
                {#if r.scope && r.scope !== 'headline'}<span class="pill" class:np={notPorted}>{SCOPE_LABELS[r.scope]}</span>{/if}
                {tags(r)}
              </span>
              {#if r.kind === 'component' && testNotes.has(r.id)}
                {@const text = testNoteText(testNotes.get(r.id) as TestComponentNote)}
                <span class="test-note">{text.lead} {text.effect}</span>
              {/if}
            </th>
            <td>{countExact(r.figures.code)}</td>
            {#if notPorted}
              <td colspan="4" class="free">Not ported: no tokens and no cost</td>
            {:else}
              <td>{countExact(r.figures.sourceTokens)}</td>
              <td>{countExact(r.figures.outputTokens)}</td>
              <td>{countExact(r.figures.cacheReadTokens)}</td>
              <td>{usdExact(r.figures.usd)}</td>
            {/if}
            <td class="share">
              <span class="share-cell">
                <span class="bar" aria-hidden="true"><span style:width="{r.bar * 100}%"></span></span>
                <span class="pct">{notPorted ? '—' : percent(r.share)}</span>
              </span>
            </td>
          </tr>
        {/each}
      </tbody>
    {/each}
    <tfoot>
      <tr>
        <th scope="row">{atRoot ? 'Total' : 'All features'}{shownRows < allRows ? `, all ${allRows} ${noun}` : ''}</th>
        <td>{countExact(level.total.code)}</td>
        <td>{countExact(level.total.sourceTokens)}</td>
        <td>{countExact(level.total.outputTokens)}</td>
        <td>{countExact(level.total.cacheReadTokens)}</td>
        <td data-total-usd={level.total.usd}>{usdExact(level.total.usd)}</td>
        <td>{percent(level.share)}</td>
      </tr>
    </tfoot>
  </table>
</div>

<style>
  caption {
    caption-side: bottom;
    padding: var(--space-2) var(--space-3);
    text-align: start;
    font-size: 0.8125rem;
    color: var(--text-muted);
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }

  .filter {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text-muted);
  }

  input {
    width: min(18rem, 100%);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--page);
    color: var(--text);
    font: inherit;
    font-weight: 400;
  }

  .count {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .scroll {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }

  th,
  td {
    padding: var(--space-2) var(--space-3);
    text-align: end;
    white-space: nowrap;
    border-bottom: 1px solid var(--grid);
  }

  th[scope='row'],
  th[scope='rowgroup'],
  thead th:first-child {
    text-align: start;
  }

  th[scope='row'] {
    white-space: normal;
    min-width: 12rem;
    font-weight: 400;
  }

  thead th {
    padding: 0;
    background: var(--surface);
    font-weight: 600;
    color: var(--text-muted);
    border-bottom: 1px solid var(--baseline);
  }

  thead button {
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: inherit;
    cursor: pointer;
    white-space: nowrap;
  }

  thead button:hover {
    color: var(--text);
    background: var(--accent-wash);
  }

  th[aria-sort] button {
    color: var(--text);
  }

  .arrow {
    display: inline-block;
    width: 0.8em;
    font-size: 0.7em;
  }

  .group-row th,
  .group-row td {
    padding-top: var(--space-4);
    background: var(--page);
    font-weight: 700;
    color: var(--text);
  }

  .open {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    font-weight: 600;
    text-align: start;
    text-decoration: underline;
    text-decoration-color: transparent;
    text-underline-offset: 0.2em;
    cursor: pointer;
  }

  .open:hover {
    text-decoration-color: currentColor;
  }

  .tags {
    display: block;
    font-size: 0.8125rem;
    color: var(--text-muted);
  }

  .test-note {
    display: block;
    max-width: 24rem;
    margin-top: var(--space-1);
    font-size: 0.8125rem;
    line-height: 1.4;
    color: var(--text-muted);
  }

  .pill {
    display: inline-block;
    margin-inline-end: var(--space-1);
    padding: 0 var(--space-2);
    border: 1px dotted var(--text);
    border-radius: 999px;
    color: var(--text);
  }

  .pill.np {
    border-style: solid;
    border-color: var(--baseline);
    background: var(--hatch-not-ported);
  }

  tbody tr:not(.group-row):hover,
  tr.highlighted {
    background: var(--accent-wash);
  }

  tr.selected {
    box-shadow: inset 3px 0 0 var(--text);
    background: var(--accent-wash);
  }

  .free {
    text-align: center;
    color: var(--text-muted);
    font-style: italic;
  }

  .share {
    min-width: 8.5rem;
  }

  .share-cell {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  .pct {
    min-width: 4.5em;
  }

  .bar {
    display: inline-block;
    width: 3.5rem;
    height: 6px;
    background: var(--grid);
    border-radius: 3px;
    overflow: hidden;
  }

  .bar span {
    display: block;
    height: 100%;
    background: var(--series-1);
    border-radius: 3px;
  }

  tfoot th,
  tfoot td {
    font-weight: 700;
    border-top: 2px solid var(--baseline);
    border-bottom: 0;
  }
</style>
