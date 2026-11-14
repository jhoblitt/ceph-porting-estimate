// What the build makes of one Markdown file under src/content/.

import type { Placeholder } from './syntax';

export interface Heading {
  level: 2 | 3;
  /** The element id, a slug of the text; unique within the file. */
  id: string;
  text: string;
}

/**
 * HTML holding placeholder sentinels; a heading, which the page renders with
 * its own link; or a slot the page fills with a table built from the data.
 * `when` names a path into the render context that must hold `true` for
 * the segment to show, or, with a leading `!`, `false`.
 */
export type Segment =
  | { kind: 'html'; html: string; when?: string }
  | ({ kind: 'heading' } & Heading)
  | { kind: 'embed'; id: string; when?: string };

export interface CompiledDoc {
  /** The source path under src/content/, for error messages. */
  file: string;
  segments: Segment[];
  headings: Heading[];
  /** Indexed by the number in each sentinel. */
  placeholders: Placeholder[];
}
