const { test, expect } = require('@playwright/test');

const labId = process.env.PORTAL_LAB_ID || 'redis-exposed';
const portalUser = process.env.PORTAL_USER || 'student01';
const portalStudent = process.env.PORTAL_STUDENT_ID || 'student01';

function skipUnlessStudent() {
    test.skip(portalUser === 'instructor', 'student-only portal flow');
}

async function terminalFrame(page) {
    const handle = await page.locator('#terminal-iframe').elementHandle();
    const frame = await handle.contentFrame();
    expect(frame).not.toBeNull();
    return frame;
}

async function terminalBufferText(target) {
    return await target.evaluate(() => {
        if (window.term?.buffer?.active) {
            const lines = [];
            for (let i = 0; i < window.term.buffer.active.length; i += 1) {
                lines.push(window.term.buffer.active.getLine(i).translateToString(true));
            }
            return lines.join('\n');
        }
        return '';
    });
}

async function terminalText(page) {
    return terminalBufferText(await terminalFrame(page));
}

async function expectTerminalReady(target) {
    await expect
        .poll(() => terminalBufferText(target), { timeout: 30_000 })
        .toMatch(/student@|[$#]\s*$/m);
    await expect
        .poll(() => target.locator('body').innerText(), { timeout: 5_000 })
        .not.toContain('Reconnect');
}

test('student can open the portal and lab page', async ({ page }) => {
    skipUnlessStudent();
    page.on('dialog', (dialog) => {
        throw new Error(`Unexpected dialog appeared: ${dialog.message()}`);
    });

    await page.goto('/portal');
    await expect(page.getByRole('heading', { name: 'Available Labs' })).toBeVisible();
    await expect(page.locator('#root')).toHaveCount(1);
    await page.getByRole('link', { name: 'Open Lab' }).first().click();
    await expect(page).toHaveURL(new RegExp(`/labs/${labId}$`));
    await expect(page.locator('.lab-content h1')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Lab Guide' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open Lab Guide' })).toHaveAttribute(
        'href',
        `/docs/labs/${labId}/`
    );
    await expect(page.getByRole('button', { name: /Start Lab|Run Check/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
});

test('student lab links open expected pages', async ({ page, context }) => {
    skipUnlessStudent();
    await page.goto(`/labs/${labId}`);

    const guidePopupPromise = context.waitForEvent('page');
    await page.getByRole('link', { name: 'Open Lab Guide' }).click();
    const guidePopup = await guidePopupPromise;
    await expect(guidePopup.locator('body')).toBeVisible({ timeout: 30_000 });
    expect(guidePopup.url()).toContain(`/docs/labs/${labId}`);
    await guidePopup.close();

    const terminal = page.locator('#terminal-container');
    if (!(await terminal.isVisible())) {
        await page.getByRole('button', { name: 'Start Lab' }).click();
        await expect(terminal).toBeVisible({ timeout: 120_000 });
    }

    const terminalPopupPromise = context.waitForEvent('page');
    await page.getByRole('link', { name: 'Open in tab' }).click();
    const terminalPopup = await terminalPopupPromise;
    await terminalPopup.waitForLoadState('domcontentloaded');
    await expectTerminalReady(terminalPopup);
    expect(terminalPopup.url()).toContain('/terminal/');
    await terminalPopup.close();

    const demoAppLinks = await page.locator('a:has-text("http://")').all();
    for (const link of demoAppLinks) {
        const href = await link.getAttribute('href');
        if (href && href.includes(':180')) {
            const appPopupPromise = context.waitForEvent('page');
            await link.click();
            const appPopup = await appPopupPromise;
            await expect(appPopup.locator('body')).toBeVisible({ timeout: 30_000 });
            await appPopup.close();
        }
    }
});

test('state-changing routes reject missing form tokens', async ({ request }) => {
    const response = await request.post(`/labs/${labId}/start`, {
        form: {},
        maxRedirects: 0,
    });
    expect([400, 422]).toContain(response.status());
});

test('running lab page exposes a resizable terminal pane', async ({ page }) => {
    skipUnlessStudent();
    await page.goto(`/labs/${labId}`);
    const terminal = page.locator('#terminal-container');
    if (!(await terminal.isVisible())) {
        await page.getByRole('button', { name: 'Start Lab' }).click();
    }

    await expect(terminal).toBeVisible({ timeout: 120_000 });
    await expect(page.locator('#terminal-iframe')).toBeVisible();

    const shell = page.locator('#lab-shell');
    const handle = page.locator('#split-handle');
    const before = await shell.evaluate((node) => {
        return node.ownerDocument.defaultView.getComputedStyle(node).gridTemplateColumns;
    });
    await handle.focus();
    await page.keyboard.press('ArrowRight');
    const after = await shell.evaluate((node) => {
        return node.ownerDocument.defaultView
            .getComputedStyle(node)
            .getPropertyValue('--left-pane');
    });
    expect(after).not.toEqual('');
    await expect
        .poll(() => {
            return shell.evaluate((node) => {
                return node.ownerDocument.defaultView.getComputedStyle(node).gridTemplateColumns;
            });
        })
        .not.toBe(before);
});

test('live terminal iframe creates a websocket connection', async ({ page }) => {
    skipUnlessStudent();
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

test('live terminal is writable for the student shell', async ({ page }) => {
    skipUnlessStudent();
    await page.goto(`/labs/${labId}`);
    if (!(await page.locator('#terminal-iframe').isVisible())) {
        await page.getByRole('button', { name: 'Start Lab' }).click();
    }
    await expect(page.locator('#terminal-iframe')).toBeVisible({ timeout: 120_000 });

    const frame = await terminalFrame(page);
    await frame.locator('.xterm-helper-textarea').fill('printf "portal-terminal-ok\\n"');
    await page.keyboard.press('Enter');
    await expect
        .poll(() => terminalText(page), { timeout: 20_000 })
        .toContain('portal-terminal-ok');
});

test('live student can run the checker from the portal', async ({ page }) => {
    skipUnlessStudent();
    await page.goto(`/labs/${labId}`);
    if (await page.getByRole('button', { name: 'Start Lab' }).isVisible()) {
        await page.getByRole('button', { name: 'Start Lab' }).click();
    }
    await expect(page.getByRole('button', { name: 'Run Check' })).toBeVisible({ timeout: 120_000 });
    await page.evaluate(() => {
        window.__checkNoReloadMarker = 'still-here';
    });
    await page.getByRole('button', { name: 'Run Check' }).click();
    await expect(page.getByRole('heading', { name: /Check Result:/ })).toBeVisible({
        timeout: 120_000,
    });
    await expect.poll(() => page.evaluate(() => window.__checkNoReloadMarker)).toBe('still-here');
});

test('instructor can view lightweight evidence', async ({ page }) => {
    test.skip(
        portalUser !== 'instructor',
        'set PORTAL_USER=instructor for instructor view verification'
    );

    await page.goto('/instructor');
    await expect(page.getByRole('heading', { name: 'Instructor View' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Lab State' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recent Terminal Commands' })).toBeVisible();
    await expect(page.getByRole('cell', { name: labId, exact: true }).first()).toBeVisible();
    await expect(
        page.getByRole('cell', { name: portalStudent, exact: true }).first()
    ).toBeVisible();
});
