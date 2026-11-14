// Where labels centred on marks along one axis go so none overlaps another.

export interface AxisLabel {
  id: string;
  /** The mark's position along the axis, in pixels. */
  center: number;
  /** The label's rendered width, in pixels; 0 until it is measured. */
  width: number;
}

/**
 * Each label's row, 0 at the axis: left to right, a label takes the lowest
 * row where it clears the last label already on that row by at least `gap`
 * pixels. So a label is raised only over a neighbour it would overlap, and a
 * label not yet measured stays on the axis.
 */
export function labelRows(labels: readonly AxisLabel[], gap = 4): Map<string, number> {
  const rows = new Map<string, number>();
  /** The right edge of the last label on each row. */
  const ends: number[] = [];
  for (const l of [...labels].sort((a, b) => a.center - b.center || (a.id < b.id ? -1 : 1))) {
    if (!(l.width > 0)) {
      rows.set(l.id, 0);
      continue;
    }
    const left = l.center - l.width / 2;
    let row = ends.findIndex((end) => end + gap < left);
    if (row === -1) row = ends.length;
    ends[row] = l.center + l.width / 2;
    rows.set(l.id, row);
  }
  return rows;
}
