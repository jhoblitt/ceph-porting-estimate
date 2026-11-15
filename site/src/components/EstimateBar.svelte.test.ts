// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import fixture from '../lib/__fixtures__/report.json';
import { Derived } from '../lib/derived.svelte';
import { signedPercent, usd, usdExact } from '../lib/format';
import { type Report, TARGET_LABELS, parseReport } from '../lib/report';
import { SETTLE_MS } from '../lib/settle';
import { type AppState, defaultState } from '../lib/state';
import EstimateBar from './EstimateBar.svelte';

const report = parseReport(fixture);

/** The report with one more scenario, `zeroed`, whose published figure is $0. */
const withZeroed: Report = (() => {
  const naive = report.assumptions.scenarios['naive']!;
  const zeroed = { ...naive, overrides: { ...naive.overrides, expansion: 0, source_read_passes: 0 } };
  return { ...report, assumptions: { ...report.assumptions, scenarios: { ...report.assumptions.scenarios, zeroed } } };
})();

beforeAll(() => {
  // jsdom lays nothing out: it has no ResizeObserver and no scrollIntoView.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

/**
 * The bar over a selection the test can change. The Derived reads it
 * reactively, as the page's does; `onselect` writes it back, as the page's
 * store does.
 */
function setup(patch: Partial<AppState> = {}, show = true, r: Report = report) {
  const initial: AppState = { ...defaultState(r), ...patch };
  let selection = $state<AppState>(initial);
  const d = new Derived(r, () => selection);
  const onselect = vi.fn((next: AppState) => {
    selection = next;
  });
  const result = render(EstimateBar, { d, selection: initial, onselect, show });
  const bar = result.container.querySelector<HTMLElement>('[data-estimate-bar]')!;
  const text = (sel: string) => (bar.querySelector(sel)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const status = () => result.container.querySelector('[role="status"]')?.textContent?.trim() ?? '';
  return {
    d,
    bar,
    text,
    status,
    onselect,
    rerender: result.rerender,
    unmount: result.unmount,
    set(next: Partial<AppState>) {
      selection = { ...selection, ...next };
    },
  };
}

/** The summary's section and heading, as the page has them, for the bar to send focus to. */
function addHeading() {
  const section = document.createElement('section');
  const heading = document.createElement('h2');
  heading.id = 'summary-title';
  heading.tabIndex = -1;
  section.append(heading);
  document.body.append(section);
  vi.mocked(Element.prototype.scrollIntoView).mockClear();
  return { section, heading };
}

describe('EstimateBar', () => {
  it('is absent while the hero figure is in view, and present once it is scrolled past', async () => {
    const { bar, rerender } = setup({}, false);
    expect(bar.inert).toBe(true);
    expect(bar.dataset['shown']).toBe('false');
    await rerender({ show: true });
    expect(bar.inert).toBe(false);
    expect(bar.dataset['shown']).toBe('true');
  });

  it('prints the headline as the hero does, with the model output behind it, and names the selection', () => {
    const { d, bar, text } = setup({ target: 'rust', model: 'gpt-6-astra', scenario: 'pessimistic' });
    const figure = bar.querySelector('.figure data')!;
    expect(figure.textContent).toBe(usd(d.root.headline.usd));
    expect(figure.getAttribute('value')).toBe(String(d.root.headline.usd));
    expect(figure.getAttribute('title')).toBe(`Model output: ${usdExact(d.root.headline.usd)}`);
    const model = report.models.find((m) => m.id === 'gpt-6-astra')!;
    const scenario = report.assumptions.scenarios['pessimistic']!;
    expect(text('.selection')).toBe(`${TARGET_LABELS.rust} ${model.name} ${scenario.label}`);
  });

  it('follows the figure as it changes, not only once the change settles', async () => {
    const { d, bar, set } = setup();
    const before = d.root.headline.usd;
    set({ overrides: { overhead: 20 } });
    await tick();
    const now = bar.querySelector('.figure data')!.getAttribute('value');
    expect(Number(now)).toBe(d.root.headline.usd);
    expect(Number(now)).not.toBe(before);
  });

  it('offers neither a difference nor a reset with nothing changed', () => {
    const { bar } = setup();
    expect(bar.querySelector('.change')).toBeNull();
    expect([...bar.querySelectorAll('button')].map((b) => b.textContent?.trim())).toEqual(['↑Back to the estimate']);
  });

  it('with a change, says how far the figure is from the scenario as published, and offers the reset', () => {
    const { d, bar, text } = setup({ overrides: { overhead: 20, 'difficulty.hard': 2 } });
    expect(text('.change')).toBe(`${signedPercent(d.fromPublished!.change!)} vs. published`);
    expect(text('.change')).toMatch(/^\+/);
    expect(bar.querySelector('button.reset')?.textContent?.trim()).toBe('Reset all (2)');
  });

  it('says a change that leaves the figure as it was is 0%', () => {
    const { text } = setup({ overrides: { clean_break_discount: 0.5 } });
    expect(text('.change')).toBe('0% vs. published');
  });

  it('gives no difference against a published figure of $0, in the bar or when announced, and still offers the reset', async () => {
    vi.useFakeTimers();
    const { d, bar, status, set } = setup({}, true, withZeroed);
    set({ scenario: 'zeroed', overrides: { overhead: 20 } });
    await tick();
    expect(d.fromPublished).toEqual({ published: 0, change: null });
    expect(bar.querySelector('.change')).toBeNull();
    expect(bar.querySelector('button.reset')?.textContent?.trim()).toBe('Reset all (1)');
    vi.advanceTimersByTime(SETTLE_MS);
    await tick();
    expect(status()).toBe(`Estimate ${usd(0)}.`);
  });

  it('resets every change as the panel does, and keeps focus in the bar', async () => {
    const { bar, onselect, text } = setup({ target: 'wasm', overrides: { overhead: 20 } });
    const reset = bar.querySelector<HTMLButtonElement>('button.reset')!;
    reset.focus();
    await fireEvent.click(reset);
    expect(onselect).toHaveBeenCalledTimes(1);
    expect(onselect.mock.calls[0]![0]).toEqual({ ...defaultState(report), target: 'wasm', overrides: {} });
    await tick();
    expect(bar.querySelector('button.reset')).toBeNull();
    expect(text('.change')).toBe('');
    expect(document.activeElement).toBe(bar.querySelector('button.back'));
  });

  it('takes the reader back to the headline', async () => {
    const { section, heading } = addHeading();
    const { bar } = setup();
    await fireEvent.click(bar.querySelector('button.back')!);
    expect(section.scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(heading);
  });

  it('hands focus to the headline, without scrolling, when it hides with focus inside it', async () => {
    const { heading } = addHeading();
    const { bar, rerender } = setup({ overrides: { overhead: 20 } });
    bar.querySelector<HTMLButtonElement>('button.reset')!.focus();
    await rerender({ show: false });
    expect(document.activeElement).toBe(heading);
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it('leaves focus where it is when it hides with focus elsewhere', async () => {
    addHeading();
    const outside = document.createElement('button');
    document.body.append(outside);
    const { rerender } = setup();
    outside.focus();
    await rerender({ show: false });
    expect(document.activeElement).toBe(outside);
  });

  it('announces the new figure once, when a change settles, and nothing on arrival', async () => {
    vi.useFakeTimers();
    const { d, status, set } = setup();
    vi.advanceTimersByTime(SETTLE_MS * 2);
    expect(status()).toBe('');
    for (const overhead of [5, 10, 20]) {
      set({ overrides: { overhead } });
      await tick();
      vi.advanceTimersByTime(SETTLE_MS / 2);
      expect(status()).toBe('');
    }
    vi.advanceTimersByTime(SETTLE_MS);
    await tick();
    expect(status()).toBe(`Estimate ${usd(d.root.headline.usd)}, ${signedPercent(d.fromPublished!.change!)} vs. published.`);
  });

  it('keeps a focused control clear of it while it is on the page', () => {
    const { unmount } = setup();
    expect(document.documentElement.style.scrollPaddingTop).toMatch(/px/);
    unmount();
    expect(document.documentElement.style.scrollPaddingTop).toBe('');
  });
});
