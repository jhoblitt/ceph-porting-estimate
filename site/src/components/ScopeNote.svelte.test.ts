// @vitest-environment jsdom
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import fixture from '../lib/__fixtures__/report.json';
import { Derived } from '../lib/derived.svelte';
import { type Report, parseReport } from '../lib/report';
import { defaultState } from '../lib/state';
import ScopeNote from './ScopeNote.svelte';

const report = parseReport(fixture);

/** The fixture with `n` more components, each with one shown feature of `bytes[i]` C++ bytes. */
function withShown(bytes: number[]): Report {
  const base = report.components[0]!.features[0]!;
  const extra = bytes.map((b, i) => ({
    id: `extra-${i}`,
    name: `Extra ${i}`,
    description: '',
    group: 'rgw',
    root: [],
    features: [
      { ...base, id: `extra-${i}-f`, scope: 'shown' as const, langs: { cpp: { files: 1, code: 100, comment: 0, blank: 0, bytes: b } } },
    ],
  }));
  return { ...report, components: [...report.components, ...extra] };
}

function shownText(r: Report): string {
  const d = new Derived(r, () => defaultState(r));
  const { container } = render(ScopeNote, { d });
  const dt = [...container.querySelectorAll('dt')].find((x) => x.textContent === 'Costed but shown separately');
  return dt?.nextElementSibling?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

describe('ScopeNote', () => {
  it('names the three largest components shown separately and counts the rest', () => {
    const text = shownText(withShown([1_000, 9_000_000, 5_000_000, 7_000_000, 2_000]));
    expect(text).toMatch(/in Extra 1, Extra 3, Extra 2, and 3 other components\./);
    expect(text).toMatch(/This code is costed for reference and is not part of the headline\.$/);
  });

  it('names a single one alone', () => {
    expect(shownText(report)).toMatch(/lines in Integration suites\. This code is costed/);
  });
});
