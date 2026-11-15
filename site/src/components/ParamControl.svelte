<!--
  One adjustable assumption: its value as a slider and a number box, where
  the value comes from, what it rests on (behind the "i"), a line when the
  value zeroes the estimate or does nothing where it is, a subdued look and
  a line when moving it cannot change the estimate or too little to print,
  and a reset once it differs from the scenario. A multiplier's slider is a
  log track from a quarter of its baseline to four times it, with the
  baseline marked.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { SLIDER_STEPS, type SliderRange, fromSlider, sliderRange, toSlider } from '../lib/assumptions';
  import { decimal, paramValue } from '../lib/format';
  import type { ParamInfo } from '../lib/model';
  import InfoPopover from './InfoPopover.svelte';

  interface Props {
    info: ParamInfo;
    value: number;
    /** Where the value comes from: "Measured on rgw-go", "Assumed", … */
    badge: string;
    /** Said beside the control, e.g. that the value has no effect where it is. */
    note?: string | undefined;
    /**
     * What moving it does to the headline: `none` subdues the control, which
     * stays operable; `small` and `none` come with `effectNote`.
     */
    effect?: 'none' | 'small' | 'live';
    /** Why it has no effect, or how far it moves the estimate when that is too little to print. */
    effectNote?: string | undefined;
    /** `live` while a slider is being dragged, so the caller can coalesce history entries. */
    onchange: (value: number, live: boolean) => void;
    onreset: () => void;
  }

  let { info, value, badge, note, effect = 'live', effectNote, onchange, onreset }: Props = $props();

  const id = $props.id();
  const describedBy = $derived(
    [note ? `${id}-note` : '', effectNote ? `${id}-effect` : ''].filter((x) => x !== '').join(' ') || undefined,
  );
  /**
   * The track as it was when a gesture began, held until it ends: the track
   * widens to reach the value, so recomputing it mid-drag would move the
   * track under the thumb.
   */
  let held = $state<SliderRange | undefined>();
  const range = $derived(held ?? sliderRange(info, value));
  const position = $derived(toSlider(range, value));
  const mark = $derived(range.baselineAt);
  const changed = $derived(value !== info.scenario);
  const isUrl = $derived(/^https?:\/\//.test(info.source));
  /** The number box shows three significant figures, as the rest of the panel does. */
  const shown = $derived(Number(value.toPrecision(3)));
  const exactBaseline = $derived(decimal(info.baseline));

  /**
   * True after the first input of a gesture, so the rest of a drag replaces
   * its history entry. Every pointer or key press starts a new gesture: a
   * drag that ends where it began fires no change event, and must not leave
   * the next change replacing an entry it should add.
   */
  let dragging = false;
  function startGesture() {
    dragging = false;
    held = range;
  }
  function endGesture() {
    dragging = false;
    held = undefined;
  }

  function slide(event: Event & { currentTarget: HTMLInputElement }) {
    onchange(fromSlider(range, event.currentTarget.valueAsNumber, [info.baseline, info.scenario]), dragging);
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

<div class="param" class:changed data-param-path={info.path} data-effect={effect}>
  <div class="head">
    <label id="{id}-label" for="{id}-number">{info.label}</label>
    <span class="badge" class:measured={info.measured}>{badge}</span>
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
        Baseline {paramValue(info.baseline)}{#if exactBaseline !== paramValue(info.baseline)}{' '}({exactBaseline} in the data){/if}{#if info.scenario !== info.baseline}; this scenario sets {paramValue(info.scenario)}{/if}.
        {#if range.scale === 'log'}The slider runs from {paramValue(range.lo)} to {paramValue(range.hi)} on a log scale.{/if}
      </p>
    </InfoPopover>
  </div>
  <div class="inputs">
    <div class="track">
      <input
        type="range"
        aria-labelledby="{id}-label"
        aria-valuetext={paramValue(value)}
        aria-describedby={describedBy}
        min="0"
        max={SLIDER_STEPS}
        step="1"
        value={position}
        oninput={slide}
        onpointerdown={startGesture}
        onkeydown={startGesture}
        onpointerup={endGesture}
        onpointercancel={endGesture}
        onchange={endGesture}
        onblur={endGesture}
      />
      <span class="baseline" style:--at={mark} title="Baseline {paramValue(info.baseline)}" aria-hidden="true"></span>
    </div>
    <input
      id="{id}-number"
      type="number"
      class="number"
      step="any"
      min="0"
      value={shown}
      aria-describedby={describedBy}
      onchange={type}
    />
  </div>
  {#if note}
    <p class="param-note" id="{id}-note">{note}</p>
  {/if}
  {#if effectNote}
    <p class="param-note effect-note" id="{id}-effect">{effectNote}</p>
  {/if}
  {#if changed}
    <div class="reset">
      <span>Scenario value {paramValue(info.scenario)}</span>
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

  /*
   * No effect as things are set: drawn back, not disabled. It stays
   * operable, so its ink keeps text contrast and its track and thumb keep
   * control contrast; the note says why, so colour is not the only sign.
   */
  .param[data-effect='none'] {
    border-style: dashed;
    background: var(--page);
  }

  .param[data-effect='none'] label,
  .param[data-effect='none'] .number {
    color: var(--text-muted);
  }

  /*
   * Drawn flat in grey. The native track's unfilled part is under 3:1 on a
   * light background, and a subdued slider at one end of its range is all
   * unfilled, so this one draws its own: a --border-strong line (>= 3:1 on
   * both pages) and a --text-muted thumb, 16px wide as the baseline mark
   * assumes.
   */
  .param[data-effect='none'] input[type='range'] {
    appearance: none;
    height: 16px;
    background: transparent;
  }

  .param[data-effect='none'] input[type='range']::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 2px;
    background: var(--border-strong);
  }

  .param[data-effect='none'] input[type='range']::-moz-range-track {
    height: 4px;
    border-radius: 2px;
    background: var(--border-strong);
  }

  .param[data-effect='none'] input[type='range']::-webkit-slider-thumb {
    appearance: none;
    width: 16px;
    height: 16px;
    margin-top: -6px;
    border: 2px solid var(--page);
    border-radius: 50%;
    background: var(--text-muted);
  }

  .param[data-effect='none'] input[type='range']::-moz-range-thumb {
    box-sizing: border-box;
    width: 16px;
    height: 16px;
    border: 2px solid var(--page);
    border-radius: 50%;
    background: var(--text-muted);
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

  .badge {
    flex: none;
    margin-top: 0.15rem;
    padding: 0 var(--space-2);
    border: 1px solid var(--border-strong);
    border-radius: 999px;
    font-size: 0.75rem;
    line-height: 1.5rem;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .badge.measured {
    border-color: var(--accent);
    color: var(--accent);
  }

  .inputs {
    margin-top: auto;
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .track {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
    padding-bottom: 6px;
  }

  input[type='range'] {
    flex: 1;
    min-width: 0;
    margin: 0;
    accent-color: var(--accent);
  }

  /* The baseline, under the track where the thumb's centre would sit (the thumb is about 16px wide). */
  .baseline {
    position: absolute;
    bottom: 0;
    left: calc(8px + var(--at) * (100% - 16px));
    width: 2px;
    height: 6px;
    background: var(--text-muted);
    transform: translateX(-50%);
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

  .param-note {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
    line-height: 1.45;
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
