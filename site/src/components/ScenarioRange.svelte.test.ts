// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import fixture from '../lib/__fixtures__/report.json';
import { Derived } from '../lib/derived.svelte';
import { usd } from '../lib/format';
import { labelRows } from '../lib/placement';
import { type Report, type ScenarioRole, parseReport } from '../lib/report';
import { type AppState, defaultState } from '../lib/state';
import ScenarioRange from './ScenarioRange.svelte';

const report = parseReport(fixture);

/** Gives every element a measured size jsdom cannot; returns the undo. */
function stubSize(prop: 'clientWidth' | 'offsetWidth', size: (el: HTMLElement) => number): () => void {
  // Only HTMLElement.prototype's own descriptor is replaced; the undo puts it back, or removes the stub
  // so the inherited one (clientWidth lives on Element.prototype) shows through again.
  const own = Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop);
  Object.defineProperty(HTMLElement.prototype, prop, {
    configurable: true,
    get(this: HTMLElement) {
      return size(this);
    },
  });
  return () => {
    if (own) Object.defineProperty(HTMLElement.prototype, prop, own);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[prop];
  };
}

// The chart measures its labels; jsdom has no ResizeObserver and lays nothing out.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

function setup(patch: Partial<AppState> = {}, r: Report = report) {
  const selection: AppState = { ...defaultState(r), ...patch };
  const d = new Derived(r, () => selection);
  const onselect = vi.fn<(next: AppState) => void>();
  const { container } = render(ScenarioRange, { d, selection, onselect });
  return { container, onselect, selection };
}

describe('ScenarioRange', () => {
  it('draws the outcomes as dots and the reference scenario as a labelled tick', () => {
    const { container } = setup();
    expect(container.querySelectorAll('.plot .dot')).toHaveLength(3);
    expect(container.querySelectorAll('.plot .reference')).toHaveLength(1);
    expect(container.querySelector('.band')).not.toBeNull();
    expect(container.querySelector('.reference-label')?.textContent).toMatch(
      /^Naive: \$\S+ — a reference point, not an outcome$/,
    );
    const label = container.querySelector('.chart')?.getAttribute('aria-label') ?? '';
    expect(label).toMatch(/^As published, from \$\S+ \(Optimistic\) to \$\S+ \(Pessimistic\)\./);
    expect(label).toContain('Scaled from rgw-go');
    expect(label).toContain('(selected)');
  });

  it('places every figure label on the axis until it can be measured', () => {
    // jsdom lays nothing out, so every width is 0.
    const { container } = setup();
    const labels = [...container.querySelectorAll<HTMLElement>('.plot .figure')];
    expect(labels).toHaveLength(3);
    expect(labels.map((l) => l.style.getPropertyValue('--row'))).toEqual(['0', '0', '0']);
  });

  it('raises the labels labelRows raises, from their measured widths and the plot width', () => {
    // A narrow plot and wide labels, so neighbours collide.
    const PLOT = 120;
    const LABEL = 60;
    const restore = [
      stubSize('clientWidth', (el) => (el.classList.contains('plot') ? PLOT : 0)),
      stubSize('offsetWidth', (el) => (el.classList.contains('figure') ? LABEL : 0)),
    ];
    try {
      const { container } = setup();
      const labels = [...container.querySelectorAll<HTMLElement>('.plot .figure')];
      const want = labelRows(
        labels.map((l, i) => ({ id: String(i), center: (Number.parseFloat(l.style.left) / 100) * PLOT, width: LABEL })),
      );
      const rows = labels.map((l) => Number(l.style.getPropertyValue('--row')));
      expect(rows).toEqual(labels.map((_, i) => want.get(String(i))));
      expect(Math.max(...rows)).toBeGreaterThan(0);
      expect(container.querySelector<HTMLElement>('.plot')?.style.getPropertyValue('--rows')).toBe(String(Math.max(...rows) + 1));
    } finally {
      for (const r of restore) r();
    }
  });

  it('keeps every scenario selectable, the reference one included', async () => {
    const { onselect, selection } = setup();
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Optimistic', 'Scaled from rgw-go', 'Pessimistic', 'Naive']);
    await fireEvent.click(screen.getByRole('button', { name: 'Naive' }));
    expect(onselect).toHaveBeenCalledWith({ ...selection, scenario: 'naive' });
  });

  it('draws no band without both ends, and still draws every scenario', () => {
    const scenarios = Object.fromEntries(
      Object.entries(report.assumptions.scenarios).map(([id, s]) => {
        const { role: _role, ...rest } = s;
        return [id, rest];
      }),
    );
    const r = { ...report, assumptions: { ...report.assumptions, scenarios } };
    const { container } = setup({}, r);
    expect(container.querySelector('.band')).toBeNull();
    expect(container.querySelectorAll('.plot .dot')).toHaveLength(4);
    expect(container.querySelector('.reference-label')).toBeNull();
  });

  it('draws the scenarios as published, and the selected one with changes as its own mark', () => {
    const { container } = setup({ scenario: 'optimistic', overrides: { overhead: 30 } });
    const d = new Derived(report, () => ({ ...defaultState(report), scenario: 'optimistic', overrides: { overhead: 30 } }));
    const low = d.range.low!;
    const figures = [...container.querySelectorAll('.plot .figure')].map((f) => f.textContent);
    expect(figures).toContain(usd(low.preset.usd));
    expect(figures).not.toContain(usd(low.cost.usd));
    expect(container.querySelectorAll('.plot .dot.yours')).toHaveLength(1);
    expect(container.querySelector('.chart')?.getAttribute('aria-label')).toMatch(
      new RegExp(`^As published, from \\${usd(low.preset.usd)} \\(Optimistic\\)`),
    );
    expect(container.querySelector('.chart')?.getAttribute('aria-label')).toContain(
      `Optimistic with your changes: ${usd(low.cost.usd)}`,
    );
  });

  it('gives no tag to a role it does not know, and still lists the scenario', () => {
    const scenarios = { ...report.assumptions.scenarios, odd: { label: 'Odd', description: 'x', role: 'middle' as ScenarioRole } };
    const r = { ...report, assumptions: { ...report.assumptions, scenarios } };
    const { container } = setup({}, r);
    const row = [...container.querySelectorAll('.rows li')].find((li) => li.querySelector('.pick')?.textContent?.trim() === 'Odd');
    expect(row).toBeDefined();
    expect(row?.querySelector('.role')).toBeNull();
    expect(container.querySelectorAll('.plot .dot')).toHaveLength(4);
  });

  it('says that a change already set by the next scenario is dropped', () => {
    const { container } = setup({ overrides: { overhead: 3 } });
    expect(container.querySelector('.kept')?.textContent).toMatch(/already sets the same value: such a change is dropped/);
  });
});
