const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test.describe.configure({ mode: 'serial' });

const studentPassword = process.env.PORTAL_PASSWORD || 'smoke-password';
const destructiveAllowed = process.env.LAB_VERIFIER_ALLOW_DESTRUCTIVE === 'true';

// Discover all labs dynamically
const labsDir = path.join(__dirname, '../../labs');
const labs = fs.readdirSync(labsDir).filter((name) => {
    return (
        fs.statSync(path.join(labsDir, name)).isDirectory() &&
        fs.existsSync(path.join(labsDir, name, 'scenario.yaml'))
    );
});

async function goToLab(page, labId) {
    // Fail the test if an unexpected dialog (like beforeunload) appears
    page.on('dialog', (dialog) => {
        throw new Error(`Unexpected dialog appeared: ${dialog.message()}`);
    });

    await page.goto(`/labs/${labId}`);
    await expect(page.locator('.lab-content')).toBeVisible();
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
        return '';
    });
}

async function sendTerminalLine(page, frame, line) {
    await frame.locator('.xterm').click();
    await page.keyboard.type(line, { delay: 1 });
    await page.keyboard.press('Enter');
}

function hasTrailingPasswordPrompt(output) {
    return /(^|\n)[^\n]*password:\s*$/i.test(output);
}

async function runPortalCheck(page, expectedStatus) {
    await expect(page.getByRole('button', { name: 'Run Check' })).toBeVisible({ timeout: 120_000 });
    await page.evaluate(() => {
        window.__labVerifierNoReload = 'present';
    });
    await page.getByRole('button', { name: 'Run Check' }).click();
    await expect(
        page.getByRole('heading', { name: new RegExp(`Check Result: ${expectedStatus}`, 'i') })
    ).toBeVisible({ timeout: 120_000 });
    await expect.poll(() => page.evaluate(() => window.__labVerifierNoReload)).toBe('present');
}

for (const labId of labs) {
    test.describe(`Universal Verifier: ${labId}`, () => {
        test('baseline checker reports vulnerable after clean start', async ({ page }) => {
            test.setTimeout(180_000);
            test.skip(!destructiveAllowed, 'set LAB_VERIFIER_ALLOW_DESTRUCTIVE=true');

            await goToLab(page, labId);

            // End lab if it's already running to start clean
            if (await page.getByRole('button', { name: 'End Lab' }).isVisible()) {
                await page.getByRole('button', { name: 'End Lab' }).click();
            }

            await expect(page.getByRole('button', { name: 'Start Lab' })).toBeVisible({
                timeout: 120_000,
            });
            await page.getByRole('button', { name: 'Start Lab' }).click();
            await expect(page.getByRole('button', { name: 'Run Check' })).toBeVisible({
                timeout: 120_000,
            });

            // Check baseline
            await runPortalCheck(page, 'vulnerable');
        });

        test('executes markdown guide commands to solve the lab', async ({ page }) => {
            test.setTimeout(300_000);
            test.skip(!destructiveAllowed, 'set LAB_VERIFIER_ALLOW_DESTRUCTIVE=true');

            // 1. Reset to baseline
            await goToLab(page, labId);
            if (await page.getByRole('button', { name: 'Start Lab' }).isVisible()) {
                await page.getByRole('button', { name: 'Start Lab' }).click();
            }
            await expect(page.getByRole('button', { name: 'Reset' })).toBeVisible({
                timeout: 120_000,
            });
            await Promise.all([
                page.waitForLoadState('domcontentloaded'),
                page.getByRole('button', { name: 'Reset' }).click(),
            ]);

            await expect(page.getByRole('button', { name: 'Run Check' })).toBeVisible({
                timeout: 120_000,
            });
            await expect(page.locator('#terminal-iframe')).toBeVisible({ timeout: 120_000 });

            // 2. Read the canonical guide
            const guidePath = path.join(__dirname, `../../docs/labs/${labId}.md`);
            const guideContent = fs.readFileSync(guidePath, 'utf8');

            // 3. Extract bash code blocks
            const bashBlocks = [];
            const regex = /```bash\n([\s\S]*?)```/g;
            let match;
            while ((match = regex.exec(guideContent)) !== null) {
                bashBlocks.push(match[1]);
            }

            const commands = bashBlocks
                .join('\n')
                .split('\n')
                .map((l) => l.trim())
                .filter((l) => l.length > 0);

            // 4. Execute commands in the terminal
            const handle = await page.locator('#terminal-iframe').elementHandle();
            const frame = await handle.contentFrame();
            await frame.locator('.xterm').click();

            for (const cmd of commands) {
                let prevOutput = await terminalText(page);
                await sendTerminalLine(page, frame, cmd);

                let output = '';
                let waited = 0;
                let answeredPassword = false;

                while (waited < 15000) {
                    await page.waitForTimeout(500);
                    waited += 500;
                    output = await terminalText(page);

                    if (hasTrailingPasswordPrompt(output) && !answeredPassword) {
                        await page.keyboard.type(studentPassword, { delay: 5 });
                        await page.keyboard.press('Enter');
                        answeredPassword = true;
                    }

                    // If prompt returned and output has changed from before, we assume command finished
                    if (
                        output !== prevOutput &&
                        (output.match(/[$#]\s*$/) || output.endsWith('$ ') || output.endsWith('# '))
                    ) {
                        break;
                    }
                }

                // Check exit code
                prevOutput = await terminalText(page);
                await sendTerminalLine(page, frame, 'echo "EXIT_CODE:$?"');

                waited = 0;
                while (waited < 5000) {
                    await page.waitForTimeout(250);
                    waited += 250;
                    output = await terminalText(page);
                    if (
                        output !== prevOutput &&
                        (output.match(/[$#]\s*$/) || output.endsWith('$ ') || output.endsWith('# '))
                    ) {
                        break;
                    }
                }

                // Assert command succeeded so we get an exact failure trace if a guide command is broken
                expect(output, `Command failed: ${cmd}\nOutput: ${output}`).toContain(
                    'EXIT_CODE:0'
                );
            }

            // 5. Verify it's fixed!
            await runPortalCheck(page, 'fixed');
        });
    });
}
