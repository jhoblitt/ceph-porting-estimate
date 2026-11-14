<!--
  SLOT for Task 8b: the drill-down explorer (treemap, table, feature detail).
  Report.svelte already mounts it with these props; 8b replaces the contents.
-->
<script lang="ts">
  import type { Derived } from '../lib/derived.svelte';
  import type { AppState, WriteOptions } from '../lib/state';
  import Section from './Section.svelte';

  interface Props {
    d: Derived;
    selection: AppState;
    onselect: (next: AppState, opts?: WriteOptions) => void;
  }

  let _props: Props = $props();
</script>

<Section id="explorer" title="Explore by component">
  {#snippet lede()}
    The breakdown by component and feature is not built yet.
  {/snippet}
</Section>
