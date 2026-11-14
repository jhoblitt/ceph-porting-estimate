import { get } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/report.json';
import { parseReport, type Report } from './report';
import {
  type AppState,
  type HashLocation,
  type SectionIds,
  createStateStore,
  routeHash,
  defaultState,
  hashFromState,
  parseHash,
  stateFromHash,
} from './state';

const report = parseReport(fixture);

const defaults: AppState = {
  route: 'report',
  target: 'go',
  model: 'opus-5-5',
  scenario: 'calibrated',
  path: [],
  overrides: {},
};

describe('stateFromHash defaults', () => {
  it.each(['', '#', '#/', '#/?'])('yields the defaults for %j', (hash) => {
    expect(stateFromHash(hash, report)).toEqual(defaults);
  });

  it('matches defaultState', () => {
    expect(defaultState(report)).toEqual(defaults);
  });
});

describe('round trip through the hash', () => {
  const full: AppState = {
    route: 'calibration',
    target: 'wasm',
    model: 'gpt-6-astra',
    scenario: 'pessimistic',
    path: ['rgw', 'rgw-multisite'],
    overrides: { 'difficulty.hard': 2.5, expansion: 1.4, 'long_context_share.cache_read': 0.25 },
  };

  it('preserves every field at once', () => {
    expect(stateFromHash(hashFromState(full), report)).toEqual(full);
  });

  it.each([
    ['route', { route: 'methods' }],
    ['target', { target: 'rust' }],
    ['model', { model: 'fable-5-2' }],
    ['scenario', { scenario: 'naive' }],
    ['component path', { path: ['osd'] }],
    ['feature path', { path: ['qa', 'qa-suites'] }],
    ['dependency path', { path: ['dependencies', 'rocksdb'] }],
    ['overrides', { overrides: { overhead: 3.75, 'adjacent_uplift.output': 0 } }],
    ['tiny and huge numbers', { overrides: { overhead: 1e-7, cache_read_per_output: 2e21 } }],
  ] satisfies [string, Partial<AppState>][])('preserves %s', (_name, patch) => {
    const state = { ...defaults, ...patch };
    expect(stateFromHash(hashFromState(state), report)).toEqual(state);
  });

  it('serialises the same state to the same hash', () => {
    const a = hashFromState({ ...defaults, overrides: { overhead: 2, expansion: 1 } });
    const b = hashFromState({ ...defaults, overrides: { expansion: 1, overhead: 2 } });
    expect(a).toBe(b);
  });

  it('puts the route in the hash path', () => {
    expect(hashFromState({ ...defaults, route: 'methods' })).toMatch(/^#\/methods\?/);
    expect(hashFromState({ ...defaults, route: 'calibration' })).toMatch(/^#\/calibration\?/);
    expect(hashFromState(defaults)).toMatch(/^#\/\?/);
  });

  it('always carries target, model and scenario so a shared link is stable', () => {
    const params = new URLSearchParams(hashFromState(defaults).split('?')[1]);
    expect(params.get('target')).toBe('go');
    expect(params.get('model')).toBe('opus-5-5');
    expect(params.get('scenario')).toBe('calibrated');
  });
});

describe('path segments with reserved characters', () => {
  /** The fixture with a component and a feature whose ids need escaping. */
  const odd = (componentId: string, featureId: string): Report => {
    const c = report.components[0]!;
    return { ...report, components: [...report.components, { ...c, id: componentId, features: [{ ...c.features[0]!, id: featureId }] }] };
  };

  it.each([
    ['a slash', 'a/b', 'c/d'],
    ['query and fragment characters', 'a?b#c', 'd&e=f'],
    ['a percent sign and a plus', '50%+more', 'x%2Fy'],
    ['spaces and non-ASCII', 'a b', 'é ✓'],
  ])('round-trips %s', (_name, componentId, featureId) => {
    const r = odd(componentId, featureId);
    const state = { ...defaults, path: [componentId, featureId] };
    const hash = hashFromState(state);
    expect(stateFromHash(hash, r)).toEqual(state);
    expect(parseHash(hash).path).toEqual([componentId, featureId]);
  });

  it('splits only on a literal slash, and decodes each segment', () => {
    expect(parseHash('#/?path=a%2Fb/c').path).toEqual(['a/b', 'c']);
    expect(parseHash('#/?target=go&path=x%20y/z&model=m').path).toEqual(['x y', 'z']);
  });

  it('drops a path with a broken escape rather than guessing', () => {
    expect(parseHash('#/?path=rgw/%E0%A4%A').path).toEqual([]);
  });
});

describe('malformed hashes', () => {
  it.each([
    ['a broken percent escape', '#%E0%A4%A'],
    ['a lone percent sign', '#/%'],
    ['no leading slash', '#garbage'],
    ['separators only', '#/??&&==&'],
    ['a key with no value', '#/methods?target'],
    ['empty values', '#/?target=&model=&scenario=&path='],
    ['a path of slashes', '#/?path=%2F%2F%2F'],
    ['override keys with no param', '#/?o.=1&o..=2&o=3'],
    ['control and non-characters', '#\u0000￿'],
    ['a very long hash', '#/?' + 'x'.repeat(10_000)],
  ])('does not throw and falls back to defaults for %s', (_name, hash) => {
    const state = stateFromHash(hash, report);
    expect(state.target).toBe('go');
    expect(state.model).toBe('opus-5-5');
    expect(state.scenario).toBe('calibrated');
    expect(state.path).toEqual([]);
    expect(state.overrides).toEqual({});
  });

  it('keeps the valid fields of a partly malformed hash', () => {
    const state = stateFromHash('#/?target=rust&model=%E0%A4%A&path=rgw', report);
    expect(state).toEqual({ ...defaults, target: 'rust', path: ['rgw'] });
  });
});

describe('unknown values fall back to defaults', () => {
  it('unknown target', () => {
    expect(stateFromHash('#/?target=cobol', report).target).toBe('go');
  });

  it('target is case-sensitive', () => {
    expect(stateFromHash('#/?target=Rust', report).target).toBe('go');
  });

  it('unknown model', () => {
    expect(stateFromHash('#/?model=gpt-2', report).model).toBe('opus-5-5');
  });

  it('unknown scenario', () => {
    expect(stateFromHash('#/?scenario=heroic', report).scenario).toBe('calibrated');
  });

  it('inherited object keys are not scenarios', () => {
    expect(stateFromHash('#/?scenario=toString', report).scenario).toBe('calibrated');
    expect(stateFromHash('#/?scenario=__proto__', report).scenario).toBe('calibrated');
  });

  it('unknown route', () => {
    expect(stateFromHash('#/nope?target=rust', report)).toEqual({ ...defaults, target: 'rust' });
  });

  it('uses the first model and the report default scenario when the fixed defaults are absent', () => {
    const other: Report = {
      ...report,
      models: report.models.filter((m) => m.id !== 'opus-5-5'),
      assumptions: {
        ...report.assumptions,
        scenarios: { naive: report.assumptions.scenarios['naive']!, pessimistic: report.assumptions.scenarios['pessimistic']! },
        default_scenario: 'pessimistic',
      },
    };
    expect(defaultState(other)).toEqual({ ...defaults, model: 'fable-5-2', scenario: 'pessimistic' });
    expect(stateFromHash('#/?model=opus-5-5&scenario=calibrated', other)).toEqual(defaultState(other));
  });
});

describe('path truncates to its longest valid prefix', () => {
  it('unknown component', () => {
    expect(stateFromHash('#/?path=nope/rgw-core', report).path).toEqual([]);
  });

  it('unknown feature', () => {
    expect(stateFromHash('#/?path=rgw/nope', report).path).toEqual(['rgw']);
  });

  it('a feature of another component', () => {
    expect(stateFromHash('#/?path=rgw/osd-core', report).path).toEqual(['rgw']);
  });

  it('too many segments', () => {
    expect(stateFromHash('#/?path=rgw/rgw-core/extra', report).path).toEqual(['rgw', 'rgw-core']);
  });

  it('empty segments', () => {
    expect(stateFromHash('#/?path=/rgw', report).path).toEqual([]);
  });

  it('unknown dependency', () => {
    expect(stateFromHash('#/?path=dependencies/leveldb', report).path).toEqual(['dependencies']);
  });
});

describe('overrides', () => {
  it('keeps numeric values for known params', () => {
    expect(stateFromHash('#/?o.overhead=2.5&o.difficulty.hard=3', report).overrides).toEqual({
      overhead: 2.5,
      'difficulty.hard': 3,
    });
  });

  it.each(['abc', '', ' ', 'NaN', 'Infinity', '-Infinity', '0x10', '1,5', '2.5.1', 'true', '1e'])(
    'drops the non-numeric value %j',
    (value) => {
      expect(stateFromHash(`#/?o.overhead=${encodeURIComponent(value)}`, report).overrides).toEqual({});
    },
  );

  it('drops params the report does not have', () => {
    expect(stateFromHash('#/?o.nope=2&o.difficulty.trivial=1', report).overrides).toEqual({});
  });

  it('drops a path that names a group rather than a value', () => {
    expect(stateFromHash('#/?o.difficulty=2&o.difficulty.hard.value=2', report).overrides).toEqual({});
  });

  it('drops inherited object keys', () => {
    expect(stateFromHash('#/?o.__proto__=1&o.constructor=1', report).overrides).toEqual({});
  });

  it('keeps the valid overrides beside dropped ones', () => {
    expect(stateFromHash('#/?o.overhead=x&o.expansion=1.2', report).overrides).toEqual({ expansion: 1.2 });
  });
});

describe('overrides are canonical', () => {
  it('clamps a value from a link to what the model uses', () => {
    expect(stateFromHash('#/?o.clean_break_discount=-0.5&o.long_context_share.output=1.5', report).overrides).toEqual({
      clean_break_discount: 0,
      'long_context_share.output': 1,
    });
  });

  it("drops overrides equal to the scenario's values on load", () => {
    expect(
      stateFromHash('#/?scenario=pessimistic&o.difficulty.hard=2&o.toggles.include_adjacent=1&o.toggles.clean_break=0', report)
        .overrides,
    ).toEqual({});
  });

  it('drops an override that the new scenario makes equal when the scenario changes', () => {
    const { loc } = fakeLocation('');
    const store = createStateStore(report, loc);
    store.set({ ...get(store), overrides: { 'difficulty.hard': 2, expansion: 1.5 } });
    expect(get(store).overrides).toEqual({ 'difficulty.hard': 2, expansion: 1.5 });
    store.set({ ...get(store), scenario: 'pessimistic' });
    expect(get(store).overrides).toEqual({ expansion: 1.5 });
    expect(loc.read()).not.toContain('difficulty.hard');
    store.destroy();
  });
});

describe('toggle overrides', () => {
  it.each([
    ['calibrated', { 'toggles.include_adjacent': 1 }],
    ['pessimistic', { 'toggles.include_adjacent': 0 }],
    ['pessimistic', { 'toggles.include_adjacent': 0, 'toggles.clean_break': 1, overhead: 2 }],
  ])('round-trip under %s: %j', (scenario, overrides) => {
    const state = { ...defaults, scenario, overrides };
    expect(stateFromHash(hashFromState(state), report)).toEqual(state);
  });

  it('reads them from a pasted link', () => {
    expect(stateFromHash('#/?o.toggles.clean_break=1', report).overrides).toEqual({ 'toggles.clean_break': 1 });
  });

  it.each(['2', '0.5', '-1', 'true', 'on', '', '1e0x'])('drops the value %j, which is neither 0 nor 1', (value) => {
    expect(stateFromHash(`#/?o.toggles.clean_break=${encodeURIComponent(value)}`, report).overrides).toEqual({});
  });

  it('drops toggles the report does not have', () => {
    expect(stateFromHash('#/?o.toggles.nope=1&o.toggles=1&o.toggles.__proto__=1', report).overrides).toEqual({});
  });

  it('survives a write through the store', () => {
    const { loc } = fakeLocation('');
    const store = createStateStore(report, loc);
    store.set({ ...get(store), overrides: { 'toggles.include_adjacent': 1 } });
    expect(get(store).overrides).toEqual({ 'toggles.include_adjacent': 1 });
    expect(loc.read()).toContain('o.toggles.include_adjacent=1');
    store.destroy();
  });
});

function fakeLocation(initial: string) {
  let hash = initial;
  const listeners = new Set<() => void>();
  const log: string[] = [];
  const loc: HashLocation = {
    read: () => hash,
    push: (h) => {
      hash = h;
      log.push(`push ${h}`);
    },
    replace: (h) => {
      hash = h;
      log.push(`replace ${h}`);
    },
    listen: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  const navigate = (h: string) => {
    hash = h;
    for (const fn of listeners) fn();
  };
  return { loc, log, navigate, listeners };
}

describe('createStateStore', () => {
  it('restores the state from the hash on load and canonicalises the hash', () => {
    const { loc, log } = fakeLocation('#/methods?model=fable-5-2&target=cobol');
    const store = createStateStore(report, loc);
    const expected = { ...defaults, route: 'methods' as const, model: 'fable-5-2' };
    expect(get(store)).toEqual(expected);
    expect(log).toEqual([`replace ${hashFromState(expected)}`]);
    store.destroy();
  });

  it('leaves a canonical hash alone', () => {
    const { loc, log } = fakeLocation(hashFromState(defaults));
    createStateStore(report, loc).destroy();
    expect(log).toEqual([]);
  });

  it('writes a new selection to the hash as a history entry', () => {
    const { loc, log } = fakeLocation('');
    const store = createStateStore(report, loc);
    log.length = 0;
    store.set({ ...get(store), target: 'rust' });
    expect(get(store).target).toBe('rust');
    expect(log).toEqual([`push ${hashFromState({ ...defaults, target: 'rust' })}`]);
    store.destroy();
  });

  it('replaces the history entry when asked', () => {
    const { loc, log } = fakeLocation('');
    const store = createStateStore(report, loc);
    log.length = 0;
    store.update((s) => ({ ...s, overrides: { overhead: 2 } }), { replace: true });
    expect(log).toEqual([`replace ${hashFromState({ ...defaults, overrides: { overhead: 2 } })}`]);
    store.destroy();
  });

  it('validates what it is given', () => {
    const { loc } = fakeLocation('');
    const store = createStateStore(report, loc);
    store.set({ ...get(store), model: 'gpt-2', path: ['rgw', 'nope'] });
    expect(get(store)).toEqual({ ...defaults, path: ['rgw'] });
    store.destroy();
  });

  it('does not write or notify when nothing changed', () => {
    const { loc, log } = fakeLocation('');
    const store = createStateStore(report, loc);
    log.length = 0;
    let calls = 0;
    const unsubscribe = store.subscribe(() => calls++);
    store.set({ ...get(store) });
    expect(log).toEqual([]);
    expect(calls).toBe(1);
    unsubscribe();
    store.destroy();
  });

  it('follows navigation such as the back button or a pasted link', () => {
    const { loc, navigate } = fakeLocation('');
    const store = createStateStore(report, loc);
    navigate('#/calibration?target=wasm&path=osd/bluestore');
    expect(get(store)).toEqual({ ...defaults, route: 'calibration', target: 'wasm', path: ['osd', 'bluestore'] });
    store.destroy();
  });

  it('keeps the selection across a prose page and back', () => {
    const { loc, navigate } = fakeLocation('');
    const store = createStateStore(report, loc);
    store.set({ ...get(store), target: 'rust', path: ['rgw'] });
    navigate(hashFromState({ ...get(store), route: 'methods' }));
    navigate(hashFromState({ ...get(store), route: 'report' }));
    expect(get(store)).toEqual({ ...defaults, target: 'rust', path: ['rgw'] });
    store.destroy();
  });

  it('stops listening when destroyed', () => {
    const { loc, listeners } = fakeLocation('');
    createStateStore(report, loc).destroy();
    expect(listeners.size).toBe(0);
  });
});

describe('parseHash', () => {
  it('reads the raw fields without validating them', () => {
    expect(parseHash('#/methods?target=cobol&path=a/b/c&o.x=y')).toEqual({
      route: 'methods',
      target: 'cobol',
      path: ['a', 'b', 'c'],
      overrides: { x: 'y' },
    });
  });
});

describe('section', () => {
  const sections: SectionIds = { methods: new Set(['scope', 'prices']), calibration: new Set(['coverage']) };

  it('keeps a known section of the page in the hash', () => {
    expect(stateFromHash('#/methods?section=scope', report, sections)).toEqual({
      ...defaults,
      route: 'methods',
      section: 'scope',
    });
  });

  it.each([
    ['an unknown section', '#/methods?section=nope'],
    ["another page's section", '#/methods?section=coverage'],
    ['a section on the report page', '#/?section=scope'],
    ['an inherited key', '#/methods?section=constructor'],
    ['an empty section', '#/methods?section='],
  ])('drops %s', (_name, hash) => {
    expect(stateFromHash(hash, report, sections)).not.toHaveProperty('section');
  });

  it('drops every section when the store is given none', () => {
    expect(stateFromHash('#/methods?section=scope', report)).not.toHaveProperty('section');
  });

  it('round-trips through the hash, last', () => {
    const state: AppState = { ...defaults, route: 'calibration', target: 'rust', section: 'coverage' };
    const hash = hashFromState(state);
    expect(hash).toMatch(/&section=coverage$/);
    expect(stateFromHash(hash, report, sections)).toEqual(state);
  });

  it('is followed by the store, so Back returns to the previous section', () => {
    const { loc, navigate } = fakeLocation('#/methods');
    const store = createStateStore(report, loc, sections);
    navigate(hashFromState({ ...get(store), section: 'scope' }));
    expect(get(store).section).toBe('scope');
    navigate(hashFromState({ ...get(store), section: 'prices' }));
    expect(get(store).section).toBe('prices');
    navigate('#/methods?target=go&model=opus-5-5&scenario=calibrated&section=scope');
    expect(get(store).section).toBe('scope');
    store.destroy();
  });
});

describe('routeHash', () => {
  // A heading id both pages have: validation alone would keep it on the other page.
  const shared: SectionIds = { methods: new Set(['scope']), calibration: new Set(['scope']) };
  const onMethods: AppState = { ...defaults, route: 'methods', target: 'rust', section: 'scope' };

  it('links to another page without the current section, keeping the rest of the selection', () => {
    const hash = routeHash(onMethods, 'calibration');
    expect(hash).toBe('#/calibration?target=rust&model=opus-5-5&scenario=calibrated');
    expect(stateFromHash(hash, report, shared)).not.toHaveProperty('section');
  });

  it('links to the top of the same page, too', () => {
    expect(routeHash(onMethods, 'methods')).toBe('#/methods?target=rust&model=opus-5-5&scenario=calibrated');
  });
});
