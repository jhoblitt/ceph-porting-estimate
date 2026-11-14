<!-- What the headline covers, what is costed but kept out of it, and what is not ported at all. -->
<script lang="ts">
  import type { Derived } from '../lib/derived.svelte';
  import { list } from '../lib/format';
  import { TARGET_LABELS } from '../lib/report';
  import Amount from './Amount.svelte';

  interface Props {
    d: Derived;
  }

  let { d }: Props = $props();

  /** Groups named in the not-ported line, and components in the shown line; the rest are counted. */
  const NAMED_GROUPS = 3;
  const NAMED_SHOWN = 3;

  const scope = $derived(d.scope);
  const shownLargest = $derived([...scope.shown].sort((a, b) => b.usd - a.usd).slice(0, NAMED_SHOWN));
  const shownRest = $derived(scope.shown.length - shownLargest.length);
  const shownNames = $derived(
    list([
      ...shownLargest.map((c) => c.name),
      ...(shownRest > 0 ? [`${shownRest === 1 ? 'one other component' : `${shownRest} other components`}`] : []),
    ]),
  );
  const dependencyLines = $derived(scope.dependencies?.headline.sloc.code ?? 0);
  const notPortedNames = $derived(scope.notPortedByGroup.slice(0, NAMED_GROUPS).map((g) => g.name));
</script>

<div class="scope">
  <h3>What the headline covers</h3>
  <dl>
    <div>
      <dt>Ported and counted</dt>
      <dd>
        <Amount value={scope.ceph.headline.code} kind="count" unit="lines" /> lines of Ceph's own code{#if dependencyLines > 0},
          plus work equal to <Amount value={dependencyLines} kind="count" unit="lines" /> lines on the
          {scope.dependenciesWithWork === 1
            ? 'dependency whose bindings or port leaves work'
            : `${scope.dependenciesWithWork} dependencies whose bindings or port leave work`} for {TARGET_LABELS[d.target]}{/if}.
      </dd>
    </div>
    {#if scope.shown.length > 0}
      <div>
        <dt>Costed but shown separately</dt>
        <dd>
          <Amount value={d.root.shown.usd} kind="usd" /> for <Amount value={scope.ceph.shown.code} kind="count" unit="lines" />
          lines in {shownNames}. This code is costed for reference and is not part of the headline.
        </dd>
      </div>
    {/if}
    {#if scope.ceph.notPorted.code > 0}
      <div>
        <dt>Not ported</dt>
        <dd>
          <Amount value={scope.ceph.notPorted.code} kind="count" unit="lines" /> lines a port would reuse or replace rather
          than rewrite, such as documentation, generated data, test fixtures, vendored code and build files{#if notPortedNames.length > 0},
            most of them in {list(notPortedNames)}{/if}. They cost nothing here.
        </dd>
      </div>
    {/if}
  </dl>
</div>

<style>
  .scope {
    padding: var(--space-4) var(--space-5);
    border-inline-start: 3px solid var(--baseline);
    background: var(--page);
    border-radius: 0 var(--radius) var(--radius) 0;
  }

  h3 {
    margin: 0 0 var(--space-3);
    font-size: var(--text-base);
  }

  dl {
    display: grid;
    gap: var(--space-3);
    margin: 0;
  }

  dt {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text-muted);
  }

  dd {
    margin: 0;
    max-width: var(--measure);
  }
</style>
