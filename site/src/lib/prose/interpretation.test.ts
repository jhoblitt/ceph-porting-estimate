import { describe, expect, it } from 'vitest';
import fixture from '../__fixtures__/report.json';
import { breakEven, breakEvenSentence, cacheTrafficShare, scaleUp, testCodeShare } from '../interpret';
import { estimate, matrix, resolveParams } from '../model';
import { parseReport } from '../report';
import { interpretation } from './interpretation';

const report = parseReport(fixture);
const params = resolveParams(report, report.assumptions.default_scenario);
const costs = matrix(report, params).go;
const root = estimate(report, 'go', 'opus-5-5', params);

describe('interpretation', () => {
  const i = interpretation(report, costs, root, params, true);

  it("takes each other model's break-even from interpret.ts, against the measured model", () => {
    expect(i.measured).toEqual({ id: 'opus-5-5', name: 'Claude Opus 5.5' });
    expect(i.breakEvens.map((b) => b.id)).toEqual(report.models.map((m) => m.id).filter((id) => id !== 'opus-5-5'));
    for (const b of i.breakEvens) {
      expect(b.factor).toBe(breakEven(costs['opus-5-5']!, costs[b.id]!));
      expect(b.usd).toBe(costs[b.id]!.usd);
      expect(b.sentence).toBe(breakEvenSentence('Claude Opus 5.5', b.factor));
    }
  });

  it('takes the scale-up and the two shares from interpret.ts', () => {
    expect(i.scaleUp).toBe(scaleUp(root.headline.tokens.output, 9.471e6));
    expect(i.cacheShare).toBe(cacheTrafficShare(costs['opus-5-5']!));
    expect(i.testShare).toBe(testCodeShare(root, params));
    expect([i.hasScaleUp, i.hasCacheShare, i.hasTestShare, i.hasBreakEvens]).toEqual([true, true, true, true]);
  });

  it('gives no break-evens when the models do not share token counts, or no model was measured', () => {
    expect(interpretation(report, costs, root, params, false).breakEvens).toEqual([]);
    const r = structuredClone(report);
    (r.calibration as { measurement: { model_id: string } }).measurement.model_id = 'not-listed';
    const none = interpretation(r, costs, root, params, true);
    expect(none.measured).toBeNull();
    expect(none.hasBreakEvens).toBe(false);
    expect(none.hasCacheShare).toBe(false);
  });
});
