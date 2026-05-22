const { test, expect } = require('@playwright/test');

const labId = process.env.PORTAL_LAB_ID || 'redis-exposed';
const expectLive = process.env.PORTAL_EXPECT_LIVE === 'true';
const portalUser = process.env.PORTAL_USER || 'student01';

test('student can open the portal and lab page', async ({ page }) => {
  page.on('dialog', dialog => {
    throw new Error(`Unexpected dialog appeared: ${dialog.message()}`);
  });

  await page.goto('/portal');
  await expect(page.getByRole('heading', { name: 'Available Labs' })).toBeVisible();
  await page.getByRole('link', { name: 'Open Lab' }).first().click();
  await expect(page).toHaveURL(new RegExp(`/labs/${labId}$`));
  await expect(page.getByRole('heading', { name: 'The Exposed Cache' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lab Guide' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Lab Guide' })).toHaveAttribute('href', '/docs/labs/redis-exposed/');
  await expect(page.getByRole('button', { name: /Start Lab|Run Check/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
});

test('state-changing routes reject missing form tokens', async ({ request }) => {
  const response = await request.post(`/labs/${labId}/start`, {
    form: {},
    maxRedirects: 0,
  });
  expect([400, 422]).toContain(response.status());
});

test('running lab page exposes a resizable terminal pane', async ({ page }) => {
  await page.goto(`/labs/${labId}`);
  const terminal = page.locator('#terminal-container');
  if (!(await terminal.isVisible())) {
    test.skip(!expectLive, 'live terminal check requires a running lab');
    await page.getByRole('button', { name: 'Start Lab' }).click();
  }

  await expect(terminal).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#terminal-iframe')).toBeVisible();

  const shell = page.locator('#lab-shell');
  const handle = page.locator('#split-handle');
  const before = await shell.evaluate((node) => getComputedStyle(node).gridTemplateColumns);
  await handle.focus();
  await page.keyboard.press('ArrowRight');
  const after = await shell.evaluate((node) => getComputedStyle(node).getPropertyValue('--left-pane'));
  expect(after).not.toEqual('');
  await expect.poll(() => shell.evaluate((node) => getComputedStyle(node).gridTemplateColumns)).not.toBe(before);
});

test('live terminal iframe creates a websocket connection', async ({ page }) => {
  test.skip(!expectLive, 'set PORTAL_EXPECT_LIVE=true for live terminal websocket verification');

  const websockets = [];
  page.on('websocket', (ws) => websockets.push(ws.url()));
  await page.goto(`/labs/${labId}`);
  if (!(await page.locator('#terminal-iframe').isVisible())) {
    await page.getByRole('button', { name: 'Start Lab' }).click();
  }
  await expect(page.locator('#terminal-iframe')).toBeVisible({ timeout: 120_000 });
  await expect.poll(() => websockets.length, { timeout: 20_000 }).toBeGreaterThan(0);
  expect(websockets.some((url) => url.includes('/terminal/'))).toBeTruthy();
});

test('live student can run the checker from the portal', async ({ page }) => {
  test.skip(!expectLive, 'set PORTAL_EXPECT_LIVE=true for live checker verification');

  await page.goto(`/labs/${labId}`);
  if (await page.getByRole('button', { name: 'Start Lab' }).isVisible()) {
    await page.getByRole('button', { name: 'Start Lab' }).click();
  }
  await expect(page.getByRole('button', { name: 'Run Check' })).toBeVisible({ timeout: 120_000 });
  await page.evaluate(() => { window.__checkNoReloadMarker = 'still-here'; });
  await page.getByRole('button', { name: 'Run Check' }).click();
  await expect(page.getByRole('heading', { name: /Check Result:/ })).toBeVisible({ timeout: 120_000 });
  await expect.poll(() => page.evaluate(() => window.__checkNoReloadMarker)).toBe('still-here');
});

test('instructor can view lightweight evidence', async ({ page }) => {
  test.skip(portalUser !== 'instructor', 'set PORTAL_USER=instructor for instructor view verification');

  await page.goto('/instructor');
  await expect(page.getByRole('heading', { name: 'Instructor View' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lab State' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'redis-exposed', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'student01', exact: true }).first()).toBeVisible();
});
