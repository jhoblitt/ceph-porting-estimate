// Bringing parts of the assumptions panel into view. Its groups are native
// <details>, which a reader may have closed, so anything that sends the
// reader there opens what it points at first. A #fragment link cannot be
// used: it would replace the hash that holds the selection.

/** Opens every group with a changed value, then scrolls to the panel's heading and focuses it. */
export function revealAssumptions(doc: Document = document): void {
  for (const group of doc.querySelectorAll<HTMLDetailsElement>('details[data-group][data-changed="true"]')) {
    group.open = true;
  }
  const heading = doc.getElementById('assumptions-title');
  heading?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  heading?.focus({ preventScroll: true });
}

/** Opens the group holding a param, then scrolls to the param and focuses its number box. */
export function revealParam(path: string, doc: Document = document): void {
  const param = [...doc.querySelectorAll<HTMLElement>('[data-param-path]')].find((el) => el.dataset['paramPath'] === path);
  if (!param) return;
  const group = param.closest('details');
  if (group) group.open = true;
  param.scrollIntoView({ behavior: 'smooth', block: 'center' });
  param.querySelector<HTMLInputElement>('input[type="number"]')?.focus({ preventScroll: true });
}
