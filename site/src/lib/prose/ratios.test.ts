import { describe, expect, it } from 'vitest';
import fixture from '../__fixtures__/report.json';
import { parseReport } from '../report';
import { parseCalibration } from './calibration';
import { calibrationRatios } from './ratios';

const report = parseReport(fixture);
const calibration = parseCalibration(report.calibration);
const ratios = calibrationRatios(report, calibration);
const bySymbol = (s: string) => ratios.filter((r) => r.symbol === s);

describe('calibrationRatios', () => {
  it('computes the input ratios from the port row and shows the operands', () => {
    const p = calibration.measurement.port;
    const r = bySymbol('r')[0];
    expect(r?.value).toBeCloseTo(p.cache_read / p.output, 12);
    expect(r?.arithmetic).toContain('÷');
    expect(r?.used).toBe(report.assumptions.params.cache_read_per_output.value);
  });

  it('agrees with the parameters the fixture uses, which its calibration derives', () => {
    for (const s of ['u', 'w', 'r', 'T', 'H', 'λ']) {
      const row = bySymbol(s)[0];
      expect(row?.value, s).toBeCloseTo(row?.used as number, 3);
    }
    const central = bySymbol('E')[0];
    expect(central?.value).toBeCloseTo(report.assumptions.params.expansion.value, 3);
  });

  it('divides each relative difficulty by the mean over the ported mix, and that mean matches what the data records', () => {
    const mean = bySymbol('mean')[0];
    expect(mean?.value).toBeCloseTo(calibration.ported_mix?.mean_relative_difficulty as number, 4);
    const hard = bySymbol('D[hard]')[0];
    expect(hard?.value).toBeCloseTo(1.5 / (mean?.value as number), 12);
  });

  it('computes an expansion at each coverage end', () => {
    expect(bySymbol('E')).toHaveLength(3);
    const [central, high, low] = bySymbol('E');
    expect(low?.value).toBeGreaterThan(central?.value as number);
    expect(high?.value).toBeLessThan(central?.value as number);
  });

  it('leaves out what the data does not record', () => {
    const c = structuredClone(calibration);
    delete c.ported_mix;
    delete c.phases;
    const rows = calibrationRatios(report, c);
    expect(rows.some((r) => r.symbol.startsWith('D['))).toBe(false);
    expect(rows.some((r) => r.name.startsWith('Overhead scale'))).toBe(false);
  });
});
