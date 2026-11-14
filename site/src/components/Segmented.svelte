<!--
  A segmented control built on a native radio group, so arrow keys, Tab and
  screen readers behave as they do for any radio group.
-->
<script lang="ts" generics="T extends string">
  interface Option {
    value: T;
    label: string;
  }

  interface Props {
    legend: string;
    name: string;
    options: Option[];
    value: T;
    onchange: (value: T) => void;
  }

  let { legend, name, options, value, onchange }: Props = $props();
</script>

<fieldset class="segmented">
  <legend>{legend}</legend>
  <div class="options">
    {#each options as option (option.value)}
      <label class:selected={option.value === value}>
        <input
          type="radio"
          {name}
          value={option.value}
          checked={option.value === value}
          onchange={() => onchange(option.value)}
        />
        <span>{option.label}</span>
      </label>
    {/each}
  </div>
</fieldset>

<style>
  .segmented {
    border: 0;
    margin: 0;
    padding: 0;
    min-width: 0;
  }

  legend {
    padding: 0;
    margin-bottom: var(--space-2);
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text-muted);
  }

  .options {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    background: var(--surface);
  }

  label {
    position: relative;
    display: block;
    padding: var(--space-1) var(--space-3);
    border-radius: calc(var(--radius) - 3px);
    font-size: var(--text-sm);
    line-height: 1.75;
    color: var(--text);
    cursor: pointer;
    user-select: none;
  }

  label:hover:not(.selected) {
    background: var(--accent-wash);
  }

  label.selected {
    background: var(--accent);
    color: var(--accent-ink);
  }

  input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  label:has(input:focus-visible) {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  @media (width < 720px) {
    .options {
      display: flex;
    }

    label {
      flex: 1 1 auto;
      text-align: center;
    }
  }

  @media (forced-colors: active) {
    label.selected {
      outline: 2px solid CanvasText;
    }
  }
</style>
