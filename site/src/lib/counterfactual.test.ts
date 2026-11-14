import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/report.json';
import { isTestComponent, testComponentNotes, testNoteText } from './counterfactual';
import { type GroupEstimate, estimate, resolveParams } from './model';
import { type Component, type Report, parseReport } from './report';

const fixtureReport = parseReport(fixture);
const params = resolveParams(fixtureReport, 'calibrated');

function component(id: string): Component {
  const c = fixtureReport.components.find((x) => x.id === id);
  if (!c) throw new Error(`fixture has no component ${id}`);
  return c;
}

/**
 * A report built from named fixture components only, so what other
 * components the fixture gains cannot change these tests: the OSD's hard and
 * extreme product code, and the qa component of standard tests.
 */
const report: Report = { ...fixtureReport, components: [component('osd'), component('qa')] };

function headlineWithout(r: Report, componentId: string, p = params): number {
  const without = { ...r, components: r.components.map((c) => (c.id === componentId ? { ...c, features: [] } : c)) };
  return estimate(without, 'go', 'opus-5-5', p).headline.usd;
}

function componentCost(root: GroupEstimate, id: string): number {
  return (root.children.find((c) => c.id === id) as GroupEstimate).headline.usd;
}

describe('isTestComponent', () => {
  it('is true for a component whose headline features are tests, with no product code', () => {
    expect(isTestComponent(component('qa'))).toBe(true);
    expect(isTestComponent(component('rgw'))).toBe(false);
    expect(isTestComponent(component('osd'))).toBe(false);
  });

  it('ignores test features outside the headline, and those that match no file', () => {
    const qa = component('qa');
    const shownOnly = { ...qa, features: qa.features.filter((f) => f.scope !== 'headline') };
    expect(isTestComponent(shownOnly)).toBe(false);
    const empty = { ...qa, features: qa.features.map((f) => (f.kind === 'test' ? { ...f, langs: {} } : f)) };
    expect(isTestComponent(empty)).toBe(false);
  });
});

describe('testComponentNotes', () => {
  it('gives the headline without each test component, run through the model', () => {
    const root = estimate(report, 'go', 'opus-5-5', params);
    const notes = testComponentNotes(report, root, 'go', 'opus-5-5', params);
    expect([...notes.keys()]).toEqual(['qa']);
    const qa = notes.get('qa')!;
    expect(qa.headline).toBe(root.headline.usd);
    expect(qa.without).toBeCloseTo(headlineWithout(report, 'qa'), 6);
    expect(qa.change).toBeCloseTo(qa.without - root.headline.usd, 6);
    expect(qa.cost).toBeCloseTo(componentCost(root, 'qa'), 9);
  });

  it('can raise the headline: the tests stand in for dearer new tests elsewhere', () => {
    const root = estimate(report, 'go', 'opus-5-5', params);
    // The OSD's product code is hard and extreme, the qa tests standard.
    expect(testComponentNotes(report, root, 'go', 'opus-5-5', params).get('qa')!.change).toBeGreaterThan(0);
  });

  it('lowers the headline by the full cost when there is no new-test work to stand in for', () => {
    const p = resolveParams(report, 'calibrated', { test_ratio: 0 });
    const root = estimate(report, 'go', 'opus-5-5', p);
    const qa = testComponentNotes(report, root, 'go', 'opus-5-5', p).get('qa')!;
    expect(qa.change).toBeLessThan(0);
    expect(-qa.change).toBeCloseTo(qa.cost, 6);
  });

  it('notes no component without test features, nor one that mixes them with product code', () => {
    const mixed: Report = { ...fixtureReport, components: [component('osd'), component('rgw')] };
    expect(testComponentNotes(mixed, estimate(mixed, 'go', 'opus-5-5', params), 'go', 'opus-5-5', params).size).toBe(0);
  });
});

describe('testNoteText', () => {
  const note = (change: number) => ({ componentId: 'qa', headline: 100_000, without: 100_000 + change, change, cost: 9_000 });
  const STANDS_IN =
    "Its cost is for porting Ceph's existing tests, which stand in for new tests the other components would otherwise need.";

  it('says the cost is for porting existing tests that stand in for new ones', () => {
    expect(testNoteText(note(1_600)).lead).toBe(STANDS_IN);
    expect(testNoteText(note(-4_000)).lead).toBe(STANDS_IN);
  });

  it('states the sign in words, with both headlines in full so a small change still shows', () => {
    expect(testNoteText(note(1_600)).effect).toBe(
      'Without it the headline would be $1.6k higher, not lower: model output $101,600 against $100,000.',
    );
    expect(testNoteText(note(-4_000)).effect).toBe(
      'Without it the headline would be $4k lower, not the $9k it costs: model output $96,000 against $100,000.',
    );
    expect(testNoteText(note(0)).effect).toBe('Without it the headline would be the same, model output $100,000.');
  });

  it('when nothing is credited, says it costs its full cost and claims no standing in', () => {
    const full = testNoteText(note(-9_000));
    expect(full.lead).toBe("Its cost is for porting Ceph's existing tests.");
    expect(full.effect).toBe('Without it the headline would be $9k lower, its full cost: model output $91,000 against $100,000.');
  });

  it('compares values, not rounded figures: a credit under 1% is not the full cost', () => {
    const partial = testNoteText(note(-8_950));
    expect(partial.lead).toBe(STANDS_IN);
    expect(partial.effect).toBe(
      'Without it the headline would be $9k lower, not all of the $9k it costs: model output $91,050 against $100,000.',
    );
  });
});
