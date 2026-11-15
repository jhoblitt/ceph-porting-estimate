// When a value the reader is changing counts as committed: no pointer is
// held down and nothing has changed for a moment. A slider being dragged,
// a held arrow key or a run of quick clicks then commits once, at the end,
// so what is said about the change is said once and not as a stream.

/** How long a value must stay unchanged, with no pointer down, to count as committed. */
export const SETTLE_MS = 600;

export interface Settle<T> {
  /** The latest value; it commits once it settles. */
  push(value: T): void;
  /** Commit nothing more, and stop listening. */
  stop(): void;
}

/**
 * Calls `oncommit` with a pushed value once it settles, unless it equals
 * the last value committed (or `initial`, before any commit).
 * @param opts.target where pointer presses are heard: the window, in the page.
 */
export function settle<T>(initial: T, oncommit: (value: T) => void, opts: { target: EventTarget }): Settle<T> {
  let committed = initial;
  let latest = initial;
  let held = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const schedule = () => {
    cancel();
    if (held) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (latest === committed) return;
      committed = latest;
      oncommit(latest);
    }, SETTLE_MS);
  };
  const down = () => {
    held = true;
    cancel();
  };
  const up = () => {
    if (!held) return;
    held = false;
    schedule();
  };

  // Capture, so a handler that stops propagation cannot hide a press.
  const listen = { capture: true } as const;
  opts.target.addEventListener('pointerdown', down, listen);
  opts.target.addEventListener('pointerup', up, listen);
  opts.target.addEventListener('pointercancel', up, listen);
  // A press can end without a pointerup: a context menu, or a release over
  // another window. Leaving the window or the tab ends it too. Not captured,
  // so an element's blur, which does not bubble, is not taken for the window's.
  opts.target.addEventListener('blur', up);
  opts.target.addEventListener('visibilitychange', up);

  return {
    push(value) {
      latest = value;
      schedule();
    },
    stop() {
      cancel();
      opts.target.removeEventListener('pointerdown', down, listen);
      opts.target.removeEventListener('pointerup', up, listen);
      opts.target.removeEventListener('pointercancel', up, listen);
      opts.target.removeEventListener('blur', up);
      opts.target.removeEventListener('visibilitychange', up);
    },
  };
}
