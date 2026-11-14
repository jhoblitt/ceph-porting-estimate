// @vitest-environment jsdom
import { render } from '@testing-library/svelte';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import fixture from '../lib/__fixtures__/report.json';
import { Derived } from '../lib/derived.svelte';
import { parseReport } from '../lib/report';
import { revealAssumptions, revealParam } from '../lib/reveal';
import { type AppState, defaultState } from '../lib/state';
import Assumptions from './Assumptions.svelte';

const report = parseReport(fixture);

beforeAll(() => {
  // jsdom does not lay out, so it has no scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn();
});

function setup(overrides: Record<string, number> = {}) {
  const selection: AppState = { ...defaultState(report), overrides };
  const d = new Derived(report, () => selection);
  const { container } = render(Assumptions, { d, selection, onselect: vi.fn() });
  const group = (id: string) => container.querySelector<HTMLDetailsElement>(`details[data-group="${id}"]`)!;
  return { container, group };
}

describe('Assumptions', () => {
  it('shows each group open, with a count of its changed values in the summary', () => {
    const { container, group } = setup({ overhead: 3, 'difficulty.hard': 2 });
    const groups = [...container.querySelectorAll<HTMLDetailsElement>('details[data-group]')];
    expect(groups.length).toBeGreaterThan(3);
    expect(groups.every((g) => g.open)).toBe(true);
    expect(group('measured').querySelector('summary')?.textContent).toContain('1 changed');
    expect(group('difficulty').dataset['changed']).toBe('true');
    expect(group('target').querySelector('summary')?.textContent).not.toContain('changed');
  });

  it('lists the model efficiencies in report order', () => {
    const { group } = setup();
    const paths = [...group('models').querySelectorAll<HTMLElement>('[data-param-path]')].map((el) => el.dataset['paramPath']);
    expect(paths).toEqual(report.models.map((m) => `model_efficiency.${m.id}`));
  });

  it('opens a closed group when the reader is sent to one of its params', () => {
    const { group } = setup();
    group('pricing').open = false;
    revealParam('long_context_share.output');
    expect(group('pricing').open).toBe(true);
    expect(document.activeElement).toBe(
      group('pricing').querySelector('[data-param-path="long_context_share.output"] input[type="number"]'),
    );
  });

  it('opens every closed group with a change when the reader is sent to the panel', () => {
    const { group } = setup({ overhead: 3 });
    group('measured').open = false;
    group('target').open = false;
    revealAssumptions();
    expect(group('measured').open).toBe(true);
    expect(group('target').open).toBe(false);
    expect(document.activeElement?.id).toBe('assumptions-title');
  });
});
