import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/report.json';
import { resolveParams } from './model';
import { parseReport } from './report';
import { targetText } from './targets';

const report = parseReport(fixture);

describe('targetText', () => {
  it('reads each factor from the params in effect', () => {
    const p = resolveParams(report, 'calibrated', { rust_factor: 1.2, wasm_overhead: 1.5 });
    expect(targetText('rust', p).basis).toBe('Go × 1.2, assumed');
    expect(targetText('wasm', p).basis).toBe('Rust × 1.5, illustrative');
    expect(targetText('wasm', p).note).toContain('each Ceph feature costs its Rust figure × 1.5');
    expect(targetText('rust', p).note).toContain('Each Ceph feature costs its Go figure × 1.2');
  });

  it('applies the factor to Ceph features only, and says dependency work is costed per target', () => {
    const p = resolveParams(report, 'calibrated');
    for (const t of ['rust', 'wasm'] as const) {
      const note = targetText(t, p).note ?? '';
      expect(note).toContain('dependency work is costed for each target on its own');
      expect(note).not.toMatch(/costed as the|Every feature/);
    }
  });

  it('marks WASM alone as secondary, and says what it leaves out', () => {
    const p = resolveParams(report, 'calibrated');
    expect([targetText('go', p), targetText('rust', p), targetText('wasm', p)].map((t) => t.secondary)).toEqual([
      false,
      false,
      true,
    ]);
    const note = targetText('wasm', p).note ?? '';
    for (const lack of ['parallel threads', 'block devices', 'process execution', 'not costed', 'price of the attempt']) {
      expect(note).toContain(lack);
    }
    // WASI's limits are the adversarial review's report, as the data's wasm_overhead reason says, not a finding.
    expect(note).toContain('An adversarial review of this estimate reports that WASI lacks');
    expect(note).toContain('rated plausible rather than confirmed; no WASI build was attempted');
    expect(note).not.toMatch(/WASI has no|kernel interfaces/);
  });

  it('says the Rust factor is an assumption, and gives Go no basis', () => {
    const p = resolveParams(report, 'calibrated');
    expect(targetText('rust', p).note).toMatch(/assumption/);
    expect(targetText('go', p).basis).toBeUndefined();
  });
});
