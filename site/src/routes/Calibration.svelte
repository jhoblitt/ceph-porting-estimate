<!-- The rgw-go measurement and how the calibrated parameters follow from it. The words are src/content/calibration/*.md. -->
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
  title="Calibration"
  lede="The one real port the central scenario is measured on: what it is, what it consumed, and how each ratio the estimate uses follows from it."
  docs={PAGE_DOCS.calibration}
  {report}
  {selection}
/>
