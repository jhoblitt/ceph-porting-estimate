// Scales the charts place marks on, linear from 0 where the marks are
// outcomes a reader compares by size, and a shading step taken by
// logarithm where values span orders of magnitude.

/** Round ticks from 0 to at most `max`, about four or five of them, stepping by 1, 2 or 5 × 10^k. */
export function linearTicks(max: number): number[] {
  if (!(Number.isFinite(max) && max > 0)) return [0];
  const rough = max / 4;
  const k = Math.floor(Math.log10(rough));
  const at = (m: number) => (k < 0 ? m / 10 ** -k : m * 10 ** k);
  const step = [1, 2, 5, 10].map(at).reduce((best, s) => (Math.abs(s - rough) < Math.abs(best - rough) ? s : best));
  const ticks: number[] = [];
  for (let i = 0; i * step <= max * (1 + 1e-9); i++) ticks.push(i * step);
  return ticks;
}

export interface LinearScale {
  /** The domain runs from 0 to max, a round tick at or above the largest value. */
  max: number;
  ticks: number[];
  /** 0 at 0, 1 at max, held inside 0 to 1; anything not a number sits at 0. */
  position(value: number): number;
}

/**
 * A linear scale from 0 that ends on a round tick at or above the largest
 * value, in about three steps of 1, 2 or 5 × 10^k: few enough labels to fit
 * a phone's width.
 */
export function linearScale(values: number[]): LinearScale {
  const largest = Math.max(0, ...values.filter((v) => Number.isFinite(v)));
  let max = 1;
  let step = 1;
  if (largest > 0) {
    const rough = largest / 3;
    const k = Math.floor(Math.log10(rough));
    const at = (m: number) => (k < 0 ? m / 10 ** -k : m * 10 ** k);
    step = [1, 2, 5, 10].map(at).reduce((best, s) => (Math.abs(s - rough) < Math.abs(best - rough) ? s : best));
    max = Math.ceil(largest / step - 1e-9) * step;
  }
  const ticks: number[] = [];
  for (let i = 0; i * step <= max * (1 + 1e-9); i++) ticks.push(i * step);
  return {
    max,
    ticks,
    position(value) {
      if (!Number.isFinite(value)) return 0;
      return Math.min(1, Math.max(0, value / max));
    },
  };
}

/** The smallest and largest positive values, or null when there are none. */
export function positiveRange(values: number[]): { min: number; max: number } | null {
  const positive = values.filter((v) => Number.isFinite(v) && v > 0);
  return positive.length > 0 ? { min: Math.min(...positive), max: Math.max(...positive) } : null;
}

/**
 * The step, 1 to `steps`, of a value on a sequential scale from min to max,
 * by logarithm; 0 for a value the scale cannot place (zero, negative or
 * non-finite), so it cannot pass for the cheapest. Take min and max from
 * positiveRange, so one zero does not flatten the rest.
 */
export function sequentialStep(value: number, min: number, max: number, steps: number): number {
  if (!(Number.isFinite(value) && value > 0)) return 0;
  if (!(min > 0 && max > 0)) return 1;
  if (max <= min) return Math.ceil(steps / 2);
  const t = (Math.log10(value) - Math.log10(min)) / (Math.log10(max) - Math.log10(min));
  return 1 + Math.round(Math.min(1, Math.max(0, t)) * (steps - 1));
}
