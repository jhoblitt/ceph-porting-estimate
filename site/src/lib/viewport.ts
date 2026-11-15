// Where an element is relative to the viewport.

/**
 * Calls `onchange` with whether `el` is scrolled past: wholly out of view
 * above the viewport. It is called once when the observer first looks and
 * on every change after; returns the stop. An element below the viewport,
 * as on a short screen at the top of the page, is not scrolled past.
 * Without an IntersectionObserver it says "not scrolled past" once and
 * watches nothing.
 */
export function watchScrolledPast(
  el: Element,
  onchange: (past: boolean) => void,
  Observer: typeof IntersectionObserver | undefined = globalThis.IntersectionObserver,
): () => void {
  if (Observer === undefined) {
    onchange(false);
    return () => {};
  }
  const io = new Observer((entries) => {
    const last = entries.at(-1);
    if (last) onchange(!last.isIntersecting && last.boundingClientRect.top < 0);
  });
  io.observe(el);
  return () => io.disconnect();
}
