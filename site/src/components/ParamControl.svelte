<!--
  One adjustable assumption: its value as a slider and a number box, whether
  it was measured or assumed, where it comes from and why (behind the "i"),
  and a reset once it differs from the scenario.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { sliderRange } from '../lib/assumptions';
  import { decimal } from '../lib/format';
  import type { ParamInfo } from '../lib/model';
  import InfoPopover from './InfoPopover.svelte';

  interface Props {
    info: ParamInfo;
    value: number;
    /** `live` while a slider is being dragged, so the caller can coalesce history entries. */
    onchange: (value: number, live: boolean) => void;
    onreset: () => void;
  }

  let { info, value, onchange, onreset }: Props = $props();

  const id = $props.id();
  const range = $derived(sliderRange(info, value));
  const changed = $derived(value !== info.scenario);
  const isUrl = $derived(/^https?:\/\//.test(info.source));
  /** Six significant figures in the number box, so a slider step does not show float noise. */
  const shown = $derived(Number(value.toPrecision(6)));

  /**
   * True after the first input of a gesture, so the rest of a drag replaces
   * its history entry. Every pointer or key press starts a new gesture: a
   * drag that ends where it began fires no change event, and must not leave
   * the next change replacing an entry it should add.
   */
  let dragging = false;
  const startGesture = () => (dragging = false);

  function slide(event: Event & { currentTarget: HTMLInputElement }) {
    onchange(event.currentTarget.valueAsNumber, dragging);
    dragging = true;
  }

  async function type(event: Event & { currentTarget: HTMLInputElement }) {
    const box = event.currentTarget;
    const v = box.valueAsNumber;
    if (Number.isFinite(v)) onchange(v, false);
    // Show what the model applies: a clamped value, or the old one if the entry was not a number.
    await tick();
    box.value = String(shown);
  }
</script>

<div class="param" class:changed data-param-path={info.path}>
  <div class="head">
    <label id="{id}-label" for="{id}-number">{info.label}</label>
    <span class="mark" class:measured={info.measured}>{info.measured ? 'Measured' : 'Assumed'}</span>
    <InfoPopover label="About: {info.label}">
      <p>{info.reason}</p>
      <p>
        <strong>Source:</strong>
        {#if isUrl}
          <a href={info.source} rel="noopener noreferrer">{info.source}</a>
        {:else if info.source === 'assumption'}
          an assumption of this estimate.
        {:else}
          <code>{info.source}</code> in this project's data.
        {/if}
      </p>
      <p>
        Baseline {decimal(info.baseline)}{#if info.scenario !== info.baseline}; this scenario sets {decimal(info.scenario)}{/if}.
      </p>
    </InfoPopover>
  </div>
  <div class="inputs">
    <input
      type="range"
      aria-labelledby="{id}-label"
      min={range.min}
      max={range.max}
      step={range.step}
      {value}
      oninput={slide}
      onpointerdown={startGesture}
      onkeydown={startGesture}
      onchange={startGesture}
      onblur={startGesture}
    />
    <input id="{id}-number" type="number" class="number" step="any" min="0" value={shown} onchange={type} />
  </div>
  {#if changed}
    <div class="reset">
      <span>Scenario value {decimal(info.scenario)}</span>
      <button type="button" onclick={onreset}>Reset<span class="visually-hidden"> {info.label}</span></button>
    </div>
  {/if}
</div>

<style>
  .param {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }

  .param.changed {
    border-color: var(--accent);
    box-shadow: inset 3px 0 0 var(--accent);
  }

  .head {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
  }

  label {
    flex: 1;
    font-size: var(--text-sm);
    font-weight: 600;
    line-height: 1.4;
    padding-top: 0.2rem;
  }

  .mark {
    flex: none;
    margin-top: 0.15rem;
    padding: 0 var(--space-2);
    border: 1px solid var(--border-strong);
    border-radius: 999px;
    font-size: 0.75rem;
    line-height: 1.5rem;
    color: var(--text-muted);
  }

  .mark.measured {
    border-color: var(--accent);
    color: var(--accent);
  }

  .inputs {
    margin-top: auto;
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  input[type='range'] {
    flex: 1;
    min-width: 0;
    accent-color: var(--accent);
  }

  .number {
    width: 7rem;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--page);
    color: var(--text);
    font: inherit;
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }

  .reset {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .reset button {
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text);
    font: inherit;
    cursor: pointer;
  }

  .reset button:hover {
    background: var(--accent-wash);
  }

  code {
    font-family: var(--font-num);
    font-size: 0.9em;
  }
</style>
