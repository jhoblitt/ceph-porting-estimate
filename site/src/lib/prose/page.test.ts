import { describe, expect, it } from 'vitest';
import fixture from '../__fixtures__/report.json';
import { parseReport } from '../report';
import { compileMarkdown } from './compile';
import { proseFacts } from './facts';
import { renderDoc } from './page';

const report = parseReport(fixture);
const facts = proseFacts(report);

/** The fixture's facts with flags the tests set. */
function withFlags(flags: Record<string, unknown>) {
  return { ...facts, flags } as unknown as typeof facts;
}

const doc = compileMarkdown('A.\n\n::: if computed.flags.on\n\nB.\n\n::: prices\n\n::: end\n\nC.\n', 'x.md');

describe('renderDoc', () => {
  it('shows what a condition guards when its path holds true', () => {
    const kinds = renderDoc(doc, report, withFlags({ on: true })).map((s) => s.kind);
    expect(kinds).toEqual(['html', 'html', 'table', 'html']);
  });

  it('leaves it out when the path holds false', () => {
    const html = renderDoc(doc, report, withFlags({ on: false })).map((s) => (s.kind === 'html' ? s.html : s.kind));
    expect(html).toEqual(['<p>A.</p>\n', '<p>C.</p>\n']);
  });

  it('shows what `::: if not` guards only when the path holds false', () => {
    const negated = compileMarkdown('::: if not computed.flags.on\n\nB.\n\n::: end\n', 'y.md');
    expect(renderDoc(negated, report, withFlags({ on: false })).map((s) => s.kind)).toEqual(['html']);
    expect(renderDoc(negated, report, withFlags({ on: true }))).toEqual([]);
  });

  it('throws, naming the file, on a condition that is not a boolean or does not resolve', () => {
    expect(() => renderDoc(doc, report, withFlags({ on: 1 }))).toThrow(/x\.md: ::: if computed\.flags\.on: .*not a boolean/);
    expect(() => renderDoc(doc, report, withFlags({}))).toThrow(/x\.md: ::: if computed\.flags\.on: unknown path/);
  });
});
