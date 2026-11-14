import { describe, expect, it } from 'vitest';
import { globLink } from './links';
import type { Ceph } from './report';

const ceph: Ceph = { repo: 'ceph/ceph', rev: 'abc123', commit_date: '2026-11-13T09:41:27Z' };
const base = 'https://github.com/ceph/ceph';

describe('globLink', () => {
  it.each([
    ['a literal file', 'src/osd/PGTransaction.h', { href: `${base}/blob/abc123/src/osd/PGTransaction.h`, path: 'src/osd/PGTransaction.h', kind: 'file' }],
    ['a literal directory', 'src/osd/', { href: `${base}/tree/abc123/src/osd`, path: 'src/osd', kind: 'directory' }],
    ['a recursive glob', 'qa/tasks/**', { href: `${base}/tree/abc123/qa/tasks`, path: 'qa/tasks', kind: 'directory' }],
    ['a file-name glob', 'src/osd/PrimaryLogPG.*', { href: `${base}/tree/abc123/src/osd`, path: 'src/osd', kind: 'directory' }],
    ['a glob inside the last segment', 'src/rgw/rgw_*.cc', { href: `${base}/tree/abc123/src/rgw`, path: 'src/rgw', kind: 'directory' }],
    [
      'an alternation',
      'src/tools/immutable_object_cache/Cache{Server,Session}.*',
      { href: `${base}/tree/abc123/src/tools/immutable_object_cache`, path: 'src/tools/immutable_object_cache', kind: 'directory' },
    ],
    [
      'a glob mid-path',
      'src/pybind/mgr/dashboard/frontend/src/app/ceph/{cephfs,nfs}/**/*.ts',
      { href: `${base}/tree/abc123/src/pybind/mgr/dashboard/frontend/src/app/ceph`, path: 'src/pybind/mgr/dashboard/frontend/src/app/ceph', kind: 'directory' },
    ],
    ['a character class', 'src/test/[a-c]*.cc', { href: `${base}/tree/abc123/src/test`, path: 'src/test', kind: 'directory' }],
    ['an escape', 'src/odd\\*name.h', { href: `${base}/tree/abc123/src`, path: 'src', kind: 'directory' }],
  ])('links %s', (_, glob, want) => {
    expect(globLink(ceph, glob)).toEqual(want);
  });

  it.each([
    ['everything', '*'],
    ['a top-level file glob', 'CMakeLists*'],
    ['a top-level recursive glob', '**/*.py'],
    ['an empty glob', ''],
    ['a leading slash only', '/'],
  ])('gives no link for %s, which has no usable prefix', (_, glob) => {
    expect(globLink(ceph, glob)).toBeNull();
  });

  it('escapes each path segment but keeps the slashes', () => {
    expect(globLink(ceph, 'doc/a b/#notes%20.md')?.href).toBe(`${base}/blob/abc123/doc/a%20b/%23notes%2520.md`);
    expect(globLink(ceph, 'src/c++/x?.h')?.href).toBe(`${base}/tree/abc123/src/c%2B%2B`);
  });

  it('drops a leading ./ or /', () => {
    expect(globLink(ceph, './src/osd/**')?.path).toBe('src/osd');
    expect(globLink(ceph, '/src/osd/OSD.cc')?.path).toBe('src/osd/OSD.cc');
  });

  it('builds the repository and commit into the link', () => {
    const fork: Ceph = { ...ceph, repo: 'someone/ceph', rev: 'f00' };
    expect(globLink(fork, 'README.md')?.href).toBe('https://github.com/someone/ceph/blob/f00/README.md');
  });
});
