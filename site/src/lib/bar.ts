// Where each part of a segmented bar is drawn. Positions come from the
// shares alone: the gap between parts is drawn inside each part, never added
// to its width, so every boundary falls on its true position and a bar
// never paints longer than its total.

export interface Segment<P> {
  part: P;
  /** From the bar's start, as a fraction of the full width. */
  start: number;
  width: number;
}

/**
 * The parts with a positive share laid end to end over `length` (0 to 1 of
 * the full width), each as wide as its share of the parts' total. The last
 * ends exactly at `length`.
 */
export function segmentGeometry<P extends { share: number }>(parts: readonly P[], length: number): Segment<P>[] {
  const bar = Math.min(1, length);
  const drawn = parts.filter((p) => Number.isFinite(p.share) && p.share > 0);
  const total = drawn.reduce((s, p) => s + p.share, 0);
  if (!(bar > 0) || !(total > 0)) return [];
  let sum = 0;
  return drawn.map((part, i) => {
    const start = (sum / total) * bar;
    sum += part.share;
    const end = i === drawn.length - 1 ? bar : (sum / total) * bar;
    return { part, start, width: end - start };
  });
}
