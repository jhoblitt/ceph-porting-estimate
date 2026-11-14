// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../lib/__fixtures__/report.json';
import { compileMarkdown } from '../../lib/prose/compile';
import { proseFacts } from '../../lib/prose/facts';
import { parseReport } from '../../lib/report';
import { type AppState, defaultState, hashFromState } from '../../lib/state';
import ProsePage from './ProsePage.svelte';

const report = parseReport(fixture);
const selection: AppState = { ...defaultState(report), route: 'methods' };

const docs = [
  compileMarkdown(
    '## First\n\nCommit {{ceph.rev | sha}}. See [the second](#/methods?section=second) or [coverage](#/calibration?section=coverage).\n\n```\nformula\n```\n\n::: prices\n',
    'methods/01.md',
  ),
  compileMarkdown('## Second\n\nMore.\n', 'methods/02.md'),
];

function mount(state: AppState = selection) {
  return render(ProsePage, { title: 'Methods', lede: 'How.', docs, report, selection: state });
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ProsePage', () => {
  it('renders the title, a contents entry per section, the filled prose and the tables', () => {
    mount();
    expect(screen.getByRole('heading', { level: 1, name: 'Methods' })).toBeTruthy();
    const contents = screen.getByRole('navigation');
    expect([...contents.querySelectorAll('a')].map((a) => a.textContent)).toEqual(['First', 'Second']);
    expect(document.body.textContent).toContain(`Commit ${report.ceph.rev.slice(0, 7)}.`);
    expect(screen.getByRole('table', { name: /List prices/ })).toBeTruthy();
  });

  it('links each heading to itself in the hash, naming the section', () => {
    mount();
    const anchor = screen.getByRole('link', { name: 'Link to section “Second”' });
    expect(anchor.getAttribute('href')).toBe(hashFromState({ ...selection, section: 'second' }));
  });

  it('points prose links at sections through the hash, keeping the selection', () => {
    mount();
    expect(screen.getByRole('link', { name: 'the second' }).getAttribute('href')).toBe(
      hashFromState({ ...selection, section: 'second' }),
    );
    expect(screen.getByRole('link', { name: 'coverage' }).getAttribute('href')).toBe(
      hashFromState({ ...selection, route: 'calibration', section: 'coverage' }),
    );
  });

  it('makes code blocks focusable', () => {
    mount();
    expect(document.querySelector('pre')?.getAttribute('tabindex')).toBe('0');
  });

  it('scrolls to the section the selection names, on load and when it changes, and to the top when it is cleared', async () => {
    const { rerender } = mount({ ...selection, section: 'second' });
    expect(document.activeElement?.id).toBe('second');
    await rerender({ selection: { ...selection, section: 'first' } });
    expect(document.activeElement?.id).toBe('first');
    expect(window.scrollTo).not.toHaveBeenCalled();
    await rerender({ selection });
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('scrolls back to the current section when its link is followed again, which changes no hash', async () => {
    const state = { ...selection, section: 'second' };
    window.history.replaceState(null, '', hashFromState(state));
    mount(state);
    const scroll = vi.mocked(Element.prototype.scrollIntoView);
    scroll.mockClear();
    (document.activeElement as HTMLElement | null)?.blur();
    const entry = screen.getByRole('navigation').querySelector('[aria-current="location"]') as HTMLElement;
    await fireEvent.click(entry);
    expect(scroll).toHaveBeenCalledOnce();
    expect(document.activeElement?.id).toBe('second');
    scroll.mockClear();
    await fireEvent.click(screen.getByRole('link', { name: 'Link to section “Second”' }));
    expect(scroll).toHaveBeenCalledOnce();
  });

  it('leaves a link to another section to the browser and the hash store', async () => {
    const state = { ...selection, section: 'second' };
    window.history.replaceState(null, '', hashFromState(state));
    mount(state);
    const scroll = vi.mocked(Element.prototype.scrollIntoView);
    scroll.mockClear();
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    screen.getByRole('link', { name: 'Link to section “First”' }).dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
    expect(scroll).not.toHaveBeenCalled();
  });

  it('marks the contents entry of the current section', () => {
    mount({ ...selection, section: 'second' });
    const current = screen.getByRole('navigation').querySelector('[aria-current="location"]');
    expect(current?.textContent).toBe('Second');
  });

  it('folds the contents where they sit above the text, and opens them beside it', () => {
    const narrow = vi.fn(() => ({ matches: false }));
    vi.stubGlobal('matchMedia', narrow);
    const { unmount } = mount();
    expect(narrow).toHaveBeenCalledWith('(min-width: 1024px)');
    expect(screen.getByText('On this page').closest('details')?.open).toBe(false);
    unmount();
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    mount();
    expect(screen.getByText('On this page').closest('details')?.open).toBe(true);
  });

  it('follows the breakpoint when the window crosses it', async () => {
    let listener: ((e: { matches: boolean }) => void) | undefined;
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: (_: string, f: (e: { matches: boolean }) => void) => (listener = f),
        removeEventListener: vi.fn(),
      })),
    );
    mount();
    const details = screen.getByText('On this page').closest('details');
    expect(details?.open).toBe(false);
    listener?.({ matches: true });
    await tick();
    expect(details?.open).toBe(true);
    listener?.({ matches: false });
    await tick();
    expect(details?.open).toBe(false);
  });

  it('lists the limitations with their computed label and the direction each moves the figure', () => {
    const doc = compileMarkdown('## Limits\n\n::: limitations\n', 'methods/09.md');
    render(ProsePage, { title: 'Methods', lede: 'How.', docs: [doc], report, selection });
    const facts = proseFacts(report);
    const items = [...document.querySelectorAll('ol.prose-limitations > li')];
    expect(items.map((li) => li.id)).toEqual(facts.limitations.map((l) => `limitation-${l.id}`));
    const effect = (id: string) => document.querySelector(`#limitation-${id} .prose-effect`)?.textContent?.trim();
    const clean = facts.limitation['clean-break'];
    expect(effect('clean-break')).toBe(`${clean?.label}, lowers the figure`);
    expect(effect('release-floors')).toBe('Not sized, lowers the figure');
    expect(effect('scale-up')).toBe('Not sized, raises the figure');
    expect(effect('other-models')).toBe('Not sized');
    expect(effect('long-prompts')).toBe('No change');
    expect(effect('cache-traffic')).toMatch(/, either way$/);
  });
});
