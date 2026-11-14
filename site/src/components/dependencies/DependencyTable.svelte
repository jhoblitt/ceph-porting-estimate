<!--
  One row per dependency: what Ceph uses it for, the current target's plan
  with its reasoning as written, the work and its cost, and the vendored
  code's size. Each row opens a comparison of all three targets' plans.
-->
<script lang="ts">
  import { type DependencyRow, vendoredText } from '../../lib/dependencies';
  import { countExact, usdExact } from '../../lib/format';
  import { DIFFICULTY_LABELS, STRATEGY_LABELS } from '../../lib/labels';
  import { TARGET_LABELS, type Target } from '../../lib/report';

  interface Props {
    rows: DependencyRow[];
    target: Target;
    onexplore: (id: string) => void;
  }

  let { rows, target, onexplore }: Props = $props();

  let open = $state<Set<string>>(new Set());

  function toggle(id: string) {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    open = next;
  }
</script>

<div class="scroll">
  <table>
    <caption class="visually-hidden">Dependencies, with the plan for {TARGET_LABELS[target]}, its work and its cost</caption>
    <thead>
      <tr>
        <th scope="col">Dependency</th>
        <th scope="col">Ceph uses it for</th>
        <th scope="col">Plan for {TARGET_LABELS[target]}</th>
        <th scope="col" class="n">Lines of work</th>
        <th scope="col" class="n">Cost</th>
        <th scope="col" class="n">Vendored code</th>
      </tr>
    </thead>
    <tbody>
      {#each rows as r (r.id)}
        {@const expanded = open.has(r.id)}
        {@const size = vendoredText(r)}
        <tr class="row" class:expanded>
          <th scope="row">
            <span class="name">{r.name}</span>
            <span class="actions">
              <button
                type="button"
                class="link"
                aria-expanded={expanded}
                aria-controls="dep-{r.id}-targets"
                onclick={() => toggle(r.id)}
              >
                {expanded ? 'Hide' : 'Compare'} targets<span class="visually-hidden"> for {r.name}</span>
              </button>
              {#if r.lines > 0}
                <button type="button" class="link" onclick={() => onexplore(r.id)}>
                  Cost breakdown<span class="visually-hidden"> of {r.name}</span>
                </button>
              {/if}
            </span>
          </th>
          <td class="used" data-label="Ceph uses it for">{r.usedFor}</td>
          <td class="plan" data-label="Plan for {TARGET_LABELS[target]}">
            <span class="strategy {r.strategy}">{STRATEGY_LABELS[r.strategy]}</span>
            {#if r.package}<code>{r.package}</code>{/if}
            <span class="note">{r.note}</span>
          </td>
          <td class="n" data-label="Lines of work">{r.lines > 0 ? countExact(r.lines) : '—'}</td>
          <td class="n" data-label="Cost">{r.lines > 0 ? usdExact(r.usd) : '—'}</td>
          <td class="n size" data-label="Vendored code">
            {size.text}{#if size.note}<span class="sub">{size.note}</span>{/if}
          </td>
        </tr>
        {#if expanded}
          <tr class="compare" id="dep-{r.id}-targets">
            <td colspan="6">
              <ul>
                {#each r.targets as t (t.target)}
                  <li class:current={t.current}>
                    <p class="target">
                      {TARGET_LABELS[t.target]}{t.current ? ' (selected)' : ''}:
                      <span class="strategy {t.strategy}">{STRATEGY_LABELS[t.strategy]}</span>
                    </p>
                    <p class="detail">
                      {#if t.package}<code>{t.package}</code>{:else}No package named{/if};
                      {t.lines > 0 ? `${countExact(t.lines)} lines of work, ${DIFFICULTY_LABELS[t.difficulty].toLowerCase()}` : 'no work to cost'}
                    </p>
                    <p class="note">{t.note}</p>
                  </li>
                {/each}
              </ul>
            </td>
          </tr>
        {/if}
      {/each}
    </tbody>
  </table>
</div>

<style>
  .scroll {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }

  td.size {
    min-width: 9rem;
    max-width: 14rem;
    white-space: normal;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }

  th,
  td {
    padding: var(--space-3);
    text-align: start;
    vertical-align: top;
    border-bottom: 1px solid var(--grid);
  }

  thead th {
    padding-block: var(--space-2);
    font-weight: 600;
    color: var(--text-muted);
    white-space: nowrap;
    border-bottom-color: var(--baseline);
  }

  .n {
    text-align: end;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  th[scope='row'] {
    min-width: 9rem;
    font-weight: 400;
  }

  .name {
    display: block;
    font-weight: 600;
  }

  .actions {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }

  .link {
    padding: 2px 0;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    font-size: 0.8125rem;
    text-decoration: underline;
    text-underline-offset: 0.2em;
    cursor: pointer;
  }

  .used {
    min-width: 10rem;
    max-width: 16rem;
    color: var(--text-muted);
  }

  .plan {
    min-width: 14rem;
    max-width: 26rem;
  }

  code {
    font-family: var(--font-num);
    font-size: 0.9em;
    overflow-wrap: anywhere;
  }

  .strategy {
    display: inline-block;
    margin-inline-end: var(--space-1);
    padding: 0 var(--space-2);
    border: 1px solid var(--border-strong);
    border-radius: 999px;
    font-weight: 600;
  }

  .strategy.bindings,
  .strategy.port {
    border-color: var(--accent);
    background: var(--accent-wash);
  }

  .note {
    display: block;
    margin-top: var(--space-1);
    color: var(--text-muted);
  }

  .sub {
    display: block;
    color: var(--text-muted);
  }

  tr.expanded th,
  tr.expanded td {
    border-bottom: 0;
  }

  .compare td {
    background: var(--page);
  }

  .compare ul {
    display: grid;
    grid-template-columns: repeat(3, minmax(14rem, 1fr));
    gap: var(--space-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .compare li {
    padding-inline-start: var(--space-3);
    border-inline-start: 3px solid var(--grid);
  }

  .compare li.current {
    border-inline-start-color: var(--accent);
  }

  .compare p {
    margin: 0 0 var(--space-1);
  }

  .target {
    font-weight: 600;
  }

  /*
   * A phone: one card per dependency, each figure under its own label, so
   * nothing sits off-screen and the comparison stacks instead of scrolling.
   */
  @media (width < 720px) {
    .scroll {
      overflow-x: visible;
    }

    table,
    tbody,
    tr,
    th,
    td {
      display: block;
    }

    thead {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    tr.row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-2) var(--space-3);
      padding: var(--space-3);
      border-bottom: 1px solid var(--grid);
    }

    tr.row.expanded {
      border-bottom: 0;
    }

    th,
    td {
      padding: 0;
      border-bottom: 0;
    }

    th[scope='row'],
    td.used,
    td.plan {
      grid-column: 1 / -1;
      min-width: 0;
      max-width: none;
    }

    .actions {
      flex-direction: row;
      flex-wrap: wrap;
      gap: 0 var(--space-4);
    }

    td.n {
      text-align: start;
      white-space: normal;
    }

    td.size {
      grid-column: 1 / -1;
      min-width: 0;
      max-width: none;
    }

    td[data-label]::before {
      content: attr(data-label);
      display: block;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-muted);
    }

    .compare td {
      padding: var(--space-3);
      border-bottom: 1px solid var(--grid);
    }

    .compare ul {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
