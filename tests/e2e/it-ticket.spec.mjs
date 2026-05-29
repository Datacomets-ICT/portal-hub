// E2E for IT-Ticket — bypasses login by injecting a fake user into
// sessionStorage before the page loads (the app's init() reads
// 'ticketUser' from sessionStorage and skips the login screen).
//
// Tests the user-facing chat flow end-to-end against the live Vercel
// deploy: home → AI chat → typed message → bot reply → click numbered
// option → multi-turn conversation → reaches CREATE_TICKET draft.
import { test, expect } from '@playwright/test';

const FAKE_USER = {
  employeeId: 'QA001',
  firstName: 'QA',
  lastName: 'Tester',
  nickname: 'qa',
  section: 'QA',
  department: 'IT',
  phone: '0800000000',
  role: 'user',
  itRole: 'user',
  email: 'qa@example.com',
};

// Inject the fake session BEFORE any page script runs. Without this
// the app boots into the login screen and our tests can't see #tabHome.
test.beforeEach(async ({ page }) => {
  await page.addInitScript((user) => {
    sessionStorage.setItem('ticketUser', JSON.stringify(user));
    sessionStorage.setItem('ticketPwd', 'fake');
  }, FAKE_USER);
});

test.describe('IT-Ticket chatbot — UI flows', () => {
  test('1. home page loads with logged-in user', async ({ page }) => {
    await page.goto('/it/');
    // Login screen should NOT be visible (sessionStorage bypass worked)
    await expect(page.locator('#loginForm')).toBeHidden();
    // Home cards should be present
    await expect(page.locator('#tabHome')).toBeVisible();
    await expect(page.locator('.home-card--report')).toBeVisible();
    await expect(page.locator('.home-card--track')).toBeVisible();
    // Greeting personalised
    await expect(page.locator('#homeGreetName')).toContainText('qa');
  });

  test('2. opens AI chat tab and shows greeting', async ({ page }) => {
    await page.goto('/it/');
    await page.locator('.home-card--report').click();
    // Report tab visible
    await expect(page.locator('#tabReport')).toBeVisible();
    // Bot greeting bubble appears within a few seconds
    const firstBotMsg = page.locator('#chatBody .chat-msg.bot').first();
    await expect(firstBotMsg).toBeVisible({ timeout: 10_000 });
    await expect(firstBotMsg).toContainText('สวัสดี');
  });

  test('3. sends a message and bot replies', async ({ page }) => {
    await page.goto('/it/');
    await page.locator('.home-card--report').click();
    // Wait for greeting so we know the chat is ready
    await page.locator('#chatBody .chat-msg.bot').first().waitFor();

    await page.locator('#chatInput').fill('email เต็ม');
    await page.locator('#chatSendBtn').click();

    // The user bubble should appear immediately
    const userBubbles = page.locator('#chatBody .chat-msg.user');
    await expect(userBubbles.last()).toContainText('email เต็ม');

    // Then a SECOND bot reply (greeting was first) — wait up to 30s
    // for the cascade to return.
    await expect.poll(
      async () => await page.locator('#chatBody .chat-msg.bot').count(),
      { timeout: 30_000 }
    ).toBeGreaterThanOrEqual(2);
  });

  test('4. numbered list options are clickable', async ({ page }) => {
    await page.goto('/it/');
    await page.locator('.home-card--report').click();
    await page.locator('#chatBody .chat-msg.bot').first().waitFor();

    // Use a generic phrase that reliably triggers the device picker
    // (which contains a numbered list with `?`).
    const before = await page.locator('#chatBody .chat-msg.bot').count();
    await page.locator('#chatInput').fill('คอมมีปัญหา');
    await page.locator('#chatSendBtn').click();

    // Wait for the new bot bubble (greeting was the first one).
    await expect.poll(
      async () => await page.locator('#chatBody .chat-msg.bot').count(),
      { timeout: 30_000 }
    ).toBeGreaterThan(before);

    // Pull the latest bot bubble and find numbered-step divs inside it.
    // Check the actual DOM structure rather than just relying on the
    // .chat-step-clickable class — the regex that adds that class is
    // sensitive to text formatting nuances.
    const lastBot = page.locator('#chatBody .chat-msg.bot').last();
    const stepCount = await lastBot.locator('.chat-step').count();
    const clickableCount = await lastBot.locator('.chat-step.chat-step-clickable').count();

    console.log(`  bot reply has ${stepCount} numbered steps, ${clickableCount} clickable`);
    if (stepCount === 0) {
      // Bot didn't return a numbered list — print what it did say so we
      // can see what flow it took.
      const text = await lastBot.innerText();
      console.log(`  bot said: ${text.slice(0, 200)}`);
      throw new Error('Bot reply contained no numbered list to click');
    }

    expect(stepCount).toBeGreaterThanOrEqual(2);
    expect(clickableCount).toBeGreaterThanOrEqual(2);

    // Click the first option — verify a user bubble shows up after
    const optionText = (await lastBot.locator('.chat-step').first().innerText()).trim();
    const userBefore = await page.locator('#chatBody .chat-msg.user').count();
    await lastBot.locator('.chat-step').first().click();
    await expect.poll(
      async () => await page.locator('#chatBody .chat-msg.user').count(),
      { timeout: 5_000 }
    ).toBeGreaterThan(userBefore);
  });

  test('5. multi-turn conversation reaches CREATE_TICKET prompt', async ({ page }) => {
    await page.goto('/it/');
    await page.locator('.home-card--report').click();
    await page.locator('#chatBody .chat-msg.bot').first().waitFor();

    // Helper: send + wait for next bot reply
    async function sendAndWait(text) {
      const before = await page.locator('#chatBody .chat-msg.bot').count();
      await page.locator('#chatInput').fill(text);
      await page.locator('#chatSendBtn').click();
      await expect.poll(
        async () => await page.locator('#chatBody .chat-msg.bot').count(),
        { timeout: 30_000, intervals: [500, 1000, 2000] }
      ).toBeGreaterThan(before);
      // Small pause so the bot bubble fully renders before next send
      await page.waitForTimeout(300);
    }

    await sendAndWait('email เต็ม');
    await sendAndWait('อีเมลเต็ม');
    await sendAndWait('Comets HQ');
    await sendAndWait('ชั้น 2');
    await sendAndWait('บัญชี');
    await sendAndWait('สำคัญ');

    // The bot should now have asked to confirm OR offered ticket draft.
    // Either a confirm-yes button shows up, or the bot text mentions "Ticket".
    const allBotText = await page.locator('#chatBody .chat-msg.bot').allInnerTexts();
    const lastFew = allBotText.slice(-3).join(' ');
    expect(lastFew).toMatch(/Ticket|สรุป|เปิด/i);
  });

  test('6. no debug bubble or error in successful flow', async ({ page }) => {
    // Catches console errors and unexpected "[debug:" text leaking into
    // bot replies — would mean the cascade is failing intermittently.
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });

    await page.goto('/it/');
    await page.locator('.home-card--report').click();
    await page.locator('#chatBody .chat-msg.bot').first().waitFor();

    await page.locator('#chatInput').fill('SAP เข้าไม่ได้');
    await page.locator('#chatSendBtn').click();

    await expect.poll(
      async () => await page.locator('#chatBody .chat-msg.bot').count(),
      { timeout: 30_000 }
    ).toBeGreaterThanOrEqual(2);

    const allBotText = (await page.locator('#chatBody .chat-msg.bot').allInnerTexts()).join(' ');
    // No debug bubble = no cascade exhaustion
    expect(allBotText).not.toContain('[debug:');
    expect(allBotText).not.toContain('เอ๊ะ AI ติดขัด');
    // Filter out CDN/font noise that's not actionable
    const meaningfulErrors = errors.filter(
      (e) => !e.includes('fonts.googleapis') && !e.includes('cdnjs') && !e.includes('favicon')
    );
    expect(meaningfulErrors).toEqual([]);
  });
});
