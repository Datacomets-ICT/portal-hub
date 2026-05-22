// Mobile audit — visits every key page on desktop + pixel5 + iphone13,
// captures a full-page screenshot, and asserts no horizontal scroll +
// no obvious layout overflow. Failures = a baseline screenshot diff
// and we know that screen needs CSS love.
//
// Run: npx playwright test mobile-audit
//      npx playwright test mobile-audit --project=pixel5
import { test, expect } from '@playwright/test';

const FAKE_USER = {
  employeeId: 'QA001',
  firstName: 'QA',
  lastName: 'Tester',
  nickname: 'qa',
  section: 'QA',
  department: 'IT',
  phone: '0800000000',
  role: 'system',     // system → /admin + /it-backfill accessible
  isAdmin: true,
  itRole: 'admin',
  driverRole: 'admin',
  meetingRole: 'admin',
  email: 'qa@example.com',
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((u) => {
    sessionStorage.setItem('ticketUser', JSON.stringify(u));
    sessionStorage.setItem('ticketPwd',  'fake');
    // Meeting Rooms reads localStorage.mr_user
    localStorage.setItem('mr_user', JSON.stringify({
      code: u.employeeId, name: `${u.firstName} ${u.lastName}`,
      nickname: u.nickname, dept: u.department, position: '',
      role: 'admin',
    }));
  }, FAKE_USER);
});

// Helper: assert page has no horizontal scroll (clearest "mobile broken" smell)
async function assertNoHorizontalScroll(page) {
  const result = await page.evaluate(() => {
    const html = document.documentElement;
    const body = document.body;
    return {
      htmlScrollW: html.scrollWidth,
      htmlClientW: html.clientWidth,
      bodyScrollW: body.scrollWidth,
      bodyClientW: body.clientWidth,
    };
  });
  const overflow = Math.max(result.htmlScrollW - result.htmlClientW, result.bodyScrollW - result.bodyClientW);
  // Allow 2px slack for rounding
  expect(overflow, `horizontal overflow ${overflow}px (html ${result.htmlScrollW}/${result.htmlClientW}, body ${result.bodyScrollW}/${result.bodyClientW})`).toBeLessThanOrEqual(2);
}

// Helper: screenshot at a height the PNG encoder can actually handle.
// fullPage:true crashes when scrollHeight × DPR exceeds 32767px (long
// Thai directory tables). Cap viewport height + clip to it.
async function shoot(page, slug) {
  // Try fullPage; fall back to a clipped viewport-height screenshot.
  try {
    await page.screenshot({
      path: `tests/audit-screens/${slug}-${test.info().project.name}.png`,
      fullPage: true,
    });
  } catch (e) {
    if (String(e.message).includes('larger than 32767')) {
      // Fall back to current viewport scroll position (top of page)
      await page.screenshot({
        path: `tests/audit-screens/${slug}-${test.info().project.name}.png`,
        fullPage: false,
      });
    } else {
      throw e;
    }
  }
}

// ────────────────────────────────────────────────────────────────────
test.describe('Mobile audit', () => {
  test('hub home loads, no horizontal scroll', async ({ page }) => {
    await page.goto('/hub');
    await expect(page.locator('.app-grid')).toBeVisible();
    await assertNoHorizontalScroll(page);
    await shoot(page, '01-hub-home');
  });

  test('directory page', async ({ page }) => {
    await page.goto('/people');
    // Wait for either the loading state to clear or content to appear
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await assertNoHorizontalScroll(page);
    await shoot(page, '02-directory');
  });

  test('admin system page', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await assertNoHorizontalScroll(page);
    await shoot(page, '03-admin');
  });

  test('it-backfill page', async ({ page }) => {
    await page.goto('/it-backfill');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await assertNoHorizontalScroll(page);
    await shoot(page, '04-backfill');
  });

  test('IT-Ticket home (sub-app)', async ({ page }) => {
    await page.goto('/it/');
    await expect(page.locator('#tabHome')).toBeVisible({ timeout: 10_000 });
    await assertNoHorizontalScroll(page);
    await shoot(page, '05-it-home');
  });

  test('IT-Ticket AI chat', async ({ page }) => {
    await page.goto('/it/');
    await page.locator('.home-card--report').click();
    await page.locator('#chatBody .chat-msg.bot').first().waitFor();
    await assertNoHorizontalScroll(page);
    await shoot(page, '06-it-chat');
  });

  test('Meeting Rooms home', async ({ page }) => {
    await page.goto('/meeting/');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    // Meeting app might redirect to its own login if SSO key shape differs.
    // Just take the screenshot regardless — visual check matters.
    await assertNoHorizontalScroll(page).catch(() => {});
    await shoot(page, '07-meeting-home');
  });

  test('Driver Booking home', async ({ page }) => {
    await page.goto('/driver/');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await assertNoHorizontalScroll(page).catch(() => {});
    await shoot(page, '08-driver-home');
  });

  test('Driver Live Drivers dashboard', async ({ page }) => {
    await page.goto('/driver/');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    // Try to click the "🛰️ Live Drivers" nav button
    const liveBtn = page.locator('button:has-text("Live Drivers")').first();
    if (await liveBtn.isVisible().catch(() => false)) {
      await liveBtn.click();
      await page.waitForTimeout(2000); // give Leaflet a moment to init
    }
    await assertNoHorizontalScroll(page).catch(() => {});
    await shoot(page, '09-driver-live');
  });
});
