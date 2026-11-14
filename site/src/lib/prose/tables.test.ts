import { describe, expect, it } from 'vitest';
import fixture from '../__fixtures__/report.json';
import { type Model, type Report, parseReport } from '../report';
import { proseFacts } from './facts';
import { type Cell, TABLES, buildTable, provenanceOf, scaleFigure, sourceCell } from './tables';

const report = parseReport(fixture);
const facts = proseFacts(report);

const text = (c: Cell | undefined) => (typeof c === 'string' ? c : c?.text);
const column = (id: string, i: number, r: Report = report) =>
  buildTable(id, r, proseFacts(r)).rows.map((row) => text(row.cells[i]));

/** A model whose vendor publishes one cache-write price, equal to input, under a label that is not a duration. */
const FLAT_CACHE: Model = {
  id: 'flat-1',
  name: 'Flat Cache 1',
  vendor: 'Example',
  source: 'https://example.com/pricing',
  read_on: '2026-11-14',
  usd_per_mtok: { input: 0.6, cache_write_short: 0.6, cache_write_long: 0.6, cache_read: 0.15, output: 2.5 },
  cache_write_ttl: { short: 'automatic', long: 'automatic' },
  long_context: null,
};

function withFourthModel(): Report {
  const r = structuredClone(report);
  r.models.push(FLAT_CACHE);
  r.assumptions.params.model_efficiency[FLAT_CACHE.id] = { value: 1, measured: false, source: 'assumption', reason: 'Test.' };
  return r;
}

/** The fixture with scenario roles and own submodule sizes, as the real report has them. */
function complete(): Report {
  const r = structuredClone(report);
  const s = r.assumptions.scenarios as unknown as Record<string, Record<string, unknown>>;
  s['optimistic'] = { label: 'Optimistic', role: 'low', description: 'Lower.', scale: { overhead: 0.87 } };
  (s['calibrated'] as Record<string, unknown>)['role'] = 'central';
  (s['pessimistic'] as Record<string, unknown>)['role'] = 'high';
  (s['naive'] as Record<string, unknown>)['role'] = 'reference';
  for (const d of r.dependencies) {
    d.submodule_size = { available: true, unavailable_nested: 0, files: 2, code: 2000, comment: 0, blank: 0, bytes: 70_000 };
    (d as unknown as Record<string, unknown>)['submodule_own'] = { ...d.submodule_size, code: 1000 };
  }
  return r;
}

describe('buildTable', () => {
  it.each(Object.keys(TABLES))('builds %s from a complete fixture with a cell per column', (id) => {
    const r = complete();
    const t = buildTable(id, r, proseFacts(r));
    expect(t.rows.length).toBeGreaterThan(0);
    for (const row of t.rows) expect(row.cells).toHaveLength(t.columns.length);
  });

  it('throws on an unknown table, naming the known ones', () => {
    expect(() => buildTable('nope', report, facts)).toThrow(/no table "nope"; known: lines-by-group/);
  });
});

describe('sourceCell', () => {
  it('links a URL, links a repository file on main, and keeps the rest as text', () => {
    expect(sourceCell('assumption')).toBe('Assumption');
    expect(sourceCell('https://example.com/p')).toEqual({ text: 'example.com/p', href: 'https://example.com/p' });
    expect(sourceCell('calibration.yaml')).toEqual({
      text: 'data/calibration.yaml',
      href: 'https://github.com/jhoblitt/ceph-porting-estimate/blob/main/data/calibration.yaml',
      code: true,
    });
    expect(sourceCell('data/generated/sloc.json')).toMatchObject({ text: 'data/generated/sloc.json' });
    expect(sourceCell("rgw-go session's classification")).toBe("rgw-go session's classification");
  });
});

describe('the measurement tables', () => {
  type Row = { scope: string; uncached: number | null; approx?: boolean };
  const raw = (r: Report) => r.calibration as { measurement: { port: Row; roles: Row[]; adjacent: Row[] } };

  it('explain a dash and "~" only when the table has one', () => {
    expect(buildTable('port-by-role', report, facts).note).toBe('Millions of tokens. The last column is computed: cache read ÷ output.');
    expect(buildTable('adjacent-work', report, facts).note).toBe(
      'Millions of tokens. A dash: the supplied table had none. ~: the supplied value was approximate.',
    );
    const r = structuredClone(report);
    const roles = raw(r).measurement.roles;
    if (roles[0]) roles[0].uncached = null;
    if (roles[1]) roles[1].approx = true;
    expect(buildTable('port-by-role', r, proseFacts(r)).note).toBe(
      'Millions of tokens. A dash: the supplied table had none. ~: the supplied value was approximate. The last column is computed: cache read ÷ output.',
    );
    raw(r).measurement.adjacent = raw(r).measurement.adjacent.map((a) => ({ ...a, approx: false, uncached: 0.01 }));
    expect(buildTable('adjacent-work', r, proseFacts(r)).note).toBe('Millions of tokens.');
  });
});

describe('scaleFigure', () => {
  it('prints three significant figures, keeping a zero the rounding put there, and an exact shorter scale as it is', () => {
    expect([1.1971, 0.871, 1.2691, 0.8333, 0.75, 1.5, 1.2].map(scaleFigure)).toEqual(['1.20', '0.871', '1.27', '0.833', '0.75', '1.5', '1.2']);
  });
});

describe('the bindings table', () => {
  it("names what bindings leave in the estimate page's words, and points at each entry's plan", () => {
    const t = buildTable('bindings-by-target', report, facts);
    expect(t.caption).toBe('Dependencies each target uses through bindings');
    expect(t.note).toContain('is in its plan, in the estimate page');
    expect(t.caption + (t.note ?? '')).not.toMatch(/C or C\+\+ library|its note/);
  });
});

describe('the scenarios table', () => {
  it('lists what each scenario replaces, then scales, then switches, leaving out values equal to the baseline', () => {
    const changes = Object.fromEntries(buildTable('scenarios', report, facts).rows.map((r) => [text(r.cells[0]), text(r.cells[4])]));
    const central = report.assumptions.scenarios[report.assumptions.default_scenario]?.label;
    expect(changes[`${central} (baseline)`]).toBe('Nothing: this is the baseline.');
    const pessimistic = changes['Pessimistic'] ?? '';
    expect(pessimistic.startsWith('Target code tokens per source token 1.62 → 1.85; Difficulty: hard 1.5 → 2; Difficulty: extreme 2 → 3; ')).toBe(true);
    const scaled = pessimistic.indexOf('Output tokens per token of finished code × 1.20;');
    expect(changes['Optimistic']).toContain('Output tokens per token of finished code × 0.871;');
    const switched = pessimistic.indexOf('Include the work around the port: on');
    expect(scaled).toBeGreaterThan(0);
    expect(switched).toBeGreaterThan(scaled);
    expect(changes['Naive']).not.toContain('Difficulty: standard');
  });
});

describe('with a model whose sheet has one cache-write price', () => {
  const r = withFourthModel();

  it('prices every model, printing whatever cache-write labels the data carries', () => {
    expect(column('prices', 0, r)).toEqual([...report.models.map((m) => m.name), 'Flat Cache 1']);
    const flat = buildTable('prices', r, proseFacts(r)).rows[report.models.length]?.cells.map(text);
    expect(flat?.slice(1, 6)).toEqual(['$0.60', '$0.60 (automatic)', '$0.60 (automatic)', '$0.15', '$2.50']);
  });

  it('lists long-context prices only for models that have them', () => {
    expect(column('long-context-prices', 0, r)).toEqual(['GPT-6 Astra']);
    expect(new Set(column('long-context-effect', 0, r))).toEqual(new Set(['GPT-6 Astra']));
  });

  it("prices the port on every model's sheet", () => {
    expect(column('port-cost', 0, r)).toEqual([...report.models.map((m) => m.name), 'Flat Cache 1']);
  });
});

describe('the parameter-provenance table', () => {
  const where = (r: Report = report) =>
    Object.fromEntries(buildTable('parameter-provenance', r, proseFacts(r)).rows.map((row) => [text(row.cells[0]), text(row.cells[1])]));

  it("says where each parameter comes from, from the data's measured flags and sources", () => {
    const w = where();
    expect(w['Output tokens per token of finished code']).toBe('Measured on rgw-go');
    expect(w['Bytes per line of dependency work']).toBe('Measured on Ceph');
    expect(w['Difficulty']).toBe('Assumed');
    expect(w['Token use relative to the calibration model']).toBe('Assumed');
    expect(w['Bytes per token']).toBe('Assumed');
    expect(w["Share of radosgw that rgw-go replaced (coverage)"]).toBe('Assumed');
  });

  it('labels a group from its measured flags, not from whether its labels differ', () => {
    const r = structuredClone(report);
    // Two assumed values from different sources: still assumed.
    r.assumptions.params.difficulty.hard.source = 'a reviewer';
    // Two measured values in different places: still measured, but not in one place.
    const lc = r.assumptions.params.long_context_share;
    for (const q of Object.values(lc)) q.measured = true;
    lc.uncached.source = 'calibration.yaml';
    lc.output.source = 'data/generated/sloc.json';
    const w = where(r);
    expect(w['Difficulty']).toBe('Assumed');
    expect(w['Billed at long-context prices']).toBe('Measured');
  });

  it('does not place a measured value with an unrecognised source anywhere in particular', () => {
    const r = structuredClone(report);
    r.assumptions.params.overhead.source = 'a notebook somewhere';
    r.assumptions.params.difficulty.hard.measured = true;
    r.assumptions.params.difficulty.hard.source = 'calibration.yaml';
    const w = where(r);
    expect(w['Output tokens per token of finished code']).toBe('Measured');
    expect(w['Difficulty']).toBe('Partly measured');
  });

  it('marks a parameter derived from rgw-go with an assumed input, and a group that is partly measured', () => {
    const r = structuredClone(report);
    r.assumptions.params.expansion.measured = false;
    r.assumptions.params.difficulty.hard.measured = true;
    const w = where(r);
    expect(w['Target code tokens per source token']).toBe('Derived from rgw-go, resting on an assumption');
    expect(w['Difficulty']).toBe('Partly measured');
  });

  it('lists every parameter group once, then bytes per token and coverage', () => {
    const rows = Object.keys(where());
    expect(new Set(rows).size).toBe(rows.length);
    expect(rows.slice(-2)).toEqual(['Bytes per token', 'Share of radosgw that rgw-go replaced (coverage)']);
  });
});

describe('provenanceOf', () => {
  it('has nothing to say of no values', () => {
    expect(() => provenanceOf([])).toThrow(/no values/);
  });
});

describe('usdPair', () => {
  it('prints two dollar figures to the same unit and decimals', async () => {
    const { usdPair } = await import('./tables');
    expect(usdPair(1_111_659, 1_971_182)).toEqual(['$1.1M', '$2.0M']);
    expect(usdPair(272_627, 651_569)).toEqual(['$270k', '$650k']);
    expect(usdPair(8_200, 12_000)).toEqual(['$8.2k', '$12.0k']);
  });
});
