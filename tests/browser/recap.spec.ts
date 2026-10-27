import { expect, test } from '@playwright/test';

const scenario = (name: string) => test.skip(test.info().project.name !== name, `Runs in the ${name} fixture.`);

test('sample recap leads with the book comparison and retains the team-wide stories', async ({ page }) => {
  scenario('sample');
  await page.goto('/');

  await expect(page.locator('meta[name="recap-mode"]')).toHaveAttribute('content', 'demo');
  await expect(page.locator('.scale-moment__intro .eyebrow')).toContainText('2026 so far');
  await expect(page.getByLabel('Illustrative data warning')).toContainText('Illustrative example only; no source data was collected.');
  await expect(page.getByTestId('book-result')).toContainText(/about 1 .*War and Peace/i);
  await expect(page.getByTestId('code-added-total')).toContainText('56,960');
  await expect(page.getByTestId('code-removed-total')).toContainText('23,840');
  await expect(page.getByText(/40 code lines per printed page/i)).toBeVisible();
  await expect(page.getByText(/1,424 pages/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Welcoming our Robot Overlords', exact: true })).toBeVisible();
  await expect(page.getByTestId('bot-pr-share')).toContainText('1 of 4');
  await expect(page.getByTestId('bot-pr-share')).toContainText('25%');
  await expect(page.locator('#security .chapter__count')).toHaveText('128');
  await expect(page.locator('#deployments .chapter__count')).toHaveText('42');
  await expect(page.locator('#work-items .chapter__count')).toHaveText('316');
  await expect(page.getByText(/Reporting cutoff \(exclusive\): October 27, 2026 at 12:00 PM EDT/)).toBeVisible();
  await expect(page.locator('.site-footer')).toContainText('Collected: October 27, 2026 at 12:00 PM EDT');
  await expect(page.locator('#deployments')).toContainText('Months after the reporting cutoff are not shown.');
  await expect(page.locator('#deployments')).not.toContainText('November');
  await expect(page.locator('#deployments')).not.toContainText('December');
  await expect(page.getByRole('navigation', { name: 'Recap sections' }).getByRole('link')).toHaveCount(6);
});

test('half a book stays approximate and keeps its exact line total nearby', async ({ page }) => {
  scenario('half');
  await page.goto('/');
  await expect(page.getByTestId('book-result')).toContainText(/about half .*War and Peace/i);
  await expect(page.getByTestId('code-added-total')).toContainText('28,480');
});

test('zero added lines is honest and does not draw a fake book stack', async ({ page }) => {
  scenario('zero');
  await page.goto('/');
  await expect(page.getByTestId('book-result')).toContainText(/zero .*book/i);
  await expect(page.locator('.book-illustration')).toHaveCount(0);
  await expect(page.getByTestId('code-added-total')).toContainText('0');
});

test('unavailable code totals do not produce a book claim', async ({ page }) => {
  scenario('unavailable');
  await page.goto('/');
  await expect(page.getByTestId('code-added-total')).toContainText('Not available');
  await expect(page.locator('[data-testid="book-result"]')).toHaveCount(0);
  await expect(page.locator('#code-added')).not.toContainText(/War and Peace|about \d|book equivalent/i);
  for (const id of ['security', 'deployments', 'work-items']) {
    await expect(page.locator(`#${id} .chapter__count`)).toHaveText('Not available');
  }
});

test('legacy v1 snapshots keep their recorded stories without invented code or robot counts', async ({ page }) => {
  scenario('legacyV1');
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('A year of shared work');
  await expect(page.locator('#security .chapter__count')).toHaveText('128');
  await expect(page.locator('#deployments .chapter__count')).toHaveText('42');
  await expect(page.locator('#work-items .chapter__count')).toHaveText('316');
  await expect(page.locator('#code-added')).toHaveCount(0);
  await expect(page.locator('#code-removed')).toHaveCount(0);
  await expect(page.locator('#robot-overlords')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Recap sections' }).getByRole('link')).toHaveCount(3);
});

test('zero merged pull requests never invent a bot percentage', async ({ page }) => {
  scenario('robotsZero');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcoming our Robot Overlords', exact: true })).toBeVisible();
  await expect(page.getByTestId('bot-pr-share')).toContainText('0 of 0');
  await expect(page.getByTestId('bot-pr-share')).not.toContainText('%');
});

test('limited source visibility carries a plain-language coverage caveat', async ({ page }) => {
  scenario('limited');
  await page.goto('/');

  await expect(page.getByText(/Limited to accessible sources.*inventory.*visibility was not verified/i)).toBeVisible();
  await expect(page.getByText(/not all.*organization|coverage.*not verified/i)).toBeVisible();
  await expect(page.locator('meta[name="recap-mode"]')).toHaveAttribute('content', 'real');
});

test('completed calendar year does not use a year-to-date label', async ({ page }) => {
  scenario('completed');
  await page.goto('/');

  await expect(page.locator('.scale-moment__intro .eyebrow')).toContainText('Calendar year 2026');
  await expect(page.locator('.scale-moment__intro .eyebrow')).not.toContainText('so far');
  await expect(page.getByText(/Reporting cutoff \(exclusive\): January 1, 2027 at 12:00 AM EST/)).toBeVisible();
  await expect(page.locator('.site-footer')).toContainText('Collected: October 27, 2026 at 12:00 PM EDT');
});

test('chapter links work by keyboard and layout remains usable at narrow and wide widths', async ({ page }) => {
  scenario('sample');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  const firstChapter = page.getByRole('navigation', { name: 'Recap sections' }).getByRole('link', { name: 'Code added' });
  await firstChapter.focus();
  await expect(firstChapter).toBeFocused();
  await expect(firstChapter).toHaveCSS('outline-style', 'solid');
  await firstChapter.press('Enter');
  await expect(page).toHaveURL(/#code-added$/);
  await expect(page.locator('#code-added h1')).toBeInViewport();

  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/screenshots/delightful-scale-${width}.png`, fullPage: true });
  }
  await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'auto');
});

test('content remains available without scripts and all requests stay local', async ({ browser }) => {
  scenario('sample');
  const requests: string[] = [];
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('http://127.0.0.1:4173/');

  const links = await page.locator('a[href]').evaluateAll((anchors) => anchors.map((anchor) => (anchor as HTMLAnchorElement).href));
  const html = await page.content();
  expect(links.every((href) => href.startsWith('http://127.0.0.1:') || href.startsWith('#'))).toBe(true);
  expect(requests.every((url) => new URL(url).hostname === '127.0.0.1')).toBe(true);
  expect(html).not.toMatch(/RECAP_BUILD_ROOT|RECAP_ALLOW_DEMO|\/private\/var/);
  expect(html).not.toMatch(/INSUP|RWJFINVEST/);
  await expect(page.locator('a[href*="github.com"], a[href*="atlassian.net"], a[href*="jira"]')).toHaveCount(0);
  await expect(page.locator('script')).toHaveCount(0);
  await expect(page.getByTestId('book-result')).toContainText(/about 1 .*War and Peace/i);
  const methodDetails = page.locator('.book-scale__details');
  await expect(methodDetails).not.toHaveAttribute('open', '');
  await methodDetails.locator('summary').click();
  await expect(methodDetails).toHaveAttribute('open', '');
  await expect(methodDetails).toContainText('not unique human-written code');
  await context.close();
});

test('preserves chapter navigation and assets under the configured Pages subpath', async ({ page }) => {
  scenario('subpath');
  await page.goto('/year-in-review/');

  await expect(page.locator('.scale-moment__intro .eyebrow')).toContainText('2026 so far');
  await expect(page.getByRole('navigation', { name: 'Recap sections' }).getByRole('link', { name: 'Code added' })).toHaveAttribute('href', '#code-added');
  const stylesheet = await page.locator('link[rel="stylesheet"]').getAttribute('href');
  if (stylesheet) expect(stylesheet).toMatch(/^\/year-in-review\//);
});
