// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import type { ParamInfo } from '../lib/model';
import ParamControl from './ParamControl.svelte';

const info: ParamInfo = {
  path: 'overhead',
  label: 'Output tokens per token of finished code',
  baseline: 4,
  scenario: 4,
  measured: true,
  source: 'calibration.yaml',
  reason: 'Measured.',
};

function setup(value = 4) {
  const onchange = vi.fn<(value: number, live: boolean) => void>();
  render(ParamControl, { info, value, onchange, onreset: vi.fn() });
  return { onchange, slider: screen.getByRole('slider'), box: screen.getByRole('spinbutton') as HTMLInputElement };
}

describe('ParamControl', () => {
  it('adds a history entry for the first step of a drag and replaces it for the rest', async () => {
    const { onchange, slider } = setup();
    await fireEvent.pointerDown(slider);
    await fireEvent.input(slider, { target: { value: '5' } });
    await fireEvent.input(slider, { target: { value: '6' } });
    expect(onchange.mock.calls).toEqual([
      [5, false],
      [6, true],
    ]);
  });

  it('starts a new entry after a drag that ended where it began, which fires no change event', async () => {
    const { onchange, slider } = setup();
    await fireEvent.pointerDown(slider);
    await fireEvent.input(slider, { target: { value: '5' } });
    await fireEvent.input(slider, { target: { value: '4' } });
    onchange.mockClear();
    await fireEvent.keyDown(slider, { key: 'ArrowRight' });
    await fireEvent.input(slider, { target: { value: '4.05' } });
    expect(onchange.mock.calls).toEqual([[4.05, false]]);
  });

  it('puts back the value in effect after a typed entry the caller clamps or ignores', async () => {
    const { onchange, box } = setup(0);
    await fireEvent.change(box, { target: { value: '-5' } });
    expect(onchange).toHaveBeenCalledWith(-5, false);
    await tick();
    expect(box.value).toBe('0');
  });
});
