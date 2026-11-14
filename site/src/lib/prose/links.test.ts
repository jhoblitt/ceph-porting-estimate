import { describe, expect, it } from 'vitest';
import fixture from '../__fixtures__/report.json';
import { parseReport } from '../report';
import { type AppState, defaultState } from '../state';
import { internalLinks, pageHref, rewriteInternalLinks } from './links';

const report = parseReport(fixture);
const selection: AppState = {
  ...defaultState(report),
  route: 'methods',
  target: 'rust',
  overrides: { overhead: 3 },
  section: 'scope',
};
const QUERY = 'target=rust&model=opus-5-5&scenario=calibrated&o.overhead=3';

describe('pageHref', () => {
  it('puts the section in the hash with the whole selection', () => {
    expect(pageHref(selection, 'calibration', 'coverage')).toBe(`#/calibration?${QUERY}&section=coverage`);
  });

  it("drops the current page's section for a link without one", () => {
    expect(pageHref(selection, 'report')).toBe(`#/?${QUERY}`);
    expect(pageHref(selection, 'methods')).toBe(`#/methods?${QUERY}`);
  });
});

describe('rewriteInternalLinks', () => {
  it('turns #/route and #/route?section=id into links that keep the selection', () => {
    const html = '<a href="#/calibration?section=coverage">a</a> <a href="#/">b</a> <a href="https://x/#/y">c</a>';
    expect(rewriteInternalLinks(html, selection)).toBe(
      `<a href="#/calibration?${QUERY.replaceAll('&', '&amp;')}&amp;section=coverage">a</a> ` +
        `<a href="#/?${QUERY.replaceAll('&', '&amp;')}">b</a> <a href="https://x/#/y">c</a>`,
    );
  });

  it('throws on a route that does not exist', () => {
    expect(() => rewriteInternalLinks('<a href="#/method">x</a>', selection)).toThrow(/unknown page "method"/);
  });

  it('throws on a section of the report page, which does not scroll to one', () => {
    expect(() => internalLinks('<a href="#/?section=matrix">x</a>')).toThrow(/no section links/);
  });
});

describe('internalLinks', () => {
  it('lists each internal link with its route and section', () => {
    expect(internalLinks('<a href="#/calibration?section=coverage">a</a> <a href="#/">b</a> <a href="#/methods">c</a>')).toEqual([
      { route: 'calibration', section: 'coverage' },
      { route: 'report', section: null },
      { route: 'methods', section: null },
    ]);
  });
});
