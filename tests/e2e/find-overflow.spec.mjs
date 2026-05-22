// Diagnostic: find which DOM element is wider than the viewport.
// Prints the top 10 offenders. Run on pixel5 to debug horizontal overflow.
import { test, expect } from '@playwright/test';

const FAKE = {
  employeeId: 'QA001', firstName: 'QA', lastName: 'Tester', nickname: 'qa',
  section: 'QA', department: 'IT', phone: '0800000000',
  role: 'system', isAdmin: true, itRole: 'admin', driverRole: 'admin', meetingRole: 'admin',
};

async function findOffenders(page, label) {
  const result = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const all = Array.from(document.querySelectorAll('*'));
    const offenders = [];
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 2 && r.width > 0 && r.height > 0) {
        const cs = getComputedStyle(el);
        // Skip if hidden / display:none
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        offenders.push({
          tag: el.tagName.toLowerCase(),
          id: el.id || '',
          cls: (el.className || '').toString().slice(0, 80),
          right: Math.round(r.right),
          width: Math.round(r.width),
          left: Math.round(r.left),
          pos: cs.position,
          text: (el.textContent || '').trim().slice(0, 40),
        });
      }
    }
    offenders.sort((a, b) => b.right - a.right);
    return { vw, offenders: offenders.slice(0, 15) };
  });
  console.log(`\n[${label}] viewport=${result.vw}`);
  for (const o of result.offenders) {
    console.log(`  right=${o.right} w=${o.width} <${o.tag}${o.id?'#'+o.id:''}> "${o.cls.slice(0,50)}" — ${o.text}`);
  }
}

test.use({ ...({ } )});

test.beforeEach(async ({ page }) => {
  await page.addInitScript((u) => {
    sessionStorage.setItem('ticketUser', JSON.stringify(u));
    sessionStorage.setItem('ticketPwd', 'fake');
    localStorage.setItem('mr_user', JSON.stringify({
      code: u.employeeId, name: u.firstName + ' ' + u.lastName,
      nickname: u.nickname, dept: u.department, position: '', role: 'admin',
    }));
  }, FAKE);
});

test('overflow on hub', async ({ page }) => {
  await page.goto('/hub');
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(()=>{});
  await page.waitForTimeout(1500); // give marquee + status pill time
  await findOffenders(page, 'HUB');
});

test('overflow on backfill', async ({ page }) => {
  await page.goto('/it-backfill');
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(()=>{});
  await page.waitForTimeout(1500);
  await findOffenders(page, 'BACKFILL');
});

test('overflow on directory', async ({ page }) => {
  await page.goto('/people');
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(()=>{});
  await page.waitForTimeout(1500);
  await findOffenders(page, 'DIRECTORY');
});

test('overflow on admin', async ({ page }) => {
  await page.goto('/admin');
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(()=>{});
  await page.waitForTimeout(1500);
  await findOffenders(page, 'ADMIN');
});

test('overflow on meeting', async ({ page }) => {
  await page.goto('/meeting/');
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(()=>{});
  await page.waitForTimeout(1500);
  await findOffenders(page, 'MEETING');
});
