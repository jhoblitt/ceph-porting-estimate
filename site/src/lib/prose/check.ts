// Can the prose pages render against this report? Run by content.test.ts on
// the fixture and, through vite.config.ts, on the generated report.json at
// every build, so a renamed calibration key or a removed group fails the
// build instead of leaving a blank page behind a green CI.

import { type Report, parseReport } from '../report';
import { calibrationAgreement } from './calibration';
import { PAGE_DOCS, type ProseRoute } from './content';
import { proseFacts } from './facts';
import { internalLinks } from './links';
import { renderDoc } from './page';
import { hasSentinel } from './syntax';
import type { CompiledDoc } from './types';

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** The file uses a computed figure, a table or a condition, all of which need the facts. */
function usesComputed(doc: CompiledDoc): boolean {
  return (
    doc.placeholders.some((p) => p.path.startsWith('computed.')) ||
    doc.segments.some((s) => s.kind === 'embed' || (s.kind !== 'heading' && s.when !== undefined))
  );
}

/**
 * Every problem rendering the pages against `report`: facts that do not
 * compute, placeholders that do not resolve, tables that do not build,
 * conditions that are not booleans and section links to headings that do
 * not exist. Each names the content file and the path. Empty when the pages
 * render.
 */
export function checkContent(report: Report, pages: Readonly<Record<ProseRoute, readonly CompiledDoc[]>> = PAGE_DOCS): string[] {
  let facts: ReturnType<typeof proseFacts>;
  try {
    facts = proseFacts(report);
  } catch (err) {
    const files = Object.values(pages)
      .flat()
      .filter(usesComputed)
      .map((d) => d.file);
    return [`computed figures: ${message(err)}; every figure and table in ${files.join(', ')} needs them`];
  }
  const sections = new Map(
    Object.entries(pages).map(([route, docs]) => [route, new Set(docs.flatMap((d) => d.headings.map((h) => h.id)))]),
  );
  const problems: string[] = [];
  for (const doc of Object.values(pages).flat()) {
    try {
      for (const s of renderDoc(doc, report, facts)) {
        if (s.kind === 'html' && hasSentinel(s.html)) problems.push(`${doc.file}: a placeholder was left unfilled`);
      }
    } catch (err) {
      problems.push(message(err));
    }
    for (const s of doc.segments) {
      if (s.kind !== 'html') continue;
      try {
        for (const link of internalLinks(s.html)) {
          if (link.section !== null && !sections.get(link.route)?.has(link.section)) {
            problems.push(`${doc.file}: link to section "${link.section}" of the ${link.route} page, which has no such heading`);
          }
        }
      } catch (err) {
        problems.push(`${doc.file}: ${message(err)}`);
      }
    }
  }
  return problems;
}

/** checkContent and calibrationAgreement on a report.json as the build wrote it. */
export function checkGeneratedReport(raw: unknown): string[] {
  let report: Report;
  try {
    report = parseReport(raw);
  } catch (err) {
    return [message(err)];
  }
  return [...checkContent(report), ...calibrationAgreement(report)];
}
