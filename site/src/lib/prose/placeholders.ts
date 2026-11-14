// Placeholders in the prose pages' Markdown: `{{path.into.context | formatter}}`.
// The build (compile.ts) parses each one and leaves a sentinel in the HTML;
// the page fills the sentinels from the report and the values computed for
// it. A path that does not resolve, or a formatter that does not exist,
// throws: a figure must never render as an empty string.

import {
  cardinal,
  count,
  countExact,
  decimal,
  list,
  multiplier,
  paramValue,
  percent,
  rate,
  signedPercent,
  times,
  tokens,
  usd,
  usdExact,
} from '../format';
import { commitDay, shortSha } from '../report';
import { type FormatterName, type Placeholder, SENTINEL_PATTERN, isFormatterName } from './syntax';

export { type Placeholder, SENTINEL_PATTERN, parsePlaceholder, sentinel } from './syntax';

function needsNumber(name: string, fmt: (n: number) => string): (v: unknown) => string {
  return (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`formatter "${name}" needs a finite number`);
    return fmt(v);
  };
}

function needsString(name: string, fmt: (s: string) => string): (v: unknown) => string {
  return (v) => {
    if (typeof v !== 'string' || v === '') throw new Error(`formatter "${name}" needs a string`);
    return fmt(v);
  };
}

/** Each formatter takes the resolved value and returns text, not yet escaped. */
export const FORMATTERS: Readonly<Record<FormatterName, (v: unknown) => string>> = Object.freeze({
  text: needsString('text', (s) => s),
  sha: needsString('sha', shortSha),
  day: needsString('day', commitDay),
  list: (v: unknown) => {
    if (!Array.isArray(v) || !v.every((s) => typeof s === 'string')) {
      throw new Error('formatter "list" needs a list of strings');
    }
    if (v.length === 0) throw new Error('formatter "list" needs a non-empty list; guard the sentence with ::: if');
    return list(v);
  },
  usd: needsNumber('usd', usd),
  usdExact: needsNumber('usdExact', usdExact),
  tokens: needsNumber('tokens', tokens),
  /** A value given in millions of tokens, as calibration.yaml gives them. */
  mtok: needsNumber('mtok', (n) => tokens(n * 1e6)),
  count: needsNumber('count', count),
  countExact: needsNumber('countExact', countExact),
  percent: needsNumber('percent', percent),
  multiplier: needsNumber('multiplier', multiplier),
  decimal: needsNumber('decimal', decimal),
  /** A parameter or a ratio of measured quantities, to three significant figures, as the assumptions panel prints one. */
  ratio: needsNumber('ratio', paramValue),
  /** A change as a fraction, with its sign: +8.1%, −31%. */
  signedPercent: needsNumber('signedPercent', signedPercent),
  /** How many times, for prose: "about {{x | times}} times". */
  times: needsNumber('times', times),
  /** A count in running prose, in words up to ten. */
  cardinal: needsNumber('cardinal', cardinal),
  /** A rate to two decimals, for rates printed side by side. */
  rate: needsNumber('rate', rate),
});

/** The value at `path`, through own properties only. Throws on a path that does not resolve. */
export function resolvePath(ctx: unknown, path: string): unknown {
  let node = ctx;
  for (const key of path.split('.')) {
    const own =
      typeof node === 'object' &&
      node !== null &&
      Object.hasOwn(node, key) &&
      !(Array.isArray(node) && !/^\d+$/.test(key));
    if (!own) throw new Error(`unknown path "${path}": no "${key}"`);
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c] as string);
}

/** One placeholder's text, formatted and escaped for HTML text or an attribute value. */
export function substitute(ctx: unknown, p: Placeholder): string {
  if (!isFormatterName(p.formatter)) throw new Error(`unknown formatter "${p.formatter}"`);
  const value = resolvePath(ctx, p.path);
  if (value === null || value === undefined) throw new Error(`path "${p.path}" is ${String(value)}`);
  if (typeof value === 'object' && !Array.isArray(value)) throw new Error(`path "${p.path}" is an object`);
  return escapeHtml(FORMATTERS[p.formatter](value));
}

/** The HTML with every sentinel replaced. `file` names the source in errors. */
export function fill(html: string, placeholders: readonly Placeholder[], ctx: unknown, file = 'markdown'): string {
  return html.replace(SENTINEL_PATTERN, (_, n: string) => {
    const p = placeholders[Number(n)];
    if (!p) throw new Error(`${file}: no placeholder ${n}`);
    try {
      return substitute(ctx, p);
    } catch (err) {
      throw new Error(`${file}: {{${p.path} | ${p.formatter}}}: ${(err as Error).message}`, { cause: err });
    }
  });
}
