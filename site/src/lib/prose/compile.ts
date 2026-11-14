// Markdown → HTML for the prose pages, run at build time by the Vite plugin
// in vite.config.ts (and by the tests); no Markdown parser ships to the
// browser. Beyond CommonMark and tables, a source file may hold:
//
//   {{path | formatter}}   a figure, filled in the browser (placeholders.ts)
//   ::: <id>               on a line of its own, a table the page builds
//                          from the data (tables.ts)
//   ::: if [not] <path>    lines up to `::: end` are shown only when the
//   ::: end                path holds true (or, with `not`, false), for text
//                          that applies only to some data (a model with
//                          long-context prices)
//
// Raw HTML is escaped, bare URLs stay text, quotes stay straight, and code
// blocks take focus so a keyboard can scroll them.

import MarkdownIt, { type Env, type Token } from 'markdown-it';
import { type Placeholder, hasSentinel, isPath, parsePlaceholder, sentinel } from './syntax.js';
import type { CompiledDoc, Heading, Segment } from './types';

const md = new MarkdownIt({ html: false, linkify: false, typographer: false });

for (const rule of ['fence', 'code_block'] as const) {
  const render = md.renderer.rules[rule];
  if (!render) throw new Error(`markdown-it has no ${rule} rule`);
  md.renderer.rules[rule] = (...args) => render(...args).replace(/^<pre>/, '<pre tabindex="0">');
}

const EMBED = /^:::\s*([a-z][a-z0-9-]*)\s*$/;
const IF = /^:::\s*if\s+(.+?)\s*$/;

/** The condition after `::: if`: a path, or `not <path>`, kept as `!<path>`. */
function condition(text: string): string {
  const negated = /^not(\s+|$)/.test(text);
  const path = negated ? text.replace(/^not\s*/, '') : text;
  if (!isPath(path)) throw new Error(`malformed condition "::: if ${text}"`);
  return negated ? `!${path}` : path;
}
const END = /^:::\s*end\s*$/;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

function slug(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Replaces each `{{…}}` with its sentinel, appending to `found`. */
function extractPlaceholders(source: string, found: Placeholder[]): string {
  let out = '';
  let rest = source;
  for (;;) {
    const open = rest.indexOf('{{');
    if (open === -1) return out + rest;
    const close = rest.indexOf('}}', open + 2);
    if (close === -1) throw new Error(`unclosed {{ near "${rest.slice(open, open + 40)}"`);
    out += rest.slice(0, open) + sentinel(found.length);
    found.push(parsePlaceholder(rest.slice(open + 2, close)));
    rest = rest.slice(close + 2);
  }
}

type Part = { kind: 'md'; text: string; when?: string } | { kind: 'embed'; id: string; when?: string };

/** The source split at embed lines outside fenced code, each part marked with the condition it sits under. */
function splitEmbeds(source: string): Part[] {
  const parts: Part[] = [];
  let chunk: string[] = [];
  let fence: string | null = null;
  let when: string | undefined;
  const mark = <T extends Part>(part: T): T => (when === undefined ? part : { ...part, when });
  const flush = () => {
    if (chunk.join('').trim() !== '') parts.push(mark({ kind: 'md', text: chunk.join('\n') }));
    chunk = [];
  };
  for (const line of source.split('\n')) {
    const f = FENCE.exec(line)?.[1];
    if (f && (fence === null || f.startsWith(fence))) fence = fence === null ? f : null;
    if (fence !== null) {
      chunk.push(line);
      continue;
    }
    const cond = IF.exec(line);
    if (cond) {
      if (when !== undefined) throw new Error(`nested ::: if ${cond[1]} inside ::: if ${when}`);
      const next = condition(cond[1] as string);
      flush();
      when = next;
      continue;
    }
    if (END.test(line)) {
      if (when === undefined) throw new Error('::: end without a ::: if');
      flush();
      when = undefined;
      continue;
    }
    const embed = EMBED.exec(line);
    if (embed) {
      flush();
      parts.push(mark({ kind: 'embed', id: embed[1] as string }));
    } else {
      chunk.push(line);
    }
  }
  if (when !== undefined) throw new Error(`unclosed ::: if ${when}`);
  flush();
  return parts;
}

function plainText(inline: Token): string {
  return (inline.children ?? []).map((t) => (t.type === 'text' || t.type === 'code_inline' ? t.content : '')).join('');
}

/**
 * Renders a token stream as HTML runs separated by heading segments. A
 * heading must be a top-level h2 or h3 of fixed text with an id no earlier
 * heading in the file has.
 */
function segmentTokens(tokens: Token[], env: Env, headings: Heading[], ids: Set<string>, when?: string): Segment[] {
  const segments: Segment[] = [];
  let run: Token[] = [];
  const flush = () => {
    const html = md.renderer.render(run, md.options, env);
    if (html !== '') segments.push(when === undefined ? { kind: 'html', html } : { kind: 'html', html, when });
    run = [];
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i] as Token;
    if (t.type !== 'heading_open') {
      run.push(t);
      continue;
    }
    const text = plainText(tokens[i + 1] as Token);
    const level = Number(t.tag.slice(1));
    if (t.level !== 0) throw new Error(`heading "${text}" must be at the top level, not inside a list or quote`);
    if (level !== 2 && level !== 3) {
      throw new Error(`heading "${text}" is level ${level}; use ## or ### (the page supplies the title)`);
    }
    if (hasSentinel(text)) throw new Error(`heading "${text}" holds a placeholder; headings must be fixed text`);
    if (when !== undefined) throw new Error(`heading "${text}" inside ::: if ${when}; the contents must not depend on data`);
    const id = slug(text);
    if (id === '' || ids.has(id)) throw new Error(`duplicate heading id "${id}" from "${text}"`);
    ids.add(id);
    flush();
    const heading: Heading = { level, id, text };
    headings.push(heading);
    segments.push({ kind: 'heading', ...heading });
    i += 2; // the inline content and heading_close
  }
  flush();
  return segments;
}

/** Compiles one Markdown file. Every error names `file`. */
export function compileMarkdown(source: string, file: string): CompiledDoc {
  try {
    if (hasSentinel(source)) {
      throw new Error('the source holds a reserved placeholder sentinel');
    }
    const placeholders: Placeholder[] = [];
    const headings: Heading[] = [];
    const ids = new Set<string>();
    const segments: Segment[] = splitEmbeds(source).flatMap((part) => {
      if (part.kind === 'embed') return [part];
      const env: Env = {};
      const tokens = md.parse(extractPlaceholders(part.text, placeholders), env);
      return segmentTokens(tokens, env, headings, ids, part.when);
    });
    return { file, segments, headings, placeholders };
  } catch (err) {
    throw new Error(`${file}: ${(err as Error).message}`, { cause: err });
  }
}
