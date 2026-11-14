// @vitest-environment jsdom
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import fixture from '../lib/__fixtures__/report.json';
import { Derived } from '../lib/derived.svelte';
import { percent } from '../lib/format';
import { parseReport } from '../lib/report';
import { type AppState, defaultState } from '../lib/state';
import CostByCategory from './CostByCategory.svelte';

const report = parseReport(fixture);

function setup(patch: Partial<AppState> = {}) {
  const selection: AppState = { ...defaultState(report), ...patch };
  const d = new Derived(report, () => selection);
  const { container } = render(CostByCategory, { d });
  return { d, container };
}

describe('CostByCategory', () => {
  it("gives the measured model's re-read share and the test-code share, computed", () => {
    const { d, container } = setup({ model: 'gpt-6-astra' });
    const text = container.querySelector('.reading')?.textContent?.replace(/\s+/g, ' ').trim();
    expect(text).toBe(
      `Re-read context, the cache reads and writes, is about ${percent(d.cacheShare!)} of Claude Opus 5.5's figure, so the ` +
        'estimate moves almost in proportion to those two prices and to how large the prompts are. Test code, new tests and ' +
        `ported ones, is about ${percent(d.testShare!)} of the headline.`,
    );
  });

  it('says when no tokens are billed at long-context prices', () => {
    const { container } = setup();
    expect(container.querySelector('.note')?.textContent).toMatch(/272k tokens of context\. Here the estimate bills none/);
  });
});
