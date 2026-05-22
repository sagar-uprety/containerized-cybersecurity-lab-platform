const { test, expect } = require('@playwright/test');
const { execFileSync } = require('node:child_process');

test.describe.configure({ mode: 'serial' });

const labId = process.env.PORTAL_LAB_ID || 'redis-exposed';
const studentPassword = process.env.PORTAL_PASSWORD || 'smoke-password';
const destructiveAllowed = process.env.LAB_VERIFIER_ALLOW_DESTRUCTIVE === 'true';

async function goToLab(page) {
  await page.goto(`/labs/${labId}`);
  await expect(page.getByRole('heading', { name: 'The Exposed Cache' })).toBeVisible();
}

async function clickIfVisible(locator, timeout = 1000) {
  try {
    await locator.waitFor({ state: 'visible', timeout });
    await locator.click();
    return true;
  } catch (_error) {
    return false;
  }
}

async function ensureRunning(page) {
  await goToLab(page);
  if (await page.getByRole('button', { name: 'Start Lab' }).isVisible()) {
    await page.getByRole('button', { name: 'Start Lab' }).click();
  }
  await expect(page.getByRole('button', { name: 'Run Check' })).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#terminal-iframe')).toBeVisible({ timeout: 120_000 });
}

async function resetToVulnerableBaseline(page) {
  await ensureRunning(page);
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByRole('button', { name: 'Run Check' })).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#terminal-iframe')).toBeVisible({ timeout: 120_000 });
}

async function terminalFrame(page) {
  await expect(page.locator('#terminal-iframe')).toBeVisible({ timeout: 120_000 });
  const handle = await page.locator('#terminal-iframe').elementHandle();
  const frame = await handle.contentFrame();
  expect(frame).not.toBeNull();
  await frame.locator('.xterm-helper-textarea').focus();
  return frame;
}

async function terminalText(page) {
  const handle = await page.locator('#terminal-iframe').elementHandle();
  const frame = await handle.contentFrame();
  if (!frame) return '';
  return await frame.evaluate(() => {
    if (window.term?.buffer?.active) {
      const lines = [];
      for (let i = 0; i < window.term.buffer.active.length; i += 1) {
        lines.push(window.term.buffer.active.getLine(i).translateToString(true));
      }
      return lines.join('\n');
    }
    const rows = document.querySelector('.xterm-rows');
    return (rows?.innerText || '').replace(/\u00a0/g, ' ');
  });
}

async function typeCommand(page, command, expected, timeout = 45_000) {
  const frame = await terminalFrame(page);
  await frame.locator('.xterm-helper-textarea').fill(command);
  await page.keyboard.press('Enter');
  if (expected) {
    await expect.poll(() => terminalText(page), { timeout }).toMatch(expected);
  }
}

async function typePasswordIfPrompted(page) {
  const prompted = await expect
    .poll(() => terminalText(page), { timeout: 12_000 })
    .toContain('password')
    .then(() => true)
    .catch(() => false);
  if (prompted) {
    await terminalFrame(page);
    await page.keyboard.type(studentPassword, { delay: 10 });
    await page.keyboard.press('Enter');
  }
}

async function runPortalCheck(page, expectedStatus) {
  await expect(page.getByRole('button', { name: 'Run Check' })).toBeVisible({ timeout: 120_000 });
  await page.evaluate(() => { window.__labVerifierNoReload = 'present'; });
  await page.getByRole('button', { name: 'Run Check' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`Check Result: ${expectedStatus}`, 'i') })).toBeVisible({ timeout: 120_000 });
  await expect.poll(() => page.evaluate(() => window.__labVerifierNoReload)).toBe('present');
}

function runOnWorker(command, timeout = 120_000) {
  return execFileSync(
    '../.venv/bin/ansible',
    ['x01', '-i', 'inventory.ini', '-m', 'ansible.builtin.shell', '-a', command],
    { cwd: 'infra', encoding: 'utf8', timeout }
  );
}

function runAsStudent(command, timeout = 120_000) {
  const shellCommand = `set -eu; ${command}`;
  return runOnWorker(
    `podman exec --user student --workdir /home/student redis-exposed_student01_workstation sh -lc ${JSON.stringify(shellCommand)}`,
    timeout
  );
}

test('lifecycle controls and external access links work', async ({ page, context, request }) => {
  test.setTimeout(180_000);
  test.skip(!destructiveAllowed, 'set LAB_VERIFIER_ALLOW_DESTRUCTIVE=true to run destructive lifecycle verification');

  await goToLab(page);
  await clickIfVisible(page.getByRole('button', { name: 'End Lab' }));
  await expect(page.getByRole('button', { name: 'Start Lab' })).toBeVisible({ timeout: 120_000 });

  await page.getByRole('button', { name: 'Start Lab' }).click();
  await expect(page.getByRole('button', { name: 'Run Check' })).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#terminal-iframe')).toBeVisible({ timeout: 120_000 });

  const terminalPopupPromise = context.waitForEvent('page');
  await page.getByRole('link', { name: 'Open in tab' }).click();
  const terminalPopup = await terminalPopupPromise;
  await expect(terminalPopup.locator('body')).toBeVisible({ timeout: 30_000 });
  expect(terminalPopup.url()).toContain('/terminal/19001/');
  await terminalPopup.close();

  const demoHref = await page.locator('a[href*=":18001/"]').getAttribute('href');
  expect(demoHref).toBeTruthy();
  const demoResponse = await request.get(demoHref);
  await expect(demoResponse).toBeOK();
  expect(await demoResponse.text()).toContain('Order cache is reachable');

  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('button', { name: 'Start Lab' })).toBeVisible({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Start Lab' }).click();
  await expect(page.getByRole('button', { name: 'Run Check' })).toBeVisible({ timeout: 120_000 });

  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByRole('button', { name: 'Run Check' })).toBeVisible({ timeout: 120_000 });
  await runPortalCheck(page, 'vulnerable');
});

test('student workflow commands solve the Redis lab end to end', async ({ page }) => {
  test.setTimeout(180_000);
  test.skip(!destructiveAllowed, 'set LAB_VERIFIER_ALLOW_DESTRUCTIVE=true to run destructive lab workflow verification');

  await resetToVulnerableBaseline(page);
  await typeCommand(page, 'echo terminal-writable', /terminal-writable/);

  expect(runAsStudent('cat ~/SITREP.txt')).toMatch(/Your mission:/);
  expect(runAsStudent('ls -l /lab/redis /lab/demo-app')).toMatch(/redis\.conf[\s\S]*app-config\.env|app-config\.env[\s\S]*redis\.conf/);
  expect(runAsStudent('getent hosts redis-host demo-app')).toMatch(/redis-host[\s\S]*demo-app|demo-app[\s\S]*redis-host/);
  expect(runAsStudent('nmap -sV -p 6379 redis-host')).toMatch(/6379\/tcp[\s\S]*open/);
  expect(runAsStudent('nmap -sV -p 8080 demo-app')).toMatch(/8080\/tcp[\s\S]*open/);
  expect(runAsStudent('curl -s http://demo-app:8080/health')).toContain('ok');
  expect(runAsStudent('redis-cli -h redis-host ping')).toContain('PONG');
  expect(runAsStudent("redis-cli -h redis-host keys '*'")).toContain('support_token:demo-only-token');
  expect(runAsStudent('redis-cli -h redis-host get support_token:demo-only-token')).toContain('not-a-real-secret');
  await runPortalCheck(page, 'vulnerable');

  runAsStudent("printf '\\nrequirepass demo-redis-password\\n' >> /lab/redis/redis.conf");
  runAsStudent("printf 'REDIS_PASSWORD=demo-redis-password\\n' > /lab/demo-app/app-config.env");
  expect(runOnWorker('podman exec --user redisadmin redis-exposed_student01_redis_host sudo /usr/local/sbin/restart-redis')).toContain('Redis restarted');
  expect(runAsStudent('redis-cli -h redis-host ping || true')).toMatch(/NOAUTH|Authentication required/i);
  expect(runAsStudent('redis-cli -h redis-host -a demo-redis-password ping')).toContain('PONG');
  expect(runAsStudent('curl -s http://demo-app:8080/health')).toContain('ok');
  await runPortalCheck(page, 'fixed');

  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByRole('button', { name: 'Run Check' })).toBeVisible({ timeout: 120_000 });
  await runPortalCheck(page, 'vulnerable');
});
