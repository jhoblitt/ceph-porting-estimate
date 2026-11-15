import { describe, expect, it, vi } from 'vitest';
import { watchScrolledPast } from './viewport';

type Entry = Pick<IntersectionObserverEntry, 'isIntersecting' | 'target' | 'boundingClientRect'>;

/** An IntersectionObserver the test drives by hand. */
class FakeObserver {
  static last: FakeObserver | undefined;
  observed: Element[] = [];
  disconnected = false;
  constructor(readonly callback: (entries: Entry[]) => void) {
    FakeObserver.last = this;
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  disconnect() {
    this.disconnected = true;
  }
  /** Reports each observed element as intersecting or not, its top `top` pixels from the viewport's. */
  fire(isIntersecting: boolean, top: number) {
    this.callback(this.observed.map((target) => ({ isIntersecting, target, boundingClientRect: { top } as DOMRectReadOnly })));
  }
}

const Observer = FakeObserver as unknown as typeof IntersectionObserver;

describe('watchScrolledPast', () => {
  it('says the element is scrolled past once it leaves the viewport upwards, and not once it is back', () => {
    const el = {} as Element;
    const onchange = vi.fn();
    watchScrolledPast(el, onchange, Observer);
    const io = FakeObserver.last!;
    expect(io.observed).toEqual([el]);
    io.fire(true, 120);
    io.fire(false, -300);
    io.fire(true, -10);
    expect(onchange.mock.calls).toEqual([[false], [true], [false]]);
  });

  it('does not count an element below the viewport, as on a short screen at the top of the page, as scrolled past', () => {
    const onchange = vi.fn();
    watchScrolledPast({} as Element, onchange, Observer);
    FakeObserver.last!.fire(false, 900);
    expect(onchange.mock.calls).toEqual([[false]]);
  });

  it('reports the last entry when the observer batches several', () => {
    const el = {} as Element;
    const onchange = vi.fn();
    watchScrolledPast(el, onchange, Observer);
    FakeObserver.last!.callback([
      { isIntersecting: true, target: el, boundingClientRect: { top: 10 } as DOMRectReadOnly },
      { isIntersecting: false, target: el, boundingClientRect: { top: -200 } as DOMRectReadOnly },
    ]);
    expect(onchange.mock.calls).toEqual([[true]]);
  });

  it('stops observing when stopped', () => {
    const stop = watchScrolledPast({} as Element, vi.fn(), Observer);
    stop();
    expect(FakeObserver.last!.disconnected).toBe(true);
  });

  it('says the element is not scrolled past, and watches nothing, where there is no IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    try {
      const onchange = vi.fn();
      const stop = watchScrolledPast({} as Element, onchange);
      expect(onchange.mock.calls).toEqual([[false]]);
      stop();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
