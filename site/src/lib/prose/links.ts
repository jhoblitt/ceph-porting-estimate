// Links between and within the prose pages. A section rides in the hash
// with the reader's selection (state.ts validates it against the page's
// headings), so following one is an ordinary navigation: it makes a history
// entry, and Back returns to the previous section.
//
// In Markdown, write a link to another page or section as `#/calibration`
// or `#/calibration?section=coverage`; the page rewrites it to carry the
// reader's selection.

import { type AppState, ROUTES, type Route, hashFromState, routeHash } from '../state';
import { escapeHtml } from './placeholders';

/** The hash of a page, or of one of its sections, that keeps the reader's selection. */
export function pageHref(selection: AppState, route: Route, section?: string): string {
  if (section === undefined) return routeHash(selection, route);
  return hashFromState({ ...selection, route, section });
}

const INTERNAL = /href="#\/([a-z]*)(?:\?section=([a-z0-9-]+))?"/g;

/** Only the prose pages scroll to a section; the report page drops one. */
const WITH_SECTIONS: readonly Route[] = ['methods', 'calibration'];

function routeOf(name: string, section: string | undefined): Route {
  const route = name === '' ? 'report' : name;
  if (!(ROUTES as readonly string[]).includes(route)) throw new Error(`link to unknown page "${name}"`);
  if (section !== undefined && !WITH_SECTIONS.includes(route as Route)) {
    throw new Error(`link to section "${section}" of the ${route} page, which has no section links`);
  }
  return route as Route;
}

/** Every `#/route` and `#/route?section=id` link in compiled Markdown. */
export function internalLinks(html: string): { route: Route; section: string | null }[] {
  return [...html.matchAll(INTERNAL)].map((m) => ({ route: routeOf(m[1] as string, m[2]), section: m[2] ?? null }));
}

/** Compiled Markdown with each internal link pointing where pageHref would. */
export function rewriteInternalLinks(html: string, selection: AppState): string {
  return html.replace(INTERNAL, (_, route: string, section: string | undefined) => {
    return `href="${escapeHtml(pageHref(selection, routeOf(route, section), section))}"`;
  });
}
