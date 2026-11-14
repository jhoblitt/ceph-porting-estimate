// What the front page tells a reader about the figure, for the prose pages
// under the published scenario: the break-even of each model against the
// measured one, the scale-up from the measured port, and the shares of the
// headline that are re-read context and test code. The arithmetic is
// lib/interpret.ts's; this module only applies it to one fixed selection,
// as Derived does to the reader's, and words the break-even with the
// builder the front page's matrix uses.

import { breakEven, breakEvenSentence, cacheTrafficShare, calibrationFacts, scaleUp, testCodeShare } from '../interpret';
import type { Cost, GroupEstimate, Params } from '../model';
import type { Report } from '../report';

export interface BreakEvenFacts {
  id: string;
  name: string;
  /** The headline at this model's list prices. */
  usd: number;
  /** The factor on its token counts at which it would cost what the measured model does. */
  factor: number;
  /** The break-even in the front page's words. */
  sentence: string;
}

export interface Interpretation {
  /** The model whose token use was measured, when the data names one the report lists. */
  measured: { id: string; name: string } | null;
  /** Every other model with a break-even, in report order. */
  breakEvens: BreakEvenFacts[];
  hasBreakEvens: boolean;
  /** How many times the measured port's output the headline's output is. */
  scaleUp: number | null;
  /** The two output token counts the scale-up divides, when it is known. */
  headlineOutput: number;
  portOutput: number | null;
  hasScaleUp: boolean;
  /** Cache reads and writes as a share of the measured model's headline dollars. */
  cacheShare: number | null;
  hasCacheShare: boolean;
  /** Test code, new and ported, as a share of the headline dollars. */
  testShare: number | null;
  hasTestShare: boolean;
}

/**
 * The interpretation of one selection: `costs` is the headline cost of each
 * model at the selection's target, `root` and `params` the estimate for the
 * selected model. Break-evens need every model on the same token counts,
 * which is what `sameVolumes` says.
 */
export function interpretation(
  report: Report,
  costs: Readonly<Record<string, Cost>>,
  root: GroupEstimate,
  params: Params,
  sameVolumes: boolean,
): Interpretation {
  const facts = calibrationFacts(report);
  const measuredModel = report.models.find((m) => m.id === facts.measuredModelId);
  const base = measuredModel ? costs[measuredModel.id] : undefined;
  const breakEvens: BreakEvenFacts[] = [];
  if (measuredModel && base && sameVolumes) {
    for (const m of report.models) {
      const cost = costs[m.id];
      if (m.id === measuredModel.id || !cost) continue;
      const factor = breakEven(base, cost);
      if (factor === null) continue;
      breakEvens.push({ id: m.id, name: m.name, usd: cost.usd, factor, sentence: breakEvenSentence(measuredModel.name, factor) });
    }
  }
  const up = scaleUp(root.headline.tokens.output, facts.portOutputTokens) ?? null;
  const cacheShare = base ? cacheTrafficShare(base) : null;
  const testShare = testCodeShare(root, params);
  return {
    measured: measuredModel ? { id: measuredModel.id, name: measuredModel.name } : null,
    breakEvens,
    hasBreakEvens: breakEvens.length > 0,
    scaleUp: up,
    headlineOutput: root.headline.tokens.output,
    portOutput: facts.portOutputTokens ?? null,
    hasScaleUp: up !== null,
    cacheShare,
    hasCacheShare: cacheShare !== null,
    testShare,
    hasTestShare: testShare !== null,
  };
}
