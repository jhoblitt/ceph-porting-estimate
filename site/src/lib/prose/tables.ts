// The tables the prose pages embed with `::: <id>`, built from the report and
// the computed facts. Formatting only: every figure is either a value in
// report.json or one of facts.ts's outputs.

import { decimal, count, countExact, multiplier, paramValue, percent, usd, usdExact } from '../format';
import { describeParams } from '../model';
import { provenance, toggleText } from '../assumptions';
import { calibrationFacts } from '../interpret';
import { type Difficulty, type Model, type Prices, type Report, TARGETS, TARGET_LABELS } from '../report';
import { REPO_URL } from '../version';
import { type MeasurementRow, parseCalibration } from './calibration';
import type { ProseFacts } from './facts';
import { calibrationRatios } from './ratios';

export type Cell = string | { text: string; href?: string; code?: boolean };

export interface Column {
  label: string;
  /** Right-aligned, tabular figures. */
  numeric?: boolean;
  /** Long text: give the column room before the table scrolls. */
  wide?: boolean;
}

export interface Row {
  cells: Cell[];
  /** A total or the row the others break down. */
  strong?: boolean;
  /** A part of the row above that is `strong`. */
  indent?: boolean;
}

export interface Table {
  caption: string;
  columns: Column[];
  rows: Row[];
  /** A line under the table: units, or what a dash means. */
  note?: string;
  /** False when the first cell of a row is a value, not the row's name. */
  rowHeaders?: boolean;
}

const row = (...cells: Cell[]): Row => ({ cells });

/** A repository file on GitHub, on main. */
function repoFile(path: string): string {
  return `${REPO_URL}/blob/main/${path}`;
}

/** A quantity's `source` as a reader can follow it: a link for a URL or a file, else the text. */
export function sourceCell(source: string): Cell {
  if (source === 'assumption') return 'Assumption';
  if (/^https?:\/\//.test(source)) return { text: source.replace(/^https?:\/\//, ''), href: source };
  if (/^[\w./-]+\.(ya?ml|json|md)$/.test(source)) {
    const path = source.includes('/') ? source : `data/${source}`;
    return { text: path, href: repoFile(path), code: true };
  }
  return source;
}

const DIFFICULTY_ORDER: readonly Difficulty[] = ['config', 'glue', 'standard', 'hard', 'extreme'];

function linesByGroup(_: Report, facts: ProseFacts): Table {
  const line = (r: ProseFacts['lines']) => [countExact(r.headline), countExact(r.shown), countExact(r.notPorted), countExact(r.total)];
  return {
    caption: 'Code lines by group and scope',
    columns: [
      { label: 'Group' },
      { label: 'Headline', numeric: true },
      { label: 'Shown separately', numeric: true },
      { label: 'Not ported', numeric: true },
      { label: 'Total', numeric: true },
    ],
    rows: [
      ...facts.linesByGroup.map((g) => row(g.name, ...line(g))),
      { cells: ['All of Ceph', ...line(facts.lines)], strong: true },
    ],
    note: 'Code lines only: comments and blank lines are counted but not shown here. Dependency work is not Ceph source and is not included.',
  };
}

function difficultyClasses(report: Report, facts: ProseFacts): Table {
  const d = report.assumptions.params.difficulty;
  const by = new Map(facts.byDifficulty.map((r) => [r.difficulty, r]));
  return {
    caption: 'Difficulty classes',
    columns: [
      { label: 'Class' },
      { label: 'Multiplier', numeric: true },
      { label: 'Headline code lines', numeric: true },
      { label: 'Share of headline output', numeric: true },
      { label: 'What it covers, and why this multiplier', wide: true },
    ],
    rows: DIFFICULTY_ORDER.map((c) =>
      row(c, multiplier(d[c].value), countExact(by.get(c)?.lines ?? 0), percent(by.get(c)?.output ?? 0), d[c].reason),
    ),
    note: `Output shares are for ${facts.target.name} under the ${facts.scenario.label} scenario and include dependency work, which carries its own class. Configuration of any rating is costed as config.`,
  };
}

function dependencyTotals(_: Report, facts: ProseFacts): Table {
  return {
    caption: 'Dependencies by strategy and target',
    columns: [
      { label: 'Target' },
      { label: 'Native', numeric: true },
      { label: 'Bindings', numeric: true },
      { label: 'Port', numeric: true },
      { label: 'Drop', numeric: true },
      { label: 'Lines of work costed', numeric: true },
    ],
    rows: TARGETS.map((t) => {
      const d = facts.dependencies[t];
      return row(
        TARGET_LABELS[t],
        countExact(d.strategies.native),
        countExact(d.strategies.bindings),
        countExact(d.strategies.port),
        countExact(d.strategies.drop),
        countExact(d.lines),
      );
    }),
    note: 'Counts are dependencies. Lines of work are the sloc_equivalent the bindings and port strategies leave; native and drop cost nothing.',
  };
}

function params(report: Report): Table {
  const scenario = report.assumptions.default_scenario;
  return {
    caption: 'Every parameter of the cost model',
    columns: [
      { label: 'Parameter' },
      { label: 'Value', numeric: true },
      { label: 'Measured or assumed' },
      { label: 'Source' },
      { label: 'Reason', wide: true },
    ],
    rows: describeParams(report, scenario).map((p) =>
      row(
        { text: p.label },
        decimal(p.baseline),
        p.measured ? 'Measured' : 'Assumed',
        sourceCell(p.source),
        p.reason,
      ),
    ),
    note: 'Baseline values, as data/assumptions.yaml gives them. The estimate page lets you change any of them.',
  };
}

function bytesPerToken(report: Report): Table {
  // The fallback first, then the languages alphabetically.
  const entries = Object.entries(report.assumptions.bytes_per_token).sort(([a], [b]) =>
    a === 'default' ? -1 : b === 'default' ? 1 : a < b ? -1 : a > b ? 1 : 0,
  );
  return {
    caption: 'Bytes per token, by language',
    columns: [{ label: 'Language' }, { label: 'Bytes per token', numeric: true }, { label: 'Reason', wide: true }],
    rows: entries.map(([lang, q]) => row({ text: lang, code: true }, decimal(q.value), q.reason)),
    note: 'All assumed; none was measured with a tokenizer. A language not listed uses default; binary files carry no tokens.',
  };
}

const THREE_FIGURES = new Intl.NumberFormat('en-US', { minimumSignificantDigits: 3, maximumSignificantDigits: 3 });

/**
 * A scale to three significant figures, keeping a trailing zero that the
 * rounding put there, so scales printed side by side carry the same number
 * of figures (0.871 beside 1.20); one exact at fewer figures prints as
 * paramValue does (0.75).
 */
export function scaleFigure(f: number): string {
  return Number(f.toPrecision(3)) === f ? paramValue(f) : THREE_FIGURES.format(f);
}

const ROLE_NAMES: Record<string, string> = { low: 'Low', central: 'Central', high: 'High', reference: 'Reference' };

function scenarios(report: Report, facts: ProseFacts): Table {
  const usdOf = new Map(facts.scenarios.map((x) => [x.id, x.usd]));
  const roleOf = new Map(facts.scenarios.map((x) => [x.id, x.role]));
  const described = describeParams(report, report.assumptions.default_scenario);
  const info = new Map(described.map((p) => [p.path, p]));
  const order = new Map(described.map((p, i) => [p.path, i]));
  const label = (path: string) => info.get(path)?.label ?? path;
  const inOrder = <V>(entries: [string, V][]) =>
    entries.sort(([a], [b]) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity));
  return {
    caption: `Scenarios, with each one's headline for ${facts.target.name} on ${facts.model.name}`,
    columns: [
      { label: 'Scenario' },
      { label: 'Role' },
      { label: 'Headline', numeric: true },
      { label: 'What it is', wide: true },
      { label: 'What it changes from the baseline', wide: true },
    ],
    rows: Object.entries(report.assumptions.scenarios).map(([id, s]) => {
      const changes = [
        ...inOrder(Object.entries(s.overrides ?? {}))
          .filter(([path, v]) => info.get(path)?.baseline !== v)
          .map(([path, v]) => `${label(path)} ${paramValue(info.get(path)?.baseline ?? Number.NaN)} → ${paramValue(v)}`),
        ...inOrder(Object.entries(s.scale ?? {})).map(([path, f]) => `${label(path)} × ${scaleFigure(f)}`),
        ...Object.entries(s.toggles ?? {})
          .filter(([t, on]) => report.assumptions.toggles[t as keyof typeof report.assumptions.toggles] !== on)
          .map(([t, on]) => `${toggleText(t).label}: ${on ? 'on' : 'off'}`),
      ];
      const role = roleOf.get(id);
      return row(
        { text: `${s.label}${id === report.assumptions.default_scenario ? ' (baseline)' : ''}` },
        role ? (ROLE_NAMES[role] ?? role) : '—',
        usd(usdOf.get(id) ?? Number.NaN),
        s.description,
        changes.length > 0 ? changes.join('; ') : 'Nothing: this is the baseline.',
      );
    }),
  };
}

const price = (p: number) => usdExact(p);

function prices(report: Report): Table {
  return {
    caption: 'List prices, US dollars per million tokens',
    columns: [
      { label: 'Model' },
      { label: 'Input', numeric: true },
      { label: 'Cache write, short tier', numeric: true },
      { label: 'Cache write, long tier', numeric: true },
      { label: 'Cache read', numeric: true },
      { label: 'Output', numeric: true },
      { label: 'Source, and the day it was read' },
    ],
    rows: report.models.map((m) =>
      row(
        m.name,
        price(m.usd_per_mtok.input),
        `${price(m.usd_per_mtok.cache_write_short)} (${m.cache_write_ttl.short})`,
        `${price(m.usd_per_mtok.cache_write_long)} (${m.cache_write_ttl.long})`,
        price(m.usd_per_mtok.cache_read),
        price(m.usd_per_mtok.output),
        { text: `${m.vendor} pricing, ${m.read_on}`, href: m.source },
      ),
    ),
    note: "In brackets, the vendor's own label for each of the two cache-write tiers the data records. A vendor with a single cache-write price has it in both.",
  };
}

function longContextPrices(report: Report): Table {
  const models = report.models.filter((m): m is Model & { long_context: Prices & { threshold_tokens: number } } => m.long_context !== null);
  return {
    caption: 'Long-context prices, US dollars per million tokens',
    columns: [
      { label: 'Model' },
      { label: 'Applies to prompts over', numeric: true },
      { label: 'Input', numeric: true },
      { label: 'Cache write, short tier', numeric: true },
      { label: 'Cache write, long tier', numeric: true },
      { label: 'Cache read', numeric: true },
      { label: 'Output', numeric: true },
    ],
    rows: models.map((m) =>
      row(
        m.name,
        `${countExact(m.long_context.threshold_tokens)} tokens`,
        price(m.long_context.input),
        `${price(m.long_context.cache_write_short)} (${m.cache_write_ttl.short})`,
        `${price(m.long_context.cache_write_long)} (${m.cache_write_ttl.long})`,
        price(m.long_context.cache_read),
        price(m.long_context.output),
      ),
    ),
    note: 'Models not listed bill their whole context window at the prices above.',
  };
}

const PAIR_UNITS: readonly [number, string][] = [
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'k'],
];

/**
 * Two dollar figures printed side by side to the same unit and the same
 * rounding: the smaller to two significant figures and the larger to the
 * same step, so $1.1M sits beside $2.0M rather than $2M.
 */
export function usdPair(a: number, b: number): [string, string] {
  if (!(Number.isFinite(a) && Number.isFinite(b)) || a <= 0 || b <= 0) return [usd(a), usd(b)];
  const [scale, unit] = PAIR_UNITS.find(([k]) => Math.max(a, b) >= k) ?? [1, ''];
  // Round both to the step that gives the smaller two significant figures.
  const exponent = Math.floor(Math.log10(Math.min(a, b) / scale)) - 1;
  const step = 10 ** exponent;
  const decimals = Math.max(0, -exponent);
  const fmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const at = (x: number) => `$${fmt.format(Math.round(x / scale / step) * step)}${unit}`;
  return [at(a), at(b)];
}

function longContextEffect(_: Report, facts: ProseFacts): Table {
  if (facts.longContext.length === 0) throw new Error('table long-context-effect: no model has long-context prices');
  return {
    caption: `Headline cost of each model with long-context prices, ${facts.scenario.label} scenario`,
    columns: [
      { label: 'Model' },
      { label: 'Target' },
      { label: 'Central', numeric: true },
      { label: "With rgw-go's long prompts billed", numeric: true },
    ],
    rows: facts.longContext.flatMap((lc) =>
      TARGETS.map((t) => row(lc.name, TARGET_LABELS[t], ...usdPair(lc.baseline[t], lc.withShares[t]))),
    ),
    note: "Model output. The last column bills each token category at the model's long-context prices for the share rgw-go sent in calls over its threshold; the token volumes are the same in both.",
  };
}

/** The unit, and what a dash and "~" mean where the rows have them. */
function unitNote(rows: readonly MeasurementRow[]): string {
  const parts = ['Millions of tokens.'];
  if (rows.some((r) => [r.uncached, r.cache_write, r.cache_read, r.output].some((v) => v === null))) {
    parts.push('A dash: the supplied table had none.');
  }
  if (rows.some((r) => r.approx)) parts.push('~: the supplied value was approximate.');
  return parts.join(' ');
}

function measurementCells(r: MeasurementRow): Cell[] {
  const approx = r.approx ? '~' : '';
  const m = (v: number | null) => (v === null ? '—' : `${approx}${decimal(v)}`);
  return [`${approx}${countExact(r.calls)}`, m(r.uncached), m(r.cache_write), m(r.cache_read), m(r.output)];
}

const MEASUREMENT_COLUMNS: Column[] = [
  { label: 'Calls', numeric: true },
  { label: 'Uncached input', numeric: true },
  { label: 'Cache write', numeric: true },
  { label: 'Cache read', numeric: true },
  { label: 'Output', numeric: true },
];

function portByRole(report: Report): Table {
  const c = parseCalibration(report.calibration);
  const readsPerOutput = (r: MeasurementRow) => countExact(r.cache_read / r.output);
  return {
    caption: 'The port, by role',
    columns: [{ label: 'Scope' }, ...MEASUREMENT_COLUMNS, { label: 'Cache reads per output token', numeric: true }],
    rows: [
      { cells: [c.measurement.port.scope, ...measurementCells(c.measurement.port), readsPerOutput(c.measurement.port)], strong: true },
      ...c.measurement.roles.map((r) => ({ cells: [r.scope, ...measurementCells(r), readsPerOutput(r)], indent: true })),
    ],
    note: `${unitNote([c.measurement.port, ...c.measurement.roles])} The last column is computed: cache read ÷ output.`,
  };
}

function adjacentWork(report: Report): Table {
  const c = parseCalibration(report.calibration);
  return {
    caption: 'Work around the port',
    columns: [{ label: 'Scope' }, ...MEASUREMENT_COLUMNS],
    rows: c.measurement.adjacent.map((r) => row(r.scope, ...measurementCells(r))),
    note: unitNote(c.measurement.adjacent),
  };
}

function rgwGoSizes(report: Report): Table {
  const c = parseCalibration(report.calibration);
  const s = c.sizes.rgw_go;
  const d = c.derived;
  type Part = 'product_go' | 'test_go' | 'tooling_go' | 'testdata' | 'markdown' | 'other_go';
  const tokens: Partial<Record<Part, number>> = {
    product_go: d.product_go_tokens,
    test_go: d.test_go_tokens,
    tooling_go: d.tooling_go_tokens,
  };
  const names: Record<Part, string> = {
    product_go: 'Product Go',
    test_go: 'Test Go',
    tooling_go: 'Tooling Go',
    testdata: 'Test data',
    markdown: 'Markdown',
    other_go: 'Other Go',
  };
  return {
    caption: `rgw-go at ${c.project.commit}, by part`,
    columns: [
      { label: 'Part' },
      { label: 'Files', numeric: true },
      { label: 'Lines', numeric: true },
      { label: 'Bytes', numeric: true },
      { label: 'Tokens', numeric: true },
      { label: 'Rule', wide: true },
    ],
    rows: (Object.keys(names) as Part[]).map((k) => {
      const t = tokens[k];
      return row(names[k], countExact(s[k].files), countExact(s[k].lines), countExact(s[k].bytes), t === undefined ? '—' : countExact(t), s[k].rule);
    }),
    note: 'Lines are physical lines, as git grep counts them. Tokens are bytes ÷ the Go bytes-per-token assumption, for the three parts the ratios use; the others play no part.',
  };
}

function derivedRatios(report: Report): Table {
  const c = parseCalibration(report.calibration);
  return {
    caption: 'Every ratio the calibration records, computed from its operands',
    columns: [
      { label: 'Symbol' },
      { label: 'What it is' },
      { label: 'Arithmetic', wide: true },
      { label: 'Computed', numeric: true },
      { label: 'Used by the estimate', numeric: true },
    ],
    rows: calibrationRatios(report, c).map((r) =>
      row(r.symbol, r.name, r.arithmetic, r.count ? countExact(r.value) : decimal(r.value), r.used === null ? '—' : decimal(r.used)),
    ),
    note: 'Computed here from the operands calibration.yaml records; the last column is the value the estimate applies, which data checks hold to the same arithmetic. A dash: the ratio is an input to others, not a parameter.',
  };
}

function expansionByCoverage(report: Report, facts: ProseFacts): Table {
  const c = parseCalibration(report.calibration);
  const e = c.derived.expansion;
  return {
    caption: 'The expansion, and the headline, across the coverage range',
    columns: [
      { label: 'Coverage of the source' },
      { label: 'E', numeric: true },
      { label: `Headline, ${facts.target.name} on ${facts.model.name}`, numeric: true },
    ],
    rows: [
      row(`${percent(c.coverage.low)} (low)`, decimal(e.at_low_coverage), usd(facts.byCoverage.low)),
      { cells: [`${percent(c.coverage.value)} (central)`, decimal(e.central), usd(facts.byCoverage.central)], strong: true },
      row(`${percent(c.coverage.high)} (high)`, decimal(e.at_high_coverage), usd(facts.byCoverage.high)),
    ],
  };
}

function breakEvens(_: Report, facts: ProseFacts): Table {
  const i = facts.interpretation;
  return {
    caption: `Each other model against ${i.measured?.name ?? 'the measured model'}`,
    columns: [
      { label: 'Model' },
      { label: `${facts.target.name} headline at its list prices`, numeric: true },
      { label: 'Break-even', wide: true },
    ],
    rows: i.breakEvens.map((b) => row(b.name, usd(b.usd), b.sentence)),
    note: `Computed by the estimate's cost model under the ${facts.scenario.label} scenario, on ${i.measured?.name ?? 'the measured model'}'s token counts.`,
  };
}

function portCost(report: Report, facts: ProseFacts): Table {
  const c = parseCalibration(report.calibration);
  return {
    caption: "The port's tokens at each model's list prices",
    columns: [
      { label: 'Model' },
      { label: 'Cost of the port row', numeric: true },
      { label: 'Per line of product Go', numeric: true },
    ],
    rows: facts.port.costs.map((p) => row(p.name, usdExact(p.usd), usdExact(p.perProductLine))),
    note: `Computed by the estimate's cost model. Product Go: ${countExact(c.sizes.rgw_go.product_go.lines)} lines. Cache writes split between the two lifetimes as rgw-go measured them; no call billed at a long-context rate.`,
  };
}

function longContextShares(report: Report): Table {
  const c = parseCalibration(report.calibration);
  const s = c.measurement_detail.prompt_size_tokens.share_over_threshold;
  const labels: Record<keyof typeof s, string> = {
    uncached: 'Uncached input',
    cache_write: 'Cache write',
    cache_read: 'Cache read',
    output: 'Output',
  };
  return {
    caption: `Share of each category's tokens in calls whose prompt exceeded ${count(c.measurement_detail.prompt_size_tokens.threshold)} tokens`,
    columns: [{ label: 'Token category' }, { label: 'Share', numeric: true }],
    rows: (Object.keys(labels) as (keyof typeof s)[]).map((k) => row(labels[k], percent(s[k]))),
  };
}

function promptSizes(report: Report): Table {
  const d = parseCalibration(report.calibration).measurement_detail.prompt_size_tokens.distribution;
  return {
    caption: 'Prompt size per call, in tokens',
    columns: [
      { label: 'Median', numeric: true },
      { label: 'Mean', numeric: true },
      { label: '90th percentile', numeric: true },
      { label: '99th percentile', numeric: true },
      { label: 'Largest', numeric: true },
    ],
    rows: [row(countExact(d.median), countExact(d.mean), countExact(d.p90), countExact(d.p99), countExact(d.max))],
    rowHeaders: false,
    note: 'A prompt is the uncached input, cache write and cache read of one call.',
  };
}

type Provenance = { measured: boolean; source: string };

/**
 * A group of values in words, from the assumptions panel's badge for each
 * (`provenance`): the badge they share when all are measured, "Partly
 * measured" when only some are, and for assumed values "Derived from" the
 * calibration project when each one's source is that project's data.
 */
export function provenanceOf(qs: readonly Provenance[], projectName?: string): string {
  if (qs.length === 0) throw new Error('provenance of no values');
  const measured = qs.filter((q) => q.measured).length;
  if (measured > 0 && measured < qs.length) return 'Partly measured';
  if (measured === qs.length) {
    const badges = new Set(qs.map((q) => provenance(q, projectName)));
    return badges.size === 1 ? ([...badges][0] as string) : 'Measured';
  }
  const project = projectName ?? 'the calibration port';
  const fromProject = qs.every((q) => provenance({ ...q, measured: true }, projectName) === `Measured on ${project}`);
  return fromProject ? `Derived from ${project}, resting on an assumption` : 'Assumed';
}

function parameterProvenance(report: Report): Table {
  const groups = new Map<string, Provenance[]>();
  for (const p of describeParams(report, report.assumptions.default_scenario)) {
    const label = p.label.split(': ')[0] as string;
    groups.set(label, [...(groups.get(label) ?? []), p]);
  }
  const c = parseCalibration(report.calibration);
  const project = calibrationFacts(report).projectName;
  return {
    caption: 'Where each parameter comes from',
    columns: [{ label: 'Parameter' }, { label: 'Source', wide: true }],
    rows: [
      ...[...groups].map(([label, qs]) => row(label, provenanceOf(qs, project))),
      row('Bytes per token', provenanceOf(Object.values(report.assumptions.bytes_per_token), project)),
      row('Share of radosgw that rgw-go replaced (coverage)', provenanceOf([c.coverage], project)),
    ],
    note: "From each value's measured flag in the data, and its source for where it was measured. A group is partly measured when some of its values are measured and others are not.",
  };
}

function phases(_: Report, facts: ProseFacts): Table {
  const m = (t: number) => decimal(t / 1e6);
  const rate = (x: number | null) => (x === null ? '—' : decimal(x));
  return {
    caption: "rgw-go's tokens and Go by phase",
    columns: [
      { label: 'Phase' },
      { label: 'Calls', numeric: true },
      { label: 'Uncached input', numeric: true },
      { label: 'Cache write', numeric: true },
      { label: 'Cache read', numeric: true },
      { label: 'Output', numeric: true },
      { label: 'Go bytes added', numeric: true },
      { label: 'Output per Go token added', numeric: true },
      { label: 'Cache reads per output token', numeric: true },
      { label: 'Cache writes per output token', numeric: true },
    ],
    rows: facts.phases.map((ph) => {
      const cells: Cell[] = [
        ph.phase === 'all' ? 'All phases' : `Phase ${ph.phase}`,
        countExact(ph.calls),
        m(ph.tokens.uncached),
        m(ph.tokens.cacheWrite),
        m(ph.tokens.cacheRead),
        m(ph.tokens.output),
        countExact(ph.goBytesAdded),
        rate(ph.outputPerGoToken),
        decimal(ph.cacheReadPerOutput),
        decimal(ph.cacheWritePerOutput),
      ];
      return ph.phase === 'all' ? { cells, strong: true } : row(...cells);
    }),
    note:
      "Token columns in millions. Go bytes added: the Go on main when each phase's Go is read, less the previous phase's; it counts test files and every other .go file, " +
      "the tools under hack/ and generated fakes included, so its non-test part is wider than the size table's Product Go. " +
      'The ratios are computed from the rows; output per Go token uses the Go bytes-per-token assumption.',
  };
}

function backTestTable(_: Report, facts: ProseFacts): Table {
  const t = facts.backTest;
  if (!t) throw new Error('table back-test: the data has no back-test (no low and high scenario phases with Go added)');
  const gap = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${percent(Math.abs(x))}`;
  return {
    caption: `Phase ${t.late} predicted from phase ${t.early}'s rates per Go byte, beside what phase ${t.late} used`,
    columns: [
      { label: '' },
      { label: 'Output tokens', numeric: true },
      { label: 'Cache-read tokens', numeric: true },
      { label: `At ${facts.model.name} list prices`, numeric: true },
    ],
    rows: [
      row('Predicted', countExact(t.predicted.output), countExact(t.predicted.cacheRead), usdExact(t.predictedUsd)),
      row('Used', countExact(t.actual.output), countExact(t.actual.cacheRead), usdExact(t.actualUsd)),
      { cells: ['Prediction against use', gap(t.outputGap), gap(t.cacheReadGap), gap(t.usdGap)], strong: true },
    ],
    note: "Model output, from the phase table on the Calibration page, per Go byte. Dollars price all four token categories under the central scenario.",
  };
}

function promptAbove(report: Report): Table {
  const above = parseCalibration(report.calibration).measurement_detail.prompt_size_tokens.above ?? [];
  if (above.length === 0) throw new Error('table prompt-above: the data has no measurement_detail.prompt_size_tokens.above');
  return {
    caption: 'Calls with a long prompt, and their share of cache reads',
    columns: [
      { label: 'Prompt above' },
      { label: 'Share of calls', numeric: true },
      { label: 'Share of cache-read tokens', numeric: true },
    ],
    rows: above.map((a) => row(`${a.prompt_above} tokens`, percent(a.share_of_calls), percent(a.share_of_cache_read))),
  };
}

function submoduleSizes(report: Report): Table {
  const own = (d: (typeof report.dependencies)[number]) => (d as { submodule_own?: { code: number } | null }).submodule_own ?? null;
  const rows = report.dependencies
    .filter((d) => d.submodule_size?.available && own(d))
    .sort((a, b) => (b.submodule_size?.code ?? 0) - (a.submodule_size?.code ?? 0));
  if (rows.length === 0) throw new Error('table submodule-sizes: no dependency has its own submodule size');
  return {
    caption: 'Vendored submodules: their own code, and with the submodules nested inside them',
    columns: [
      { label: 'Dependency' },
      { label: 'Own code lines', numeric: true },
      { label: 'With nested submodules', numeric: true },
      ...TARGETS.map((t) => ({ label: `${TARGET_LABELS[t]} strategy` })),
    ],
    rows: rows.map((d) =>
      row(
        d.name,
        countExact(own(d)?.code ?? 0),
        countExact(d.submodule_size?.code ?? 0),
        ...TARGETS.map((t) => d.targets[t].strategy),
      ),
    ),
    note: 'Code lines only. A nested submodule is counted inside the one that vendors it, so a library vendored twice appears in both totals. None of these lines is costed: dependency work is costed from the lines of work each strategy leaves.',
  };
}

function bindingsByTarget(report: Report): Table {
  return {
    caption: 'Dependencies each target uses through bindings',
    columns: [{ label: 'Target' }, { label: 'Kept, through bindings', wide: true }],
    rows: TARGETS.map((t) => {
      const kept = report.dependencies.filter((d) => d.targets[t].strategy === 'bindings').map((d) => d.name);
      return row(TARGET_LABELS[t], kept.length > 0 ? kept.join(', ') : 'None');
    }),
    note: "Names are the data's dependency entries. Which existing code each one leaves the port relying on, and what the port replaces, is in its plan, in the estimate page's Dependencies section.",
  };
}

type Builder = (report: Report, facts: ProseFacts) => Table;

/** Every table a Markdown file may embed, by the id it writes after `:::`. */
export const TABLES: Readonly<Record<string, Builder>> = Object.freeze({
  'lines-by-group': linesByGroup,
  'difficulty-classes': difficultyClasses,
  'dependency-totals': dependencyTotals,
  params,
  'bytes-per-token': bytesPerToken,
  scenarios,
  prices,
  'long-context-prices': longContextPrices,
  'long-context-effect': longContextEffect,
  'port-by-role': portByRole,
  'adjacent-work': adjacentWork,
  'rgw-go-sizes': rgwGoSizes,
  'derived-ratios': derivedRatios,
  'expansion-by-coverage': expansionByCoverage,
  'port-cost': portCost,
  'break-evens': breakEvens,
  'long-context-shares': longContextShares,
  'prompt-sizes': promptSizes,
  'parameter-provenance': parameterProvenance,
  phases,
  'back-test': backTestTable,
  'prompt-above': promptAbove,
  'submodule-sizes': submoduleSizes,
  'bindings-by-target': bindingsByTarget,
});

export function buildTable(id: string, report: Report, facts: ProseFacts): Table {
  if (!Object.hasOwn(TABLES, id)) throw new Error(`no table "${id}"; known: ${Object.keys(TABLES).join(', ')}`);
  return (TABLES[id] as Builder)(report, facts);
}
