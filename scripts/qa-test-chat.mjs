// QA test for IT-Ticket chatbot.
// Hits the deployed /api/chat with a series of multi-turn scenarios and
// logs each turn so we can spot regressions (asking brand, drilling
// into model/spec, missing fields, etc.)
//
// Run: node scripts/qa-test-chat.mjs

const BASE = process.env.BASE_URL || 'https://portal-hub-taupe.vercel.app';
const ENDPOINT = `${BASE}/api/chat`;

// Worklist sample — same shape as what the IT-Ticket frontend builds.
// Real worklist is much larger; keeping it minimal here so we can spot
// the bot inventing options that aren't on the list.
const WORKLIST = [
  { jobType: 'ปัญหาโปรแกรม', issueType: 'Email', symptom: 'เปิดโปรแกรมไม่ได้ | ไม่สามารถรับ/ส่งอีเมลได้ | อีเมลเต็ม | ภาษาเพี้ยน | ขอเพิ่มอีเมล' },
  { jobType: 'ปัญหาโปรแกรม', issueType: 'SAP', symptom: 'ล็อกอินไม่ได้ | รหัสหมดอายุ | เปลี่ยนรหัสผ่าน | ขอสิทธิ์เข้าระบบ SAP' },
  { jobType: 'ปัญหาโปรแกรม', issueType: 'Express', symptom: 'ล็อกอินไม่ได้ | ปริ้นไม่ออก | รหัสหมดอายุ | ขอสิทธิ์เข้าระบบ Express' },
  { jobType: 'ปัญหาเครือข่าย', issueType: 'อินเทอร์เน็ต', symptom: 'เน็ตช้า | wifi หลุด | เน็ตขัดข้อง' },
  { jobType: 'ปัญหาเครือข่าย', issueType: 'VPN', symptom: 'ใช้งานไม่ได้ | ขอรหัสผ่าน | ขอใช้งาน VPN' },
  { jobType: 'คอมพิวเตอร์', issueType: 'PC ตั้งโต๊ะ', symptom: 'หน้าจอฟ้า | เปิดไม่ติด | เครื่องค้าง | รีสตาร์ทเอง' },
  { jobType: 'คอมพิวเตอร์', issueType: 'Notebook', symptom: 'หน้าจอฟ้า | เปิดไม่ติด | เครื่องค้าง | แบตเสื่อม' },
  { jobType: 'คอมพิวเตอร์', issueType: 'Macbook', symptom: 'หน้าจอฟ้า | เปิดไม่ติด | เครื่องค้าง | แบตเสื่อม' },
  { jobType: 'อุปกรณ์ไอที', issueType: 'เมาส์', symptom: 'ไม่ติด | ปุ่มเสีย | เลื่อนไม่ลื่น | ขอเปลี่ยนเมาส์' },
  { jobType: 'อุปกรณ์ไอที', issueType: 'คีย์บอร์ด', symptom: 'พิมพ์ไม่ออก | ปุ่มหลุด | ขอเปลี่ยนคีย์บอร์ด' },
  { jobType: 'ปริ้นเตอร์', issueType: 'ปริ้นเตอร์', symptom: 'ปริ้นไม่ออก | หมึกหมด | กระดาษติด | ขอสิทธิ์ปริ้นเตอร์' },
  { jobType: 'ขอสิทธิ์เข้าระบบ', issueType: 'ขอสิทธิ์เข้าระบบ Express', symptom: 'ขอสิทธิ์เข้าระบบ Express' },
];

// Each scenario is a list of user messages we'll feed in sequence.
// The bot replies between each.
const scenarios = [
  {
    name: 'A. Hardware crash — Notebook (text-only)',
    description: 'User reports laptop crashed. Bot should ask device, then symptom (no brand/model drill-down).',
    redFlags: ['Dell', 'HP', 'Lenovo', 'Asus', 'รุ่น', 'ยี่ห้อ', 'Windows', 'RAM', 'spec'],
    turns: ['notebook พัง เปิดไม่ติด', 'Notebook', 'เปิดไม่ติด', 'Comets HQ', 'ชั้น 3', 'IT', 'ด่วนมาก', 'เปิดเลย'],
  },
  {
    name: 'B. Email — clear symptom',
    description: 'User clearly says email is full. Bot should jump to symptom confirmation, then location.',
    redFlags: ['ยี่ห้อ', 'รุ่น', 'Outlook version', 'IMAP', 'SMTP'],
    turns: ['email เต็ม', 'อีเมลเต็ม', 'Comets HQ', 'ชั้น 2', 'บัญชี', 'สำคัญ', 'เปิดเลย'],
  },
  {
    name: 'C. SAP — ambiguous',
    description: 'User says "SAP เข้าไม่ได้" — bot should list SAP options.',
    redFlags: ['ยี่ห้อ', 'รุ่น', 'version SAP', 'transaction code'],
    turns: ['SAP เข้าไม่ได้', 'ล็อกอินไม่ได้', 'Comets FAC', 'ชั้น 1', 'การตลาด', 'ปกติ', 'เปิดเลย'],
  },
  {
    name: 'D. Permission request',
    description: 'User asks for Express access. Bot should ask location, not check why they need it.',
    redFlags: ['ยี่ห้อ', 'รุ่น', 'reason', 'เพราะอะไร', 'จะใช้ทำไม'],
    turns: ['ขอสิทธิ์ใช้ Express', 'ขอสิทธิ์เข้าระบบ Express', 'ICT', 'ชั้น 2', 'IT', 'ไม่เร่ง', 'เปิดเลย'],
  },
  {
    name: 'E. Generic computer problem (no device specified)',
    description: 'User says "คอมมีปัญหา" — bot should ask device first then symptom.',
    redFlags: ['Dell', 'HP', 'Lenovo', 'Asus', 'Yoga', 'ThinkPad', 'IdeaPad', 'รุ่น', 'ยี่ห้อ', 'Windows version', 'BIOS'],
    turns: ['คอมมีปัญหา', 'Notebook', 'เครื่องค้าง', 'JA', 'ชั้น 4', 'HR', 'สำคัญ', 'เปิดเลย'],
  },
  {
    name: 'F. Mouse problem — should NOT ask device tier',
    description: 'Mouse issue is uncategorized — should go straight to symptom from อุปกรณ์ไอที.',
    redFlags: ['ยี่ห้อ', 'รุ่น', 'Logitech', 'Microsoft', 'wireless'],
    turns: ['เมาส์ไม่ติด', 'ไม่ติด', 'Comets HQ', 'ชั้น 1', 'ขาย', 'ปกติ', 'เปิดเลย'],
  },
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runScenario(s, index) {
  console.log('\n' + '═'.repeat(78));
  console.log(`[${index + 1}/${scenarios.length}] ${s.name}`);
  console.log('─'.repeat(78));
  console.log(`Description: ${s.description}`);
  console.log(`Red flags  : ${s.redFlags.join(', ')}`);
  console.log('─'.repeat(78));

  const history = [];
  const sessionId = `qa-${Date.now()}-${index}`;
  let issuesFound = [];
  let fieldsCollected = { symptom: false, location: false, floor: false, dept: false, priority: false };
  let createTicket = false;

  for (let turn = 0; turn < s.turns.length; turn++) {
    const userMsg = s.turns[turn];
    history.push({ role: 'user', content: userMsg });
    console.log(`\n  USER  ▶ ${userMsg}`);

    let res;
    try {
      const t0 = Date.now();
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history,
          sessionId,
          employeeId: 'QA001',
          worklist: WORKLIST,
          images: [],
        }),
      });
      const dt = Date.now() - t0;
      const data = await res.json();

      if (!res.ok) {
        console.log(`  ERROR ✖ ${res.status}: ${(data.error || 'unknown').slice(0, 200)}`);
        issuesFound.push(`Turn ${turn + 1}: API error ${res.status}`);
        break;
      }

      const reply = data.reply || '';
      const wantsTicket = data.wantsTicket || false;
      console.log(`  BOT   ◀ (${dt}ms${wantsTicket ? ', wantsTicket' : ''})`);
      reply.split('\n').forEach(line => console.log(`         │ ${line}`));

      // Check for red flags
      for (const flag of s.redFlags) {
        if (reply.toLowerCase().includes(flag.toLowerCase())) {
          issuesFound.push(`Turn ${turn + 1}: bot mentioned "${flag}" — should not`);
          console.log(`  ⚠️  RED FLAG: bot said "${flag}"`);
        }
      }

      // Track field progress (rough heuristic — looks for question keywords)
      if (/อยู่โลเคชั่น|อยู่ที่ไหน|location/i.test(reply)) fieldsCollected.location = true;
      if (/ชั้นไหน|ชั้นอะไร|floor/i.test(reply)) fieldsCollected.floor = true;
      if (/แผนกไหน|แผนกอะไร|department|dept/i.test(reply)) fieldsCollected.dept = true;
      if (/ระดับเร่งด่วน|priority|ด่วนแค่ไหน/i.test(reply)) fieldsCollected.priority = true;
      if (wantsTicket) { createTicket = true; fieldsCollected.symptom = true; }

      history.push({ role: 'assistant', content: reply });

      // Be polite — small delay so we don't bombard the API
      await sleep(800);
    } catch (err) {
      console.log(`  ERROR ✖ ${err.message}`);
      issuesFound.push(`Turn ${turn + 1}: fetch error: ${err.message}`);
      break;
    }
  }

  console.log('\n  ─── Scenario verdict ───');
  console.log(`  Fields asked: ${Object.entries(fieldsCollected).filter(([_, v]) => v).map(([k]) => k).join(', ') || 'none'}`);
  console.log(`  Reached [CREATE_TICKET]: ${createTicket ? 'YES' : 'NO'}`);
  console.log(`  Issues found: ${issuesFound.length === 0 ? '✅ NONE' : '❌ ' + issuesFound.length}`);
  for (const issue of issuesFound) console.log(`    - ${issue}`);

  return { name: s.name, issuesFound, fieldsCollected, createTicket };
}

(async () => {
  console.log('═'.repeat(78));
  console.log(' IT-Ticket Chatbot QA — automated test run');
  console.log(` Endpoint: ${ENDPOINT}`);
  console.log(` Started : ${new Date().toISOString()}`);
  console.log('═'.repeat(78));

  const results = [];
  for (let i = 0; i < scenarios.length; i++) {
    const r = await runScenario(scenarios[i], i);
    results.push(r);
    await sleep(1500); // gap between scenarios
  }

  console.log('\n\n' + '═'.repeat(78));
  console.log(' SUMMARY');
  console.log('═'.repeat(78));
  let totalIssues = 0;
  for (const r of results) {
    const icon = r.issuesFound.length === 0 ? '✅' : '❌';
    console.log(`  ${icon} ${r.name}`);
    console.log(`     create ticket: ${r.createTicket ? '✓' : '✗'} | issues: ${r.issuesFound.length}`);
    totalIssues += r.issuesFound.length;
  }
  console.log('─'.repeat(78));
  console.log(` Scenarios   : ${results.length}`);
  console.log(` Issues found: ${totalIssues}`);
  console.log(` Pass rate   : ${results.filter(r => r.issuesFound.length === 0).length}/${results.length}`);
  console.log('═'.repeat(78));
})();
