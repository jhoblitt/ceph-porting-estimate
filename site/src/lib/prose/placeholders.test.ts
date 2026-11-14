import { describe, expect, it } from 'vitest';
import { paramValue, tokens, usd } from '../format';
import { FORMATTERS, escapeHtml, fill, parsePlaceholder, resolvePath, sentinel, substitute } from './placeholders';

const ctx = {
  ceph: { rev: 'ec322a5e95ebcb46dec7d6a9d7813a34543c64ad', commit_date: '2026-11-14T05:11:18+05:30' },
  assumptions: { params: { overhead: { value: 10.939 }, 'long-name': { value: 0.0728 } } },
  models: [{ name: 'Claude Opus 5.5' }, { name: 'GPT-6 Astra' }],
  names: ['Go', 'Rust', 'WASM'],
  cost: 18_078.66,
  unsafe: '<b>"Tom" & \'Jerry\'</b>',
  nothing: null,
  zero: 0,
  empty: '',
  nothingListed: [],
};

describe('parsePlaceholder', () => {
  it('reads a path and a formatter, ignoring whitespace', () => {
    expect(parsePlaceholder(' assumptions.params.overhead.value | multiplier ')).toEqual({
      path: 'assumptions.params.overhead.value',
      formatter: 'multiplier',
    });
  });

  it('defaults to the text formatter', () => {
    expect(parsePlaceholder('ceph.rev')).toEqual({ path: 'ceph.rev', formatter: 'text' });
  });

  it('accepts hyphens and digits in a segment', () => {
    expect(parsePlaceholder('computed.headline.go.gpt-6-astra|usd').path).toBe('computed.headline.go.gpt-6-astra');
  });

  it('rejects an unknown formatter', () => {
    expect(() => parsePlaceholder('cost | dollars')).toThrow(/unknown formatter "dollars"/);
  });

  it.each(['', ' | usd', 'a..b | usd', 'a.b |', 'a b | usd', 'a | usd | count', '.a | usd'])(
    'rejects the malformed expression %j',
    (expr) => {
      expect(() => parsePlaceholder(expr)).toThrow(/placeholder/);
    },
  );
});

describe('resolvePath', () => {
  it('walks objects and array indices', () => {
    expect(resolvePath(ctx, 'assumptions.params.overhead.value')).toBe(10.939);
    expect(resolvePath(ctx, 'models.1.name')).toBe('GPT-6 Astra');
    expect(resolvePath(ctx, 'assumptions.params.long-name.value')).toBe(0.0728);
  });

  it('throws on an unknown path, naming it', () => {
    expect(() => resolvePath(ctx, 'assumptions.params.overheda.value')).toThrow(
      /assumptions\.params\.overheda\.value.*"overheda"/,
    );
    expect(() => resolvePath(ctx, 'models.2.name')).toThrow(/models\.2\.name/);
  });

  it('does not reach inherited properties', () => {
    expect(() => resolvePath(ctx, 'ceph.constructor')).toThrow(/unknown path/);
    expect(() => resolvePath(ctx, 'ceph.rev.length')).toThrow(/unknown path/);
    expect(() => resolvePath(ctx, 'names.length')).toThrow(/unknown path/);
  });
});

describe('substitute', () => {
  it('formats a known path with a known formatter', () => {
    expect(substitute(ctx, { path: 'assumptions.params.overhead.value', formatter: 'multiplier' })).toBe('10.9×');
    expect(substitute(ctx, { path: 'cost', formatter: 'usd' })).toBe(usd(ctx.cost));
    expect(substitute(ctx, { path: 'cost', formatter: 'usdExact' })).toBe('$18,079');
    expect(substitute(ctx, { path: 'ceph.rev', formatter: 'sha' })).toBe('ec322a5');
    expect(substitute(ctx, { path: 'ceph.commit_date', formatter: 'day' })).toBe('2026-11-14');
    expect(substitute(ctx, { path: 'names', formatter: 'list' })).toBe('Go, Rust, and WASM');
    expect(substitute(ctx, { path: 'zero', formatter: 'count' })).toBe('0');
  });

  it('escapes the substituted value', () => {
    expect(substitute(ctx, { path: 'unsafe', formatter: 'text' })).toBe(
      '&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;',
    );
  });

  it('throws on an unknown path rather than rendering nothing', () => {
    expect(() => substitute(ctx, { path: 'missing', formatter: 'text' })).toThrow(/unknown path "missing"/);
  });

  it('throws on an unknown formatter', () => {
    expect(() => substitute(ctx, { path: 'cost', formatter: 'dollars' })).toThrow(/unknown formatter "dollars"/);
  });

  it.each([
    ['nothing', 'text', /null/],
    ['empty', 'text', /needs a string/],
    ['ceph', 'text', /object/],
    ['cost', 'text', /needs a string/],
    ['ceph.rev', 'usd', /needs a finite number/],
    ['models', 'list', /needs a list of strings/],
    ['nothingListed', 'list', /needs a non-empty list/],
  ])('rejects %s with %s', (path, formatter, error) => {
    expect(() => substitute(ctx, { path, formatter })).toThrow(error);
  });

  it('has a formatter for each number style the report uses', () => {
    expect(Object.keys(FORMATTERS).sort()).toEqual(
      [
        'count',
        'countExact',
        'day',
        'decimal',
        'list',
        'mtok',
        'multiplier',
        'percent',
        'ratio',
        'sha',
        'signedPercent',
        'text',
        'times',
        'cardinal',
        'rate',
        'tokens',
        'usd',
        'usdExact',
      ].sort(),
    );
  });

  it('prints a ratio as the assumptions panel prints a parameter, without a unit', () => {
    expect(substitute({ v: 0.5403637 }, { path: 'v', formatter: 'ratio' })).toBe(paramValue(0.5403637));
    expect(substitute({ v: 1248.91 }, { path: 'v', formatter: 'ratio' })).toBe(paramValue(1248.91));
  });

  it('reads mtok as millions of tokens', () => {
    expect(substitute({ v: 56_213.6 }, { path: 'v', formatter: 'mtok' })).toBe(tokens(56_213.6e6));
    expect(substitute({ v: 0.35 }, { path: 'v', formatter: 'mtok' })).toBe('350k');
  });
});

describe('fill', () => {
  it('replaces each sentinel with its escaped value, wherever it appears', () => {
    const html = `<p>${sentinel(0)} and <a href="https://x/${sentinel(1)}">${sentinel(0)}</a></p>`;
    const out = fill(html, [
      { path: 'cost', formatter: 'usd' },
      { path: 'unsafe', formatter: 'text' },
    ], ctx);
    expect(out).toBe(
      `<p>${usd(ctx.cost)} and <a href="https://x/&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;">${usd(ctx.cost)}</a></p>`,
    );
  });

  it('names the file and expression when a placeholder does not resolve', () => {
    expect(() => fill(`<p>${sentinel(0)}</p>`, [{ path: 'nope', formatter: 'usd' }], ctx, 'methods/01-x.md')).toThrow(
      /methods\/01-x\.md: \{\{nope \| usd\}\}: unknown path "nope"/,
    );
  });

  it('throws on a sentinel with no placeholder', () => {
    expect(() => fill(`<p>${sentinel(3)}</p>`, [], ctx)).toThrow(/placeholder 3/);
  });
});

describe('escapeHtml', () => {
  it('escapes the five characters that matter in text and attributes', () => {
    expect(escapeHtml(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&#39;');
  });
});
