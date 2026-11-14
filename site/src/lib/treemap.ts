// The explorer's treemap as geometry: the input tree for an explorer level,
// its layout in pixels (d3-hierarchy's squarified treemap), which labels fit
// a cell, and which cell an arrow key moves to. The view only draws boxes.

import { type HierarchyRectangularNode, hierarchy, treemap, treemapSquarify } from 'd3-hierarchy';
import type { AreaMode, Level, Row } from './explorer';
import type { Scope } from './report';
import { sequentialStep } from './scale';

export interface TreemapNode {
  id: string;
  kind: 'root' | 'group' | 'row' | 'part';
  /** A part's scope. */
  scope?: Scope;
  /** A part's size; groups and rows take the sum of their parts. */
  value?: number;
  children?: TreemapNode[];
}

/**
 * The level as a tree: groups, rows and parts at the root; rows and parts
 * at a component. A part's value is its code lines or its cost.
 */
export function treemapInput(level: Level, area: AreaMode): TreemapNode {
  const rows = (g: Level['groups'][number]): TreemapNode[] =>
    g.rows.map((r) => ({
      id: r.id,
      kind: 'row',
      children: r.parts.map((p) => ({
        id: `${r.id}/${p.scope}`,
        kind: 'part',
        scope: p.scope,
        value: area === 'code' ? p.code : p.usd,
      })),
    }));
  const children: TreemapNode[] =
    level.componentId === null
      ? level.groups.map((g) => ({ id: g.id, kind: 'group', children: rows(g) }))
      : level.groups.flatMap(rows);
  return { id: 'root', kind: 'root', children };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PartBox {
  scope: Scope;
  rect: Rect;
}

export interface CellBox {
  id: string;
  /** The enclosing group at the root; null at a component. */
  groupId: string | null;
  rect: Rect;
  parts: PartBox[];
  /** The sum of the parts' values. */
  value: number;
}

export interface GroupBox {
  id: string;
  rect: Rect;
  /** Whether the layout left room for the group's name above its cells. */
  header: boolean;
}

export interface TreemapLayout {
  width: number;
  height: number;
  groups: GroupBox[];
  cells: CellBox[];
}

export interface LayoutOptions {
  /** Room above a group's cells for its name; given only to groups large enough to use it. */
  headerHeight: number;
  groupGap: number;
  cellGap: number;
  partGap: number;
}

/** Steps of the sequential scale a cell is shaded on: --seq-1 … --seq-7 in tokens.css. */
export const SHADE_STEPS = 7;

export const DEFAULT_LAYOUT: LayoutOptions = { headerHeight: 22, groupGap: 6, cellGap: 2, partGap: 2 };

/** A group gets a header only where its name and at least a sliver of cells fit. */
const HEADER_MIN_WIDTH = 56;
const HEADER_MIN_CELLS = 18;

const usable = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v) && v > 0;

/** The tree without nodes of no size, and without branches they leave empty. */
function prune(node: TreemapNode): TreemapNode | null {
  if (!node.children) return usable(node.value) ? node : null;
  const children = node.children.map(prune).filter((c): c is TreemapNode => c !== null);
  return children.length > 0 ? { ...node, children } : null;
}

function rectOf(n: HierarchyRectangularNode<TreemapNode>): Rect {
  return { x: n.x0, y: n.y0, w: Math.max(0, n.x1 - n.x0), h: Math.max(0, n.y1 - n.y0) };
}

/** Lays the tree out in a width × height box, largest first; an empty tree or box gives no cells. */
export function layoutTreemap(input: TreemapNode, width: number, height: number, opts: LayoutOptions = DEFAULT_LAYOUT): TreemapLayout {
  const empty: TreemapLayout = { width, height, groups: [], cells: [] };
  const tree = prune(input);
  if (!tree || !(width > 0 && height > 0)) return empty;

  const root = hierarchy(tree)
    .sum((d) => (d.children ? 0 : (d.value as number)))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || (a.data.id < b.data.id ? -1 : a.data.id > b.data.id ? 1 : 0));

  const headers = new Set<string>();
  const laid = treemap<TreemapNode>()
    .tile(treemapSquarify)
    .size([width, height])
    .round(false)
    .paddingInner((n) => {
      switch (n.data.kind) {
        case 'root':
          return n.children?.[0]?.data.kind === 'group' ? opts.groupGap : opts.cellGap;
        case 'group':
          return opts.cellGap;
        default:
          return opts.partGap;
      }
    })
    .paddingTop((n) => {
      // d3 has placed the node itself when it asks for its padding.
      const fits = n.x1 - n.x0 >= HEADER_MIN_WIDTH && n.y1 - n.y0 >= opts.headerHeight + HEADER_MIN_CELLS;
      if (n.data.kind !== 'group' || opts.headerHeight <= 0 || !fits) return 0;
      headers.add(n.data.id);
      return opts.headerHeight;
    })(root);

  const groups: GroupBox[] = [];
  const cells: CellBox[] = [];
  for (const n of laid.descendants()) {
    if (n.data.kind === 'group') groups.push({ id: n.data.id, rect: rectOf(n), header: headers.has(n.data.id) });
    if (n.data.kind !== 'row') continue;
    cells.push({
      id: n.data.id,
      groupId: n.parent?.data.kind === 'group' ? n.parent.data.id : null,
      rect: rectOf(n),
      parts: (n.children ?? []).map((p) => ({ scope: p.data.scope as Scope, rect: rectOf(p) })),
      value: n.value ?? 0,
    });
  }
  return { width, height, groups, cells };
}

/**
 * Each part's step on the sequential scale (1 to `steps`) by its scope, from
 * its cost per line on the level's range; 0 for a part with no cost, which
 * no shade may stand for. Keyed by scope because the layout orders a cell's
 * parts by size, not as the row lists them.
 */
export function shadeSteps(
  row: Row,
  range: { min: number; max: number } | null,
  steps: number,
): Partial<Record<Scope, number>> {
  return Object.fromEntries(
    row.parts.map((p) => [p.scope, range && p.perLine !== null ? sequentialStep(p.perLine, range.min, range.max, steps) : 0]),
  );
}

/** Below this width the map is drawn taller than wide, so a phone still gets cells big enough to tap. */
const NARROW = 560;

/**
 * The map's height for a width: wide and short on a laptop, tall on a
 * phone, never so tall that the page scrolls past it, and fixed for a width
 * so zooming never moves the rest of the page.
 */
export function mapHeight(width: number): number {
  if (!(width > 0)) return 0;
  const h = width < NARROW ? width * 1.3 : width * 0.55;
  return Math.round(Math.min(560, Math.max(width < NARROW ? 360 : 400, h)));
}

/**
 * What a cell can print: its name over up to three lines, and its figure
 * under it. `lines` is 0 when nothing fits; the cell still names itself on
 * hover and focus.
 */
export interface LabelFit {
  lines: number;
  figure: boolean;
}

/** The label's metrics in TreemapCell.svelte: padding, line heights, and an average character's width. */
const LABEL = { padX: 12, padY: 8, line: 16.25, figure: 15, char: 7.2, figureChar: 6.6, maxLines: 3, minChars: 6 };

/** Lines a greedy word wrap needs; a word longer than a line takes one, clipped. */
function wrappedLines(name: string, perLine: number): number {
  let lines = 0;
  let used = 0;
  for (const word of name.split(/\s+/).filter(Boolean)) {
    if (used > 0 && used + 1 + word.length <= perLine) {
      used += 1 + word.length;
    } else {
      lines += 1;
      used = word.length;
    }
  }
  return lines;
}

/** True when a figure line of this text fits the cell's width whole, without an ellipsis. */
export function figureFits(r: Rect, text: string): boolean {
  return text.length * LABEL.figureChar <= r.w - LABEL.padX;
}

export function labelFit(r: Rect, name: string): LabelFit {
  const none = { lines: 0, figure: false };
  const width = r.w - LABEL.padX;
  // Print a name only where it shows whole, or at least its first few letters.
  if (width < LABEL.char * Math.min(name.length, LABEL.minChars)) return none;
  const room = Math.floor((r.h - LABEL.padY) / LABEL.line);
  if (room < 1) return none;
  const lines = Math.min(room, LABEL.maxLines, Math.max(1, wrappedLines(name, Math.floor(width / LABEL.char))));
  const figure = r.h - LABEL.padY - lines * LABEL.line >= LABEL.figure && width >= LABEL.char * LABEL.minChars;
  return { lines, figure };
}

export type Direction = 'up' | 'down' | 'left' | 'right';

/** Cells separated by a gap still count as touching. */
const TOLERANCE = 3;

function gap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, b0 - a1, a0 - b1);
}

/**
 * The cell an arrow key moves to from `fromId`: the nearest cell wholly in
 * that direction, preferring one that lines up with the current cell, then
 * the one whose centre is closest across; null when there is none.
 */
export function neighbour(cells: readonly CellBox[], fromId: string, dir: Direction): string | null {
  const from = cells.find((c) => c.id === fromId);
  if (!from) return null;
  const f = from.rect;
  const horizontal = dir === 'left' || dir === 'right';
  let best: { id: string; score: [number, number, number] } | null = null;
  for (const c of cells) {
    if (c.id === fromId) continue;
    const r = c.rect;
    let along: number;
    switch (dir) {
      case 'right':
        along = r.x - (f.x + f.w);
        break;
      case 'left':
        along = f.x - (r.x + r.w);
        break;
      case 'down':
        along = r.y - (f.y + f.h);
        break;
      case 'up':
        along = f.y - (r.y + r.h);
        break;
    }
    if (along < -TOLERANCE) continue;
    const across = horizontal ? gap(f.y, f.y + f.h, r.y, r.y + r.h) : gap(f.x, f.x + f.w, r.x, r.x + r.w);
    const centre = horizontal ? Math.abs(r.y + r.h / 2 - (f.y + f.h / 2)) : Math.abs(r.x + r.w / 2 - (f.x + f.w / 2));
    const score: [number, number, number] = [across, Math.max(0, along), centre];
    if (!best || less(score, best.score)) best = { id: c.id, score };
  }
  return best?.id ?? null;
}

function less(a: [number, number, number], b: [number, number, number]): boolean {
  for (let i = 0; i < 3; i++) {
    if (a[i]! < b[i]! - 1e-9) return true;
    if (a[i]! > b[i]! + 1e-9) return false;
  }
  return false;
}
