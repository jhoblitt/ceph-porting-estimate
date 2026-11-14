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
  min: number;
  max: number;
  step: number;
}

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
 * The slider's range: 0 to 1 for a share, else 0 to a few times the larger
 * of the baseline and scenario values, widened to reach `current`.
 */
export function sliderRange(info: ParamInfo, current: number): SliderRange {
  if (isShare(info.path) || FRACTIONS.has(info.path)) return { min: 0, max: 1, step: 0.001 };
  const reference = Math.max(Math.abs(info.baseline), Math.abs(info.scenario)) || 1;
  const max = niceCeil(Math.max(reference * 4, Number.isFinite(current) ? current : 0));
  return { min: 0, max, step: max / 1000 };
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
      "Keep no on-disk or wire compatibility with today's Ceph, which removes the bit-exact encoders and the cross-checks against C++. Output is multiplied by the clean-break setting below.",
  },
};

export function toggleText(id: string): ToggleText {
  if (Object.hasOwn(TOGGLES, id)) return TOGGLES[id] as ToggleText;
  const words = id.replaceAll('_', ' ');
  return { label: words.charAt(0).toUpperCase() + words.slice(1), description: '' };
}
