// @vitest-environment jsdom
// jsdom, for a real window: an element's blur must not count as the window's.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SETTLE_MS, settle } from './settle';

describe('settle', () => {
  let target: EventTarget;
  let committed: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    target = new EventTarget();
    committed = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const gate = (initial = 'a') => settle(initial, (v) => committed.push(v), { target });
  const press = (type: 'pointerdown' | 'pointerup' | 'pointercancel' | 'blur' | 'visibilitychange') =>
    target.dispatchEvent(new Event(type));

  it('commits a value once nothing has changed for the settle time', () => {
    const g = gate();
    g.push('b');
    vi.advanceTimersByTime(SETTLE_MS - 1);
    expect(committed).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(committed).toEqual(['b']);
  });

  it('commits only the last of a run of quick changes, as from a held arrow key', () => {
    const g = gate();
    for (const v of ['b', 'c', 'd']) {
      g.push(v);
      vi.advanceTimersByTime(SETTLE_MS / 2);
    }
    vi.advanceTimersByTime(SETTLE_MS);
    expect(committed).toEqual(['d']);
  });

  it('holds every change back while a pointer is down, however long it rests, and commits after it lifts', () => {
    const g = gate();
    press('pointerdown');
    g.push('b');
    vi.advanceTimersByTime(SETTLE_MS * 10);
    g.push('c');
    vi.advanceTimersByTime(SETTLE_MS * 10);
    expect(committed).toEqual([]);
    press('pointerup');
    vi.advanceTimersByTime(SETTLE_MS);
    expect(committed).toEqual(['c']);
  });

  it('treats a cancelled pointer as lifted', () => {
    const g = gate();
    press('pointerdown');
    g.push('b');
    press('pointercancel');
    vi.advanceTimersByTime(SETTLE_MS);
    expect(committed).toEqual(['b']);
  });

  for (const release of ['blur', 'visibilitychange'] as const) {
    it(`treats a press that never lifts as lifted on ${release}, as when a context menu or another window takes the release`, () => {
      const g = gate();
      press('pointerdown');
      g.push('b');
      vi.advanceTimersByTime(SETTLE_MS * 10);
      expect(committed).toEqual([]);
      press(release);
      vi.advanceTimersByTime(SETTLE_MS);
      expect(committed).toEqual(['b']);
    });

    it(`stops hearing ${release} once stopped`, () => {
      const g = gate();
      press('pointerdown');
      g.push('b');
      g.stop();
      press(release);
      vi.advanceTimersByTime(SETTLE_MS);
      expect(committed).toEqual([]);
    });
  }

  it("keeps holding when an element in the page loses focus, which is not the window's blur", () => {
    const input = document.createElement('input');
    const other = document.createElement('input');
    document.body.append(input, other);
    const committedHere: string[] = [];
    const g = settle('a', (v) => committedHere.push(v), { target: window });
    try {
      input.focus();
      window.dispatchEvent(new Event('pointerdown'));
      g.push('b');
      // A press moves focus: the old element blurs, and its blur passes the window in the capture phase.
      other.focus();
      vi.advanceTimersByTime(SETTLE_MS * 10);
      expect(committedHere).toEqual([]);
      window.dispatchEvent(new Event('pointerup'));
      vi.advanceTimersByTime(SETTLE_MS);
      expect(committedHere).toEqual(['b']);
    } finally {
      g.stop();
      input.remove();
      other.remove();
    }
  });

  it('commits nothing when the value settles where it was last committed', () => {
    const g = gate();
    g.push('b');
    g.push('a');
    vi.advanceTimersByTime(SETTLE_MS);
    expect(committed).toEqual([]);
    g.push('b');
    vi.advanceTimersByTime(SETTLE_MS);
    g.push('b');
    vi.advanceTimersByTime(SETTLE_MS);
    expect(committed).toEqual(['b']);
  });

  it('commits nothing, and stops listening, once stopped', () => {
    const g = gate();
    g.push('b');
    g.stop();
    vi.advanceTimersByTime(SETTLE_MS);
    press('pointerdown');
    press('pointerup');
    press('blur');
    press('visibilitychange');
    vi.advanceTimersByTime(SETTLE_MS);
    expect(committed).toEqual([]);
  });
});
