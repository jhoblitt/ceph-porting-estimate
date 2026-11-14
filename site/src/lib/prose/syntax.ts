// The placeholder syntax, shared by the build (compile.ts, loaded from
// vite.config.ts) and the browser (placeholders.ts). It imports nothing, so
// the Vite config does not pull browser modules into its typecheck.

export const FORMATTER_NAMES = [
  'text',
  'sha',
  'day',
  'list',
  'usd',
  'usdExact',
  'tokens',
  'mtok',
  'count',
  'countExact',
  'percent',
  'multiplier',
  'decimal',
  'ratio',
  'signedPercent',
  'times',
  'cardinal',
  'rate',
] as const;
export type FormatterName = (typeof FORMATTER_NAMES)[number];

export interface Placeholder {
  /** Dot-separated keys, or array indices, into the render context. */
  path: string;
  formatter: string;
}

const SEGMENT = '[A-Za-z0-9_-]+';
const EXPRESSION = new RegExp(`^\\s*(${SEGMENT}(?:\\.${SEGMENT})*)\\s*(?:\\|\\s*([A-Za-z]+)\\s*)?$`);

/** True for a dot-separated path into the render context. */
export function isPath(path: string): boolean {
  return new RegExp(`^${SEGMENT}(?:\\.${SEGMENT})*$`).test(path);
}

export function isFormatterName(name: string): name is FormatterName {
  return (FORMATTER_NAMES as readonly string[]).includes(name);
}

/** Parses the text between `{{` and `}}`. Throws on bad syntax or an unknown formatter. */
export function parsePlaceholder(expr: string): Placeholder {
  const m = EXPRESSION.exec(expr);
  if (!m) throw new Error(`malformed placeholder {{${expr}}}: want {{path.to.value | formatter}}`);
  const path = m[1] as string;
  const formatter = m[2] ?? 'text';
  if (!isFormatterName(formatter)) throw new Error(`placeholder {{${expr}}}: unknown formatter "${formatter}"`);
  return { path, formatter };
}

/**
 * What compile.ts leaves in the HTML for placeholder `i`. Letters and digits
 * only, so Markdown leaves it alone in text, link text and URLs alike.
 */
export function sentinel(i: number): string {
  return `PHLDR${i}RDLHP`;
}

/** Matches one sentinel; group 1 is its index. Global: reset lastIndex or copy before `test`. */
export const SENTINEL_PATTERN = /PHLDR(\d+)RDLHP/g;

export function hasSentinel(text: string): boolean {
  return new RegExp(SENTINEL_PATTERN.source).test(text);
}
