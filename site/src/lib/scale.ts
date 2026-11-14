// Scales the charts place marks on. Costs here span more than two orders of
// magnitude (a naive single pass against the calibrated port), so both scales
// are logarithmic.

export interface LogScale {
  /** The domain, in whole decades around the values. */
  min: number;
  max: number;
  /** Every decade from min to max. */
  ticks: number[];
  /** 0 at min, 1 at max; anything not positive sits at 0, so check onScale first. */
  position(value: number): number;
  /** False for zero, negative and non-finite values, which a log scale cannot place. */
  onScale(value: number): boolean;
}

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

export function logScale(values: number[]): LogScale {
  const positive = values.filter((v) => Number.isFinite(v) && v > 0);
  let lo = 0;
  let hi = 1;
  if (positive.length > 0) {
    lo = Math.floor(Math.log10(Math.min(...positive)));
    hi = Math.ceil(Math.log10(Math.max(...positive)));
    // Values on one decade would leave no domain; give them a decade either side.
    if (lo === hi) {
      lo -= 1;
      hi += 1;
    }
  }
  const ticks: number[] = [];
  for (let e = lo; e <= hi; e++) ticks.push(10 ** e);
  return {
    min: 10 ** lo,
    max: 10 ** hi,
    ticks,
    position(value) {
      if (!(Number.isFinite(value) && value > 0)) return 0;
      return Math.min(1, Math.max(0, (Math.log10(value) - lo) / (hi - lo)));
    },
    onScale(value) {
      return Number.isFinite(value) && value > 0;
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
