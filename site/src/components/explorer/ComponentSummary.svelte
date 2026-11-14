<!-- The component the explorer has zoomed into: what it is, and its lines and cost in each scope. -->
<script lang="ts">
  import { type TestComponentNote, testNoteText } from '../../lib/counterfactual';
  import type { ComponentScopes } from '../../lib/explorer';
  import { percent } from '../../lib/format';
  import { SCOPE_LABELS } from '../../lib/labels';
  import { globLink } from '../../lib/links';
  import type { Ceph } from '../../lib/report';
  import Amount from '../Amount.svelte';

  interface Props {
    ceph: Ceph;
    name: string;
    groupName: string;
    description: string;
    /** The component's directories in the ceph tree. */
    roots: string[];
    scopes: ComponentScopes;
    /** True for the dependency work, whose lines are lines of work. */
    dependencies: boolean;
    /** For a component of ported tests, what leaving it out would do to the headline. */
    testNote?: TestComponentNote | undefined;
    onshowdependencies: () => void;
  }

  let { ceph, name, groupName, description, roots, scopes, dependencies, testNote, onshowdependencies }: Props = $props();

  const unit = $derived(dependencies ? 'lines of work' : 'code lines');
</script>

<div class="summary">
  <div class="text">
    <p class="kicker">{groupName}</p>
    <h3>{name}</h3>
    <p class="description">{description}</p>
    {#if testNote}
      {@const text = testNoteText(testNote)}
      <p class="tests"><strong>Ported tests.</strong> {text.lead} {text.effect}</p>
    {/if}
    {#if roots.length > 0}
      <p class="roots">
        In the tree:
        {#each roots as r, i (r)}
          {@const link = globLink(ceph, r.endsWith('/') ? r : `${r}/`)}
          {#if i > 0},
          {/if}{#if link}<a href={link.href} rel="noopener noreferrer"><code>{r}</code></a>{:else}<code>{r}</code>{/if}
        {/each}
      </p>
    {/if}
    {#if dependencies}
      <p>
        Each feature here is one library that needs bindings or a port. The
        <button type="button" class="link" onclick={onshowdependencies}>dependency table</button> lists all of them, with the
        plan for every target.
      </p>
    {:else}
      <p class="hint">
        {scopes.features === 1 ? 'One feature matches' : `${scopes.features} features match`} files here. Choose one, on the map
        or in the table, to see how its cost is built.
      </p>
    {/if}
  </div>
  <dl class="scopes">
    <div>
      <dt>{SCOPE_LABELS.headline}</dt>
      <dd>
        <span class="figure"><Amount value={scopes.headline.usd} kind="usd" /></span>
        <span><Amount value={scopes.headline.code} kind="count" unit={unit} /> {unit}, {percent(scopes.headline.share)} of the headline</span>
      </dd>
    </div>
    {#if scopes.shown.code > 0 || scopes.shown.usd > 0}
      <div>
        <dt>{SCOPE_LABELS.shown}</dt>
        <dd>
          <span class="figure"><Amount value={scopes.shown.usd} kind="usd" /></span>
          <span><Amount value={scopes.shown.code} kind="count" unit={unit} /> {unit}, not in the headline</span>
        </dd>
      </div>
    {/if}
    {#if scopes.notPorted.code > 0}
      <div class="np">
        <dt>{SCOPE_LABELS['not-ported']}</dt>
        <dd>
          <span class="figure">$0</span>
          <span><Amount value={scopes.notPorted.code} kind="count" unit={unit} /> {unit}, which cost nothing</span>
        </dd>
      </div>
    {/if}
  </dl>
</div>

<style>
  .summary {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    gap: var(--space-4) var(--space-6);
    padding: var(--space-5);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--page);
  }

  .kicker {
    margin: 0 0 var(--space-1);
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  h3 {
    margin: 0 0 var(--space-2);
  }

  .description {
    color: var(--text-muted);
  }

  .tests {
    padding: var(--space-2) var(--space-3);
    border-inline-start: 3px solid var(--accent);
    background: var(--accent-wash);
  }

  .roots,
  .hint,
  .text p:last-child {
    margin-bottom: 0;
    font-size: var(--text-sm);
  }

  code {
    font-family: var(--font-num);
    font-size: 0.9em;
  }

  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    text-decoration: underline;
    text-underline-offset: 0.2em;
    cursor: pointer;
  }

  .scopes {
    display: grid;
    align-content: start;
    gap: var(--space-3);
    margin: 0;
  }

  dt {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text-muted);
  }

  dd {
    display: flex;
    flex-direction: column;
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .figure {
    font-size: var(--text-xl);
    font-weight: 700;
    color: var(--text);
    line-height: 1.2;
  }

  .np {
    padding-inline-start: var(--space-3);
    border-inline-start: 6px solid transparent;
    border-image: var(--hatch-not-ported-line) 6;
  }

  @media (width < 720px) {
    .summary {
      grid-template-columns: minmax(0, 1fr);
      padding: var(--space-4) var(--space-3);
    }
  }
</style>
