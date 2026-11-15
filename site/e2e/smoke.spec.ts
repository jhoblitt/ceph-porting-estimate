// A smoke test of the built site on the real data: that each view loads,
// answers the reader's main interactions, and keeps the URL as the source of
// truth. Figures are compared with each other, never with fixed amounts, so
// the test survives new data.

import { type Locator, type Page, expect, test } from '@playwright/test';

const REPO = 'https://github.com/jhoblitt/ceph-porting-estimate';

/** Console errors and uncaught exceptions on the page, checked after every test. */
let problems: string[] = [];

function watch(page: Page): void {
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
}

test.beforeEach(({ page, context }) => {
  problems = [];
  watch(page);
  // A page a test opens itself is watched too.
  context.on('page', watch);
});

test.afterEach(() => {
  expect(problems).toEqual([]);
});

function headline(page: Page): Locator {
  return page.getByRole('region', { name: 'The estimate' }).locator('.hero data');
}

/**
 * The headline's unrounded model output. The page prints two significant
 * figures, so a change can leave the printed text as it was; compare this.
 */
async function headlineValue(page: Page): Promise<string> {
  return (await headline(page).getAttribute('value')) ?? '';
}

async function open(page: Page, hash = ''): Promise<void> {
  await page.goto(hash === '' ? './' : `./${hash}`);
  await expect(headline(page)).toBeVisible();
}

test('the headline shows a dollar figure', async ({ page }) => {
  await open(page);
  await expect(headline(page)).toHaveText(/^\$\d+(\.\d+)?[kMB]?$/);
});

test('choosing a matrix cell changes the headline', async ({ page }) => {
  await open(page);
  const before = await headlineValue(page);
  await page.getByRole('button', { name: /^Rust with Claude Fable 5\.2:/ }).click();
  await expect(headline(page)).not.toHaveAttribute('value', before);
  await expect(page).toHaveURL(/target=rust&model=fable-5-2/);
});

for (const width of [1280, 390]) {
  test(`at ${width}px the answer comes before the controls, on screen and in the document`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    const answer = page.locator('.answer');
    const controls = page.getByRole('region', { name: 'Selection' });
    // A union locator lists its matches in document order.
    await expect(page.locator('.answer, section[aria-label="Selection"]').first()).toHaveClass(/\banswer\b/);
    const a = await answer.boundingBox();
    const c = await controls.boundingBox();
    // Seen after the answer: below it, or beside it to the right.
    expect(c!.y >= a!.y + a!.height || c!.x >= a!.x + a!.width).toBe(true);
  });
}

test('choosing a treemap cell zooms in, and a feature opens its detail', async ({ page }) => {
  await open(page);
  const explorer = page.locator('#explorer');
  const crumbs = page.getByRole('navigation', { name: 'Explorer location' });
  await expect(crumbs.locator('[aria-current="location"]')).toHaveText('Ceph');

  await explorer.locator('[data-cell="osd"]').click();
  await expect(crumbs.locator('[aria-current="location"]')).toContainText('OSD');
  await expect(crumbs.getByRole('button', { name: /RADOS core/ })).toBeVisible();
  await expect(explorer.getByRole('heading', { name: /^The features of OSD/ })).toBeVisible();
  const row = explorer.getByRole('table').getByRole('button', { name: 'PG peering and recovery' });
  await expect(row).toBeVisible();
  await expect(page).toHaveURL(/path=osd(&|$)/);

  await explorer.locator('.layer:not([inert]) [data-cell="peering-recovery"]').click();
  await expect(page.locator('#explorer-detail-title')).toHaveText('PG peering and recovery');
  await expect(explorer.getByRole('heading', { name: 'From size to output tokens' })).toBeVisible();
  await expect(crumbs.locator('[aria-current="location"]')).toContainText('PG peering and recovery');
  await expect(page).toHaveURL(/path=osd\/peering-recovery/);

  // Back up through the breadcrumb.
  await crumbs.getByRole('button', { name: /Ceph/ }).click();
  await expect(crumbs.locator('[aria-current="location"]')).toHaveText('Ceph');
  await expect(explorer.getByRole('heading', { name: 'Every component' })).toBeVisible();
});

test('moving a slider changes the headline and the URL, and that URL restores it', async ({ page, context }) => {
  await open(page);
  const before = await headlineValue(page);
  const slider = page.locator('[data-param-path="overhead"] input[type="range"]');
  await slider.focus();
  for (let i = 0; i < 5; i++) await slider.press('ArrowRight');
  await expect(headline(page)).not.toHaveAttribute('value', before);
  await expect(page).toHaveURL(/o\.overhead=/);
  const changed = await headlineValue(page);

  const again = await context.newPage();
  await again.goto(page.url());
  await expect(headline(again)).toHaveAttribute('value', changed);
  await expect(again.locator('[data-param-path="overhead"]')).toContainText('Reset');
  await again.close();
});

// Each slider's data-effect against what its two ends do to the headline: none
// leaves the value as it was, small changes the value but not the printed
// text, live changes the text. Each read of the page is one round trip.
for (const [name, hash] of [
  ['the default selection', ''],
  ['WASM with GPT-6 Astra, Pessimistic', '#/?target=wasm&model=gpt-6-astra&scenario=pessimistic'],
] as const) {
  test(`for ${name}, every slider's effect is what its two ends do to the headline`, async ({ page }) => {
    // 9.2 s and 10.9 s for the two selections on the machine this was written on, with the
    // whole suite running in parallel: about three times that, for a slower CI runner.
    test.setTimeout(35_000);
    await open(page, hash);
    const read = () => headline(page).evaluate((el) => ({ value: el.getAttribute('value') ?? '', text: el.textContent ?? '' }));
    const start = await read();
    const paths = await page.locator('[data-param-path]').evaluateAll((els) => els.map((e) => e.getAttribute('data-param-path')!));
    expect(paths.length).toBeGreaterThan(0);
    const reset = page.locator('#assumptions button.reset-all');
    const seen = { none: 0, small: 0, live: 0 };
    for (const path of paths) {
      const param = page.locator(`[data-param-path="${path}"]`);
      const slider = param.locator('input[type="range"]');
      const number = param.locator('input[type="number"]');
      const control = () =>
        param.evaluate((el) => {
          const range = el.querySelector<HTMLInputElement>('input[type="range"]')!;
          return {
            effect: el.getAttribute('data-effect') as 'none' | 'small' | 'live',
            position: range.value,
            min: range.min,
            max: range.max,
            number: el.querySelector<HTMLInputElement>('input[type="number"]')!.value,
          };
        });
      const { effect } = await control();
      const ends: { value: string; text: string }[] = [];
      for (const key of ['End', 'Home'] as const) {
        const before = await control();
        await slider.press(key);
        // A slider whose thumb already sits at this end has nowhere to go. Any other
        // must take the key: the number box shows the new value once the page has
        // applied it, and only then is the headline read.
        if (before.position !== (key === 'End' ? before.max : before.min)) {
          await expect(number, `${path}: ${key} moves it`).not.toHaveValue(before.number);
        }
        ends.push(await read());
      }
      const valueMoved = ends.some((e) => e.value !== start.value);
      const textMoved = ends.some((e) => e.text !== start.text);
      const what = `${path} (${effect}): ends ${JSON.stringify(ends)}, start ${JSON.stringify(start)}`;
      if (effect === 'none') expect(valueMoved, what).toBe(false);
      else if (effect === 'small') expect(valueMoved && !textMoved, what).toBe(true);
      else expect(textMoved, what).toBe(true);
      seen[effect] += 1;
      if (await reset.isEnabled()) await reset.click();
      await expect(headline(page)).toHaveAttribute('value', start.value);
    }
    // Both selections have sliders in every state, so none of the three checks above went unexercised.
    expect(seen.none > 0 && seen.small > 0 && seen.live > 0, JSON.stringify(seen)).toBe(true);
  });
}

test('at 390px a greyed-out slider and a small-effect slider show their notes, and nothing overflows', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await expect(page.locator('#assumptions .inert-count')).toContainText(/Greyed-out sliders \(\d+ of the \d+ below\) have no effect on this estimate/);
  for (const effect of ['none', 'small']) {
    const param = page.locator(`#assumptions [data-effect="${effect}"]`).first();
    await param.scrollIntoViewIfNeeded();
    const note = param.locator('.effect-note');
    await expect(param).toBeInViewport();
    await expect(note).toBeInViewport();
    await expect(note).not.toBeEmpty();
    for (const input of await param.locator('input').all()) {
      await expect(input).toHaveAttribute('aria-describedby', new RegExp(`\\b${await note.getAttribute('id')}\\b`));
    }
    expect(await param.evaluate((el) => el.scrollWidth <= el.clientWidth), `${effect}: the control fits its box`).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

function estimateBar(page: Page): Locator {
  return page.locator('[data-estimate-bar]');
}

/**
 * Asserts that the bar is showing and the focused element is wholly below
 * it and on screen. A hidden bar sits above the viewport with its bottom at
 * 0, where any element would clear it, so "showing" is part of the claim.
 */
async function expectFocusClear(page: Page, step: string): Promise<void> {
  const c = await page.evaluate(() => {
    const barEl = document.querySelector<HTMLElement>('[data-estimate-bar]')!;
    const el = document.activeElement as HTMLElement;
    const rect = el.getBoundingClientRect();
    return {
      shown: barEl.dataset['shown'],
      barBottom: barEl.getBoundingClientRect().bottom,
      top: rect.top,
      bottom: rect.bottom,
      viewport: window.innerHeight,
      name: `${el.tagName} ${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 40) ?? ''}`,
    };
  });
  const what = `${step}: ${c.name}`;
  expect(c.shown, `${what}: the bar is shown`).toBe('true');
  expect(c.top, what).toBeGreaterThanOrEqual(c.barBottom);
  expect(c.bottom, what).toBeLessThanOrEqual(c.viewport);
}

/** Waits for the bar to finish sliding in, so what it covers is measured at its full height. */
async function barAtRest(page: Page): Promise<void> {
  await expect(estimateBar(page)).toBeInViewport();
  await expect.poll(async () => (await estimateBar(page).boundingBox())?.y).toBe(0);
}

/** Scrolls so that `target`'s top sits just under the top of the viewport, where the bar is. */
async function tuckUnderBar(target: Locator): Promise<void> {
  await target.evaluate((el) => window.scrollBy(0, el.getBoundingClientRect().top - 4));
}

for (const [width, height] of [
  [1280, 900],
  [390, 844],
] as const) {
  test(`at ${width}px the estimate stays on screen while a work-pattern slider is dragged, and leaves with the hero back`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await open(page);
    const bar = estimateBar(page);
    await expect(bar).toBeHidden();
    const published = await headlineValue(page);

    const group = page.locator('details[data-group]').filter({ has: page.getByRole('heading', { name: 'The work pattern' }) });
    const slider = group.locator('input[type="range"]').first();
    await slider.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await expect(bar).toBeInViewport();
    const figure = bar.locator('.figure data');
    await expect(figure).toHaveAttribute('value', published);
    await expect(bar.locator('.change')).toHaveCount(0);

    // Drag with the mouse, as the owner did: the figure follows before the button is released.
    const box = (await slider.boundingBox())!;
    const position = Number(await slider.inputValue()) / Number(await slider.getAttribute('max'));
    const x = box.x + 8 + position * (box.width - 16);
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + box.width / 4, y, { steps: 5 });
    await expect(figure).not.toHaveAttribute('value', published);
    await page.mouse.up();

    await barAtRest(page);
    await expect(slider).toBeInViewport();
    const sliderTop = (await slider.boundingBox())!.y;
    const barBottom = (await bar.boundingBox())!.y + (await bar.boundingBox())!.height;
    expect(sliderTop).toBeGreaterThanOrEqual(barBottom);
    const now = await figure.getAttribute('value');
    await expect(headline(page)).toHaveAttribute('value', now!);
    await expect(figure).toHaveText((await headline(page).textContent())!);
    await expect(bar.locator('.change')).toHaveText(/^\+\S+% vs\. published$/);
    await expect(bar.getByRole('button', { name: 'Reset all (1)' })).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(headline(page)).toBeInViewport();
    await expect(bar).toBeHidden();
  });

  test(`at ${width}px a control tabbed to in the assumptions panel is never under the estimate bar`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await open(page);
    const panel = page.locator('#assumptions');
    const controls = panel.locator('a[href], button, input, summary').filter({ visible: true });
    const steps = 8;

    // From above: the panel's first control starts under the bar.
    await tuckUnderBar(controls.first());
    await barAtRest(page);
    await page.locator('#assumptions-title').evaluate((el: HTMLElement) => el.focus({ preventScroll: true }));
    for (let i = 0; i < steps; i++) {
      await page.keyboard.press('Tab');
      await expectFocusClear(page, `tab ${i + 1}`);
    }

    // From below: the controls above the focused one start under the bar.
    const last = controls.nth(steps);
    await tuckUnderBar(controls.nth(steps - 1));
    await last.evaluate((el: HTMLElement) => el.focus({ preventScroll: true }));
    await barAtRest(page);
    for (let i = 0; i < steps; i++) {
      await page.keyboard.press('Shift+Tab');
      await expectFocusClear(page, `shift-tab ${i + 1}`);
    }
  });
}

test('at 390px, with a change shown, the bar shortens the scenario before any model name', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const models = await page.getByRole('region', { name: 'Selection' }).locator('input[name="model"]').evaluateAll((inputs) =>
    inputs.map((i) => (i as HTMLInputElement).value),
  );
  expect(models.length).toBeGreaterThan(1);
  for (const model of models) {
    // A fresh load, so the change and the reset are both on the bar: its widest state.
    await page.goto(`./#/?model=${encodeURIComponent(model)}&o.overhead=8`);
    await expect(headline(page)).toBeVisible();
    await page.locator('#explorer').scrollIntoViewIfNeeded();
    await barAtRest(page);
    const bar = estimateBar(page);
    await expect(bar.locator('.change')).toBeVisible();
    await expect(bar.getByRole('button', { name: /^Reset all/ })).toBeVisible();
    const cut = await bar.locator('.model').evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(cut, `${model}: the model's name is whole`).toBe(false);
    const lines = await bar.locator('.line').count();
    expect(lines).toBe(2);
    for (const line of await bar.locator('.line').all()) {
      // One row each: no taller than its tallest control.
      expect((await line.boundingBox())!.height).toBeLessThanOrEqual(26);
    }
  }
});

test('the estimate bar resets every change and leads back to the headline', async ({ page }) => {
  await open(page, '#/?o.overhead=8');
  const changed = await headlineValue(page);
  await page.locator('#assumptions').scrollIntoViewIfNeeded();
  const bar = estimateBar(page);
  await expect(bar.locator('.figure data')).toHaveAttribute('value', changed);
  await bar.getByRole('button', { name: 'Reset all (1)' }).click();
  await expect(page).not.toHaveURL(/o\.overhead=/);
  await expect(bar.locator('.change')).toHaveCount(0);
  await expect(bar.getByRole('button', { name: 'Back to the estimate' })).toBeFocused();
  await expect(bar.locator('.figure data')).not.toHaveAttribute('value', changed);

  await bar.getByRole('button', { name: 'Back to the estimate' }).click();
  await expect(headline(page)).toBeInViewport();
  await expect(page.locator('#summary-title')).toBeFocused();
  await expect(bar).toBeHidden();
});

test('when the bar hides with focus in it, focus goes to the headline rather than the page', async ({ page }) => {
  await open(page);
  await page.locator('#assumptions').scrollIntoViewIfNeeded();
  const bar = estimateBar(page);
  await barAtRest(page);
  await bar.getByRole('button', { name: 'Back to the estimate' }).focus();
  // Home scrolls the page, not the bar: the hero comes back and the bar goes inert.
  await page.keyboard.press('Home');
  await expect(headline(page)).toBeInViewport();
  await expect(bar).toBeHidden();
  await expect(page.locator('#summary-title')).toBeFocused();
});

test('an unknown model in the URL falls back to the defaults', async ({ page, context }) => {
  await open(page);
  const defaults = await headlineValue(page);
  // Loaded fresh, as a shared link is, not as a hash change on a loaded page.
  const fresh = await context.newPage();
  await open(fresh, '#/?model=no-such-model');
  await expect(headline(fresh)).toHaveAttribute('value', defaults);
  await expect(fresh).toHaveURL(/model=opus-5-5/);
  await fresh.close();
});

for (const route of ['methods', 'calibration']) {
  test(`the ${route} page renders`, async ({ page }) => {
    await page.goto(`./#/${route}`);
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Pages' }).locator('[aria-current="page"]')).toBeVisible();
    // The estimate bar belongs to the estimate page alone.
    await page.getByRole('contentinfo').scrollIntoViewIfNeeded();
    await expect(estimateBar(page)).toHaveCount(0);
  });

  test(`at 390px the ${route} page renders, and its contents open and lead to a section`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`./#/${route}`);
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
    // On a phone the contents start folded, so the text starts on the first screen.
    const toc = page.getByRole('navigation', { name: 'On this page' });
    const last = toc.getByRole('link').last();
    await expect(last).toBeHidden();
    await toc.getByText('On this page').click();
    await expect(last).toBeVisible();
    const section = new URLSearchParams(((await last.getAttribute('href')) ?? '').split('?')[1]).get('section');
    expect(section).toBeTruthy();
    await last.click();
    await expect(page).toHaveURL(new RegExp(`section=${section}`));
    await expect(page.locator(`h2[id="${section}"]`)).toBeInViewport();
  });
}

test('the footer shows a version and the repository link', async ({ page }) => {
  await open(page);
  const footer = page.getByRole('contentinfo');
  await expect(footer).toContainText(/\b(dev|v\d+\.\d+\.\d+\S*)\b/);
  await expect(footer.locator(`a[href="${REPO}"]`)).toBeVisible();
});
