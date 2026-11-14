import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/report.json';
import { cephCommitUrl, commitDay, parseReport, shortSha } from './report';

describe('parseReport', () => {
  it('accepts the fixture', () => {
    const report = parseReport(fixture);
    expect(report.models.map((m) => m.id)).toEqual(['fable-5-2', 'opus-5-5', 'gpt-6-astra']);
    expect(Object.keys(report.assumptions.scenarios).sort()).toEqual(['calibrated', 'naive', 'pessimistic']);
  });

  it.each([
    ['not an object', []],
    ['no ceph rev', { ...fixture, ceph: { repo: 'ceph/ceph' } }],
    ['a component without an id', { ...fixture, components: [{ features: [] }] }],
    ['a feature without an id', { ...fixture, components: [{ id: 'x', features: [{}] }] }],
    ['no models', { ...fixture, models: [] }],
    ['no scenarios', { ...fixture, assumptions: { params: {} } }],
  ])('rejects a report with %s', (_name, raw) => {
    expect(() => parseReport(raw)).toThrow(/^report\.json: /);
  });
});

describe('ceph commit links', () => {
  const ceph = { repo: 'ceph/ceph', rev: 'ec322a5b1f0d6c4e8a7b39d2f5c1e08a64b7d913', commit_date: '2026-11-13' };

  it('links the full commit', () => {
    expect(cephCommitUrl(ceph)).toBe('https://github.com/ceph/ceph/commit/ec322a5b1f0d6c4e8a7b39d2f5c1e08a64b7d913');
  });

  it('shortens the SHA to seven characters', () => {
    expect(shortSha(ceph.rev)).toBe('ec322a5');
  });
});

describe('commitDay', () => {
  it.each([
    ['2026-11-13T09:41:27Z', '2026-11-13'],
    ['2026-11-13T23:41:27-05:00', '2026-11-13'],
    ['2026-11-13', '2026-11-13'],
    ['yesterday', 'yesterday'],
  ])('shows %j as %j', (raw, shown) => {
    expect(commitDay(raw)).toBe(shown);
  });
});
