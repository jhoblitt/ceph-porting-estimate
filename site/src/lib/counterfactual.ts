// What a component of ported tests is worth to the headline. The model
// credits Ceph's existing tests against the new tests every product feature
// would otherwise need (T_new = T − R, docs/cost-model.md), so leaving a test
// component out does not lower the headline by its cost: it lowers R, and the
// new tests it stood in for come back. The only honest figure is the model
// run again without the component.

import { usd, usdExact } from './format';
import { type GroupEstimate, type Params, estimate } from './model';
import type { Component, Report, Target } from './report';

export interface TestComponentNote {
  componentId: string;
  /** The headline as it is. */
  headline: number;
  /** The headline with the component's features left out. */
  without: number;
  /** without − the headline: positive when leaving the component out would raise the headline. */
  change: number;
  /** The component's own headline cost. */
  cost: number;
}

const matchesFiles = (f: Component['features'][number]) => Object.values(f.langs).some((l) => l.files > 0);

/**
 * True for a component of ported tests: at least one headline test feature
 * that matches files, and no headline product code. Its configuration, if
 * any, is the tests' own.
 */
export function isTestComponent(c: Component): boolean {
  const headline = c.features.filter((f) => f.scope === 'headline' && matchesFiles(f));
  return headline.some((f) => f.kind === 'test') && !headline.some((f) => f.kind === 'product');
}

/** Each test component's counterfactual, by component id, in report order. */
export function testComponentNotes(
  report: Report,
  root: GroupEstimate,
  target: Target,
  modelId: string,
  params: Params,
): Map<string, TestComponentNote> {
  const notes = new Map<string, TestComponentNote>();
  for (const c of report.components) {
    if (!isTestComponent(c)) continue;
    const without: Report = {
      ...report,
      components: report.components.map((x) => (x.id === c.id ? { ...x, features: [] } : x)),
    };
    const usdWithout = estimate(without, target, modelId, params).headline.usd;
    const own = root.children.find((x): x is GroupEstimate => x.kind !== 'feature' && x.id === c.id);
    notes.set(c.id, {
      componentId: c.id,
      headline: root.headline.usd,
      without: usdWithout,
      change: usdWithout - root.headline.usd,
      cost: own?.headline.usd ?? 0,
    });
  }
  return notes;
}

export interface TestNoteText {
  /** What the component's cost is for. */
  lead: string;
  /** The counterfactual, with its sign in words. */
  effect: string;
}

/** Below this many dollars a change is no change. */
const NONE = 0.005;

/**
 * The note's sentences. The change is quoted as the page quotes money; the
 * two headlines follow in full, since a change smaller than the headline's
 * rounding would leave both printing the same figure. "Its full cost" is
 * decided on the values, so a credit too small to show at two figures is
 * still not called none.
 */
export function testNoteText(note: TestComponentNote): TestNoteText {
  const both = `model output ${usdExact(note.without)} against ${usdExact(note.headline)}`;
  const full = note.change < 0 && Math.abs(-note.change - note.cost) <= Math.max(NONE, note.cost * 1e-9);
  const lead = full
    ? "Its cost is for porting Ceph's existing tests."
    : "Its cost is for porting Ceph's existing tests, which stand in for new tests the other components would otherwise need.";
  let effect: string;
  if (Math.abs(note.change) < NONE) {
    effect = `Without it the headline would be the same, model output ${usdExact(note.headline)}.`;
  } else if (note.change > 0) {
    effect = `Without it the headline would be ${usd(note.change)} higher, not lower: ${both}.`;
  } else if (full) {
    effect = `Without it the headline would be ${usd(-note.change)} lower, its full cost: ${both}.`;
  } else {
    const lower = usd(-note.change);
    const cost = usd(note.cost);
    const not = lower === cost ? `not all of the ${cost} it costs` : `not the ${cost} it costs`;
    effect = `Without it the headline would be ${lower} lower, ${not}: ${both}.`;
  }
  return { lead, effect };
}
