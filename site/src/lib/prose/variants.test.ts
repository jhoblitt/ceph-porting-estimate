import { describe, expect, it } from 'vitest';
import fixture from '../__fixtures__/report.json';
import { estimate, existingTestRatio, resolveParams, sumTokens } from '../model';
import { usdByCategory } from '../model/cost';
import { type Report, parseReport } from '../report';
import { LIMITATION_IDS, VARIANT, cacheMissEffect, limitations, securityHookEffect, smallestIsLast, variantContext } from './variants';

const report = parseReport(fixture);

/** The fixture with no scenario roles. */
function withoutRoles(): Report {
  const r = structuredClone(report);
  for (const s of Object.values(r.assumptions.scenarios)) delete (s as { role?: unknown }).role;
  return r;
}

const usdOf = (r: Report, overrides: Record<string, number> = {}) =>
  estimate(r, 'go', 'opus-5-5', resolveParams(r, 'calibrated', overrides)).headline.usd;

describe('limitations', () => {
  const ctx = variantContext(report, 'calibrated', 'go', 'opus-5-5');
  const by = Object.fromEntries(limitations(ctx).map((l) => [l.id, l]));

  it('sizes each variant by running the model with it applied', () => {
    const e = (report.calibration as { derived: { expansion: Record<string, number> } }).derived.expansion;
    expect(by['coverage']?.effect).toEqual({
      low: usdOf(report, { expansion: e['at_high_coverage'] as number }) / ctx.base - 1,
      high: usdOf(report, { expansion: e['at_low_coverage'] as number }) / ctx.base - 1,
    });
    expect(by['clean-break']?.effect?.low).toBeCloseTo(usdOf(report, { 'toggles.clean_break': 1 }) / ctx.base - 1, 12);
    const R = existingTestRatio(report, ctx.params);
    expect(by['tests']?.effect?.high).toBeCloseTo(usdOf(report, { test_ratio: ctx.params.testRatio + R }) / ctx.base - 1, 12);
  });

  it('gives each a sign the variant implies', () => {
    expect(by['clean-break']?.direction).toBe('lowers');
    expect(by['osds']?.direction).toBe('lowers');
    expect(by['adjacent']?.direction).toBe('raises');
    expect(by['python']?.direction).toBe('raises');
    expect(by['bindings']?.direction).toBe('raises');
    for (const id of ['cache-traffic', 'price-cell', 'coverage']) {
      expect(by[id]?.effect?.low).toBeLessThan(0);
      expect(by[id]?.effect?.high).toBeGreaterThan(0);
      expect(by[id]?.direction).toBe('either');
    }
  });

  it('marks as choices only what a port could choose', () => {
    expect(limitations(ctx).filter((l) => l.choice).map((l) => l.id).sort()).toEqual(['clean-break', 'osds']);
  });

  it('cannot size the harness and difficulty ranges without low and high scenarios', () => {
    expect(by['unfinished']?.effect?.low).toBeLessThan(0);
    expect(by['unfinished']?.effect?.high).toBeGreaterThan(0);
    expect(by['difficulty']?.effect?.low).toBeLessThan(0);
    const r = withoutRoles();
    const unranged = Object.fromEntries(limitations(variantContext(r, 'calibrated', 'go', 'opus-5-5')).map((l) => [l.id, l]));
    expect(unranged['unfinished']?.effect).toBeNull();
    expect(unranged['difficulty']?.effect).toBeNull();
  });

  it('lists sized items largest first, then those it cannot size, then bytes per token', () => {
    const list = limitations(ctx);
    const sized = list.filter((l) => l.effect && l.id !== 'bytes-per-token');
    const size = (l: (typeof list)[number]) => Math.max(Math.abs(l.effect?.low ?? 0), Math.abs(l.effect?.high ?? 0));
    for (let i = 1; i < sized.length; i++) expect(size(sized[i - 1] as (typeof list)[number])).toBeGreaterThanOrEqual(size(sized[i] as (typeof list)[number]));
    expect(list.at(-1)?.id).toBe('bytes-per-token');
    const firstUnsized = list.findIndex((l) => !l.effect);
    expect(list.slice(firstUnsized, -1).every((l) => !l.effect)).toBe(true);
  });

  it('cannot size one OSD without a crimson group', () => {
    const r = structuredClone(report);
    r.groups = r.groups.filter((g) => g.id !== 'crimson');
    r.components = r.components.filter((c) => c.group !== 'crimson');
    const l = limitations(variantContext(r, 'calibrated', 'go', 'opus-5-5')).find((x) => x.id === 'osds');
    expect(l?.effect).toBeNull();
  });
});

describe('cacheMissEffect', () => {
  it('reprices the headline with a share of cache reads billed as uncached input', () => {
    const ctx = variantContext(report, 'calibrated', 'go', 'opus-5-5');
    const root = estimate(report, 'go', 'opus-5-5', ctx.params);
    const t = root.headline.tokens;
    const model = report.models.find((m) => m.id === 'opus-5-5');
    if (!model) throw new Error('opus');
    const k = VARIANT.cacheMiss;
    const want = sumTokens(usdByCategory(model, ctx.params, { ...t, uncached: t.uncached + k * t.cacheRead, cacheRead: (1 - k) * t.cacheRead }));
    expect(cacheMissEffect(ctx, k)).toBeCloseTo(want / ctx.base - 1, 12);
    expect(cacheMissEffect(ctx, k)).toBeGreaterThan(0);
  });
});

describe('securityHookEffect', () => {
  it('folds the security-review row into the port row and recomputes the ratios', () => {
    const ctx = variantContext(report, 'calibrated', 'go', 'opus-5-5');
    const c = report.calibration as { measurement: { port: Record<string, number>; adjacent: Record<string, number | null | string>[] }; derived: { surviving_go_tokens: number } };
    const hook = c.measurement.adjacent.find((r) => String(r['scope']).includes('security')) as Record<string, number>;
    const p = c.measurement.port;
    const out = (p['output'] as number) + (hook['output'] as number);
    const want = usdOf(report, {
      overhead: (out * 1e6) / c.derived.surviving_go_tokens,
      uncached_per_output: (p['uncached'] as number) / out,
      cache_write_per_output: ((p['cache_write'] as number) + (hook['cache_write'] as number)) / out,
      cache_read_per_output: ((p['cache_read'] as number) + (hook['cache_read'] as number)) / out,
    });
    expect(securityHookEffect(ctx)).toBeCloseTo(want / ctx.base - 1, 12);
  });

  it('is null without a security-review row', () => {
    const r = structuredClone(report);
    const c = r.calibration as { measurement: { adjacent: { scope: string }[] } };
    c.measurement.adjacent = c.measurement.adjacent.filter((row) => !row.scope.includes('security'));
    expect(securityHookEffect(variantContext(r, 'calibrated', 'go', 'opus-5-5'))).toBeNull();
  });
});

describe('declared directions', () => {
  const ctx = variantContext(report, 'calibrated', 'go', 'opus-5-5');
  const list = limitations(ctx);

  it('agree with every sized effect, or the effect is none', () => {
    for (const l of list.filter((x) => x.effect)) expect([l.declared, 'none'], l.id).toContain(l.direction);
  });

  it('give an unsized item its declared direction', () => {
    for (const l of list.filter((x) => !x.effect)) expect(l.direction, l.id).toBe(l.declared);
    expect(list.find((l) => l.id === 'release-floors')?.direction).toBe('lowers');
  });

  it("list long prompts only where a model has long-context prices, with no change to a model that has none", () => {
    const lp = list.find((l) => l.id === 'long-prompts');
    expect(lp?.effect).toEqual({ low: 0, high: 0 });
    expect(lp?.direction).toBe('none');
    const astra = limitations(variantContext(report, 'calibrated', 'go', 'gpt-6-astra')).find((l) => l.id === 'long-prompts');
    expect(astra?.direction).toBe('raises');
    const r = structuredClone(report);
    for (const m of r.models) m.long_context = null;
    expect(limitations(variantContext(r, 'calibrated', 'go', 'opus-5-5')).some((l) => l.id === 'long-prompts')).toBe(false);
    expect(LIMITATION_IDS).toContain('long-prompts');
  });
});

describe('smallestIsLast', () => {
  const sized = (id: string, e: number) => ({ id, effect: { low: -e, high: e }, direction: 'either' as const, declared: 'either' as const, choice: false, phrase: id, plural: false, ends: 'chosen' as const });
  const unsized = { ...sized('u', 0), effect: null };

  it('is true only when the last item is sized and no sized item moves the figure less', () => {
    expect(smallestIsLast([sized('a', 0.3), unsized, sized('bpt', 0.02)])).toBe(true);
    expect(smallestIsLast([sized('a', 0.01), sized('bpt', 0.02)])).toBe(false);
    expect(smallestIsLast([sized('a', 0.3), unsized])).toBe(false);
  });

  it('holds on the fixture as computed', () => {
    const list = limitations(variantContext(report, 'calibrated', 'go', 'opus-5-5'));
    const last = list.at(-1)?.effect as { low: number; high: number };
    const m = (e: { low: number; high: number }) => Math.max(Math.abs(e.low), Math.abs(e.high));
    const others = list.slice(0, -1).filter((l) => l.effect).map((l) => m(l.effect as { low: number; high: number }));
    expect(smallestIsLast(list)).toBe(others.every((x) => x >= m(last)));
  });
});

describe("where each range's ends come from", () => {
  it("marks the unfinished port, measured on rgw-go's phases, and the multipliers and judgements this report chose", () => {
    const by = Object.fromEntries(limitations(variantContext(report, 'calibrated', 'go', 'opus-5-5')).map((l) => [l.id, l]));
    expect(by['unfinished']?.ends).toBe('measured');
    for (const id of ['cache-traffic', 'price-cell', 'coverage', 'difficulty', 'bytes-per-token']) expect(by[id]?.ends, id).toBe('chosen');
  });
});

