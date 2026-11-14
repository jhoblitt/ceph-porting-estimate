<!-- How the estimate is made. The words are src/content/methods/*.md, in file-name order. -->
<script lang="ts">
  import ProsePage from '../components/prose/ProsePage.svelte';
  import { PAGE_DOCS } from '../lib/prose/content';
  import type { Report } from '../lib/report';
  import type { AppState } from '../lib/state';

  interface Props {
    report: Report;
    selection: AppState;
  }

  let { report, selection }: Props = $props();
</script>

<ProsePage
  title="Methods"
  lede="How the estimate is made: what it counts, what it leaves out, the formulas, every parameter with its source, and what could make it wrong."
  docs={PAGE_DOCS.methods}
  {report}
  {selection}
/>
