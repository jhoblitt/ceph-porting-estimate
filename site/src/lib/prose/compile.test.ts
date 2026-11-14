import { describe, expect, it } from 'vitest';
import { usd } from '../format';
import { compileMarkdown } from './compile';
import { fill, sentinel } from './placeholders';
import type { CompiledDoc } from './types';

function htmlOf(doc: CompiledDoc): string {
  return doc.segments
    .map((s) => (s.kind === 'html' ? s.html : s.kind === 'heading' ? `[h${s.level} #${s.id} ${s.text}]` : `[embed ${s.id}]`))
    .join('');
}

describe('compileMarkdown', () => {
  it('renders Markdown to HTML, splitting out headings with ids, and lists the headings', () => {
    const doc = compileMarkdown('## What is counted\n\nSome *text*.\n\n### Lines, by `scope`\n\nMore.', 'm/02.md');
    expect(doc.segments).toEqual([
      { kind: 'heading', level: 2, id: 'what-is-counted', text: 'What is counted' },
      { kind: 'html', html: '<p>Some <em>text</em>.</p>\n' },
      { kind: 'heading', level: 3, id: 'lines-by-scope', text: 'Lines, by scope' },
      { kind: 'html', html: '<p>More.</p>\n' },
    ]);
    expect(doc.headings).toEqual([
      { level: 2, id: 'what-is-counted', text: 'What is counted' },
      { level: 3, id: 'lines-by-scope', text: 'Lines, by scope' },
    ]);
    expect(doc.file).toBe('m/02.md');
  });

  it('leaves a sentinel for each placeholder and lists them in order', () => {
    const doc = compileMarkdown('Overhead is {{assumptions.params.overhead.value | multiplier}} at {{ceph.rev|sha}}.', 'x.md');
    expect(htmlOf(doc)).toBe(`<p>Overhead is ${sentinel(0)} at ${sentinel(1)}.</p>\n`);
    expect(doc.placeholders).toEqual([
      { path: 'assumptions.params.overhead.value', formatter: 'multiplier' },
      { path: 'ceph.rev', formatter: 'sha' },
    ]);
  });

  it('keeps a placeholder whole inside a table cell and inside a link URL', () => {
    const md = [
      '| Model | Cost |',
      '|---|---:|',
      '| Opus | {{cost | usd}} |',
      '',
      '[the commit](https://github.com/ceph/ceph/commit/{{ceph.rev}})',
    ].join('\n');
    const doc = compileMarkdown(md, 'x.md');
    const html = fill(htmlOf(doc), doc.placeholders, { cost: 18_078.66, ceph: { rev: 'ec322a5' } });
    expect(html).toContain(`<td style="text-align:right">${usd(18_078.66)}</td>`);
    expect(html).toContain('<a href="https://github.com/ceph/ceph/commit/ec322a5">the commit</a>');
  });

  it('splits the document at embed lines', () => {
    const doc = compileMarkdown('Before.\n\n::: code-by-group\n\nAfter.\n', 'x.md');
    expect(doc.segments).toEqual([
      { kind: 'html', html: '<p>Before.</p>\n' },
      { kind: 'embed', id: 'code-by-group' },
      { kind: 'html', html: '<p>After.</p>\n' },
    ]);
  });

  it('does not treat an embed line inside a fenced block as an embed', () => {
    const doc = compileMarkdown('```\n::: not-an-embed\n```\n', 'x.md');
    expect(doc.segments).toEqual([{ kind: 'html', html: '<pre tabindex="0"><code>::: not-an-embed\n</code></pre>\n' }]);
  });

  it('makes code blocks focusable, so a keyboard can scroll them', () => {
    expect(htmlOf(compileMarkdown('    indented\n\n```\nfenced\n```\n', 'x.md'))).toBe(
      '<pre tabindex="0"><code>indented\n</code></pre>\n<pre tabindex="0"><code>fenced\n</code></pre>\n',
    );
  });

  it('marks a negated condition with a leading !', () => {
    const doc = compileMarkdown('::: if not computed.flag\n\nB.\n\n::: end\n', 'x.md');
    expect(doc.segments).toEqual([{ kind: 'html', html: '<p>B.</p>\n', when: '!computed.flag' }]);
  });

  it('marks what sits between `::: if <path>` and `::: end` as shown only when the path holds true', () => {
    const doc = compileMarkdown('A.\n\n::: if computed.flag\n\nB.\n\n::: prices\n\n::: end\n\nC.\n', 'x.md');
    expect(doc.segments).toEqual([
      { kind: 'html', html: '<p>A.</p>\n' },
      { kind: 'html', html: '<p>B.</p>\n', when: 'computed.flag' },
      { kind: 'embed', id: 'prices', when: 'computed.flag' },
      { kind: 'html', html: '<p>C.</p>\n' },
    ]);
  });

  it('escapes raw HTML rather than passing it through', () => {
    const doc = compileMarkdown('<script>alert(1)</script>\n\nA <b>tag</b>.', 'x.md');
    expect(htmlOf(doc)).not.toContain('<script>');
    expect(htmlOf(doc)).toContain('&lt;b&gt;tag&lt;/b&gt;');
  });

  it('does not turn bare URLs into links or straight quotes into curly ones', () => {
    expect(htmlOf(compileMarkdown('See https://example.com "here".', 'x.md'))).toBe(
      '<p>See https://example.com &quot;here&quot;.</p>\n',
    );
  });

  it.each([
    ['an unknown formatter', 'A {{cost | dollars}}.', /x\.md: .*unknown formatter "dollars"/],
    ['a malformed placeholder', 'A {{cost | usd | count}}.', /x\.md: malformed placeholder/],
    ['an unclosed placeholder', 'A {{cost | usd.', /x\.md: unclosed \{\{/],
    ['a placeholder in a heading', '## Cost {{cost | usd}}', /x\.md: .*heading "Cost/],
    ['two headings with one id', '## Scope\n\n### Scope', /x\.md: .*duplicate heading id "scope"/],
    ['a sentinel typed into the source', `A ${sentinel(0)}.`, /x\.md: .*reserved/],
    ['an h1', '# Title', /x\.md: .*level 1/],
    ['an h4', '#### Detail', /x\.md: .*level 4/],
    ['a heading inside a list', '- ## Item', /x\.md: .*top level/],
    ['an unclosed condition', '::: if a.b\n\nText.', /x\.md: .*unclosed ::: if a\.b/],
    ['an end without a condition', 'Text.\n\n::: end', /x\.md: .*::: end without/],
    ['a nested condition', '::: if a\n\n::: if b\n\n::: end\n\n::: end', /x\.md: .*nested ::: if/],
    ['a heading inside a condition', '::: if a\n\n## Maybe\n\n::: end', /x\.md: .*heading "Maybe" inside ::: if/],
    ['a malformed condition', '::: if a..b\n\n::: end', /x\.md: .*malformed condition/],
    ['a malformed negated condition', '::: if not\n\n::: end', /x\.md: .*malformed condition/],
  ])('fails the build on %s', (_, md, error) => {
    expect(() => compileMarkdown(md, 'x.md')).toThrow(error);
  });
});
