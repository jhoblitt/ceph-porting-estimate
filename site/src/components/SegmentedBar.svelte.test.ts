// @vitest-environment jsdom
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import type { Part } from '../lib/categories';
import SegmentedBar from './SegmentedBar.svelte';

const part = (key: string, share: number): Part => ({ key, label: key, series: 1, share, text: key, title: `${key} title` });

describe('SegmentedBar', () => {
  it('draws each part at its true place, ending exactly at the bar length', () => {
    const { container } = render(SegmentedBar, {
      label: 'Bar',
      parts: [part('a', 0.6), part('tiny', 0.0001), part('b', 0.3999)],
      length: 0.25,
    });
    const parts = [...container.querySelectorAll<HTMLElement>('.part')];
    expect(parts).toHaveLength(3);
    const left = parts.map((p) => Number.parseFloat(p.style.left));
    const width = parts.map((p) => Number.parseFloat(p.style.width));
    expect(left[0]).toBe(0);
    expect(width[0]).toBeCloseTo(15, 9);
    expect(width[1]).toBeCloseTo(0.0025, 9);
    expect(left[2]! + width[2]!).toBeCloseTo(25, 9);
  });

  it('names every part in its accessible name, and draws none at zero', () => {
    const { container } = render(SegmentedBar, { label: 'Bar', parts: [part('a', 1), part('z', 0)] });
    expect(container.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Bar: a title; z title');
    expect(container.querySelectorAll('.part')).toHaveLength(1);
  });
});
