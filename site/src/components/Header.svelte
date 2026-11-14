<script lang="ts">
  import { type Ceph, cephCommitUrl, commitDay, shortSha } from '../lib/report';
  import { type AppState, hashFromState } from '../lib/state';
  import Nav from './Nav.svelte';
  import ThemeToggle from './ThemeToggle.svelte';

  interface Props {
    ceph: Ceph;
    selection: AppState;
  }

  let { ceph, selection }: Props = $props();
</script>

<header class="site-header">
  <div class="inner">
    <div class="brand">
      <a class="title" href={hashFromState({ ...selection, route: 'report' })}>Ceph porting estimate</a>
      <p class="snapshot">
        <a href={cephCommitUrl(ceph)} title={`${ceph.repo} commit ${ceph.rev}`}>
          ceph@<span class="num">{shortSha(ceph.rev)}</span>
        </a>
        <span aria-hidden="true">·</span>
        <time class="num" datetime={commitDay(ceph.commit_date)}>{commitDay(ceph.commit_date)}</time>
      </p>
    </div>
    <div class="nav"><Nav {selection} /></div>
    <div class="toggle"><ThemeToggle /></div>
  </div>
</header>

<style>
  .site-header {
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }

  .inner {
    display: grid;
    grid-template-columns: 1fr auto auto;
    grid-template-areas: 'brand nav toggle';
    align-items: center;
    gap: var(--space-3) var(--space-5);
    max-width: var(--content-max);
    margin: 0 auto;
    padding: var(--space-4) var(--space-5);
  }

  .brand {
    grid-area: brand;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-1) var(--space-4);
  }

  .nav {
    grid-area: nav;
  }

  .toggle {
    grid-area: toggle;
  }

  .title {
    color: var(--text);
    font-size: var(--text-lg);
    font-weight: 700;
    letter-spacing: -0.01em;
    text-decoration: none;
  }

  .snapshot {
    margin: 0;
    display: flex;
    gap: var(--space-2);
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  @media (width < 720px) {
    .inner {
      grid-template-columns: 1fr auto;
      grid-template-areas:
        'brand toggle'
        'nav nav';
      padding: var(--space-4);
    }

    .brand {
      flex-direction: column;
      gap: 0;
    }
  }
</style>
