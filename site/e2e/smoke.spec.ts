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
