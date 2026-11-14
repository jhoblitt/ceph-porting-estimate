// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import fixture from '../lib/__fixtures__/report.json';
import { Derived } from '../lib/derived.svelte';
import { type Report, parseReport } from '../lib/report';
import { type AppState, defaultState } from '../lib/state';
import Matrix from './Matrix.svelte';

const report = parseReport(fixture);

function setup(patch: Partial<AppState> = {}, r: Report = report) {
  const selection: AppState = { ...defaultState(r), ...patch };
  const d = new Derived(r, () => selection);
  const onselect = vi.fn<(next: AppState) => void>();
  const { container } = render(Matrix, { d, selection, onselect });
  const rowText = (model: string) =>
    [...container.querySelectorAll('tbody')]
      .find((b) => b.querySelector('.model')?.textContent === model)
      ?.textContent?.replace(/\s+/g, ' ')
      .trim() ?? '';
  return { container, onselect, selection, rowText };
}

/** A fifth model: Opus's sheet at half the cache-read price. */
function withFifthModel(): Report {
  const opus = report.models.find((m) => m.id === 'opus-5-5')!;
  const model = { ...opus, id: 'cheap-1', name: 'Cheap One', usd_per_mtok: { ...opus.usd_per_mtok, cache_read: 0.1 } };
  const efficiency = report.assumptions.params.model_efficiency['opus-5-5']!;
  return {
    ...report,
    models: [...report.models, model],
    assumptions: {
      ...report.assumptions,
      params: {
        ...report.assumptions.params,
        model_efficiency: { ...report.assumptions.params.model_efficiency, 'cheap-1': efficiency },
      },
    },
  };
}

describe('Matrix', () => {
  it('has a cell for every target and model, and marks only the current one', () => {
    setup({ target: 'rust', model: 'fable-5-2' });
    const cells = screen.getAllByRole('button', { name: /with/ });
    expect(cells).toHaveLength(3 * report.models.length);
    const pressed = cells.filter((c) => c.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0]?.getAttribute('aria-label')).toMatch(/^Rust with Claude Fable 5\.2: \$\S+, model output \$[\d,]+\./);
    expect(pressed[0]?.textContent).toContain('Selected');
  });

  it('sets both target and model when a cell is chosen', async () => {
    const { onselect, selection } = setup();
    await fireEvent.click(screen.getByRole('button', { name: /^WASM with GPT-6 Astra:/ }));
    expect(onselect).toHaveBeenCalledWith({ ...selection, target: 'wasm', model: 'gpt-6-astra' });
  });

  it('marks the measured row, and gives every other row its basis and break-even', () => {
    const { rowText } = setup();
    expect(rowText('Claude Opus 5.5')).toContain('Measured');
    expect(rowText('Claude Opus 5.5')).toContain('Token use measured with this model, on rgw-go');
    expect(rowText('GPT-6 Astra')).toContain('Price sheet only');
    expect(rowText('GPT-6 Astra')).toMatch(
      /Claude Opus 5\.5's token counts at GPT-6 Astra's list prices\. It would cost the same as Claude Opus 5\.5 if it needed \d+% fewer tokens for the same work\./,
    );
  });

  it('says a cheaper sheet could need more tokens, and a fifth model reads like the rest', () => {
    const { container, rowText } = setup({}, withFifthModel());
    expect(screen.getAllByRole('button', { name: /with/ })).toHaveLength(15);
    expect(rowText('Cheap One')).toMatch(/Claude Opus 5\.5's token counts at Cheap One's list prices\. .* if it needed \d+% more tokens/);
    expect(container.querySelectorAll('.cell[style]')).toHaveLength(0);
  });

  it('labels the targets from the params, with WASM secondary', () => {
    const { container } = setup({ overrides: { wasm_overhead: 1.5 } });
    const heads = [...container.querySelectorAll('thead th')].map((th) => th.textContent?.replace(/\s+/g, ' ').trim());
    expect(heads[1]).toMatch(/^Rust Go × 1\.15, assumed/);
    expect(heads[2]).toMatch(/^WASM Rust × 1\.5, illustrative/);
    expect(container.querySelector('thead th.secondary')?.textContent).toContain('WASM');
  });

  it('names no measured model when the data does not, and claims no break-even', () => {
    const { container, rowText } = setup({}, { ...report, calibration: {} });
    expect(container.querySelector('.status')).toBeNull();
    expect(rowText('GPT-6 Astra')).toContain("Token counts priced at GPT-6 Astra's list prices.");
    expect(rowText('GPT-6 Astra')).not.toContain('would cost the same');
  });

  it('stops saying every row shares the token counts once a model efficiency is changed', () => {
    const { container, rowText } = setup({ overrides: { 'model_efficiency.kimi-k3': 1.3 } });
    expect(rowText('Claude Opus 5.5')).toContain('Token use measured with this model, on rgw-go.');
    expect(rowText('Claude Opus 5.5')).not.toContain('every row uses these token counts');
    const caption = container.querySelector('.caption')?.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(caption).toMatch(/^The rows differ because the price sheets do and because of the model efficiencies you set\./);
    expect(caption).not.toMatch(/above all the price of re-read context/);
  });

  it('words an extreme break-even as a share of the tokens, never "100% fewer"', () => {
    const { rowText } = setup({ overrides: { 'model_efficiency.gpt-6-astra': 200 } });
    expect(rowText('GPT-6 Astra')).toMatch(/only if it needed less than 1% of the tokens this row assumes\./);
    expect(rowText('GPT-6 Astra')).not.toMatch(/100% fewer/);
  });

  it('says the comparison is of price sheets, not models', () => {
    const { container } = setup();
    expect(container.querySelector('.caption')?.textContent?.replace(/\s+/g, ' ')).toMatch(
      /The rows differ because the price sheets do, above all the price of re-read context\. This is not a measurement of which model would port Ceph most cheaply/,
    );
  });
});
