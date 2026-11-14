// Renders every Markdown file under src/content/ with the fixture report, so
// a placeholder whose path does not resolve, a table that does not exist or
// a link to a missing section fails here as well as in the build's check of
// the generated report (check.ts, run from vite.config.ts).

import { describe, expect, it } from 'vitest';
import fixture from '../__fixtures__/report.json';
import { parseReport } from '../report';
import { checkContent, checkGeneratedReport } from './check';
import { PAGE_DOCS } from './content';
import { proseFacts } from './facts';
import { renderDoc } from './page';

// The fixture is a miniature of the real report: it carries what the prose
// names (a crimson group) and a calibration that agrees with its params, so
// `make site-dev-data` then `npm run build` passes the build's check too.
const report = parseReport(fixture);
const facts = proseFacts(report);

/** Every page's text for a report, as one string of HTML. */
function pageHtml(page: keyof typeof PAGE_DOCS, r: typeof report): string {
  const f = proseFacts(r);
  return PAGE_DOCS[page]
    .flatMap((d) => renderDoc(d, r, f))
    .map((s) => (s.kind === 'html' ? s.html : ''))
    .join('');
}

const SOURCES = import.meta.glob<string>('../../content/**/*.md', { eager: true, query: '?raw', import: 'default' });

describe('checkContent', () => {
  it('finds no problem in the fixture as shipped, as the build would on `make site-dev-data`', () => {
    expect(checkGeneratedReport(fixture)).toEqual([]);
  });

  it('renders the pages, and says what is true, when no model has long-context prices', () => {
    const r = structuredClone(report);
    for (const m of r.models) m.long_context = null;
    expect(checkContent(r)).toEqual([]);
    const methods = pageHtml('methods', r);
    const calibration = pageHtml('calibration', r);
    expect(methods).toContain('No model in this report has long-context prices');
    expect(methods).toContain('<p>Every price in the estimate is one of these.</p>');
    expect(methods).not.toContain('long-context prices below');
    expect(calibration).toContain('No model in this report has long-context prices, so these shares change no figure.');
    expect(calibration).not.toContain('gives the estimate with no prompt over the threshold');
  });

  it("says the expansion is not a measurement only when the data's flag says so", () => {
    const sentence = 'so it is not a measurement';
    const measured = structuredClone(report);
    measured.assumptions.params.expansion.measured = true;
    const assumed = structuredClone(report);
    assumed.assumptions.params.expansion.measured = false;
    expect(pageHtml('calibration', measured)).not.toContain(sentence);
    expect(pageHtml('calibration', assumed)).toContain(sentence);
  });

  it('points at the long-context comparison when some model has long-context prices', () => {
    expect(pageHtml('methods', report)).toContain('or one of the long-context prices below');
    expect(pageHtml('calibration', report)).toContain('its central figure and its figure with these shares billed at those prices');
    const f = proseFacts(report);
    const segments = PAGE_DOCS.methods.flatMap((d) => renderDoc(d, report, f));
    expect(segments.some((s) => s.kind === 'table' && s.id === 'long-context-effect')).toBe(true);
    const items = segments.flatMap((s) => (s.kind === 'limitations' ? s.items : []));
    expect(items.map((i) => i.id)).toContain('long-prompts');
  });

  it('gives the judgement, its thin evidence, the premise, the step at its strength, and the caveat, in that order', () => {
    const methods = pageHtml('methods', report);
    const parts = [
      "In this report's judgement the figure is more likely too low than too high.",
      'The measured evidence for that is thin: one port, and a test of the calibration rather than of the estimate',
      "rgw-go's output per byte of Go added has risen from phase to phase so far, 2.06, 2.70, and 3.71 output tokens per byte in phases 0, 1, and 2, " +
        "and the central scenario reflects the average so far, 3.10 on the phase table's basis " +
        // The fixture's Go bytes per token.
        '(that table gives output per Go token; these rates per byte are its rates divided by 3.9, the Go bytes-per-token value).',
      "The work still to be done has only to run above that average, not as high as phase 2, for rgw-go's finished rate to end above it; " +
        'then, with input per output token no lower than measured and the other calibrated parameters as measured, this figure is too low.',
      "By the session's account phase 2 is unfinished and more review-heavy, and it builds a different kind of feature, so the rise may not continue; " +
        'its Go is also read slightly before its tokens end',
      'That is why this is a judgement, not a finding.',
      'The sized items that can only lower the figure are choices a port could make.',
    ];
    const at = parts.map((p) => methods.indexOf(p));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(methods).not.toMatch(/account, and a different kind of feature|The evidence for it is one test|that its ratios rise|risen in each phase/);
  });

  /** The fixture with the latest phase's Go read on `day`; its tokens end on 2026-11-14. */
  function readOn(day: string): typeof report {
    const r = structuredClone(report);
    const rows = (r.calibration as { phases: { rows: { go_bytes_at: string }[] } }).phases.rows;
    (rows.at(-1) as { go_bytes_at: string }).go_bytes_at = day;
    return r;
  }

  it("gives the judgement's caveat with the Go read days before the tokens end", () => {
    const methods = pageHtml('methods', readOn('2026-11-10'));
    expect(methods).toContain(
      "By the session's account phase 2 is unfinished and more review-heavy, and it builds a different kind of feature, so the rise may not continue; " +
        'its Go is also read four days before its tokens end (<a href="#/calibration?section=the-measurement">The measurement</a>). ' +
        'That is why this is a judgement, not a finding.',
    );
    expect(methods).not.toContain('read slightly before its tokens end');
  });

  it("gives the judgement's caveat with the Go read when the tokens end", () => {
    const methods = pageHtml('methods', readOn('2026-11-14'));
    expect(methods).toContain(
      "By the session's account phase 2 is unfinished and more review-heavy, and it builds a different kind of feature, so the rise may not continue. " +
        'That is why this is a judgement, not a finding.',
    );
    expect(methods).not.toMatch(/its Go is also read/);
  });

  it('makes no judgement, and says so, when the rate has not risen from phase to phase', () => {
    const r = structuredClone(report);
    const rows = (r.calibration as { phases: { rows: { output: number }[] } }).phases.rows;
    (rows.at(-1) as { output: number }).output = (rows[0] as { output: number }).output;
    const methods = pageHtml('methods', r);
    expect(methods).toContain(
      '<p>On these items alone the figure could be too low or too high; this report does not judge which is more likely.</p>',
    );
    expect(methods).not.toMatch(/judgement the figure is more likely|That is why this is a judgement/);
  });

  it('attributes the two review counts and says no more about why they differ', () => {
    const sentence =
      "475 is the role breakdown's count of review agents, in its review row above; 455 is the session's count of review passes. " +
      "Both are the session's figures; the data does not say why they differ.";
    expect(pageHtml('calibration', report)).toContain(sentence);
    const same = structuredClone(report);
    (same.calibration as { measurement: { review_passes: number } }).measurement.review_passes = 475;
    expect(checkContent(same)).toEqual([]);
    expect(pageHtml('calibration', same)).not.toContain('count of review agents');
  });

  it('says what keyword roles mean for the review share the clean-break item quotes', () => {
    const calibration = pageHtml('calibration', report);
    expect(calibration).toContain(
      "By the session's report, the split between controller, implementation, review and the rest comes from each agent's type",
    );
    expect(calibration).toMatch(
      /so the review role's \d+% of the port's cost, which the clean-break item under .* quotes, is on that assignment a floor for the cost of review-driven work\./,
    );
    const cleanBreak = PAGE_DOCS.methods
      .flatMap((d) => renderDoc(d, report, facts))
      .flatMap((s) => (s.kind === 'limitations' ? s.items : []))
      .find((i) => i.id === 'clean-break');
    expect(cleanBreak?.html).toContain("a floor for review-driven work since, by the session's report, review fix rounds count as implementation");
  });

  it('shows where each price was read only when some model says', () => {
    const ids = (r: typeof report) =>
      PAGE_DOCS.methods.flatMap((d) => renderDoc(d, r, proseFacts(r))).flatMap((s) => (s.kind === 'table' ? [s.id] : []));
    expect(ids(report)).not.toContain('price-sources');
    const r = structuredClone(report);
    (r.models.at(-1) as (typeof r.models)[number]).price_sources = [
      { prices: ['input', 'cache_write_short', 'cache_write_long', 'cache_read', 'output'], source: 'https://example.com/p', read_on: '2026-11-14' },
    ];
    expect(checkContent(r)).toEqual([]);
    expect(ids(r)).toContain('price-sources');
    expect(pageHtml('methods', r)).toContain("Some models' prices were read from more than one page.");
  });

  it('says where each phase table counts Go, and when phase 2 reads it, on both pages', () => {
    const calibration = pageHtml('calibration', report);
    // A computed sentence is escaped as it is filled in.
    expect(calibration).toContain('Phase 2&#39;s Go is read at 239f789 (2026-11-13), the commit the rgw-go size table measures');
    expect(calibration).toContain('slightly overstated.');
    const segments = PAGE_DOCS.calibration.flatMap((d) => renderDoc(d, report, facts));
    const phases = segments.find((s) => s.kind === 'table' && s.id === 'phases');
    expect(phases?.kind === 'table' && phases.table.note).toContain('the tools under hack/ and generated fakes included');
    expect(pageHtml('methods', report)).toContain(
      "Phase 2's Go is read at 239f789 (2026-11-13), the day before its tokens end at 2026-11-14T00:31Z " +
        '(<a href="#/calibration?section=the-measurement">The measurement</a>), ' +
        "so phase 2's rates per Go byte, on which this check rests, are if anything slightly overstated.",
    );
  });

  it('keeps the share rgw-go leaves out apart from the coverage, and says what the test-code share is of', () => {
    const calibration = pageHtml('calibration', report);
    expect(calibration).toContain(
      'The share of the source rgw-go leaves out is a separate figure from its coverage: by the session\'s count of bytes it is &quot;40.8%: other SAL drivers 13.4%',
    );
    expect(calibration).not.toContain('Most of the ~40%');
    const tests = PAGE_DOCS.methods
      .flatMap((d) => renderDoc(d, report, facts))
      .flatMap((s) => (s.kind === 'limitations' ? s.items : []))
      .find((i) => i.id === 'tests');
    expect(tests?.html).toMatch(/Test code, new and ported, is \d+% of the headline's dollars\./);
  });

  it("says the early Go reading leans the overhead scales, prints the long-prompt rise unsigned, and attributes what rgw-go leaves out", () => {
    expect(pageHtml('calibration', report)).toContain(
      "which leaves phase 2's rate, and to a lesser degree the all-phases rate, if anything slightly high: " +
        "so the Pessimistic scenario's overhead scale leans slightly high and the Optimistic scenario's slightly low.",
    );
    const methods = pageHtml('methods', report);
    expect(methods).toMatch(/figure by up to \d+%/);
    expect(methods).not.toMatch(/by up to [+−]/);
    const coverage = PAGE_DOCS.methods
      .flatMap((d) => renderDoc(d, report, facts))
      .flatMap((s) => (s.kind === 'limitations' ? s.items : []))
      .find((i) => i.id === 'coverage');
    expect(coverage?.html).toContain("By the rgw-go session's account, what rgw-go leaves out is mostly multisite");
  });

  it('attributes the two subagent counts and says no more about why they differ', () => {
    const sentence =
      "About 1,030 is the session's approximate figure in the words quoted above; 984 is the port row's own count " +
      '(<a href="#/calibration?section=the-measurement">The measurement</a>); the data does not say why they differ.';
    expect(pageHtml('calibration', report)).toContain(sentence);
    const same = structuredClone(report);
    (same.calibration as { measurement: { port: { scope: string } } }).measurement.port.scope = 'The port: controller + 1,030 subagents';
    expect(checkContent(same)).toEqual([]);
    expect(pageHtml('calibration', same)).not.toContain('approximate figure in the words quoted above');
  });

  it('names the file and path of a figure the data no longer has', () => {
    const r = structuredClone(report);
    r.groups = r.groups.filter((g) => g.id !== 'crimson');
    r.components = r.components.filter((c) => c.group !== 'crimson');
    expect(checkContent(r)).toEqual([
      expect.stringMatching(/^methods\/09-what-could-make-this-wrong\.md: limitations\/osds\.md: \{\{computed\.group\.crimson\.usd \| usd\}\}: unknown path/),
    ]);
  });

  it('fails a group the prose names that is still listed but holds no headline code', () => {
    const r = structuredClone(report);
    for (const c of r.components) if (c.group === 'crimson') for (const f of c.features) f.langs = {};
    expect(checkContent(r)).toEqual([
      expect.stringMatching(/^methods\/09-what-could-make-this-wrong\.md: limitations\/osds\.md: \{\{computed\.group\.crimson\.usd \| usd\}\}: unknown path/),
    ]);
  });

  it('names what does not compute when a calibration key is missing', () => {
    const r = structuredClone(report);
    delete (r.calibration as Record<string, unknown>)['coverage'];
    expect(checkContent(r)[0]).toMatch(
      /^computed figures: calibration: coverage\.value must be a positive number; every figure and table in methods\/01-what-this-estimates\.md, .* needs them$/,
    );
  });

  it('reports an unreadable report instead of throwing', () => {
    expect(checkGeneratedReport({})).toEqual(['report.json: ceph.repo and ceph.rev must be strings']);
  });
});

describe.each(Object.entries(PAGE_DOCS))('the %s page', (_page, docs) => {
  it('has content', () => {
    expect(docs.length).toBeGreaterThan(0);
  });

  it('gives every heading an id unique on the page', () => {
    const ids = docs.flatMap((d) => d.headings.map((h) => h.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain('prose-toc-title');
  });

  it('starts each file with a section heading', () => {
    for (const d of docs) expect(d.segments[0]).toMatchObject({ kind: 'heading', level: 2 });
  });

  it.each(docs.map((d) => [d.file, d] as const))('leaves nothing unrendered in %s', (_, doc) => {
    for (const s of renderDoc(doc, report, facts)) {
      if (s.kind !== 'html') continue;
      expect(s.html).not.toContain('{{');
      expect(s.html).not.toMatch(/>\s*(undefined|null|NaN|—)\s*</);
    }
  });
});

/**
 * Text in the Markdown that may contain digits. Methods types no figure:
 * only model and project names and the constants of the formulas. The
 * calibration page may type what report.json does not hold, attributed to
 * the rgw-go session (see the report for each).
 */
const TYPED: Record<'methods' | 'calibration', readonly string[]> = {
  methods: [
    'Claude Opus 5.5',
    's3-tests',
    'S3',
    'Jinja2',
    'max(0, T − R)',
    '(1 + T_new)',
    '(1 − σ[cat])',
    '(1 − λ)',
    // The phase the data's key `phase_3_not_started` names.
    'phase 3, not started',
  ],
  calibration: [
    'Claude Opus 5.5',
    's3-tests',
    'S3',
    'D3N',
    'Tentacle v20.2.4',
    'SigV4 and SigV2',
    '2026-09-25',
    'Phase 0, foundations, from 09-26',
    'Phase 1, from 09-29 to 10-13',
    'Phase 2, from 10-13',
    'phase 3 (',
    'phase 4 (',
    'phase 3, not started',
    'phases 0 to 2',
    'phases 1 and 2',
    'Phase 2 was still in progress, and phases 3 and 4',
    'with 579 pull requests merged',
    'about 0.7 to 3.0 µs per operation',
    // rgw-go's README and hack/rook/README.md, quoted at the commit linked beside them.
    '`0010b8b`',
    'Phase 1 of the design spec',
    'and phase 2, versioning',
    'The phase 1 subset below has passed every nightly run since 2026-10-12 but\none, on 2026-10-24.',
    'every nightly run since 2026-10-12 but one, on 2026-10-24',
    'The phase 1 subset',
    '\n1. ',
    '\n2. ',
    '\n3. ',
    '\n4. ',
    '\n5. ',
    '\n6. ',
    '\n7. ',
  ],
};

/** The source with placeholders, link destinations and allowed text taken out. */
function untyped(source: string, allowed: readonly string[]): string {
  let text = source.replace(/\{\{[^}]*\}\}/g, '').replace(/\]\([^)]*\)/g, ']');
  for (const phrase of allowed) text = text.replaceAll(phrase, ' ');
  return text;
}

describe('typed numbers', () => {
  it.each(Object.entries(SOURCES))('%s types no figure outside its allowlist', (path, source) => {
    // The limitations are part of the Methods page.
    const page = path.includes('/calibration/') ? 'calibration' : 'methods';
    const stray = untyped(source, TYPED[page])
      .split('\n')
      .filter((line) => /\d/.test(line));
    expect(stray).toEqual([]);
  });
});
