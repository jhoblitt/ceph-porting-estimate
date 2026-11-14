// Assembling a prose page from its compiled Markdown files.

import { LIMITATION_IDS } from './variants';
import type { Report } from '../report';
import { LIMITATION_DOCS } from './content';
import type { ProseFacts } from './facts';
import { fill, resolvePath } from './placeholders';
import { type Table, buildTable } from './tables';
import type { CompiledDoc, Heading } from './types';
import type { Direction } from './variants';

export interface LimitationItem {
  id: string;
  /** The computed effect as the page prints it, e.g. `+3.6% to +18%`, or `Not sized`. */
  label: string;
  direction: Direction;
  html: string;
}

/** What a placeholder path starts from: the report's own keys, and `computed` for facts.ts's values. */
export function renderContext(report: Report, facts: ProseFacts): Record<string, unknown> {
  return { ...report, computed: facts };
}

export type RenderedSegment =
  | { kind: 'html'; html: string }
  | ({ kind: 'heading' } & Heading)
  | { kind: 'table'; id: string; table: Table }
  | { kind: 'limitations'; items: LimitationItem[] };

/**
 * The limitations in the order facts.ts computed, each its own file's HTML.
 * A limitation with no file, or a file with no limitation, is an error: the
 * list must be the computed list exactly.
 */
export function renderLimitations(
  report: Report,
  facts: ProseFacts,
  docs: Readonly<Record<string, CompiledDoc>> = LIMITATION_DOCS,
): LimitationItem[] {
  const known = new Set(LIMITATION_IDS);
  const stray = Object.keys(docs).filter((id) => !known.has(id));
  if (stray.length > 0) throw new Error(`limitation files with no computed limitation: ${stray.join(', ')}`);
  return facts.limitations.map((l) => {
    const doc = docs[l.id];
    if (!doc) throw new Error(`limitation "${l.id}" has no file content/limitations/${l.id}.md`);
    const html = renderDoc(doc, report, facts).map((seg) => {
      if (seg.kind !== 'html') throw new Error(`${doc.file}: a limitation is prose only, with no heading or table`);
      return seg.html;
    });
    return { id: l.id, label: l.label, direction: l.direction, html: html.join('') };
  });
}

/**
 * Every segment with its placeholders filled and its tables built. Throws,
 * naming the file, on a placeholder that does not resolve or a table that
 * does not exist.
 */
export function renderDoc(doc: CompiledDoc, report: Report, facts: ProseFacts): RenderedSegment[] {
  const ctx = renderContext(report, facts);
  const shown = (when: string | undefined): boolean => {
    if (when === undefined) return true;
    const negated = when.startsWith('!');
    const path = negated ? when.slice(1) : when;
    try {
      const value = resolvePath(ctx, path);
      if (typeof value !== 'boolean') throw new Error(`${JSON.stringify(value)} is not a boolean`);
      return value !== negated;
    } catch (err) {
      throw new Error(`${doc.file}: ::: if ${negated ? 'not ' : ''}${path}: ${(err as Error).message}`, { cause: err });
    }
  };
  return doc.segments.flatMap((s): RenderedSegment[] => {
    if (s.kind === 'heading') return [s];
    if (!shown(s.when)) return [];
    if (s.kind === 'html') return [{ kind: 'html', html: fill(s.html, doc.placeholders, ctx, doc.file) }];
    try {
      if (s.id === 'limitations') return [{ kind: 'limitations', items: renderLimitations(report, facts) }];
      return [{ kind: 'table', id: s.id, table: buildTable(s.id, report, facts) }];
    } catch (err) {
      throw new Error(`${doc.file}: ${(err as Error).message}`, { cause: err });
    }
  });
}

/** The page's table of contents: every h2, in order. */
export function contents(docs: readonly CompiledDoc[]): Heading[] {
  return docs.flatMap((d) => d.headings.filter((h) => h.level === 2));
}
