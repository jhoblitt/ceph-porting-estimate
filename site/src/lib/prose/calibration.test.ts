import { describe, expect, it } from 'vitest';
import fixture from '../__fixtures__/report.json';
import { parseReport } from '../report';
import { calibrationAgreement } from './calibration';

const report = parseReport(fixture);

describe('calibrationAgreement', () => {
  it('finds nothing on the fixture, whose parameters are its derived values', () => {
    expect(calibrationAgreement(report)).toEqual([]);
  });

  it('names each parameter the calibration page would show with arithmetic the estimate no longer uses', () => {
    const r = structuredClone(report);
    r.assumptions.params.overhead.value = 11;
    const cw = r.assumptions.params.adjacent_uplift.cache_write;
    cw.value = 0.2;
    expect(calibrationAgreement(r)).toEqual([
      'calibration.derived.overhead is 4.1 but assumptions.params.overhead is 11',
      'calibration.derived.adjacent_uplift.cache_write is 0.16 but assumptions.params.adjacent_uplift.cache_write is 0.2',
    ]);
  });

  it('checks that the central expansion is the arithmetic the page prints', () => {
    const r = structuredClone(report);
    const c = r.calibration as { coverage: { value: number } };
    c.coverage.value = 0.5;
    expect(calibrationAgreement(r)).toEqual([
      expect.stringMatching(/^calibration\.derived\.expansion\.central is 1\.62 but product_go_tokens ÷ \(source tokens × coverage\) is 1\.296/),
    ]);
  });

  it('reports what it cannot read instead of throwing', () => {
    expect(calibrationAgreement({ ...report, calibration: {} })[0]).toMatch(/^calibration: /);
  });
});
