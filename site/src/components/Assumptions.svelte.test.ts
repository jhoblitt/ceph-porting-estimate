// @vitest-environment jsdom
import { render } from '@testing-library/svelte';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import fixture from '../lib/__fixtures__/report.json';
import { Derived } from '../lib/derived.svelte';
import { parseReport } from '../lib/report';
import { revealAssumptions } from '../lib/reveal';
import { type AppState, defaultState } from '../lib/state';
import Assumptions from './Assumptions.svelte';

const report = parseReport(fixture);

beforeAll(() => {
  // jsdom does not lay out, so it has no scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn();
});

function setup(overrides: Record<string, number> = {}, patch: Partial<AppState> = {}) {
  const selection: AppState = { ...defaultState(report), ...patch, overrides };
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

  it('says what else the estimate rests on, and what "measured" means', () => {
    const { container } = setup();
    const lede = container.querySelector('header .lede')?.textContent ?? '';
    expect(lede).not.toMatch(/Every number/);
    expect(lede).toMatch(/bytes per token/);
    expect(container.querySelector('header .lede a')?.getAttribute('href')).toMatch(/^#\/methods\?/);
    expect(container.querySelector('.measured-means')?.textContent).toMatch(/Measured on rgw-go” means measured by that project's own script/);
  });

  it('badges each param by where it was measured, or as assumed', () => {
    const { container } = setup();
    const badge = (path: string) => container.querySelector(`[data-param-path="${path}"] .badge`)?.textContent;
    expect(badge('overhead')).toBe('Measured on rgw-go');
    expect(badge('sloc_equivalent_bytes_per_line')).toBe('Measured on Ceph');
    expect(badge('rust_factor')).toBe('Assumed');
  });

  it('says beside a control when its value zeroes the estimate or does nothing', () => {
    const { container } = setup({ expansion: 0 });
    const note = (path: string) => container.querySelector(`[data-param-path="${path}"] .param-note`)?.textContent;
    expect(note('expansion')).toBe('At 0 this alone makes the estimate $0.');
    expect(note('clean_break_discount')).toBe('No effect while “Clean break” is off.');
    expect(note('overhead')).toBe('No effect on this estimate with the other values as they are now.');
  });

  describe('the effect of each slider', () => {
    const effectOf = (container: HTMLElement, path: string) => {
      const param = container.querySelector<HTMLElement>(`[data-param-path="${path}"]`)!;
      return { effect: param.dataset['effect'], note: param.querySelector('.effect-note')?.textContent };
    };

    it('subdues each slider without effect and gives the reason, with every name from the data', () => {
      const { container } = setup();
      expect(effectOf(container, 'rust_factor')).toEqual({
        effect: 'none',
        note: 'No effect on a Go estimate; it applies to Rust and WASM estimates.',
      });
      expect(effectOf(container, 'wasm_overhead').note).toBe('No effect on a Go estimate; it applies to WASM estimates.');
      expect(effectOf(container, 'long_context_share.output')).toEqual({
        effect: 'none',
        note: 'No effect with Claude Opus 5.5, whose price sheet has no long-context prices.',
      });
      expect(effectOf(container, 'model_efficiency.fable-5-2').note).toBe(
        'No effect on this estimate; it changes the Claude Fable 5.2 row in the comparison of models.',
      );
      expect(effectOf(container, 'adjacent_uplift.output').note).toBe('No effect while “Include the work around the port” is off.');
      expect(effectOf(container, 'difficulty.glue').note).toBe('No effect: no work in this estimate is of this difficulty.');
    });

    it('names the slider at 0 that leaves a share nothing to price', () => {
      const { container } = setup({ source_read_passes: 0 }, { scenario: 'naive', model: 'gpt-6-astra' });
      expect(effectOf(container, 'long_cache_write_share').note).toBe('No effect while “Cache-write tokens per output token” is 0.');
      expect(effectOf(container, 'long_context_share.uncached').note).toBe(
        'No effect while “Uncached input tokens per output token” and “Extra uncached reads of the source” are 0.',
      );
    });

    it('gives a small effect its reach, and adds nothing to a live slider', () => {
      const { container } = setup();
      expect(effectOf(container, 'source_read_passes')).toEqual({
        effect: 'small',
        note: 'Across its range this moves the estimate by up to +0.38%, too little to change the printed figure.',
      });
      // Its downward reach is below what a percentage prints, so only the upward one is given.
      expect(effectOf(container, 'uncached_per_output').note).toBe(
        'Across its range this moves the estimate by up to +0.022%, too little to change the printed figure.',
      );
      expect(effectOf(container, 'overhead')).toEqual({ effect: 'live', note: undefined });
    });

    it('gives both ends of a reach that both print, and says one that prints at neither is less than the smallest printed', () => {
      const { container } = setup({}, { scenario: 'pessimistic' });
      expect(effectOf(container, 'difficulty.config').note).toBe(
        'Across its range this moves the estimate from −0.077% to +0.31%, too little to change the printed figure.',
      );
      expect(effectOf(container, 'adjacent_uplift.uncached')).toEqual({
        effect: 'small',
        note: 'Across its range this moves the estimate by less than 0.01%, too little to change the printed figure.',
      });
      for (const note of container.querySelectorAll('.effect-note')) expect(note.textContent).not.toMatch(/[<>][+−]?0\.01%/);
    });

    it('says what the greyed-out look means and how many sliders have it, only when any do', () => {
      const { container } = setup();
      const subdued = container.querySelectorAll('[data-effect="none"]').length;
      const all = container.querySelectorAll('[data-param-path]').length;
      expect(subdued).toBeGreaterThan(0);
      expect(container.querySelector('.inert-count')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
        `Greyed-out sliders (${subdued} of the ${all} below) have no effect on this estimate with the current selection and values. Each says why, and each can still be changed.`,
      );

      // A count of ten or fewer is printed in figures too, as the other half of the comparison is.
      const few = setup({}, { target: 'wasm', model: 'gpt-6-astra', scenario: 'pessimistic' }).container;
      const n = few.querySelectorAll('[data-effect="none"]').length;
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(10);
      expect(few.querySelector('.inert-count')?.textContent?.replace(/\s+/g, ' ').trim()).toMatch(
        new RegExp(`^Greyed-out sliders \\(${n} of the ${all} below\\) have no effect`),
      );

      const selection: AppState = { ...defaultState(report), overrides: {} };
      const real = new Derived(report, () => selection);
      const allLive = new Map(real.paramInfo.map((p) => [p.path, { kind: 'live' as const }]));
      const d = new Proxy(real, { get: (t, k) => (k === 'paramEffects' ? allLive : Reflect.get(t, k)) });
      const { container: live } = render(Assumptions, { d, selection, onselect: vi.fn() });
      expect(live.querySelector('.inert-count')).toBeNull();
    });
  });

  it('says what a clean break gives up', () => {
    const { container } = setup();
    expect(container.querySelector('.toggles')?.textContent).toMatch(
      /cannot serve existing kernel clients, existing librbd or libcephfs consumers, or existing clusters: it is a new system with Ceph's design, not a replacement\..*a guess\./,
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
