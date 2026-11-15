// A report cut down to what the headline adds up, so the cost model can be
// evaluated many times in one update. The headline is a sum over headline
// features and dependencies of terms that are each linear in the item's
// bytes, with factors set by its kind and difficulty; so one feature per
// kind and difficulty, with its languages' counts added up, and one
// dependency per difficulty, with each target's lines added up, give the
// same headline to rounding. Work outside the headline is left out.
//
// Nothing proves that for every value of every param. What checks it: the
// derived layer compares the two headlines at the selection in effect and
// falls back to the full report where they differ; the unit tests compare
// every slider's effect on both reports (each probe end) for every selection
// on the fixture; and the build compares them on the real data at no-change
// selections, and every slider's effect for each scenario at the default
// target and model. A model change that is not linear in an item's size only
// at some values, away from all of those points, would not be caught.

import type { Component, Dependency, DependencyTarget, Difficulty, Feature, LineCounts, Report, Target } from './report';
import { TARGETS } from './report';

/** Strategies whose dependency work the model costs. */
const COSTED = new Set(['bindings', 'port']);

function addCounts(into: Record<string, LineCounts>, from: Record<string, LineCounts>): void {
  for (const [lang, c] of Object.entries(from)) {
    const sum = (into[lang] ??= { files: 0, code: 0, comment: 0, blank: 0, bytes: 0 });
    sum.files += c.files;
    sum.code += c.code;
    sum.comment += c.comment;
    sum.blank += c.blank;
    sum.bytes += c.bytes;
  }
}

function headlineFeatures(report: Report): Feature[] {
  const byClass = new Map<string, Feature>();
  for (const c of report.components) {
    for (const f of c.features) {
      if (f.scope !== 'headline') continue;
      const key = `${f.kind}/${f.difficulty}`;
      let into = byClass.get(key);
      if (!into) {
        into = { ...f, id: key, name: key, description: '', globs: [], why: '', langs: {} };
        byClass.set(key, into);
      }
      addCounts(into.langs, f.langs);
    }
  }
  return [...byClass.values()];
}

function costedDependencies(report: Report): Dependency[] {
  const byDifficulty = new Map<Difficulty, Record<Target, number>>();
  for (const d of report.dependencies) {
    for (const t of TARGETS) {
      const work = d.targets[t];
      if (!COSTED.has(work.strategy)) continue;
      const lines = byDifficulty.get(work.difficulty) ?? { go: 0, rust: 0, wasm: 0 };
      lines[t] += work.sloc_equivalent;
      byDifficulty.set(work.difficulty, lines);
    }
  }
  return [...byDifficulty].map(([difficulty, lines]) => {
    const target = (t: Target): DependencyTarget => ({
      strategy: 'port',
      package: null,
      sloc_equivalent: lines[t],
      difficulty,
      note: '',
    });
    return {
      id: difficulty,
      name: difficulty,
      used_for: '',
      submodules: [],
      submodule_size: null,
      submodule_own: null,
      targets: { go: target('go'), rust: target('rust'), wasm: target('wasm') },
    };
  });
}

/** The report with only its headline work, merged by kind and difficulty. */
export function compactReport(report: Report): Report {
  const features = headlineFeatures(report);
  const components: Component[] =
    features.length === 0
      ? []
      : [{ id: 'headline', name: 'Headline', description: '', group: report.groups[0]?.id ?? '', root: [], features }];
  return { ...report, components, dependencies: costedDependencies(report) };
}

/** Closer than this, as a share of the larger, two headlines differ only by rounding. */
const ROUNDING = 1e-9;

/** True when two headline figures are the same but for floating-point rounding. */
export function sameHeadline(a: number, b: number): boolean {
  return Math.abs(a - b) <= ROUNDING * Math.max(Math.abs(a), Math.abs(b));
}
