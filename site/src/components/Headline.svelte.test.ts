// @vitest-environment jsdom
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import fixture from '../lib/__fixtures__/report.json';
import { Derived } from '../lib/derived.svelte';
import { times } from '../lib/format';
import { type Report, parseReport } from '../lib/report';
import { type AppState, defaultState } from '../lib/state';
import Headline from './Headline.svelte';

const report = parseReport(fixture);

function setup(patch: Partial<AppState> = {}, r: Report = report) {
  const selection: AppState = { ...defaultState(r), ...patch };
  const d = new Derived(r, () => selection);
  const { container } = render(Headline, { d, selection });
  const text = (sel: string) => (container.querySelector(sel)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  return { d, container, text };
}

describe('Headline', () => {
  it('for the measured model, says what the figure is, what it is scaled from and what it leaves out', () => {
    const { d, container, text } = setup();
    expect(text('.answer')).toMatch(/^Porting Ceph to Go with Claude Opus 5\.5 would cost about \$/);
    expect(text('.caveat')).toBe(
      `This is the model API bill alone, at list prices, scaled up about ${times(d.scaleUp!)} times from one unfinished port ` +
        'of roughly 40% of one Ceph component; it does not include people, human review, CI, test clusters or time, and it ' +
        'is not evidence that the result would work.',
    );
    const links = [...container.querySelectorAll('.caveat a')].map((a) => a.getAttribute('href'));
    expect(links[0]).toMatch(/^#\/calibration\?/);
    expect(links[1]).toMatch(/^#\/methods\?/);
  });

  it('for another model, says it is the measured model\'s token counts at that model\'s prices', () => {
    const { text } = setup({ model: 'gpt-6-astra' });
    expect(text('.answer')).toMatch(
      /^Claude Opus 5\.5's token counts for porting Ceph to Go, billed at GPT-6 Astra's list prices, come to about \$/,
    );
  });

  it('names no measured model when the data does not', () => {
    const r = { ...report, calibration: {} };
    const { text } = setup({ model: 'gpt-6-astra' }, r);
    expect(text('.answer')).toMatch(/^Porting Ceph to Go, billed at GPT-6 Astra's list prices, would cost about/);
    expect(text('.caveat')).toContain('extrapolated from one unfinished port; it does not include');
  });

  it('gives the range from the low and high scenarios', () => {
    const { d, text } = setup();
    expect(text('.spread')).toMatch(
      /^Read this as .+ dollars, not as a quote: assumptions of the size this report already considers move it from about \$\S+ .*to about \$\S+ .*, and neither is a limit\.$/,
    );
    expect(d.range.low && d.range.high).toBeTruthy();
  });

  it('says a reference scenario is not an outcome', () => {
    const { text } = setup({ scenario: 'naive' });
    expect(text('.caveat')).toMatch(/^This is a reference point, not an outcome\./);
    expect(text('.spread')).toMatch(/^Assumptions of the size this report already considers put the same port at about/);
  });

  it('quotes the low and high scenarios as published, as the range chart draws them, when one is selected and changed', () => {
    const { d, container } = setup({ scenario: 'optimistic', overrides: { overhead: 30 } });
    const figures = [...container.querySelectorAll('.spread data')].map((x) => Number(x.getAttribute('value')));
    expect(figures).toContain(d.range.low!.preset.usd);
    expect(figures).not.toContain(d.range.low!.cost.usd);
    expect(container.querySelector('.spread')?.textContent?.replace(/\s+/g, ' ')).toMatch(/as published, and neither is a limit/);
  });

  it('says when the reader\'s changes take the figure outside the range', () => {
    const { text } = setup({ overrides: { overhead: 100 } });
    expect(text('.spread')).toMatch(/and neither is a limit\. Your changes take this figure outside that range\.$/);
    expect(setup().text('.spread')).not.toMatch(/outside/);
  });

  it('does not read a $0 figure as an order of magnitude', () => {
    const { text } = setup({ overrides: { expansion: 0 } });
    expect(text('.spread')).not.toMatch(/Read this as/);
    expect(text('.spread')).toMatch(
      /At \$0 this is not an estimate: a value in the assumptions removes the work\. Assumptions of the size this report already considers put the same port at about/,
    );
  });

  it('gives what it can of the range when a role is missing', () => {
    const { optimistic, ...rest } = report.assumptions.scenarios;
    const { role: _role, ...noRole } = optimistic!;
    const r = { ...report, assumptions: { ...report.assumptions, scenarios: { optimistic: noRole, ...rest } } };
    const { text } = setup({}, r);
    expect(text('.spread')).toMatch(/move it up to about \$\S+ .*, and that is not a limit\.$/);
  });
});
