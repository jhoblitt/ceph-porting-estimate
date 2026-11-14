<!--
  The adjustable numbers the estimate rests on, grouped; the lede says what
  else it rests on that is not adjustable here. A change writes an override
  to the URL and every view recomputes; a value equal to the scenario's is
  not stored, so "reset" and "set it back" are the same. Each group is a
  native <details>, open at first, whose summary says how many of its
  values are changed; lib/reveal.ts opens a group before it sends the
  reader into it.
-->
<script lang="ts">
  import { groupParams, provenance, toggleText } from '../lib/assumptions';
  import type { Derived, ParamNote, ToggleInfo } from '../lib/derived.svelte';
  import { paramValue } from '../lib/format';
  import { withOverride, withoutOverride } from '../lib/overrides';
  import { type AppState, type WriteOptions, hashFromState } from '../lib/state';
  import ParamControl from './ParamControl.svelte';
  import Section from './Section.svelte';

  interface Props {
    d: Derived;
    selection: AppState;
    onselect: (next: AppState, opts?: WriteOptions) => void;
  }

  let { d, selection, onselect }: Props = $props();

  const groups = $derived(groupParams(d.paramInfo, d.report.models.map((m) => m.id)));
  const changed = $derived(d.changedCount);
  const changedIn = (params: { path: string }[]) => params.filter((p) => Object.hasOwn(d.overrides, p.path)).length;

  function setOverrides(overrides: Record<string, number>, live = false) {
    onselect({ ...selection, overrides }, { replace: live });
  }

  function setToggle(t: ToggleInfo, on: boolean) {
    setOverrides(withOverride(d.overrides, t.key, on ? 1 : 0, t.scenario ? 1 : 0));
  }

  const project = $derived(d.calibration.projectName);
  const methodsHref = $derived(hashFromState({ ...selection, route: 'methods' }));

  function noteText(note: ParamNote | undefined): string | undefined {
    if (!note) return undefined;
    switch (note.kind) {
      case 'zeroes':
        return 'At 0 this alone makes the estimate $0.';
      case 'below':
        return `At or below ${paramValue(note.threshold)}, the tests Ceph already has per unit of product code, this has no effect: existing tests are taken to replace new ones.`;
      case 'switch':
        return `No effect while “${toggleText(note.toggle).label}” is off.`;
    }
  }
</script>

<Section id="assumptions" title="Assumptions">
  {#snippet lede()}
    The numbers you can change. Change one and every figure on the page follows; the address bar keeps your changes, so a
    link shares them. The estimate also rests on inputs that are not adjustable here: bytes per token for each language,
    the share of its component the calibration port is taken to cover, the difficulty class of each feature, and each
    model's prices. <a href={methodsHref}>Methods</a> explains them.
  {/snippet}

  <p class="measured-means">
    “Measured on {project ?? 'the calibration port'}” means measured by that project's own script over its own transcripts,
    on one port; “Measured on Ceph” means counted from Ceph's source at the commit this report prices. Everything else is
    assumed.
  </p>

  <div class="scenario">
    <div>
      <p class="kicker">Scenario: {d.scenario.label}</p>
      <p class="description">{d.scenario.description}</p>
    </div>
    <button type="button" class="reset-all" disabled={changed === 0} onclick={() => setOverrides({})}>
      Reset all{changed > 0 ? ` (${changed})` : ''}
    </button>
  </div>

  <fieldset class="toggles">
    <legend>Switches</legend>
    {#each d.toggles as t (t.id)}
      {@const text = toggleText(t.id)}
      <label class="toggle" class:changed={t.value !== t.scenario}>
        <input type="checkbox" role="switch" checked={t.value} onchange={(e) => setToggle(t, e.currentTarget.checked)} />
        <span class="toggle-text">
          <span class="toggle-label">{text.label}</span>
          {#if text.description}<span class="toggle-description">{text.description}</span>{/if}
          {#if t.value !== t.scenario}
            <span class="toggle-description">The scenario has this {t.scenario ? 'on' : 'off'}.</span>
          {/if}
        </span>
      </label>
    {/each}
  </fieldset>

  {#each groups as g (g.id)}
    {@const n = changedIn(g.params)}
    <details class="group" open data-group={g.id} data-changed={n > 0 ? 'true' : 'false'}>
      <summary>
        <h3 id="group-{g.id}">{g.title}</h3>
        {#if n > 0}<span class="count">{n} changed</span>{/if}
      </summary>
      <p class="group-description">{g.description}</p>
      <div class="params">
        {#each g.params as info (info.path)}
          <ParamControl
            {info}
            value={d.values.get(info.path) ?? info.scenario}
            badge={provenance(info, project)}
            note={noteText(d.paramNotes.get(info.path))}
            onchange={(v, live) => setOverrides(withOverride(d.overrides, info.path, v, info.scenario), live)}
            onreset={() => setOverrides(withoutOverride(d.overrides, info.path))}
          />
        {/each}
      </div>
    </details>
  {/each}
</Section>

<style>
  .measured-means {
    margin: 0 0 var(--space-4);
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .scenario {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-4);
    padding: var(--space-4);
    margin-bottom: var(--space-5);
    background: var(--page);
    border-radius: var(--radius);
  }

  .kicker {
    margin: 0 0 var(--space-1);
    font-weight: 600;
  }

  .description {
    margin: 0;
    color: var(--text-muted);
  }

  button.reset-all {
    flex: none;
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    cursor: pointer;
  }

  button.reset-all:hover:not(:disabled) {
    background: var(--accent-wash);
  }

  button.reset-all:disabled {
    color: var(--text-muted);
    cursor: default;
  }

  .toggles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
    gap: var(--space-3);
    margin: 0 0 var(--space-6);
    padding: 0;
    border: 0;
  }

  legend {
    margin-bottom: var(--space-3);
    padding: 0;
    font-size: var(--text-lg);
    font-weight: 700;
  }

  .toggle {
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
  }

  .toggle.changed {
    border-color: var(--accent);
    box-shadow: inset 3px 0 0 var(--accent);
  }

  .toggle input {
    flex: none;
    width: 1.25rem;
    height: 1.25rem;
    margin: 0.1rem 0 0;
    accent-color: var(--accent);
  }

  .toggle-text {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .toggle-label {
    font-weight: 600;
  }

  .toggle-description {
    font-size: var(--text-sm);
    color: var(--text-muted);
    line-height: 1.45;
  }

  .group + .group {
    margin-top: var(--space-5);
  }

  summary {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    padding: var(--space-1) 0;
    cursor: pointer;
    list-style: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  /* A disclosure triangle that turns, drawn so it matches the heading's size. */
  summary::before {
    content: '';
    flex: none;
    align-self: center;
    width: 0;
    height: 0;
    border-block: 5px solid transparent;
    border-inline-start: 7px solid var(--text-muted);
    transition: transform 0.15s;
  }

  details[open] > summary::before {
    transform: rotate(90deg);
  }

  summary h3 {
    margin: 0;
  }

  .count {
    padding: 0 var(--space-2);
    border-radius: 999px;
    background: var(--accent-wash);
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .group-description {
    margin: 0 0 var(--space-3);
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .params {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
    gap: var(--space-3);
  }

  @media (width < 720px) {
    .scenario {
      flex-direction: column;
    }

    .params {
      grid-template-columns: 1fr;
    }
  }
</style>
