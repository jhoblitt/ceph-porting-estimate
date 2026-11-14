<!--
  SLOT for Task 8b: the dependency table. Report.svelte already mounts it
  with these props; 8b replaces the contents.
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

<Section id="dependencies" title="Dependencies">
  {#snippet lede()}
    The table of the libraries Ceph builds on, and what each target does with them, is not built yet.
  {/snippet}
</Section>
