import { describe, expect, it } from 'vitest';
import fixture from '../__fixtures__/report.json';
import { resolveParams, sumTokens } from '../model';
import { usdByCategory } from '../model/cost';
import { parseReport } from '../report';
import { type Calibration, parseCalibration } from './calibration';
import { backTest, goReadEarly, goReadSentence, phaseTable, scenarioPhases } from './phases';

const report = parseReport(fixture);
const calibration = parseCalibration(report.calibration);
const rows = calibration.phases?.rows ?? [];
const opus = report.models.find((m) => m.id === 'opus-5-5');
if (!opus) throw new Error('opus');
const params = resolveParams(report, 'calibrated');

describe('phaseTable', () => {
  const table = phaseTable(calibration, 3.5);

  it("computes each phase's Go added as its end total less the previous phase's", () => {
    let before = 0;
    for (const row of rows) {
      const end = row.go_bytes.product + row.go_bytes.test;
      expect(table.find((p) => p.phase === row.phase)?.goBytesAdded).toBe(end - before);
      before = end;
    }
  });

  it('computes the rates from the rows, and an all-phases row from their totals', () => {
    const one = table.find((p) => p.phase === 1);
    const row = rows.find((r) => r.phase === 1);
    if (!one || !row) throw new Error('phase 1');
    expect(one.outputPerGoByte).toBeCloseTo((row.output * 1e6) / one.goBytesAdded, 9);
    expect(one.outputPerGoToken).toBeCloseTo(((row.output * 1e6) / one.goBytesAdded) * 3.5, 9);
    expect(one.cacheReadPerOutput).toBeCloseTo(row.cache_read / row.output, 9);
    const all = table.at(-1);
    expect(all?.phase).toBe('all');
    expect(all?.tokens.output).toBeCloseTo(rows.reduce((t, r) => t + r.output * 1e6, 0), 0);
    expect(all?.goBytesAdded).toBe(rows.reduce((t, r) => Math.max(t, r.go_bytes.product + r.go_bytes.test), 0));
  });

  it('gives no per-byte rate for a phase that added no Go', () => {
    const c = structuredClone(calibration);
    const second = c.phases?.rows[1];
    const first = c.phases?.rows[0];
    if (!second || !first) throw new Error('rows');
    second.go_bytes = { ...first.go_bytes };
    const p = phaseTable(c, 3.5).find((x) => x.phase === second.phase);
    expect(p?.goBytesAdded).toBe(0);
    expect(p?.outputPerGoByte).toBeNull();
    expect(p?.outputPerGoToken).toBeNull();
  });

  it('is empty without a phase table', () => {
    const c = structuredClone(calibration) as Calibration;
    delete c.phases;
    expect(phaseTable(c, 3.5)).toEqual([]);
  });
});

describe('backTest', () => {
  const table = phaseTable(calibration, 3.5);

  it("predicts the later phase from the earlier phase's per-Go-byte rates, in tokens and dollars", () => {
    const t = backTest(table, 1, 2, opus, params);
    if (!t) throw new Error('back-test');
    const a = table.find((p) => p.phase === 1);
    const b = table.find((p) => p.phase === 2);
    if (!a || !b) throw new Error('phases');
    const k = b.goBytesAdded / a.goBytesAdded;
    expect(t.predicted.output).toBeCloseTo(a.tokens.output * k, 3);
    expect(t.outputGap).toBeCloseTo((a.tokens.output * k) / b.tokens.output - 1, 12);
    expect(t.actualUsd).toBeCloseTo(sumTokens(usdByCategory(opus, params, b.tokens)), 6);
    expect(t.outputRateRise).toBeCloseTo((b.outputPerGoByte as number) / (a.outputPerGoByte as number) - 1, 12);
    // rgw-go's rates rose from phase 1 to phase 2, so phase 1 under-predicts.
    expect(t.outputGap).toBeLessThan(0);
    expect(t.usdGap).toBeLessThan(0);
  });

  it('is null when either phase is missing or added no Go', () => {
    expect(backTest(table, 1, 9, opus, params)).toBeNull();
    const c = structuredClone(calibration);
    const rowsC = c.phases?.rows ?? [];
    (rowsC[2] as (typeof rowsC)[number]).go_bytes = { ...(rowsC[1] as (typeof rowsC)[number]).go_bytes };
    expect(backTest(phaseTable(c, 3.5), 1, 2, opus, params)).toBeNull();
  });
});

describe('goReadEarly', () => {
  it("finds the phase whose Go is read on a day before its tokens end, and says which way that leans its rates", () => {
    const reads = goReadEarly(calibration);
    expect(reads).toEqual([
      { phase: 2, at: '239f789 (2026-11-13)', ends: '2026-11-14T00:31Z', days: 1, atSizesCommit: true },
    ]);
    expect(goReadSentence(reads)).toBe(
      "Phase 2's Go is read at 239f789 (2026-11-13), the commit the rgw-go size table measures, and its tokens run to 2026-11-14T00:31Z, the next day. " +
        "The work that produced any Go merged between the two is in phase 2's tokens but that Go is not in its bytes, " +
        "so phase 2's rates per Go byte are, if anything, slightly overstated.",
    );
  });

  it('says "slightly" only within a day, names no commit it was not read at, and says nothing when every phase is read on the day it ends', () => {
    const c = structuredClone(calibration);
    const last = c.phases?.rows.find((r) => r.phase === 2);
    if (!last) throw new Error('phase 2');
    last.go_bytes_at = '2026-11-10';
    const sentence = goReadSentence(goReadEarly(c));
    expect(sentence).toContain("Phase 2's Go is read at 2026-11-10 and its tokens run to 2026-11-14T00:31Z, four days later.");
    expect(sentence).toContain('are, if anything, overstated.');
    last.go_bytes_at = '2026-11-14';
    expect(goReadEarly(c)).toEqual([]);
    expect(goReadSentence([])).toBeNull();
    last.go_bytes_at = 'at the cut';
    expect(goReadEarly(c)).toEqual([]);
  });
});

describe('scenarioPhases', () => {
  it('needs both a low and a high scenario', () => {
    expect(scenarioPhases(report, calibration)).toEqual({ early: 1, late: 2 });
    const r = structuredClone(report);
    const s = r.assumptions.scenarios as unknown as Record<string, Record<string, unknown>>;
    delete (s['optimistic'] as Record<string, unknown>)['role'];
    expect(scenarioPhases(r, calibration)).toBeNull();
  });
});
