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
