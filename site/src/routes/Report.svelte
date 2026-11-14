<!--
  The estimate, in the order a reader asks: what it costs (Summary), how much
  that moves (ScenarioRange, Matrix), why (CostByCategory, the 8b explorer
  and dependency slots, Assumptions). Every view reads one Derived.
-->
<script lang="ts">
  import Assumptions from '../components/Assumptions.svelte';
  import CostByCategory from '../components/CostByCategory.svelte';
  import Dependencies from '../components/Dependencies.svelte';
  import Explorer from '../components/Explorer.svelte';
  import Matrix from '../components/Matrix.svelte';
  import ScenarioRange from '../components/ScenarioRange.svelte';
  import SelectionControls from '../components/SelectionControls.svelte';
  import Summary from '../components/Summary.svelte';
  import { Derived } from '../lib/derived.svelte';
  import type { Report } from '../lib/report';
  import type { AppState, WriteOptions } from '../lib/state';

  interface Props {
    report: Report;
    selection: AppState;
    onselect: (next: AppState, opts?: WriteOptions) => void;
  }

  let { report, selection, onselect }: Props = $props();

  // App mounts this with the one report it loaded, which is never replaced.
  // svelte-ignore state_referenced_locally
  const d = new Derived(report, () => selection);
</script>

<div class="intro">
  <h1>Porting estimate</h1>
  <p class="lede">
    What it would cost, in tokens and US dollars, to port Ceph with an agentic coding model.
  </p>
</div>

<SelectionControls {report} {selection} onchange={onselect} changed={d.changedCount} />

<Summary {d} />
<ScenarioRange {d} {selection} {onselect} />
<Matrix {d} {selection} {onselect} />
<CostByCategory {d} />

<!-- Slots for Task 8b: the explorer and the dependency table. -->
<Explorer {d} {selection} {onselect} />
<Dependencies {d} {selection} {onselect} />

<Assumptions {d} {selection} {onselect} />

<style>
  .intro h1 {
    margin-bottom: var(--space-2);
  }

  .lede {
    margin: 0;
    font-size: var(--text-lg);
    color: var(--text-muted);
  }
</style>
