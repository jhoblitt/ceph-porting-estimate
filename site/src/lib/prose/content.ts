// The prose pages' compiled Markdown, in file-name order, and the heading
// ids each page has, which the hash state accepts as a section. The
// limitations on the Methods page are one file each, in an order the data
// decides (lib/prose/variants.ts), so they are kept apart, by id.

import type { SectionIds } from '../state';
import type { CompiledDoc } from './types';

export type ProseRoute = 'methods' | 'calibration';

/** The files of an `import.meta.glob(..., { eager: true, import: 'default' })`, in file-name order. */
export function docsInOrder(modules: Record<string, CompiledDoc>): CompiledDoc[] {
  return Object.keys(modules)
    .sort()
    .map((k) => modules[k] as CompiledDoc);
}

export const PAGE_DOCS: Readonly<Record<ProseRoute, readonly CompiledDoc[]>> = {
  methods: docsInOrder(import.meta.glob<CompiledDoc>('../../content/methods/*.md', { eager: true, import: 'default' })),
  calibration: docsInOrder(
    import.meta.glob<CompiledDoc>('../../content/calibration/*.md', { eager: true, import: 'default' }),
  ),
};

/** One file per limitation, by the id variants.ts gives it (the file's name without `.md`). */
export const LIMITATION_DOCS: Readonly<Record<string, CompiledDoc>> = Object.fromEntries(
  Object.entries(import.meta.glob<CompiledDoc>('../../content/limitations/*.md', { eager: true, import: 'default' })).map(
    ([path, doc]) => [path.replace(/^.*\/|\.md$/g, ''), doc],
  ),
);

export const SECTION_IDS: SectionIds = Object.fromEntries(
  Object.entries(PAGE_DOCS).map(([route, docs]) => [route, new Set(docs.flatMap((d) => d.headings.map((h) => h.id)))]),
);
