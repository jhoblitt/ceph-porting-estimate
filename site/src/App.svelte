<script lang="ts">
  import { onDestroy } from 'svelte';
  import Footer from './components/Footer.svelte';
  import Header from './components/Header.svelte';
  import { SECTION_IDS } from './lib/prose/content';
  import type { Report as ReportData } from './lib/report';
  import { type Route, createStateStore, windowHashLocation } from './lib/state';
  import Calibration from './routes/Calibration.svelte';
  import Methods from './routes/Methods.svelte';
  import Report from './routes/Report.svelte';

  interface Props {
    report: ReportData;
  }

  let { report }: Props = $props();

  // main.ts loads the report once and mounts with it; it is never replaced.
  // svelte-ignore state_referenced_locally
  const selection = createStateStore(report, windowHashLocation(window), SECTION_IDS);
  onDestroy(selection.destroy);

  const titles: Record<Route, string> = {
    report: 'Ceph porting estimate',
    methods: 'Methods · Ceph porting estimate',
    calibration: 'Calibration · Ceph porting estimate',
  };

  let main: HTMLElement;
  let shownRoute: Route | undefined;

  $effect(() => {
    const route = $selection.route;
    document.title = titles[route];
    // On a page change, start at the top and give the new page focus, as a
    // full page load would; the first render leaves both alone.
    if (shownRoute !== undefined && shownRoute !== route) {
      window.scrollTo(0, 0);
      main.focus({ preventScroll: true });
    }
    shownRoute = route;
  });

  function skipToContent(event: MouseEvent) {
    // A plain #main link would replace the hash that holds the selection.
    event.preventDefault();
    main.focus();
  }
</script>

<a class="skip-link" href="#/" onclick={skipToContent}>Skip to content</a>

<Header ceph={report.ceph} selection={$selection} />

<main bind:this={main} tabindex="-1">
  {#if $selection.route === 'methods'}
    <Methods {report} selection={$selection} />
  {:else if $selection.route === 'calibration'}
    <Calibration {report} selection={$selection} />
  {:else}
    <Report {report} selection={$selection} onselect={(next, opts) => selection.set(next, opts)} />
  {/if}
</main>

<Footer />

<style>
  main {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    max-width: var(--content-max);
    margin: 0 auto;
    padding: var(--space-7) var(--space-5) 0;
  }

  main:focus {
    outline: none;
  }

  .skip-link {
    position: absolute;
    left: var(--space-4);
    top: -10rem;
    z-index: 1;
    padding: var(--space-2) var(--space-4);
    background: var(--accent);
    color: var(--accent-ink);
    border-radius: var(--radius-sm);
  }

  .skip-link:focus-visible {
    top: var(--space-4);
  }

  @media (width < 720px) {
    main {
      padding-top: var(--space-5);
      padding-inline: var(--space-4);
    }
  }
</style>
