// Links from a feature's path globs to that place in ceph/ceph at the commit
// the counts were taken from. A glob is matched the way rollup matches it
// (doublestar): a pattern without metacharacters names one file, and
// everything before the first metacharacter is literal.

import type { Ceph } from './report';

export interface GlobLink {
  href: string;
  /** The path the link opens. */
  path: string;
  kind: 'file' | 'directory';
}

/** Rollup's metacharacters (internal/rollup/match.go, literalPrefix); a backslash counts as one. */
const META = /[*?[{\\]/;

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

/**
 * A link to the glob's literal file, or to the deepest directory its literal
 * prefix names; null when the prefix names no directory, as with `*` or
 * `CMakeLists*`, since a link to the whole repository says nothing.
 */
export function globLink(ceph: Ceph, glob: string): GlobLink | null {
  const pattern = glob.replace(/^(\.\/|\/)+/, '');
  const meta = META.exec(pattern);
  let path: string;
  let kind: GlobLink['kind'];
  if (meta === null) {
    kind = pattern.endsWith('/') ? 'directory' : 'file';
    path = pattern.replace(/\/+$/, '');
  } else {
    kind = 'directory';
    const prefix = pattern.slice(0, meta.index);
    path = prefix.slice(0, prefix.lastIndexOf('/') + 1).replace(/\/+$/, '');
  }
  if (path === '') return null;
  const view = kind === 'file' ? 'blob' : 'tree';
  return { href: `https://github.com/${ceph.repo}/${view}/${encodeURIComponent(ceph.rev)}/${encodePath(path)}`, path, kind };
}
