// The parts of report.calibration (data/calibration.yaml, free-form) that the
// calibration page computes with or tabulates. report.ts leaves the shape to
// this page; this file checks what the arithmetic depends on and trusts the
// rest, as parseReport does.

import { decimal } from '../format';
import type { Report } from '../report';

/** One row of the measurement table, in millions of tokens; null where the supplied table had "—". */
export interface MeasurementRow {
  scope: string;
  calls: number;
  uncached: number | null;
  cache_write: number;
  cache_read: number;
  output: number;
  /** The supplied values carried "~". */
  approx?: boolean;
}

export interface SizeRow {
  bytes: number;
  lines: number;
  files: number;
  rule: string;
}

/** One row of calibration.yaml's phase table: token columns in millions, uncached a plain count. */
export interface PhaseRow {
  phase: number;
  ends: string;
  calls: number;
  uncached_tokens: number;
  cache_write: number;
  cache_read: number;
  output: number;
  go_bytes_at: string;
  go_bytes: { product: number; test: number };
}

export interface Calibration {
  project: { name: string; repo: string; commit: string; commit_date: string; ports: { repo: string; tag: string } };
  measurement: {
    source: string;
    /** The models.yaml id of the model the port ran on. */
    model_id: string;
    port: MeasurementRow & { uncached: number };
    roles: MeasurementRow[];
    adjacent: (MeasurementRow & { note?: string })[];
    tasks: number;
    review_passes: number;
    review_passes_per_task: number;
    known_gaps: string[];
    notes: { source: string; items: string[] };
  };
  /** Tokens by implementation phase; optional, so a report without it degrades rather than throws. */
  phases?: {
    source: string;
    rows: PhaseRow[];
    note: string;
    /** Scenario id → the phase whose ratios its harness scales take. */
    scenario_phase: Record<string, number>;
  };
  /** What rgw-go ported, mapped onto the taxonomy, and the difficulty scale's mean over it. */
  ported_mix?: {
    features: { feature: string; difficulty: string; bytes: number }[];
    relative_difficulty: Record<string, number>;
    mean_relative_difficulty: number;
  };
  measurement_detail: {
    calls: number;
    cache_write_ttl_tokens: { total: number; short_5m: number; long_1h: number; long_share: number };
    prompt_size_tokens: {
      threshold: number;
      calls_over_threshold: number;
      share_over_threshold: Record<'uncached' | 'cache_write' | 'cache_read' | 'output', number>;
      distribution: { median: number; p90: number; p99: number; max: number; mean: number };
      above?: { prompt_above: string; share_of_calls: number; share_of_cache_read: number }[];
      compaction_markers?: number;
      caveat: string;
    };
    cache_write_by_call?: {
      low_cache_read_calls: { calls: number; share_of_calls: number; share_of_cache_write: number };
      no_cache_read_calls: { calls: number; share_of_cache_write: number };
      note: string;
    };
  };
  sizes: {
    rgw_go: Record<'product_go' | 'test_go' | 'tooling_go' | 'testdata' | 'markdown' | 'other_go', SizeRow> & {
      product_go_comments?: { bytes: number; share_of_product_go_bytes: number };
    };
    source: {
      tag: string;
      total: { bytes: number; lines: number };
      tokens: number;
      by_language: Record<string, Record<string, number>>;
    };
  };
  coverage: {
    value: number;
    low: number;
    high: number;
    measured: boolean;
    source: string;
    reason: string;
    scenario_end?: Record<string, 'low' | 'value' | 'high'>;
    byte_classification?: { ported_bytes: number; ported_share_bytes: number; ported_share_lines: number; note: string };
    cited_files?: { citations: number; files_cited: number; share_of_bytes: number; share_of_lines_inside_cited_ranges: number };
    session_estimate?: { value: number; low: number; high: number; position: string; caution: string };
  };
  derived: {
    product_go_tokens: number;
    test_go_tokens: number;
    tooling_go_tokens: number;
    surviving_go_tokens: number;
    uncached_per_output: number;
    cache_write_per_output: number;
    cache_read_per_output: number;
    test_ratio: number;
    overhead: number;
    long_cache_write_share: number;
    expansion: { central: number; at_low_coverage: number; at_high_coverage: number };
    adjacent_uplift: Record<'uncached' | 'cache_write' | 'cache_read' | 'output', number>;
  };
}

function at(raw: unknown, path: string): unknown {
  let node = raw;
  for (const key of path.split('.')) {
    if (typeof node !== 'object' || node === null || !Object.hasOwn(node, key)) return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

/** Numbers the page computes with or prints as derived ratios; all positive. */
const POSITIVE = [
  'measurement.port.uncached',
  'measurement.port.cache_write',
  'measurement.port.cache_read',
  'measurement.port.output',
  'measurement_detail.calls',
  'measurement_detail.prompt_size_tokens.calls_over_threshold',
  'sizes.rgw_go.product_go.lines',
  'derived.product_go_tokens',
  'derived.test_go_tokens',
  'derived.tooling_go_tokens',
  'derived.surviving_go_tokens',
  'derived.uncached_per_output',
  'derived.cache_write_per_output',
  'derived.cache_read_per_output',
  'derived.test_ratio',
  'derived.overhead',
  'derived.long_cache_write_share',
  'derived.expansion.central',
  'derived.expansion.at_low_coverage',
  'derived.expansion.at_high_coverage',
  'derived.adjacent_uplift.uncached',
  'derived.adjacent_uplift.cache_write',
  'derived.adjacent_uplift.cache_read',
  'derived.adjacent_uplift.output',
  'sizes.source.tokens',
  'coverage.value',
];

const LISTS = ['measurement.roles', 'measurement.adjacent'];

export function parseCalibration(raw: unknown): Calibration {
  for (const path of POSITIVE) {
    const v = at(raw, path);
    if (typeof v !== 'number' || !(v > 0) || !Number.isFinite(v)) {
      throw new Error(`calibration: ${path} must be a positive number`);
    }
  }
  for (const path of LISTS) {
    if (!Array.isArray(at(raw, path))) throw new Error(`calibration: ${path} must be a list`);
  }
  return raw as Calibration;
}

/** Equal to within rounding of the last digit calibration.yaml writes. */
function close(a: number, b: number, rel: number): boolean {
  return Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b));
}

/**
 * Where the calibration page's arithmetic and the estimate part ways: each
 * derived ratio the page prints beside the parameter the cost model uses,
 * and the central expansion beside the division the page shows for it.
 * Empty when they agree. Reports a calibration it cannot read rather than
 * throwing, so the build can list every problem at once.
 */
export function calibrationAgreement(report: Report): string[] {
  let c: Calibration;
  try {
    c = parseCalibration(report.calibration);
  } catch (err) {
    return [(err as Error).message];
  }
  const p = report.assumptions.params;
  const d = c.derived;
  const pairs: [string, number, number][] = [
    ['expansion', d.expansion.central, p.expansion.value],
    ['test_ratio', d.test_ratio, p.test_ratio.value],
    ['overhead', d.overhead, p.overhead.value],
    ['uncached_per_output', d.uncached_per_output, p.uncached_per_output.value],
    ['cache_write_per_output', d.cache_write_per_output, p.cache_write_per_output.value],
    ['cache_read_per_output', d.cache_read_per_output, p.cache_read_per_output.value],
    ['long_cache_write_share', d.long_cache_write_share, p.long_cache_write_share.value],
    ...(Object.keys(d.adjacent_uplift) as (keyof typeof d.adjacent_uplift)[]).map(
      (cat): [string, number, number] => [`adjacent_uplift.${cat}`, d.adjacent_uplift[cat], p.adjacent_uplift[cat].value],
    ),
  ];
  const problems = pairs
    .filter(([, derived, used]) => !close(derived, used, 1e-9))
    .map(([path, derived, used]) => {
      const shown = path === 'expansion' ? 'expansion.central' : path;
      return `calibration.derived.${shown} is ${decimal(derived)} but assumptions.params.${path} is ${decimal(used)}`;
    });
  const central = d.product_go_tokens / (c.sizes.source.tokens * c.coverage.value);
  if (!close(central, d.expansion.central, 1e-4)) {
    problems.push(
      `calibration.derived.expansion.central is ${decimal(d.expansion.central)} but product_go_tokens ÷ (source tokens × coverage) is ${decimal(central)}`,
    );
  }
  return problems;
}
