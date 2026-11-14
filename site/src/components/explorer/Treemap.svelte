<!--
  The explorer's map. Area is code lines or cost, shade is cost per line;
  at the root the cells sit under their group's name. Zooming scales the
  level out of (or back into) the cell it belongs to, inside a frame of fixed
  height, so the page never moves. Keyboard: Tab enters at one cell, arrow
  keys move between cells, Home and End jump, Enter opens, Escape goes up.
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { cubicInOut } from 'svelte/easing';
  import type { TransitionConfig } from 'svelte/transition';
  import { type TestComponentNote, testNoteText } from '../../lib/counterfactual';
  import { type AreaMode, type Level, type Row, matchesFilter } from '../../lib/explorer';
  import { count, percent, usd } from '../../lib/format';
  import { SCOPE_LABELS } from '../../lib/labels';
  import {
    DEFAULT_LAYOUT,
    type Direction,
    type Rect,
    type TreemapLayout,
    labelFit,
    layoutTreemap,
    mapHeight,
    neighbour,
    shadeSteps,
    treemapInput,
  } from '../../lib/treemap';
  import TreemapCell from './TreemapCell.svelte';
  import TreemapTooltip from './TreemapTooltip.svelte';

  interface Props {
    level: Level;
    /** The root level in the same scope, for where a component sits when zooming. */
    rootLevel: Level;
    area: AreaMode;
    /** The shade scale's cheapest and dearest cost per line. */
    range: { min: number; max: number } | null;
    /** The feature whose detail is open. */
    selectedId: string | null;
    /** A row the table has under the pointer. */
    highlightId: string | null;
    query: string;
    /** What leaving out each component of ported tests would do to the headline. */
    testNotes: Map<string, TestComponentNote>;
    /** The map's accessible name. */
    label: string;
    onopen: (row: Row, fromKeyboard: boolean) => void;
    onhover: (id: string | null) => void;
    onup: () => void;
  }

  let { level, rootLevel, area, range, selectedId, highlightId, query, testNotes, label, onopen, onhover, onup }: Props =
    $props();

  /** --seq-1 … --seq-7 in tokens.css. */
  const STEPS = 7;
  const ZOOM_MS = 450;

  let width = $state(0);
  const height = $derived(mapHeight(width));

  interface Layer {
    key: string;
    componentId: string | null;
    layout: TreemapLayout;
    rows: Map<string, { row: Row; group: string | null }>;
    groups: Map<string, Level['groups'][number]>;
  }

  function rowsOf(l: Level): Layer['rows'] {
    const atRoot = l.componentId === null;
    return new Map(l.groups.flatMap((g) => g.rows.map((row) => [row.id, { row, group: atRoot ? g.name : null }] as const)));
  }

  const layout = $derived(layoutTreemap(treemapInput(level, area), width, height, DEFAULT_LAYOUT));
  const rootLayout = $derived(
    level.componentId === null ? layout : layoutTreemap(treemapInput(rootLevel, area), width, height, DEFAULT_LAYOUT),
  );
  const layer: Layer = $derived({
    key: level.componentId ?? '',
    componentId: level.componentId,
    layout,
    rows: rowsOf(level),
    groups: new Map(level.groups.map((g) => [g.id, g])),
  });

  const componentId = $derived(level.componentId);
  /** The component a zoom goes into or comes out of; read when the zoom starts. */
  let zoomAnchor: string | null = null;
  let lastComponent: string | null = null;
  $effect.pre(() => {
    const id = componentId;
    untrack(() => {
      zoomAnchor = id ?? lastComponent;
      lastComponent = id;
    });
  });

  function anchorRect(id: string | null): Rect | null {
    const r = id === null ? undefined : rootLayout.cells.find((c) => c.id === id)?.rect;
    return r && r.w > 0 && r.h > 0 ? r : null;
  }

  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /**
   * The root is hidden by being zoomed into a component's cell; a component's
   * features are hidden by being shrunk into it. Svelte runs these forward to
   * show a layer and backward to hide it, so one zoom is both at once.
   */
  function zoom(_node: Element, p: { componentId: string | null }): TransitionConfig {
    const r = anchorRect(p.componentId ?? zoomAnchor);
    const W = width;
    const H = height;
    if (!r || W <= 0 || reducedMotion()) return { duration: 0 };
    const css =
      p.componentId === null
        ? (t: number, u: number) => {
            const kx = 1 + u * (W / r.w - 1);
            const ky = 1 + u * (H / r.h - 1);
            return `transform-origin: 0 0; transform: translate(${-r.x * kx * u}px, ${-r.y * ky * u}px) scale(${kx}, ${ky}); opacity: ${t};`;
          }
        : (t: number, u: number) => {
            const kx = 1 + u * (r.w / W - 1);
            const ky = 1 + u * (r.h / H - 1);
            return `transform-origin: 0 0; transform: translate(${r.x * u}px, ${r.y * u}px) scale(${kx}, ${ky}); opacity: ${t};`;
          };
    return { duration: ZOOM_MS, easing: cubicInOut, css };
  }

  function accessibleName(row: Row, group: string | null): string {
    const where = group ? `, ${group}` : '';
    const cost = row.figures.usd > 0 ? usd(row.figures.usd) : 'no cost';
    const scope = row.scope && row.scope !== 'headline' ? `. ${SCOPE_LABELS[row.scope]}` : '';
    const notPorted = row.kind === 'component' ? (row.parts.find((p) => p.scope === 'not-ported')?.code ?? 0) : 0;
    const rest = notPorted > 0 ? `, of which ${count(notPorted)} not ported` : '';
    const note = row.kind === 'component' ? testNotes.get(row.id) : undefined;
    const tests = note ? `. Ported existing tests. ${testNoteText(note).effect.replace(/\.$/, '')}` : '';
    return `${row.name}${where}: ${cost}, ${count(row.figures.code)} code lines${rest}, ${percent(row.share)} of the headline${scope}${tests}`;
  }

  // Roving focus: one cell is in the tab order, the arrows move it.
  let activeId = $state<string | null>(null);
  const activeCell = $derived.by(() => {
    const ids = layout.cells.map((c) => c.id);
    if (activeId !== null && ids.includes(activeId)) return activeId;
    if (selectedId !== null && ids.includes(selectedId)) return selectedId;
    return ids[0] ?? null;
  });

  let frame: HTMLDivElement;

  /** Moves focus to a cell of the current level, or to its first cell. */
  export async function focusCell(id?: string | null): Promise<void> {
    await tick();
    const target = id && layout.cells.some((c) => c.id === id) ? id : activeCell;
    if (target === null) return;
    activeId = target;
    await tick();
    const current = frame?.querySelector(`.layer[data-key="${CSS.escape(layer.key)}"]`);
    current?.querySelector<HTMLElement>(`[data-cell="${CSS.escape(target)}"]`)?.focus();
  }

  const KEYS: Record<string, Direction> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && componentId !== null) {
      e.preventDefault();
      onup();
      return;
    }
    if (activeCell === null) return;
    let next: string | null = null;
    const dir = KEYS[e.key];
    if (dir) next = neighbour(layout.cells, activeCell, dir);
    else if (e.key === 'Home') next = layout.cells[0]?.id ?? null;
    else if (e.key === 'End') next = layout.cells.at(-1)?.id ?? null;
    else return;
    e.preventDefault();
    if (next) void focusCell(next);
  }

  // The tooltip follows the pointer, or sits on the focused cell.
  let tip = $state<{ id: string; x: number; y: number } | null>(null);

  function hover(id: string, on: boolean, e: PointerEvent) {
    if (!on) {
      if (tip?.id === id) tip = null;
      onhover(null);
      return;
    }
    const box = frame.getBoundingClientRect();
    tip = { id, x: e.clientX - box.left, y: e.clientY - box.top };
    onhover(id);
  }

  function focused(id: string, visible: boolean) {
    activeId = id;
    if (!visible) return;
    const c = layout.cells.find((x) => x.id === id);
    if (c) tip = { id, x: c.rect.x + Math.min(c.rect.w, 120) / 2, y: c.rect.y + Math.min(c.rect.h, 60) / 2 };
  }

  const tipRow = $derived(tip ? layer.rows.get(tip.id) : undefined);
</script>

<!-- The cells are the controls; the group only routes arrow keys between them. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="frame"
  role="group"
  aria-label={label}
  aria-describedby="treemap-keys"
  bind:this={frame}
  bind:clientWidth={width}
  style:height="{height}px"
  {onkeydown}
  onfocusout={(e) => {
    if (!frame.contains(e.relatedTarget as Node | null)) tip = null;
  }}
>
  <p id="treemap-keys" class="visually-hidden">
    Arrow keys move between cells, Enter opens one{componentId !== null ? ', Escape goes back up' : ''}. The table below
    lists the same figures.
  </p>
  {#each [layer] as l (l.key)}
    <div class="layer" data-key={l.key} inert={l.key !== layer.key} transition:zoom={{ componentId: l.componentId }}>
      {#each l.layout.groups as g (g.id)}
        {@const info = l.groups.get(g.id)}
        <div
          class="group"
          style:left="{g.rect.x}px"
          style:top="{g.rect.y}px"
          style:width="{g.rect.w}px"
          style:height="{g.rect.h}px"
          aria-hidden="true"
        >
          {#if g.header && info}
            <span class="group-name">{info.name}</span>
            <span class="group-figure">{area === 'cost' ? usd(info.subtotal.usd) : count(info.subtotal.code)}</span>
          {/if}
        </div>
      {/each}
      {#each l.layout.cells as cell (cell.id)}
        {@const entry = l.rows.get(cell.id)}
        {#if entry}
          <TreemapCell
            {cell}
            row={entry.row}
            steps={shadeSteps(entry.row, range, STEPS)}
            fit={labelFit(cell.rect, entry.row.name)}
            {area}
            name={accessibleName(entry.row, entry.group)}
            tag={entry.row.kind === 'component' && testNotes.has(entry.row.id) ? 'ported tests' : undefined}
            active={cell.id === activeCell}
            selected={cell.id === selectedId}
            highlighted={cell.id === highlightId}
            dimmed={query.trim() !== '' && !matchesFilter(entry.row.name, query)}
            onactivate={(e) => onopen(entry.row, e.detail === 0)}
            onfocus={(visible) => focused(cell.id, visible)}
            onhover={(on, e) => hover(cell.id, on, e)}
          />
        {/if}
      {/each}
    </div>
  {/each}
  {#if tip && tipRow}
    <TreemapTooltip
      row={tipRow.row}
      groupName={tipRow.group}
      testNote={tipRow.row.kind === 'component' ? testNotes.get(tipRow.row.id) : undefined}
      x={tip.x}
      y={tip.y}
      frameWidth={width}
      frameHeight={height}
    />
  {/if}
</div>

<style>
  .frame {
    position: relative;
    overflow: hidden;
    border-radius: var(--radius-sm);
    background: var(--surface);
    contain: layout paint;
  }

  .layer {
    position: absolute;
    inset: 0;
  }

  .layer[inert] {
    pointer-events: none;
  }

  .group {
    position: absolute;
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    padding: 0 2px;
    border-top: 2px solid var(--baseline);
    font-size: 0.75rem;
    line-height: 20px;
    pointer-events: none;
    transition:
      left 0.3s ease,
      top 0.3s ease,
      width 0.3s ease,
      height 0.3s ease;
  }

  .group-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 700;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--text);
  }

  .group-figure {
    flex: none;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  @media (prefers-reduced-motion: reduce) {
    .group {
      transition: none;
    }
  }
</style>
