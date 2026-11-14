// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import fixture from '../lib/__fixtures__/report.json';
import { Derived } from '../lib/derived.svelte';
import { parseReport } from '../lib/report';
import { type AppState, defaultState } from '../lib/state';
import Matrix from './Matrix.svelte';

const report = parseReport(fixture);

function setup(patch: Partial<AppState> = {}) {
  const selection: AppState = { ...defaultState(report), ...patch };
  const d = new Derived(report, () => selection);
  const onselect = vi.fn<(next: AppState) => void>();
  render(Matrix, { d, selection, onselect });
  return { onselect, selection };
}

describe('Matrix', () => {
  it('has a cell for every target and model, and marks only the current one', () => {
    setup({ target: 'rust', model: 'fable-5-2' });
    const cells = screen.getAllByRole('button');
    expect(cells).toHaveLength(3 * report.models.length);
    const pressed = cells.filter((c) => c.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0]?.getAttribute('aria-label')).toMatch(/^Rust with Claude Fable 5\.2: \$/);
    expect(pressed[0]?.textContent).toContain('Selected');
  });

  it('sets both target and model when a cell is chosen', async () => {
    const { onselect, selection } = setup();
    await fireEvent.click(screen.getByRole('button', { name: /^WASM with GPT-6 Astra:/ }));
    expect(onselect).toHaveBeenCalledWith({ ...selection, target: 'wasm', model: 'gpt-6-astra' });
  });
});
