<!--
  How a feature's size becomes its output tokens: the source tokens, then
  each factor docs/cost-model.md applies, with the running total after it.
-->
<script lang="ts">
  import type { ChainStep } from '../../lib/explorer';
  import { decimal } from '../../lib/format';
  import { CHAIN_TEXT } from '../../lib/labels';
  import Amount from '../Amount.svelte';

  interface Props {
    steps: ChainStep[];
    /** Names the difficulty step's class, e.g. "hard". */
    difficulty: string;
  }

  let { steps, difficulty }: Props = $props();
</script>

<table class="chain">
  <caption class="visually-hidden">From source tokens to output tokens, one factor at a time</caption>
  <thead>
    <tr>
      <th scope="col">Step</th>
      <th scope="col">Factor</th>
      <th scope="col">Tokens</th>
    </tr>
  </thead>
  <tbody>
    {#each steps as s (s.key)}
      {@const text = CHAIN_TEXT[s.key]}
      <tr>
        <th scope="row">
          <span class="label">{text.label}{s.key === 'difficulty' ? ` (${difficulty})` : ''}</span>
          <span class="note">{text.note}</span>
        </th>
        <td class="factor">{s.factor === null ? '' : `× ${decimal(s.factor)}`}</td>
        <td class="value"><Amount value={s.value} kind="tokens" spellExact /></td>
      </tr>
    {/each}
  </tbody>
  <tfoot>
    <tr>
      <th scope="row" colspan="2">Output tokens</th>
      <td class="value"><Amount value={steps.at(-1)?.value ?? 0} kind="tokens" spellExact /></td>
    </tr>
  </tfoot>
</table>

<style>
  .chain {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }

  th,
  td {
    padding: var(--space-2) var(--space-2);
    border-bottom: 1px solid var(--grid);
    text-align: start;
    vertical-align: top;
  }

  thead th {
    font-weight: 600;
    color: var(--text-muted);
    border-bottom-color: var(--baseline);
  }

  thead th:not(:first-child),
  .factor,
  .value {
    text-align: end;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  tbody th {
    font-weight: 400;
  }

  .label {
    display: block;
    font-weight: 600;
  }

  .note {
    display: block;
    color: var(--text-muted);
    font-size: 0.8125rem;
  }

  .factor {
    color: var(--text-muted);
  }

  tfoot th,
  tfoot td {
    border-top: 2px solid var(--baseline);
    border-bottom: 0;
    font-weight: 700;
  }
</style>
