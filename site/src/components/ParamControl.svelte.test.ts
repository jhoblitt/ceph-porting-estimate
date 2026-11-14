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

// The track runs from 1 to 16 on a log scale, so position 750 of 1000 is 16^0.75 = 8.
function setup(value = 4, note?: string) {
  const onchange = vi.fn<(value: number, live: boolean) => void>();
  const { container } = render(ParamControl, {
    info,
    value,
    badge: 'Measured on rgw-go',
    ...(note === undefined ? {} : { note }),
    onchange,
    onreset: vi.fn(),
  });
  return { container, onchange, slider: screen.getByRole('slider'), box: screen.getByRole('spinbutton') as HTMLInputElement };
}

describe('ParamControl', () => {
  it('adds a history entry for the first step of a drag and replaces it for the rest', async () => {
    const { onchange, slider } = setup();
    await fireEvent.pointerDown(slider);
    await fireEvent.input(slider, { target: { value: '750' } });
    await fireEvent.input(slider, { target: { value: '875' } });
    expect(onchange.mock.calls).toEqual([
      [8, false],
      [11.3, true],
    ]);
  });

  it('starts a new entry after a drag that ended where it began, which fires no change event', async () => {
    const { onchange, slider } = setup();
    await fireEvent.pointerDown(slider);
    await fireEvent.input(slider, { target: { value: '750' } });
    await fireEvent.input(slider, { target: { value: '500' } });
    expect(onchange.mock.calls.at(-1)).toEqual([4, true]);
    onchange.mockClear();
    await fireEvent.keyDown(slider, { key: 'ArrowRight' });
    await fireEvent.input(slider, { target: { value: '550' } });
    expect(onchange.mock.calls).toEqual([[4.59, false]]);
  });

  it('puts back the value in effect after a typed entry the caller clamps or ignores', async () => {
    const { onchange, box } = setup(0);
    await fireEvent.change(box, { target: { value: '-5' } });
    expect(onchange).toHaveBeenCalledWith(-5, false);
    await tick();
    expect(box.value).toBe('0');
  });

  it('holds the track still for the length of a drag, then fits it to the new value', async () => {
    const onchange = vi.fn<(value: number, live: boolean) => void>();
    const props = { info, value: 700, badge: 'Assumed', onchange, onreset: vi.fn() };
    const { rerender } = render(ParamControl, props);
    const slider = screen.getByRole('slider') as HTMLInputElement;
    // The track runs 1 to 700, widened to reach the typed value.
    await fireEvent.pointerDown(slider);
    await fireEvent.input(slider, { target: { value: '500' } });
    const dragged = onchange.mock.calls[0]![0];
    expect(dragged).toBeCloseTo(Math.sqrt(700), 0);
    await rerender({ ...props, value: dragged });
    // Mid-drag the thumb stays where the pointer left it.
    expect(Number(slider.value)).toBeCloseTo(500, -1);
    await fireEvent.change(slider);
    // Released, the track fits the new value: 1 to 26.5, so the value is at the far end.
    expect(Number(slider.value)).toBe(1000);
  });

  it('gives the slider the value, not its position, as its spoken value', () => {
    const { slider } = setup(10.939);
    expect(slider.getAttribute('aria-valuetext')).toBe('10.9');
  });

  it('shows where the value comes from, and a note tied to the control', () => {
    const { container, box } = setup(4, 'Has no effect while the clean break is off.');
    expect(container.querySelector('.badge')?.textContent).toBe('Measured on rgw-go');
    const note = container.querySelector('.param-note')!;
    expect(note.textContent).toBe('Has no effect while the clean break is off.');
    expect(box.getAttribute('aria-describedby')).toBe(note.id);
  });
});
