// How the assumptions panel arranges and edits the params describeParams
// lists. A param this file does not name still appears, under "Other", so a
// new quantity in assumptions.yaml needs no change here to be adjustable.

import { type ParamInfo, isShare } from './model';

export interface ParamGroup {
  id: string;
  title: string;
  description: string;
  params: ParamInfo[];
}

interface GroupRule {
  id: string;
  title: string;
  description: string;
  matches(path: string): boolean;
}

const prefixed = (prefix: string) => (path: string) => path.startsWith(`${prefix}.`);
const oneOf = (...paths: string[]) => (path: string) => paths.includes(path);

const RULES: readonly GroupRule[] = [
  {
    id: 'measured',
    title: 'The work pattern',
    description: 'How much a port writes, and how much it reads, for each token of finished code.',
    matches: oneOf(
      'expansion',
      'test_ratio',
      'overhead',
      'uncached_per_output',
      'cache_write_per_output',
      'cache_read_per_output',
      'source_read_passes',
    ),
  },
  {
    id: 'difficulty',
    title: 'Difficulty',
    description: 'How much work a line of each difficulty class takes, relative to standard code.',
    matches: prefixed('difficulty'),
  },
  {
    id: 'target',
    title: 'Target languages',
    description: 'How much work the same logic takes in one target language relative to another.',
    matches: oneOf('rust_factor', 'wasm_overhead'),
  },
  {
    id: 'pricing',
    title: 'Pricing mix',
    description:
      "How token volumes split across the tiers of a model's price sheet. Long-context shares matter only for models with long-context prices.",
    matches: (path) => path === 'long_cache_write_share' || prefixed('long_context_share')(path),
  },
  {
    id: 'models',
    title: 'Model efficiency',
    description: 'Tokens each model needs for the same work, relative to the model the work pattern was measured with.',
    matches: prefixed('model_efficiency'),
  },
];

const OTHER = {
  id: 'other',
  title: 'Other',
  description: 'Settings that belong to none of the groups above, including those the switches use.',
};

const MODEL_PREFIX = 'model_efficiency.';

/**
 * The params in panel order: each rule's group, then everything else under
 * "Other"; empty groups are left out. Model efficiencies follow `modelIds`,
 * the report's model order, so they line up with the rest of the page.
 */
export function groupParams(info: ParamInfo[], modelIds: readonly string[] = []): ParamGroup[] {
  const groups: ParamGroup[] = RULES.map(({ id, title, description }) => ({ id, title, description, params: [] }));
  const other: ParamGroup = { ...OTHER, params: [] };
  for (const p of info) {
    const i = RULES.findIndex((r) => r.matches(p.path));
    (i === -1 ? other : (groups[i] as ParamGroup)).params.push(p);
  }
  const rank = (p: ParamInfo) => {
    const i = modelIds.indexOf(p.path.slice(MODEL_PREFIX.length));
    return i === -1 ? modelIds.length : i;
  };
  for (const g of groups) if (g.id === 'models') g.params.sort((a, b) => rank(a) - rank(b));
  return [...groups, other].filter((g) => g.params.length > 0);
}

export interface SliderRange {
  /** The values at the two ends of the track. */
  lo: number;
  hi: number;
  /** A multiplier moves on a log track, so halving and doubling are the same distance; a share on a linear one. */
  scale: 'linear' | 'log';
  /** Where the baseline sits along the track, 0 to 1. */
  baselineAt: number;
}

/** Positions along every track, 0 to SLIDER_STEPS: the range input's min, max and step 1. */
export const SLIDER_STEPS = 1000;

/** How far either side of its baseline a multiplier's track runs. */
const LOG_SPAN = 4;

/** The fraction of output a clean break keeps; a share for the slider though the model does not cap it. */
const FRACTIONS = new Set(['clean_break_discount']);

/** The smallest of 1, 2, 5 × 10^k that is at least x. */
function niceCeil(x: number): number {
  const k = Math.floor(Math.log10(x));
  const scale = (m: number) => (k < 0 ? m / 10 ** -k : m * 10 ** k);
  const nice = [1, 2, 5, 10].find((m) => scale(m) >= x) ?? 10;
  return scale(nice);
}

/**
 * The slider's track. A share runs 0 to 1. A multiplier runs from a quarter
 * of its baseline to four times it on a log track, widened to reach the
 * scenario's value and `current` where they fall outside. A param with no
 * positive baseline cannot sit on a log track, so it runs linearly from 0
 * to a few times its scenario value.
 */
export function sliderRange(info: ParamInfo, current: number): SliderRange {
  if (isShare(info.path) || FRACTIONS.has(info.path)) {
    return { lo: 0, hi: 1, scale: 'linear', baselineAt: Math.min(1, Math.max(0, info.baseline)) };
  }
  if (info.baseline > 0) {
    const inside = [info.scenario, current].filter((v) => Number.isFinite(v) && v > 0);
    const lo = Math.min(info.baseline / LOG_SPAN, ...inside);
    const hi = Math.max(info.baseline * LOG_SPAN, ...inside);
    return { lo, hi, scale: 'log', baselineAt: Math.log(info.baseline / lo) / Math.log(hi / lo) };
  }
  const reference = Math.max(Math.abs(info.baseline), Math.abs(info.scenario)) || 1;
  const hi = niceCeil(Math.max(reference * LOG_SPAN, Number.isFinite(current) ? current : 0));
  return { lo: 0, hi, scale: 'linear', baselineAt: Math.max(0, info.baseline) / hi };
}

/** A value's position along the track, 0 to SLIDER_STEPS; a value a log track cannot place sits at 0. */
export function toSlider(range: SliderRange, value: number): number {
  let t: number;
  if (range.scale === 'log') {
    t = value > 0 ? Math.log(value / range.lo) / Math.log(range.hi / range.lo) : 0;
  } else {
    t = range.hi > range.lo ? (value - range.lo) / (range.hi - range.lo) : 0;
  }
  return Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * SLIDER_STEPS;
}

/**
 * The value at a position, to three significant figures; within half a step
 * of one of `snaps` (the baseline and the scenario's value), that value
 * exactly, so dragging back to it drops the override.
 */
export function fromSlider(range: SliderRange, position: number, snaps: readonly number[]): number {
  for (const s of snaps) if (Math.abs(toSlider(range, s) - position) <= 0.5) return s;
  const t = Math.min(1, Math.max(0, position / SLIDER_STEPS));
  const v = range.scale === 'log' ? range.lo * (range.hi / range.lo) ** t : range.lo + t * (range.hi - range.lo);
  return v === 0 ? 0 : Number(v.toPrecision(3));
}

/**
 * Where a quantity comes from, for its badge: "Measured on rgw-go" for one
 * measured by the calibration project, "Measured on Ceph" for one counted
 * from Ceph's own tree, "Assumed" for the rest.
 */
export function provenance(q: { measured: boolean; source: string }, projectName?: string): string {
  if (!q.measured) return 'Assumed';
  if (q.source.includes('calibration')) return `Measured on ${projectName ?? 'the calibration port'}`;
  if (q.source.includes('generated/')) return 'Measured on Ceph';
  return 'Measured';
}

export interface ToggleText {
  label: string;
  description: string;
}

const TOGGLES: Record<string, ToggleText> = {
  include_adjacent: {
    label: 'Include the work around the port',
    description:
      'Defect reproduction, security review, upstream pull requests and feasibility work, at the rates the work-around-the-port settings below give.',
  },
  clean_break: {
    label: 'Clean break',
    description:
      "Keep no on-disk or wire compatibility with today's Ceph, which removes the bit-exact encoders and the cross-checks against C++. Such a port cannot serve existing kernel clients, existing librbd or libcephfs consumers, or existing clusters: it is a new system with Ceph's design, not a replacement. Output is multiplied by the clean-break setting below, and that discount is a guess.",
  },
};

export function toggleText(id: string): ToggleText {
  if (Object.hasOwn(TOGGLES, id)) return TOGGLES[id] as ToggleText;
  const words = id.replaceAll('_', ' ');
  return { label: words.charAt(0).toUpperCase() + words.slice(1), description: '' };
}
