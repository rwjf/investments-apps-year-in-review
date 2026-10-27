import { expect, test } from '@playwright/test';

const scenario = (name: string) => test.skip(test.info().project.name !== name, `Runs in the ${name} fixture.`);

test('sample recap leads with the three team-wide measures and a clear illustrative warning', async ({ page }) => {
  scenario('sample');
  await page.goto('/');

  await expect(page.locator('meta[name="recap-mode"]')).toHaveAttribute('content', 'demo');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('2026 so far');
  await expect(page.getByLabel('Illustrative data warning')).toContainText('Illustrative example only; no source data was collected.');
  await expect(page.getByTestId('metric-dependency-alerts-fixed').getByRole('heading', { name: 'Dependency alerts fixed', exact: true })).toBeVisible();
  await expect(page.getByTestId('metric-production-deployments').getByRole('heading', { name: 'Successful production deployments', exact: true })).toBeVisible();
  await expect(page.getByTestId('metric-work-items-closed').getByRole('heading', { name: 'Work items closed', exact: true })).toBeVisible();
  await expect(page.getByTestId('metric-dependency-alerts-fixed')).toContainText('128');
  await expect(page.getByTestId('metric-production-deployments')).toContainText('42');
  await expect(page.getByTestId('metric-work-items-closed')).toContainText('316');
  await expect(page.getByText(/Reporting cutoff \(exclusive\): October 27, 2026 at 12:00 PM EDT/)).toBeVisible();
  await expect(page.locator('#deployments')).toContainText('Months after the reporting cutoff are not shown.');
  await expect(page.locator('#deployments')).not.toContainText('November');
  await expect(page.locator('#deployments')).not.toContainText('December');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.getByRole('navigation', { name: 'Recap sections' }).getByRole('link')).toHaveCount(3);
  await expect(page.getByRole('list', { name: 'Recap chapters' }).getByRole('link')).toHaveCount(3);
});

test('unavailable measures remain unknown rather than being presented as zero', async ({ page }) => {
  scenario('unavailable');
  await page.goto('/');

  for (const id of ['metric-dependency-alerts-fixed', 'metric-production-deployments', 'metric-work-items-closed']) {
    await expect(page.getByTestId(id)).toContainText('Not available');
    await expect(page.getByTestId(id)).not.toContainText('0');
  }
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

  await expect(page.getByRole('heading', { level: 1 })).toContainText('2026');
  await expect(page.getByRole('heading', { level: 1 })).not.toContainText('so far');
  await expect(page.locator('.snapshot__heading p')).toHaveText('Calendar year 2026');
});

test('chapter links work by keyboard and layout remains usable at narrow and wide widths', async ({ page }) => {
  scenario('sample');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  const firstChapter = page.getByRole('navigation', { name: 'Recap sections' }).getByRole('link', { name: 'Security' });
  await firstChapter.focus();
  await expect(firstChapter).toBeFocused();
  await expect(firstChapter).toHaveCSS('outline-style', 'solid');
  await firstChapter.press('Enter');
  await expect(page).toHaveURL(/#security$/);
  await expect(page.getByRole('heading', { name: 'Dependency alert fixes' })).toBeInViewport();

  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/screenshots/recap-${width}.png`, fullPage: true });
  }
  await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'auto');
});

test('renders without source links or outbound requests', async ({ page }) => {
  scenario('sample');
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/');

  const links = await page.locator('a[href]').evaluateAll((anchors) => anchors.map((anchor) => (anchor as HTMLAnchorElement).href));
  const html = await page.content();
  expect(links.every((href) => href.startsWith('http://127.0.0.1:') || href.startsWith('#'))).toBe(true);
  expect(requests.every((url) => new URL(url).hostname === '127.0.0.1')).toBe(true);
  expect(html).not.toMatch(/RECAP_BUILD_ROOT|RECAP_ALLOW_DEMO|\/private\/var/);
  expect(html).not.toMatch(/INSUP|RWJFINVEST/);
  await expect(page.locator('a[href*="github.com"], a[href*="atlassian.net"], a[href*="jira"]')).toHaveCount(0);
  await expect(page.locator('script')).toHaveCount(0);
});

test('preserves chapter navigation and assets under the configured Pages subpath', async ({ page }) => {
  scenario('subpath');
  await page.goto('/year-in-review/');

  await expect(page.getByRole('heading', { level: 1 })).toContainText('2026 so far');
  await expect(page.getByRole('navigation', { name: 'Recap sections' }).getByRole('link', { name: 'Security' })).toHaveAttribute('href', '#security');
  const stylesheet = await page.locator('link[rel="stylesheet"]').getAttribute('href');
  if (stylesheet) expect(stylesheet).toMatch(/^\/year-in-review\//);
});
