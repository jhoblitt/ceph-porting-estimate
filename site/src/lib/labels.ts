// The words the explorer and the dependency table use for the data's enums,
// so a reader sees what a thing is rather than its key in the YAML.

import type { ChainKey, ScopeMode } from './explorer';
import type { Difficulty, Kind, Report, Scope, Strategy } from './report';

export const SCOPE_LABELS: Record<Scope, string> = {
  headline: 'In the headline',
  shown: 'Costed, shown separately',
  'not-ported': 'Not ported',
};

export const SCOPE_MODE_LABELS: Record<ScopeMode, string> = {
  headline: 'Headline',
  costed: 'Plus shown separately',
  all: 'Everything',
};

export const KIND_LABELS: Record<Kind, string> = {
  product: 'Product code',
  test: 'Tests',
  config: 'Build and configuration',
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  config: 'Configuration',
  glue: 'Glue',
  standard: 'Standard',
  hard: 'Hard',
  extreme: 'Extreme',
};

/** What a difficulty class means and how it weighs, from the assumption's own reason. */
export function difficultyMeaning(report: Report, d: Difficulty): string {
  const q = report.assumptions.params.difficulty[d];
  return q ? q.reason : '';
}

export const STRATEGY_LABELS: Record<Strategy, string> = {
  native: 'Native',
  bindings: 'Bindings',
  port: 'Port',
  drop: 'Drop',
};

export const STRATEGY_MEANINGS: Record<Strategy, string> = {
  native: "the target's own libraries cover it, so there is no work to cost",
  bindings: 'call the existing library through bindings, which leaves glue code to write',
  port: 'rewrite the part Ceph uses in the target language',
  drop: 'not needed in the port, so there is no work to cost',
};

const LANGUAGES: Record<string, string> = {
  cpp: 'C++',
  c: 'C',
  python: 'Python',
  shell: 'Shell',
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  cmake: 'CMake',
  yaml: 'YAML',
  json: 'JSON',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  go: 'Go',
  rust: 'Rust',
  lua: 'Lua',
  java: 'Java',
  rst: 'reStructuredText',
  markdown: 'Markdown',
  binary: 'Binary files',
  cram: 'Cram tests',
  cython: 'Cython',
  dockerfile: 'Dockerfile',
  ini: 'INI',
  jinja: 'Jinja',
  jsonnet: 'Jsonnet',
  make: 'Make',
  other: 'Other',
  perl: 'Perl',
  protobuf: 'Protocol Buffers',
  text: 'Text',
  toml: 'TOML',
  xml: 'XML',
};

/** A language as people write it; a name the list lacks is shown as the counter gives it. */
export function languageLabel(lang: string): string {
  return Object.hasOwn(LANGUAGES, lang) ? (LANGUAGES[lang] as string) : lang;
}

export interface ChainText {
  label: string;
  /** What the factor stands for, in one line. */
  note: string;
}

export const CHAIN_TEXT: Record<ChainKey, ChainText> = {
  source: { label: 'Source tokens', note: 'The size the work starts from, in tokens as the model reads them.' },
  difficulty: { label: 'Difficulty', note: 'Work per line for this difficulty class.' },
  target: { label: 'Target language', note: 'Work in the target language relative to Go.' },
  expansion: { label: 'Expansion', note: 'Tokens of new code written per source token.' },
  newTests: { label: 'New tests', note: 'One plus the new tests still to write once existing tests are credited; 1 for tests and configuration.' },
  overhead: { label: 'Overhead', note: 'Output per token of code that survives; above 1 for reviews, rework and dead ends.' },
  modelEfficiency: { label: 'Model efficiency', note: 'Tokens this model needs relative to the measured one.' },
  cleanBreak: { label: 'Clean break', note: 'Output kept when compatibility is dropped; 1× when the switch is off.' },
  adjacent: { label: 'Work around the port', note: 'Defect reproduction, review and upstream work, added while that switch is on.' },
};
