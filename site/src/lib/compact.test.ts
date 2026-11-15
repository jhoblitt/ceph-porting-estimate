import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/report.json';
import { compactReport, sameHeadline } from './compact';
import { estimate, resolveParams } from './model';
import { TARGETS, parseReport } from './report';

const report = parseReport(fixture);

describe('compactReport', () => {
  const compact = compactReport(report);

  it('keeps one feature per kind and difficulty of headline work, and one dependency per difficulty', () => {
    const features = compact.components.flatMap((c) => c.features);
    const classes = new Set(
      report.components.flatMap((c) => c.features.filter((f) => f.scope === 'headline').map((f) => `${f.kind}/${f.difficulty}`)),
    );
    expect(features).toHaveLength(classes.size);
    expect(features.every((f) => f.scope === 'headline')).toBe(true);
    expect(compact.dependencies.length).toBeLessThanOrEqual(5);
  });

  it('gives the same headline as the full report for every target, model, scenario and switch', () => {
    const overrideSets: Record<string, number>[] = [
      {},
      { 'toggles.include_adjacent': 1, 'toggles.clean_break': 1 },
      { test_ratio: 0.1, sloc_equivalent_bytes_per_line: 90, 'difficulty.config': 2 },
    ];
    for (const scenario of Object.keys(report.assumptions.scenarios)) {
      for (const overrides of overrideSets) {
        const params = resolveParams(report, scenario, overrides);
        for (const target of TARGETS) {
          for (const model of report.models) {
            const full = estimate(report, target, model.id, params).headline.usd;
            const cut = estimate(compact, target, model.id, params).headline.usd;
            expect(sameHeadline(cut, full), `${scenario} ${target} ${model.id} ${JSON.stringify(overrides)}`).toBe(true);
          }
        }
      }
    }
  });
});

describe('sameHeadline', () => {
  it('allows for rounding and nothing more', () => {
    expect(sameHeadline(272_627.000_000_01, 272_627)).toBe(true);
    expect(sameHeadline(272_627.01, 272_627)).toBe(false);
    expect(sameHeadline(0, 0)).toBe(true);
    expect(sameHeadline(1e-12, 0)).toBe(false);
  });
});
