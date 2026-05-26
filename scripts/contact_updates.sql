-- Contact backfill from 'เบอร์ติดต่อบริษัทในเครือ 05_05_2026.xlsx'
-- Auto-generated. Each UPDATE only fills BLANK fields in employees
-- — never overwrites values the user already set in their profile.
-- Match strategy: STRICT (first_name + last_name). Falls back to
-- first_name only when Excel has a single Thai token AND the employee
-- row also has no last_name. Nickname matching was REMOVED — common
-- Thai nicknames (บี, นัท, มด) caused one Excel contact to inflate
-- in_directory across 5-10 unrelated employees.
-- Run in Supabase SQL Editor. Idempotent — safe to re-run.
--
-- Each row also flips `in_directory = true` so the /people page
-- shows only this month's contact list (RPC list_active_employees
-- filters by this flag — see schema_v49_directory_filter.sql).
-- Anyone NOT in this Excel keeps in_directory = false → hidden from
-- the directory but can still log in.
--
-- Initial password is set to employee_id ONLY when password is empty.
-- Existing custom passwords are kept (re-running monthly won't reset
-- people who already set their own).

begin;

-- Step 1: clear in_directory for everyone, so people removed from
-- this month's Excel drop out of the directory automatically.
update public.employees set in_directory = false;

-- Step 2: per-person updates — contact info + in_directory flag
-- + initial password + auto-approve.

-- [HQ] ศลิษา พิบูลย์สวัสดิ์ (จุ๋ม)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'salisa.p@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0899257375') where (first_name = 'ศลิษา' and last_name = 'พิบูลย์สวัสดิ์');

-- [HQ] วสวัตติ์ โอฬารอธิสิทธิ์ (วัตติ์)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'acc@cometsintertrade.com') where (first_name = 'วสวัตติ์' and last_name = 'โอฬารอธิสิทธิ์');

-- [HQ] วราภร สุขารมณ์ (ภร)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'gl@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0981635932') where (first_name = 'วราภร' and last_name = 'สุขารมณ์');

-- [HQ] ศิริรัตน์ พรมแก้วต่อ (ติ๊ก)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'ap@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0811710681') where (first_name = 'ศิริรัตน์' and last_name = 'พรมแก้วต่อ');

-- [HQ] สุณา หมื่นลูกท้าว (อึ้ม)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'ap02@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0897701195') where (first_name = 'สุณา' and last_name = 'หมื่นลูกท้าว');

-- [HQ] ภาริษา ชินบูรณ์ (อิ๋ว)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'ap03@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0901921583') where (first_name = 'ภาริษา' and last_name = 'ชินบูรณ์');

-- [HQ] แก้วตา สีดาสมา (ตุ๊กตา)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'ap04@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0888968256') where (first_name = 'แก้วตา' and last_name = 'สีดาสมา');

-- [HQ] เบญจรงค์ วงษ์สมัย (อ้อ)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'ar@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0860070764') where (first_name = 'เบญจรงค์' and last_name = 'วงษ์สมัย');

-- [HQ] วิภาพร ควรนาม (เจี๊ยบ)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'fin@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0654141285') where (first_name = 'วิภาพร' and last_name = 'ควรนาม');

-- [HQ] ภัสส์ศา พรมเทศ (ไอซ์)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'fin01@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0944201661') where (first_name = 'ภัสส์ศา' and last_name = 'พรมเทศ');

-- [HQ] ณัฐวดี แซ่ลิ่ม (บิว)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'fin02@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0642067834') where (first_name = 'ณัฐวดี' and last_name = 'แซ่ลิ่ม');

-- [HQ] อรพรรณ ผลงาม (บี)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'cost01@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0909788396') where (first_name = 'อรพรรณ' and last_name = 'ผลงาม');

-- [HQ] วันวิสา เสาวรส (พิม)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'cost02@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0988187182') where (first_name = 'วันวิสา' and last_name = 'เสาวรส');

-- [HQ] อิทธิ อยู่วารีรักษ์ (ทอย)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'scm02@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0844226141') where (first_name = 'อิทธิ' and last_name = 'อยู่วารีรักษ์');

-- [HQ] นลินธารา นีรนัน (ต้นน้ำ)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'scm03@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0839790756') where (first_name = 'นลินธารา' and last_name = 'นีรนัน');

-- [HQ] นัสรีน กาขาว (นัส)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'scm04@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0931283637') where (first_name = 'นัสรีน' and last_name = 'กาขาว');

-- [HQ] พัฒนพล สุขแถม (เอ็ก)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'scm05@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0832517814') where (first_name = 'พัฒนพล' and last_name = 'สุขแถม');

-- [HQ] อัญชิสา เดชยงค์ (ไอซ์)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'scm06@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0955582039') where (first_name = 'อัญชิสา' and last_name = 'เดชยงค์');

-- [HQ] จิตรวรรณ์ ปราชญ์ส่งเสริม (ปัท)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pur01@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0640424544') where (first_name = 'จิตรวรรณ์' and last_name = 'ปราชญ์ส่งเสริม');

-- [HQ] กาญจนา ถาวงษ์กลาง (นก)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pur03@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0986662593') where (first_name = 'กาญจนา' and last_name = 'ถาวงษ์กลาง');

-- [HQ] วัชราภรณ์ รักษ์วงษ์ (มด)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pur04@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0931371285') where (first_name = 'วัชราภรณ์' and last_name = 'รักษ์วงษ์');

-- [HQ] สุพัตรา มีสุข (โบว์)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pur06@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0631961285') where (first_name = 'สุพัตรา' and last_name = 'มีสุข');

-- [HQ] ณัฐฐาพร เอี่ยมแทน (สายป่าน)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'graphic@ictcos.com'), phone = coalesce(nullif(phone, ''), '0612696014') where (first_name = 'ณัฐฐาพร' and last_name = 'เอี่ยมแทน');

-- [HQ] ภาสวิชญ์ โอฬารธนปรีดา (เฟย)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm30@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0904994649') where (first_name = 'ภาสวิชญ์' and last_name = 'โอฬารธนปรีดา');

-- [HQ] พันณ์ภัสร์ บัตรพันธนะ (เมย์)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm02@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0653507502') where (first_name = 'พันณ์ภัสร์' and last_name = 'บัตรพันธนะ');

-- [HQ] วัชราภรณ์ สุดใจ (นุ่น)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm03@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0986662590') where (first_name = 'วัชราภรณ์' and last_name = 'สุดใจ');

-- [HQ] เดือนเพ็ญ ขวัญมงคลทอง (พลอย)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm04@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0653507504') where (first_name = 'เดือนเพ็ญ' and last_name = 'ขวัญมงคลทอง');

-- [HQ] ยศวดี รัตนกุล (ตีตี้)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm05@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0611450115') where (first_name = 'ยศวดี' and last_name = 'รัตนกุล');

-- [HQ] สวิชญา อ่อนประสพ (อันอัน)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm06@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0621546923') where (first_name = 'สวิชญา' and last_name = 'อ่อนประสพ');

-- [HQ] อัจฉราภรณ์ สถาปนศิริ (ไนน์)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm07@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0623104698') where (first_name = 'อัจฉราภรณ์' and last_name = 'สถาปนศิริ');

-- [HQ] ปาลิตา รุ่งเรืองจาตุรันต์ (กลาส)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm08@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0610241285') where (first_name = 'ปาลิตา' and last_name = 'รุ่งเรืองจาตุรันต์');

-- [HQ] ธัญชนก รักษาศิริ (น้ำผึ้ง)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm09@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0916973480') where (first_name = 'ธัญชนก' and last_name = 'รักษาศิริ');

-- [HQ] อริศรา  อินต๊ะนาม (มาย)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm10@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0931696080') where (first_name = 'อริศรา' and last_name = 'อินต๊ะนาม');

-- [HQ] สุปราณี อินทร์ชัย (มิ้นท์)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm11@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0996265235') where (first_name = 'สุปราณี' and last_name = 'อินทร์ชัย');

-- [HQ] จตุพร สมงาม (ป่าน)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm12@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0952547112') where (first_name = 'จตุพร' and last_name = 'สมงาม');

-- [HQ] เพียงรวี ทองสุก (เพียง)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm14@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0833338823') where (first_name = 'เพียงรวี' and last_name = 'ทองสุก');

-- [HQ] ธนภรณ์ ถิ่นสะท้อน (ปุยฝ้าย)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm16@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0930831502') where (first_name = 'ธนภรณ์' and last_name = 'ถิ่นสะท้อน');

-- [HQ] วริษา บุญกำเนิด (กุ้ง)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm31@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0653507501') where (first_name = 'วริษา' and last_name = 'บุญกำเนิด');

-- [HQ] อารีรัตน์ ปุระณะ (บรีน)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm33@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0945499614') where (first_name = 'อารีรัตน์' and last_name = 'ปุระณะ');

-- [HQ] พิเชษฐ์ ศรีชัยยศ (นิว)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm34@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0842132719') where (first_name = 'พิเชษฐ์' and last_name = 'ศรีชัยยศ');

-- [HQ] จุฑามาศ เสสนาเวช (กิ๊ฟ)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm36@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0968271463') where (first_name = 'จุฑามาศ' and last_name = 'เสสนาเวช');

-- [HQ] ศิริรัตน์ เกิดแสง (แม๊ะ)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm38@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0948956635') where (first_name = 'ศิริรัตน์' and last_name = 'เกิดแสง');

-- [HQ] สุดารัตน์ นันทะทอง (ฟ๊อต)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm39@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0956850768') where (first_name = 'สุดารัตน์' and last_name = 'นันทะทอง');

-- [HQ] เจกิตาน์ บุญเรือง (บีม)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'sls01@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0931306566') where (first_name = 'เจกิตาน์' and last_name = 'บุญเรือง');

-- [HQ] อภิญญา หนูช่วย (ฟักแฟง)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'sls02@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0634257260') where (first_name = 'อภิญญา' and last_name = 'หนูช่วย');

-- [HQ] วรสุนาถ คุณพรม (แทม)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'sls03@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0882758141') where (first_name = 'วรสุนาถ' and last_name = 'คุณพรม');

-- [HQ] ปรียาภรณ์ มานะคิด (จีจี้)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), phone = coalesce(nullif(phone, ''), '0952695754') where (first_name = 'ปรียาภรณ์' and last_name = 'มานะคิด');

-- [HQ] ธนบดี เหลาทอง (เติ้ล)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), phone = coalesce(nullif(phone, ''), '0646967494') where (first_name = 'ธนบดี' and last_name = 'เหลาทอง');

-- [HQ] รวิสรา ผลศรี (โอม)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'sls04@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0659851285') where (first_name = 'รวิสรา' and last_name = 'ผลศรี');

-- [HQ] ณัฏฐธิชา เรือนแก้ว (แพร)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'sls05@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0966677411') where (first_name = 'ณัฏฐธิชา' and last_name = 'เรือนแก้ว');

-- [HQ] สุพรรณษา โคตรสมุทร (อ้อ)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'dataadm.comets@gmail.com'), phone = coalesce(nullif(phone, ''), '0625515002') where (first_name = 'สุพรรณษา' and last_name = 'โคตรสมุทร');

-- [HQ] อารียา ใจเฉื่อย (นีน่า)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'salesadm01@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0613833583') where (first_name = 'อารียา' and last_name = 'ใจเฉื่อย');

-- [HQ] อรวี ตรงกาบิน (ฝน)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'salesadmin@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0623106563') where (first_name = 'อรวี' and last_name = 'ตรงกาบิน');

-- [HQ] สุณิสา ศาลากลาง (สุ)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), phone = coalesce(nullif(phone, ''), '0925692269') where (first_name = 'สุณิสา' and last_name = 'ศาลากลาง');

-- [HQ] เบญจมาศ ม่วงประโคน (เบนซ์)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), phone = coalesce(nullif(phone, ''), '0630184969') where (first_name = 'เบญจมาศ' and last_name = 'ม่วงประโคน');

-- [HQ] ศิรินันท์ ศุภสีห์ (มะปราง)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), phone = coalesce(nullif(phone, ''), '0617729377') where (first_name = 'ศิรินันท์' and last_name = 'ศุภสีห์');

-- [HQ] ชนาธิป ศรประภา (เบิร์ด)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'bd@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0659249262') where (first_name = 'ชนาธิป' and last_name = 'ศรประภา');

-- [HQ] อมรรัตน์ เริงนิสสัย (มร)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'hr01@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0639264445') where (first_name = 'อมรรัตน์' and last_name = 'เริงนิสสัย');

-- [HQ] ปราหนัน จักรทิพย์ (ยู)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'hr02@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0958024888') where (first_name = 'ปราหนัน' and last_name = 'จักรทิพย์');

-- [HQ] สุพิชญา เกิดทอง (แก้ม)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'hr03@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0925349865') where (first_name = 'สุพิชญา' and last_name = 'เกิดทอง');

-- [HQ] ณัฐวดี ยุโซบ (ดา)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'hr04@ictcos.com'), phone = coalesce(nullif(phone, ''), '0809055797') where (first_name = 'ณัฐวดี' and last_name = 'ยุโซบ');

-- [HQ] ฟาริตา บัวแช่ม (แพม)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'hr04@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0945851810') where (first_name = 'ฟาริตา' and last_name = 'บัวแช่ม');

-- [HQ] ณฐกานต์ คำโสกเชือก (เบนซ์)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'hr05@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0882481633') where (first_name = 'ณฐกานต์' and last_name = 'คำโสกเชือก');

-- [HQ] จิตรลดา ทรัพย์เสริมสิน (กิ๊ก)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'cometsadm@gmail.com'), phone = coalesce(nullif(phone, ''), '0850453746') where (first_name = 'จิตรลดา' and last_name = 'ทรัพย์เสริมสิน');

-- [HQ] สุนิดา  เกลี้ยงจันทร์ (ขิม)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), phone = coalesce(nullif(phone, ''), '0952212054') where (first_name = 'สุนิดา' and last_name = 'เกลี้ยงจันทร์');

-- [HQ] IT
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'it@cometsintertrade.com') where (first_name = 'IT' and (last_name is null or last_name = ''));

-- [HQ] ปณิธิ ช้างแรงการ (คอรีด)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'it01@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0982460568') where (first_name = 'ปณิธิ' and last_name = 'ช้างแรงการ');

-- [HQ] ณิศวรา ยูรนิยม (ปุ๊ก)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'it02@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0809826991') where (first_name = 'ณิศวรา' and last_name = 'ยูรนิยม');

-- [HQ] นันทวัฒน์ จุ่นแก้ว (ยาม้าล)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), phone = coalesce(nullif(phone, ''), '0903248576') where (first_name = 'นันทวัฒน์' and last_name = 'จุ่นแก้ว');

-- [HQ] ศราวุฒิ อากาศเย็น (แชมป์)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'it03@cometsintertrade.com') where (first_name = 'ศราวุฒิ' and last_name = 'อากาศเย็น');

-- [HQ] จริยา นาครทรรพ (พี่ปุ้ย)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'vpsproperty1@gmail.com'), phone = coalesce(nullif(phone, ''), '0818152976') where (first_name = 'จริยา' and last_name = 'นาครทรรพ');

-- [Fac] วรพล พิบูลย์สวัสดิ์ (อู๋)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'vorapol.p@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0813713515') where (first_name = 'วรพล' and last_name = 'พิบูลย์สวัสดิ์');

-- [Fac] ธีรตา พูลโภคะ (ฟาง)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pd01@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0905983663') where (first_name = 'ธีรตา' and last_name = 'พูลโภคะ');

-- [Fac] ไตรภพ สงวนงาม (ภพ)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pd02@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0972194917') where (first_name = 'ไตรภพ' and last_name = 'สงวนงาม');

-- [Fac] สุกัญญา พาชารี (แอม)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), phone = coalesce(nullif(phone, ''), '0870115233') where (first_name = 'สุกัญญา' and last_name = 'พาชารี');

-- [Fac] ณัฐมล นิมา (นัส)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), phone = coalesce(nullif(phone, ''), '0645593182') where (first_name = 'ณัฐมล' and last_name = 'นิมา');

-- [Fac] ชินสีห์   จักร์น้ำอ่าง (อั้ม)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), phone = coalesce(nullif(phone, ''), '0839161421') where (first_name = 'ชินสีห์' and last_name = 'จักร์น้ำอ่าง');

-- [Fac] ปองกานต์ ตาพะขาว (ข้าวโพด)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), phone = coalesce(nullif(phone, ''), '0980346275') where (first_name = 'ปองกานต์' and last_name = 'ตาพะขาว');

-- [Fac] สหรัตน์ เดชพล (ต๊ะ)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), phone = coalesce(nullif(phone, ''), '0961600294') where (first_name = 'สหรัตน์' and last_name = 'เดชพล');

-- [Fac] ศักดิ์ดา ไชยลังการ์ (ศักดิ์)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), phone = coalesce(nullif(phone, ''), '0625073827') where (first_name = 'ศักดิ์ดา' and last_name = 'ไชยลังการ์');

-- [Fac] อรกัญญา นุเวที (แนน)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'wh01@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0835417346') where (first_name = 'อรกัญญา' and last_name = 'นุเวที');

-- [Fac] โชติกา ชัยมัง (ยุ้ย)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'wh02@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0619638936') where (first_name = 'โชติกา' and last_name = 'ชัยมัง');

-- [Fac] อรุณี พิมพ์จันทร์ (อ้อย)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), phone = coalesce(nullif(phone, ''), '0924036776') where (first_name = 'อรุณี' and last_name = 'พิมพ์จันทร์');

-- [Fac] ธนโชค ปาปะไน (พีม)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), phone = coalesce(nullif(phone, ''), '0801373544') where (first_name = 'ธนโชค' and last_name = 'ปาปะไน');

-- [Fac] วนิดา ขันทศกรณ์ (กีต้าร์)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'wh03@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0825575762') where (first_name = 'วนิดา' and last_name = 'ขันทศกรณ์');

-- [Fac] จรีนุช บุดสา
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), phone = coalesce(nullif(phone, ''), '0631967518') where (first_name = 'จรีนุช' and last_name = 'บุดสา');

-- [Fac] ณัฐวัฒน์ พาไธสง (จีโน่)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), phone = coalesce(nullif(phone, ''), '0823624020') where (first_name = 'ณัฐวัฒน์' and last_name = 'พาไธสง');

-- [Fac] นรวัฒน์ วงศ์วัฒธนโชติ (วิน)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'ri@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0958647500') where (first_name = 'นรวัฒน์' and last_name = 'วงศ์วัฒธนโชติ');

-- [Fac] ธนกร ปงยานะ (เจอาร์)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'ri@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0644355428') where (first_name = 'ธนกร' and last_name = 'ปงยานะ');

-- [Fac] ธิดารัตน์ จันทร์เดช (เบลล์)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'qc03@cometsintertrade.com'), phone = coalesce(nullif(phone, ''), '0934380776') where (first_name = 'ธิดารัตน์' and last_name = 'จันทร์เดช');

-- [Fac] รุ่งรัตน์ ธงวิชัย (อิ๋ว)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), phone = coalesce(nullif(phone, ''), '0865130053') where (first_name = 'รุ่งรัตน์' and last_name = 'ธงวิชัย');

-- [Fac] สายธาร เขียวจันทร์ (ปอ)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), phone = coalesce(nullif(phone, ''), '0966026494') where (first_name = 'สายธาร' and last_name = 'เขียวจันทร์');

-- [Fac] กานต์ธีรา วุทธา (แป้ง)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'cometsadm@gmail.com'), phone = coalesce(nullif(phone, ''), '0812402137') where (first_name = 'กานต์ธีรา' and last_name = 'วุทธา');

-- [Fac] กานต์ธีรา วุทธา (กิ๊ก)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), phone = coalesce(nullif(phone, ''), '0811207974') where (first_name = 'กานต์ธีรา' and last_name = 'วุทธา');

-- [Fac] สายชล ศรีสงคราม (ยุ้ย)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), phone = coalesce(nullif(phone, ''), '0947728140') where (first_name = 'สายชล' and last_name = 'ศรีสงคราม');

-- [Fac] หล่า แสดขุนทด (หล่า (Messenger))
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), phone = coalesce(nullif(phone, ''), '0968239767') where (first_name = 'หล่า' and last_name = 'แสดขุนทด');

-- [Fac] ชนะชล ศรีทน (โต้ง (Messenger))
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), phone = coalesce(nullif(phone, ''), '0927607605') where (first_name = 'ชนะชล' and last_name = 'ศรีทน');

-- [Fac] วัชระ แสดง (เทิด (ช่าง))
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), phone = coalesce(nullif(phone, ''), '0839369943') where (first_name = 'วัชระ' and last_name = 'แสดง');

-- [Fac] วัฒนพงษ์ ใจซื่อ (พงษ์ (ช่าง))
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), phone = coalesce(nullif(phone, ''), '0930852109') where (first_name = 'วัฒนพงษ์' and last_name = 'ใจซื่อ');

-- [Fac] นันทร บัวเขียว (นัน (แม่บ้าน))
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), phone = coalesce(nullif(phone, ''), '0890640397') where (first_name = 'นันทร' and last_name = 'บัวเขียว');

-- [ICT] สฤษฏ์รัช พิบูลย์สวัสดิ์ (โอม)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'saritrach.p@ictcos.com'), phone = coalesce(nullif(phone, ''), '0819211285') where (first_name = 'สฤษฏ์รัช' and last_name = 'พิบูลย์สวัสดิ์');

-- [ICT] ไกรสีห์  วงศ์อนวัช (กิตติ)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'csl@ictcos.com'), phone = coalesce(nullif(phone, ''), '0818337301') where (first_name = 'ไกรสีห์' and last_name = 'วงศ์อนวัช');

-- [ICT] ปาจรี มัทนวงศ์ไพบูลย์ (แป้ง)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pm01@ictcos.com'), phone = coalesce(nullif(phone, ''), '0985653561') where (first_name = 'ปาจรี' and last_name = 'มัทนวงศ์ไพบูลย์');

-- [ICT] ัฐพงศ์ วงศ์อนวัช (นัท)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pmi@ictcos.com'), phone = coalesce(nullif(phone, ''), '0858482135') where (first_name = 'ัฐพงศ์' and last_name = 'วงศ์อนวัช');

-- [ICT] วิฑูรย์ ควรรู้ (โต้ง)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'acc01@ictcos.com'), phone = coalesce(nullif(phone, ''), '0968907476') where (first_name = 'วิฑูรย์' and last_name = 'ควรรู้');

-- [ICT] นิชาภัทร กาญจนฉวี (นุช)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'acc02@ictcos.com'), phone = coalesce(nullif(phone, ''), '0829962498') where (first_name = 'นิชาภัทร' and last_name = 'กาญจนฉวี');

-- [ICT] ปนัดดา เย็นสุข (นุ่น)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'acc03@ictcos.com'), phone = coalesce(nullif(phone, ''), '0828869540') where (first_name = 'ปนัดดา' and last_name = 'เย็นสุข');

-- [ICT] พรวิมล พลบำรุง (ดรีม)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'acc04@ictcos.com'), phone = coalesce(nullif(phone, ''), '0910325026') where (first_name = 'พรวิมล' and last_name = 'พลบำรุง');

-- [ICT] วีระศักดิ์ พรมมานอก (เบ๊นซ์)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'ap@ictcos.com, gl2@ictcos.com'), phone = coalesce(nullif(phone, ''), '0635963585') where (first_name = 'วีระศักดิ์' and last_name = 'พรมมานอก');

-- [ICT] ณัฏฐา ใจแสน (กุ๊กไก่)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'cost02@ictcos.com'), phone = coalesce(nullif(phone, ''), '0987466107') where (first_name = 'ณัฏฐา' and last_name = 'ใจแสน');

-- [ICT] เสาร์ฤดี คำขวา (เตย)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'cost04@ictcos.com'), phone = coalesce(nullif(phone, ''), '0633821047') where (first_name = 'เสาร์ฤดี' and last_name = 'คำขวา');

-- [ICT] ฐณัฏชฌาณันท์ กอสันเทียะ (กล้วย)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'fin@ictcos.com'), phone = coalesce(nullif(phone, ''), '0952508345') where (first_name = 'ฐณัฏชฌาณันท์' and last_name = 'กอสันเทียะ');

-- [ICT] ธนัญกรณ์ อัครพลไพศาล (มาย)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'eng01@ictcos.com'), phone = coalesce(nullif(phone, ''), '0927957892') where (first_name = 'ธนัญกรณ์' and last_name = 'อัครพลไพศาล');

-- [ICT] วิชัย นาอุดม (ป้อม)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'eng02@ictcos.com'), phone = coalesce(nullif(phone, ''), '0845669699') where (first_name = 'วิชัย' and last_name = 'นาอุดม');

-- [ICT] วรัญญา ผู้กองชนะ (ป๊อป)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'eng03@ictcos.com'), phone = coalesce(nullif(phone, ''), '0963862658') where (first_name = 'วรัญญา' and last_name = 'ผู้กองชนะ');

-- [ICT] ศักดา เบ้ามูลตรี (น๊อต)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'eng03@ictcos.com'), phone = coalesce(nullif(phone, ''), '0969495075') where (first_name = 'ศักดา' and last_name = 'เบ้ามูลตรี');

-- [ICT] อัครินทร์ ปินป๋าน (เบสท์)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'eng03@ictcos.com'), phone = coalesce(nullif(phone, ''), '0838925911') where (first_name = 'อัครินทร์' and last_name = 'ปินป๋าน');

-- [ICT] สุริยะ ศรีสุวรรณ (บอล)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), phone = coalesce(nullif(phone, ''), '0971769185') where (first_name = 'สุริยะ' and last_name = 'ศรีสุวรรณ');

-- [ICT] อัฎพล สืบสิน. (โก๋)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'qac01@ictcos.com'), phone = coalesce(nullif(phone, ''), '0610344036') where (first_name = 'อัฎพล' and last_name = 'สืบสิน.');

-- [ICT] อัฎพล สืบสิน (โก๋)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'qac02@ictcos.com') where (first_name = 'อัฎพล' and last_name = 'สืบสิน');

-- [ICT] วริยา เจริญกิจเกษตร (เอ็ม)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'qac03@ictcos.com'), phone = coalesce(nullif(phone, ''), '0637821739') where (first_name = 'วริยา' and last_name = 'เจริญกิจเกษตร');

-- [ICT] บุษมากร ทองบ่อ (มด)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'dcc@ictcos.com'), phone = coalesce(nullif(phone, ''), '0886591693') where (first_name = 'บุษมากร' and last_name = 'ทองบ่อ');

-- [ICT] ทิพย์สุดา จักราธรรมรักษ์ (ทิพย์)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'qab@ictcos.com'), phone = coalesce(nullif(phone, ''), '0830329459') where (first_name = 'ทิพย์สุดา' and last_name = 'จักราธรรมรักษ์');

-- [ICT] อนันตา  ชินณาวงศ์ (แพรว)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'qab@ictcos.com'), phone = coalesce(nullif(phone, ''), '0854631157') where (first_name = 'อนันตา' and last_name = 'ชินณาวงศ์');

-- [ICT] โศศิษฐา แสงสว่าง (ป๊อป)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'qab@ictcos.com'), phone = coalesce(nullif(phone, ''), '0990013524') where (first_name = 'โศศิษฐา' and last_name = 'แสงสว่าง');

-- [ICT] ธิรดา เซี่ยงหวอง (อ้อน)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'qab@ictcos.com'), phone = coalesce(nullif(phone, ''), '0992172796') where (first_name = 'ธิรดา' and last_name = 'เซี่ยงหวอง');

-- [ICT] เบญญาภา สะอาดเอี่ยม (ผา)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'qap@ictcos.com'), phone = coalesce(nullif(phone, ''), '0895048586') where (first_name = 'เบญญาภา' and last_name = 'สะอาดเอี่ยม');

-- [ICT] รติมา อยู่ยืน (หลิง)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'qap@ictcos.com'), phone = coalesce(nullif(phone, ''), '0965398462') where (first_name = 'รติมา' and last_name = 'อยู่ยืน');

-- [ICT] อภิชญา ใจมาแก้ว (กวาง)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'qai@ictcos.com'), phone = coalesce(nullif(phone, ''), '0990013524') where (first_name = 'อภิชญา' and last_name = 'ใจมาแก้ว');

-- [ICT] กิ่งกาญจน์ ศรีประเสริฐ (มายด์)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'qai@ictcos.com'), phone = coalesce(nullif(phone, ''), '0649869852') where (first_name = 'กิ่งกาญจน์' and last_name = 'ศรีประเสริฐ');

-- [ICT] ลินดา วงค์เวียน (แสบ)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'qai@ictcos.com'), phone = coalesce(nullif(phone, ''), '0800540388') where (first_name = 'ลินดา' and last_name = 'วงค์เวียน');

-- [ICT] คุุณฐิตาภรณ์ สุขแม้น (แจน)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'qai@ictcos.com'), phone = coalesce(nullif(phone, ''), '0621253053') where (first_name = 'คุุณฐิตาภรณ์' and last_name = 'สุขแม้น');

-- [ICT] ชนาภา หอมละมุล (อั้ม)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'qai@ictcos.com'), phone = coalesce(nullif(phone, ''), '0926453817') where (first_name = 'ชนาภา' and last_name = 'หอมละมุล');

-- [ICT] กุลธิดา กองต๊ะ (มด)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'qai@ictcos.com'), phone = coalesce(nullif(phone, ''), '0987729218') where (first_name = 'กุลธิดา' and last_name = 'กองต๊ะ');

-- [ICT] ลักษณี วงค์คม (กวาง)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm21@ictcos.com'), phone = coalesce(nullif(phone, ''), '0963955666') where (first_name = 'ลักษณี' and last_name = 'วงค์คม');

-- [ICT] พิชญสินี ศิรินันทยา (แนน)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm22@ictcos.com'), phone = coalesce(nullif(phone, ''), '0830884745') where (first_name = 'พิชญสินี' and last_name = 'ศิรินันทยา');

-- [ICT] ณัฐนิช ธรรมนิมิตโชค (ครีม)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm23@ictcos.com'), phone = coalesce(nullif(phone, ''), '0613872959') where (first_name = 'ณัฐนิช' and last_name = 'ธรรมนิมิตโชค');

-- [ICT] ธารธิชา กงจักร์ (เฟรม)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm24@ictcos.com'), phone = coalesce(nullif(phone, ''), '0616625422') where (first_name = 'ธารธิชา' and last_name = 'กงจักร์');

-- [ICT] สรัลนุช บุญนาค (เนเน่)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm25@ictcos.com'), phone = coalesce(nullif(phone, ''), '0648217541') where (first_name = 'สรัลนุช' and last_name = 'บุญนาค');

-- [ICT] ณัฐชา ละอองทอง (นัท)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm26@ictcos.com'), phone = coalesce(nullif(phone, ''), '0625815245') where (first_name = 'ณัฐชา' and last_name = 'ละอองทอง');

-- [ICT] กุลนิษฐ์  ไทยวงษ์ (ฮาร์ทบีท)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm27@ictcos.com'), phone = coalesce(nullif(phone, ''), '0968288650') where (first_name = 'กุลนิษฐ์' and last_name = 'ไทยวงษ์');

-- [ICT] อัครนาฎ ขวดแก้ว (ใบเฟิร์น)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm28@ictcos.com'), phone = coalesce(nullif(phone, ''), '0902154626') where (first_name = 'อัครนาฎ' and last_name = 'ขวดแก้ว');

-- [ICT] มีรดา คำบุญเรือง (มินนี่)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm29@ictcos.com'), phone = coalesce(nullif(phone, ''), '0628545901') where (first_name = 'มีรดา' and last_name = 'คำบุญเรือง');

-- [ICT] ปวริศา มณีชัย (เจอร์รี่)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm40@ictcos.com'), phone = coalesce(nullif(phone, ''), '0802924641') where (first_name = 'ปวริศา' and last_name = 'มณีชัย');

-- [ICT] นีรชา สุนะวงษ์ (ครีม)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm43@ictcos.com'), phone = coalesce(nullif(phone, ''), '0962254399') where (first_name = 'นีรชา' and last_name = 'สุนะวงษ์');

-- [ICT] มณีรัตน์ ธวัชชัยเจริญยิ่ง (อัน)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm44@ictcos.com'), phone = coalesce(nullif(phone, ''), '0973107480') where (first_name = 'มณีรัตน์' and last_name = 'ธวัชชัยเจริญยิ่ง');

-- [ICT] ศิริวรรณ ทองสวัสดิ์ (โฟร์ท)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm45@ictcos.com'), phone = coalesce(nullif(phone, ''), '0878729972') where (first_name = 'ศิริวรรณ' and last_name = 'ทองสวัสดิ์');

-- [ICT] ธิติยา เรืองนุช (ฝ้าย)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm46@ictcos.com'), phone = coalesce(nullif(phone, ''), '0952488120') where (first_name = 'ธิติยา' and last_name = 'เรืองนุช');

-- [ICT] สุพัตรา คำสมาน (มีน)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm47@ictcos.com'), phone = coalesce(nullif(phone, ''), '0993249362') where (first_name = 'สุพัตรา' and last_name = 'คำสมาน');

-- [ICT] อโณทัย แถบทอง (น้อง)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm48@ictcos.com'), phone = coalesce(nullif(phone, ''), '0830201478') where (first_name = 'อโณทัย' and last_name = 'แถบทอง');

-- [ICT] รุจิลดา กลิ่นคำหอม (ป๊อป)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'npdad1.comets@gmail.com'), phone = coalesce(nullif(phone, ''), '0953701899') where (first_name = 'รุจิลดา' and last_name = 'กลิ่นคำหอม');

-- [ICT] อุมารัตน์ ตฤษณารมย์ (อุ)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'mkt01@ictcos.com'), phone = coalesce(nullif(phone, ''), '0945674226') where (first_name = 'อุมารัตน์' and last_name = 'ตฤษณารมย์');

-- [ICT] ศกลวรรณ เอกนันทกุล (นุ่น)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'mkt02@ictcos.com'), phone = coalesce(nullif(phone, ''), '0922718062') where (first_name = 'ศกลวรรณ' and last_name = 'เอกนันทกุล');

-- [ICT] อารยา ศรีพุ่มบาง (การ์ตูน)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'mkt02@ictcos.com'), phone = coalesce(nullif(phone, ''), '0944892659') where (first_name = 'อารยา' and last_name = 'ศรีพุ่มบาง');

-- [ICT] อักษร ปราบพินาศ (เตย)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'mkt03@ictcos.com'), phone = coalesce(nullif(phone, ''), '0959536532') where (first_name = 'อักษร' and last_name = 'ปราบพินาศ');

-- [ICT] รัชฎา แดนวงดร (บี)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'mkt04@ictcos.com'), phone = coalesce(nullif(phone, ''), '0625428546') where (first_name = 'รัชฎา' and last_name = 'แดนวงดร');

-- [ICT] เบญจวรรณ สอนสา (ปูเปรี้ยว)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'mkt04@ictcos.com'), phone = coalesce(nullif(phone, ''), '0924626142') where (first_name = 'เบญจวรรณ' and last_name = 'สอนสา');

-- [ICT] รัฐภูมิเพชร เจ้าอภิบริบูรณ์ (ภูมิ)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'mkt04@ictcos.com'), phone = coalesce(nullif(phone, ''), '0900465999') where (first_name = 'รัฐภูมิเพชร' and last_name = 'เจ้าอภิบริบูรณ์');

-- [ICT] วาคิม อาดำ (ชารีฟ)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'graphics@gmail.com'), phone = coalesce(nullif(phone, ''), '0914517202') where (first_name = 'วาคิม' and last_name = 'อาดำ');

-- [ICT] ธนวัฒ พิบูลย์สวัสดิ์ (เอก)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'tanawat.p@cometsintertrade.com
tanawat.p@ictcos.com'), phone = coalesce(nullif(phone, ''), '0896644482') where (first_name = 'ธนวัฒ' and last_name = 'พิบูลย์สวัสดิ์');

-- [ICT] พลอยไพลิน หอมเนียม (พลอย)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'sales02@ictcos.com'), phone = coalesce(nullif(phone, ''), '0874001363') where (first_name = 'พลอยไพลิน' and last_name = 'หอมเนียม');

-- [ICT] ปรียานุช สง่าพล (ซี)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'sales03@ictcos.com'), phone = coalesce(nullif(phone, ''), '0987372969') where (first_name = 'ปรียานุช' and last_name = 'สง่าพล');

-- [ICT] บัวชมพู  ทองคำ (แบม)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'sales04@ictcos.com'), phone = coalesce(nullif(phone, ''), '0984190080') where (first_name = 'บัวชมพู' and last_name = 'ทองคำ');

-- [ICT] ชญนินทร์ สารถ้อย (เอื้อ)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'sales05@ictcos.com'), phone = coalesce(nullif(phone, ''), '0616466086') where (first_name = 'ชญนินทร์' and last_name = 'สารถ้อย');

-- [ICT] นรินทรา สนดา (ริน)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'sales06@ictcos.com'), phone = coalesce(nullif(phone, ''), '0936487997') where (first_name = 'นรินทรา' and last_name = 'สนดา');

-- [ICT] นฤมล คงศักดิ์ศรีสกุล (เบลล์)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'sales06@ictcos.com'), phone = coalesce(nullif(phone, ''), '0800670967') where (first_name = 'นฤมล' and last_name = 'คงศักดิ์ศรีสกุล');

-- [ICT] ขวัญข้าว สุริยะลังกา (สตางค์)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'sales07@ictcos.com'), phone = coalesce(nullif(phone, ''), '0639405522') where (first_name = 'ขวัญข้าว' and last_name = 'สุริยะลังกา');

-- [ICT] รุ่งนภา หม่องคำ (ออย)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'sales08@ictcos.com'), phone = coalesce(nullif(phone, ''), '0952087866') where (first_name = 'รุ่งนภา' and last_name = 'หม่องคำ');

-- [ICT] ฐิติรัตน์ สิงห์ใส (แพรว)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'sales09@ictcos.com'), phone = coalesce(nullif(phone, ''), '0956919625') where (first_name = 'ฐิติรัตน์' and last_name = 'สิงห์ใส');

-- [ICT] เบญจมาภรณ์ รัตนพันธุ์ศรี (หมิว)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'sales10@ictcos.com'), phone = coalesce(nullif(phone, ''), '0979929473') where (first_name = 'เบญจมาภรณ์' and last_name = 'รัตนพันธุ์ศรี');

-- [ICT] ธัญชนก ทองมังกร (ส้มโอ)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'cs01@ictcos.com'), phone = coalesce(nullif(phone, ''), '0828893558') where (first_name = 'ธัญชนก' and last_name = 'ทองมังกร');

-- [ICT] ชนิดาภา มามี (จ๊ะจ๋า)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'cs02@ictcos.com'), phone = coalesce(nullif(phone, ''), '0884267593') where (first_name = 'ชนิดาภา' and last_name = 'มามี');

-- [ICT] ปาณิสรา เพ็รชรเจริญ (ปาล์มมี่)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'cs03@ictcos.com'), phone = coalesce(nullif(phone, ''), '0992832834') where (first_name = 'ปาณิสรา' and last_name = 'เพ็รชรเจริญ');

-- [ICT] อารีรักษ์  สัตย์ซื่อ (อาย)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'cs04@ictcos.com'), phone = coalesce(nullif(phone, ''), '0932180679') where (first_name = 'อารีรักษ์' and last_name = 'สัตย์ซื่อ');

-- [ICT] สิริสุดา ชัญถาวร (กระต่าย)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'cs05@ictcos.com'), phone = coalesce(nullif(phone, ''), '0968035315') where (first_name = 'สิริสุดา' and last_name = 'ชัญถาวร');

-- [ICT] หทัยชนก จำปาศรี (ฟ้า)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'cs06@ictcos.com'), phone = coalesce(nullif(phone, ''), '0903257269') where (first_name = 'หทัยชนก' and last_name = 'จำปาศรี');

-- [ICT] บุษบา มาเยอะ (บุษ)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'cs07@ictcos.com'), phone = coalesce(nullif(phone, ''), '0988647632') where (first_name = 'บุษบา' and last_name = 'มาเยอะ');

-- [ICT] ทิชา ตุ่นภักดี (เฟรช)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'cs08@ictcos.com'), phone = coalesce(nullif(phone, ''), '0624671545') where (first_name = 'ทิชา' and last_name = 'ตุ่นภักดี');

-- [ICT] วัชราภรณ์ ยี่เข่ง (นกกี้)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'cs09@ictcos.com'), phone = coalesce(nullif(phone, ''), '0801688987') where (first_name = 'วัชราภรณ์' and last_name = 'ยี่เข่ง');

-- [ICT] ลักษณาพร สิงห์นิกร (ตุลย์)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'cs10@ictcos.com'), phone = coalesce(nullif(phone, ''), '0869164962') where (first_name = 'ลักษณาพร' and last_name = 'สิงห์นิกร');

-- [ICT] ปภัสรา ประกอบแนม (นาเดียร์)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'cs11@ictcos.com'), phone = coalesce(nullif(phone, ''), '0638267324') where (first_name = 'ปภัสรา' and last_name = 'ประกอบแนม');

-- [ICT] ภัทราภรณ์ นามะวงค์ (เอิญ)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'cs12@ictcos.com'), phone = coalesce(nullif(phone, ''), '0979459399') where (first_name = 'ภัทราภรณ์' and last_name = 'นามะวงค์');

-- [ICT] สุธิตา ชาวสวน (ออย)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'cs13@ictcos.com'), phone = coalesce(nullif(phone, ''), '0624949592') where (first_name = 'สุธิตา' and last_name = 'ชาวสวน');

-- [ICT] นภาลัย วิชัยโย (อีฟ)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'cs14@ictcos.com'), phone = coalesce(nullif(phone, ''), '0982476574') where (first_name = 'นภาลัย' and last_name = 'วิชัยโย');

-- [ICT] เสาร์วภา ณอุดม (นก)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'cs16@ictcos.com'), phone = coalesce(nullif(phone, ''), '0851196281') where (first_name = 'เสาร์วภา' and last_name = 'ณอุดม');

-- [ICT] ศศิชา เลอธนกุล (หลิง)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm02@ictcos.com'), phone = coalesce(nullif(phone, ''), '0873808869') where (first_name = 'ศศิชา' and last_name = 'เลอธนกุล');

-- [ICT] ไอรดา อาชญาทา (ไอด้า)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm03@ictcos.com'), phone = coalesce(nullif(phone, ''), '0929462940') where (first_name = 'ไอรดา' and last_name = 'อาชญาทา');

-- [ICT] สุธารัตน์ มนต์อ่อน (เค้ก)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm04@ictcos.com'), phone = coalesce(nullif(phone, ''), '0923898843') where (first_name = 'สุธารัตน์' and last_name = 'มนต์อ่อน');

-- [ICT] พรชิตา  จันทร์แก้ว (จ๋า)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcm05@ictcos.com'), phone = coalesce(nullif(phone, ''), '0961518617') where (first_name = 'พรชิตา' and last_name = 'จันทร์แก้ว');

-- [ICT] ชโลธร สุวรรณทัต (เค้ก)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcs01@ictcos.com'), phone = coalesce(nullif(phone, ''), '0612795885') where (first_name = 'ชโลธร' and last_name = 'สุวรรณทัต');

-- [ICT] จิรภัทร ดีพิน (นีมส์)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcs02@ictcos.com'), phone = coalesce(nullif(phone, ''), '0839480817') where (first_name = 'จิรภัทร' and last_name = 'ดีพิน');

-- [ICT] ปิยะธดา บุคคล (ฝ้าย)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcs04@ictcos.com'), phone = coalesce(nullif(phone, ''), '0890437992') where (first_name = 'ปิยะธดา' and last_name = 'บุคคล');

-- [ICT] วราภรณ์ คะละ (มะนาว)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcs06@ictcos.com'), phone = coalesce(nullif(phone, ''), '0866559771') where (first_name = 'วราภรณ์' and last_name = 'คะละ');

-- [ICT] พรวิมล ไกรจันทร์ (จอย)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcs07@ictcos.com'), phone = coalesce(nullif(phone, ''), '0951853291') where (first_name = 'พรวิมล' and last_name = 'ไกรจันทร์');

-- [ICT] อภิญญา ทองสุข (ตอง)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcs07@ictcos.com'), phone = coalesce(nullif(phone, ''), '0622357215') where (first_name = 'อภิญญา' and last_name = 'ทองสุข');

-- [ICT] ภัทร์ปรียา กีรติชัยพชรกูล (อิป)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcs08@ictcos.com'), phone = coalesce(nullif(phone, ''), '0944965988') where (first_name = 'ภัทร์ปรียา' and last_name = 'กีรติชัยพชรกูล');

-- [ICT] อภิชญา จันทร์มะโฮง (ฟาง)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcs08@ictcos.com'), phone = coalesce(nullif(phone, ''), '0959519082') where (first_name = 'อภิชญา' and last_name = 'จันทร์มะโฮง');

-- [ICT] กัลยรัตน์ ไพรพนาพงศ์ (พลอย)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcs08@ictcos.com'), phone = coalesce(nullif(phone, ''), '0928588811') where (first_name = 'กัลยรัตน์' and last_name = 'ไพรพนาพงศ์');

-- [ICT] กฤติยา บุญนาค (ไกด์)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcs09@ictcos.com'), phone = coalesce(nullif(phone, ''), '0954649168') where (first_name = 'กฤติยา' and last_name = 'บุญนาค');

-- [ICT] สุวภัทร์ ทองน้อย (ป่าน)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pcs10@ictcos.com'), phone = coalesce(nullif(phone, ''), '0959341129') where (first_name = 'สุวภัทร์' and last_name = 'ทองน้อย');

-- [ICT] นราเทพ แจ่มแสง (แชมป์)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), phone = coalesce(nullif(phone, ''), '0625283136') where (first_name = 'นราเทพ' and last_name = 'แจ่มแสง');

-- [ICT] รัชพร อินทะโชติ (เนย)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), phone = coalesce(nullif(phone, ''), '0925949703') where (first_name = 'รัชพร' and last_name = 'อินทะโชติ');

-- [ICT] อัญรัตน์ มโนวรกุล (ตาล)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pd01@ictcos.com'), phone = coalesce(nullif(phone, ''), '0850949646') where (first_name = 'อัญรัตน์' and last_name = 'มโนวรกุล');

-- [ICT] ชนัญชิดา ภูมิภู่ทอง (ปุ๊กกี้)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pd02@ictcos.com'), phone = coalesce(nullif(phone, ''), '0922655982') where (first_name = 'ชนัญชิดา' and last_name = 'ภูมิภู่ทอง');

-- [ICT] อรทัย ทองจันทร์ (ปุ้ย)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pd03@ictcos.com'), phone = coalesce(nullif(phone, ''), '0833982665') where (first_name = 'อรทัย' and last_name = 'ทองจันทร์');

-- [ICT] ปภาวรินทร์ เนื่องรินทร์ (นิ่ม)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pd03@ictcos.com'), phone = coalesce(nullif(phone, ''), '0615562728') where (first_name = 'ปภาวรินทร์' and last_name = 'เนื่องรินทร์');

-- [ICT] กรรณธิดา คงพะดุง (ปลาน้อย)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pd04@ictcos.com'), phone = coalesce(nullif(phone, ''), '0982868971') where (first_name = 'กรรณธิดา' and last_name = 'คงพะดุง');

-- [ICT] ทรัพย์สิมา วีทีไว (ลูกตาล)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pd04@ictcos.com'), phone = coalesce(nullif(phone, ''), '0945917766') where (first_name = 'ทรัพย์สิมา' and last_name = 'วีทีไว');

-- [ICT] ฉันทนา  อุ่นชัย (บุ๋ม)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pd04@ictcos.com'), phone = coalesce(nullif(phone, ''), '0844219985') where (first_name = 'ฉันทนา' and last_name = 'อุ่นชัย');

-- [ICT] ชญานิตย์ ถิ่นสุข (ใบตอง)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pd05@ictcos.com'), phone = coalesce(nullif(phone, ''), '0988949366') where (first_name = 'ชญานิตย์' and last_name = 'ถิ่นสุข');

-- [ICT] ลัลนารัศม์ พิศเพ็ง (แขก)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pdad@ictcos.com'), phone = coalesce(nullif(phone, ''), '0815850917') where (first_name = 'ลัลนารัศม์' and last_name = 'พิศเพ็ง');

-- [ICT] ปัญญา แก้วแจ่มจันทร์ (เจส)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pdad@ictcos.com'), phone = coalesce(nullif(phone, ''), '0625815609') where (first_name = 'ปัญญา' and last_name = 'แก้วแจ่มจันทร์');

-- [ICT] ทัศสินา ทองสุข (น้ำ)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pdad@ictcos.com'), phone = coalesce(nullif(phone, ''), '0909986537') where (first_name = 'ทัศสินา' and last_name = 'ทองสุข');

-- [ICT] พชรวรรณ สมนิยาม (แบม)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'pdad@ictcos.com'), phone = coalesce(nullif(phone, ''), '0991405005') where (first_name = 'พชรวรรณ' and last_name = 'สมนิยาม');

-- [ICT] พนิดา เจนใจ (หมิว)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'rd04@ictcos.com'), phone = coalesce(nullif(phone, ''), '0822691547') where (first_name = 'พนิดา' and last_name = 'เจนใจ');

-- [ICT] ชุติรัตน์  ไฝเอ้ย (ว่าน)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'rd05@ictcos.com'), phone = coalesce(nullif(phone, ''), '0885443176') where (first_name = 'ชุติรัตน์' and last_name = 'ไฝเอ้ย');

-- [ICT] พรรณี อาสนา (เอ็กซ์)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'rd06@ictcos.com'), phone = coalesce(nullif(phone, ''), '0879744655') where (first_name = 'พรรณี' and last_name = 'อาสนา');

-- [ICT] ศศิธร กล่อมเกตุ (น้ำ)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'rd07@ictcos.com'), phone = coalesce(nullif(phone, ''), '0897705263') where (first_name = 'ศศิธร' and last_name = 'กล่อมเกตุ');

-- [ICT] กาญจนา ฟองนวล (มิ้นท์)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'rd08@ictcos.com'), phone = coalesce(nullif(phone, ''), '0915395937') where (first_name = 'กาญจนา' and last_name = 'ฟองนวล');

-- [ICT] ธัญญรัตน์ หิรัญวงษ์ (วาวา)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'rd09@ictcos.com'), phone = coalesce(nullif(phone, ''), '0824043631') where (first_name = 'ธัญญรัตน์' and last_name = 'หิรัญวงษ์');

-- [ICT] พรสวรรค์ นิ่มทับทิม (เบนซ์)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'rd10@ictcos.com'), phone = coalesce(nullif(phone, ''), '0932792021') where (first_name = 'พรสวรรค์' and last_name = 'นิ่มทับทิม');

-- [ICT] จักรภัทร มงคลอุทก (ทะเล)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'rd11@ictcos.com'), phone = coalesce(nullif(phone, ''), '0953637907') where (first_name = 'จักรภัทร' and last_name = 'มงคลอุทก');

-- [ICT] ดวงนภา เสมรสุวรรณ (อ้อม)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'rd12@ictcos.com'), phone = coalesce(nullif(phone, ''), '0645531195') where (first_name = 'ดวงนภา' and last_name = 'เสมรสุวรรณ');

-- [ICT] เกศสิริภรณ์ พิมพา (ชมพู่)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'rd13@ictcos.com'), phone = coalesce(nullif(phone, ''), '0989592891') where (first_name = 'เกศสิริภรณ์' and last_name = 'พิมพา');

-- [ICT] วรรณพร เจริญศักดิ์ขจร (อีฟ)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'rd14@ictcos.com'), phone = coalesce(nullif(phone, ''), '0905844368') where (first_name = 'วรรณพร' and last_name = 'เจริญศักดิ์ขจร');

-- [ICT] เมษกรานต์ ผลหอม (อุ้ม)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'rd15@ictcos.com'), phone = coalesce(nullif(phone, ''), '0885818607') where (first_name = 'เมษกรานต์' and last_name = 'ผลหอม');

-- [ICT] พิมพ์ไพลิน รอดประดิษฐ์ (ส้ม)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'rd16@ictcos.com'), phone = coalesce(nullif(phone, ''), '0622696991') where (first_name = 'พิมพ์ไพลิน' and last_name = 'รอดประดิษฐ์');

-- [ICT] เพาพะงา สังข์อุดม (พลอย)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'rd.doc.ict@gmail.com'), phone = coalesce(nullif(phone, ''), '0913549704') where (first_name = 'เพาพะงา' and last_name = 'สังข์อุดม');

-- [ICT] พรรณษา เกตุแก้ว (พิพลอย)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), phone = coalesce(nullif(phone, ''), '0958648368') where (first_name = 'พรรณษา' and last_name = 'เกตุแก้ว');

-- [ICT] RD Powder (RD)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'rd_powder@ictcos.com') where (first_name = 'RD' and last_name = 'Powder');

-- [ICT] RD Skincard (RD)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'rd_skincare@ictcos.com') where (first_name = 'RD' and last_name = 'Skincard');

-- [ICT] RD Baseskin (RD)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'rd_baseskin@ictcos.com') where (first_name = 'RD' and last_name = 'Baseskin');

-- [ICT] RD Lip (RD)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'rd_lip@ictcos.com') where (first_name = 'RD' and last_name = 'Lip');

-- [ICT] สายรุ้ง ตับไหว (นุ้ย)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'scm02@ictcos.com'), phone = coalesce(nullif(phone, ''), '0863969398') where (first_name = 'สายรุ้ง' and last_name = 'ตับไหว');

-- [ICT] ปัณฑารีย์ ศรธัญญาภรณ์ (เอฟ)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'scm03@ictcos.com'), phone = coalesce(nullif(phone, ''), '0837759674') where (first_name = 'ปัณฑารีย์' and last_name = 'ศรธัญญาภรณ์');

-- [ICT] ปริญญาภรณ์ ทองดี (บอมแบม)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'scm04@ictcos.com'), phone = coalesce(nullif(phone, ''), '0969832286') where (first_name = 'ปริญญาภรณ์' and last_name = 'ทองดี');

-- [ICT] วริศรา ภาระพงษ์ (ต้นข้าว)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'scm05@ictcos.com'), phone = coalesce(nullif(phone, ''), '0634079799') where (first_name = 'วริศรา' and last_name = 'ภาระพงษ์');

-- [ICT] ณัฐญาดา เหร่าหมัด (นัท)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'scm06@ictcos.com'), phone = coalesce(nullif(phone, ''), '0909629904') where (first_name = 'ณัฐญาดา' and last_name = 'เหร่าหมัด');

-- [ICT] ชนากานต์ สุขอยู่ (ดริ้ง)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'scm06@ictcos.com'), phone = coalesce(nullif(phone, ''), '0989547401') where (first_name = 'ชนากานต์' and last_name = 'สุขอยู่');

-- [ICT] ฉัฏรากรณ์ มาลารัตน์ (มาส)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'wh02@ictcos.com'), phone = coalesce(nullif(phone, ''), '0881261096') where (first_name = 'ฉัฏรากรณ์' and last_name = 'มาลารัตน์');

-- [ICT] สุภาพร เที่ยงมน (มน)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'wh03@ictcos.com'), phone = coalesce(nullif(phone, ''), '0843260140') where (first_name = 'สุภาพร' and last_name = 'เที่ยงมน');

-- [ICT] วิโรจน์ ติ๊ตาวงศ์ (โรจน์)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'wh03@ictcos.com'), phone = coalesce(nullif(phone, ''), '0873808869') where (first_name = 'วิโรจน์' and last_name = 'ติ๊ตาวงศ์');

-- [ICT] บุญฤทธิ์ กองอุดม (บูม)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'wh04@ictcos.com'), phone = coalesce(nullif(phone, ''), '0928186230') where (first_name = 'บุญฤทธิ์' and last_name = 'กองอุดม');

-- [ICT] ธีระพันธ์ สีพั้ว (โบ๊ท)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'wh04@ictcos.com') where (first_name = 'ธีระพันธ์' and last_name = 'สีพั้ว');

-- [ICT] สุริยะ ประเสริฐสุข (โจ)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'wh04@ictcos.com'), phone = coalesce(nullif(phone, ''), '0615206649') where (first_name = 'สุริยะ' and last_name = 'ประเสริฐสุข');

-- [ICT] ว่าง
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'hr01@ictcos.com') where (first_name = 'ว่าง' and (last_name is null or last_name = ''));

-- [ICT] ศิรินันท์ พรมวาส (น้อง)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'hr02@ictcos.com'), phone = coalesce(nullif(phone, ''), '0612308522') where (first_name = 'ศิรินันท์' and last_name = 'พรมวาส');

-- [ICT] ว่าง
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'hr03@ictcos.com') where (first_name = 'ว่าง' and (last_name is null or last_name = ''));

-- [ICT] ณัฐวดี ยุโซบ (ดา)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'hr04@ictcos.com'), phone = coalesce(nullif(phone, ''), '0809055797') where (first_name = 'ณัฐวดี' and last_name = 'ยุโซบ');

-- [ICT] พลอยปภัส พุ่มพวง (พลอย)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'hr05@ictcos.com'), phone = coalesce(nullif(phone, ''), '0889144217') where (first_name = 'พลอยปภัส' and last_name = 'พุ่มพวง');

-- [ICT] ระวีวรรณ  ดอกไม้เงิน (เกตุ)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'ictadm01@gmail.com'), phone = coalesce(nullif(phone, ''), '0808129467') where (first_name = 'ระวีวรรณ' and last_name = 'ดอกไม้เงิน');

-- [ICT] พรพจน์ ศิลาคชสาร (กะทง)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'safety@ictcos.com'), phone = coalesce(nullif(phone, ''), '0855328987') where (first_name = 'พรพจน์' and last_name = 'ศิลาคชสาร');

-- [ICT] วุทธิพรรธน์ คำผาย (วี)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'it01@ictcos.com'), phone = coalesce(nullif(phone, ''), '0816155226') where (first_name = 'วุทธิพรรธน์' and last_name = 'คำผาย');

-- [JA] จันทรัช พิบูลย์สวัสดิ์ (โอ๋)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'c.piboon@journeyacross.com'), phone = coalesce(nullif(phone, ''), '0631573659') where (first_name = 'จันทรัช' and last_name = 'พิบูลย์สวัสดิ์');

-- [JA] ขวัญดาว  ดารา (ดาว)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'acc@journeyacross.com'), phone = coalesce(nullif(phone, ''), '0949746691') where (first_name = 'ขวัญดาว' and last_name = 'ดารา');

-- [JA] วรพล รักษ์เสถียรภาพ (เบนซ์)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'adm02@journeyacross.com'), phone = coalesce(nullif(phone, ''), '0970292993') where (first_name = 'วรพล' and last_name = 'รักษ์เสถียรภาพ');

-- [JA] ดาริน พลีสุดใจ (ดีน่า)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'darin.p@journeyacross.com'), phone = coalesce(nullif(phone, ''), '0824425163') where (first_name = 'ดาริน' and last_name = 'พลีสุดใจ');

-- [JA] ศิรภัสสร ขจรสุวรรณ์ (หว่าหวา)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'mkt02@journeyacross.com'), phone = coalesce(nullif(phone, ''), '0621755924') where (first_name = 'ศิรภัสสร' and last_name = 'ขจรสุวรรณ์');

-- [JA] สุพิชฌา ทิสมบูรณ์ (แตงไทย)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), phone = coalesce(nullif(phone, ''), '0611504498') where (first_name = 'สุพิชฌา' and last_name = 'ทิสมบูรณ์');

-- [JA] วาสนา สว่างรอบ (เล็ก)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'npd01@journeyacross.com'), phone = coalesce(nullif(phone, ''), '0811330299') where (first_name = 'วาสนา' and last_name = 'สว่างรอบ');

-- [JA] อรทัย กมลเกลียว (แหม่ม)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'sales01@journeyacross.com'), phone = coalesce(nullif(phone, ''), '0897744163') where (first_name = 'อรทัย' and last_name = 'กมลเกลียว');

-- [JA] ชุติกาญจน์ สระทอง (ทีน)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'sales02@journeyacross.com'), phone = coalesce(nullif(phone, ''), '0942908432') where (first_name = 'ชุติกาญจน์' and last_name = 'สระทอง');

-- [JA] ชญานิศ ชัยวงศ์เจริญเดช (กิ๊ก)
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), phone = coalesce(nullif(phone, ''), '0958931144') where (first_name = 'ชญานิศ' and last_name = 'ชัยวงศ์เจริญเดช');

-- [JA] กลุ่มพนักงาน JA ทั้งหมด
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'all@journeyacross.com') where (first_name = 'กลุ่มพนักงาน' and last_name = 'JA ทั้งหมด');

-- [JA] กลุ่ม Account
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'account@journeyacross.com') where (first_name = 'กลุ่ม' and last_name = 'Account');

-- [JA] กลุ่ม Marketing JA
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'mkt@journeyacross.com') where (first_name = 'กลุ่ม' and last_name = 'Marketing JA');

-- [JA] กลุ่ม NPD JA
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'npd@journeyacross.com') where (first_name = 'กลุ่ม' and last_name = 'NPD JA');

-- [JA] กลุ่มการตลาดออนไลน์ JA
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'online@journeyacross.com') where (first_name = 'กลุ่มการตลาดออนไลน์' and last_name = 'JA');

-- [JA] กลุ่ม Sales JA
update public.employees set in_directory = true, is_approved  = true, password     = coalesce(nullif(password, ''), employee_id), email = coalesce(nullif(email, ''), 'sales@journeyacross.com') where (first_name = 'กลุ่ม' and last_name = 'Sales JA');

commit;

-- After running, sanity-check matched rows:
-- select employee_id, first_name, last_name, nickname, email, phone
-- from public.employees where email is not null and phone is not null;