-- Seed data — run AFTER schema.sql
-- Seeds rooms + sample bookings only. Employees are seeded separately from
-- the HR xlsx via scripts/generate_employee_seed.py → supabase/seed_employees.sql

truncate public.bookings  restart identity cascade;
truncate public.rooms     cascade;

-- Rooms
insert into public.rooms (id, name, picture, location, floor, seats) values
  ('C001','ห้องมั่งคั่ง','rooms_Images/C001.jpg','Comets HQ','ชั้น 1',14),
  ('C002','ห้องร่ำรวย','rooms_Images/C002.jpg','Comets HQ','ชั้น 1',10),
  ('C003','ห้อง THE STAR','rooms_Images/C003.jpg','Comets HQ','ชั้น 2',20),
  ('C004','ห้อง GALAXY','rooms_Images/C004.jpg','Comets HQ','ชั้น 2',16),
  ('C005','ห้องเพิ่มพูน','rooms_Images/C005.jpg','Comets HQ','ชั้น 2',8),
  ('C006','ห้องประชุมชั้น 1','rooms_Images/C006.jpg','Comets HQ','ชั้น 1',12),
  ('C007','ห้องโถงชั้น 1','rooms_Images/C007.jpg','Comets HQ','ชั้น 1',30),
  ('C008','ห้อง NORTH STAR','rooms_Images/C008.jpg','Comets HQ','ชั้น 3',12),
  ('C009','ห้อง JUPITER','rooms_Images/C009.jpg','Comets HQ','ชั้น 3',7),
  ('C010','ห้อง NEPTUNE','rooms_Images/C010.jpg','Comets HQ','ชั้น 3',7),
  ('C011','ห้องประชุมชั้น 3','rooms_Images/C011.jpg','Comets HQ','ชั้น 3',10),
  ('C012','ห้อง MERCURY','rooms_Images/C012.jpg','Comets HQ','ชั้น 3',6),
  ('C013','ห้อง VENUS','rooms_Images/C013.jpg','Comets HQ','ชั้น 3',6),
  ('C014','ห้อง 2 B','rooms_Images/C014.jpg','ICT','ชั้น 2',8),
  ('C015','ห้อง Color','rooms_Images/C015.jpg','ICT','ชั้น 2',8),
  ('C016','ห้อง Innovation','rooms_Images/C016.jpg','ICT','ชั้น 2',10),
  ('C017','ห้อง Technology Room','rooms_Images/C017.jpg','ICT','ชั้น 2',12),
  ('C018','ห้อง 2 A','rooms_Images/C018.jpg','ICT','ชั้น 2',10),
  ('C019','ห้อง LIVE','rooms_Images/C019.jpg','ICT','ชั้น 3',14),
  ('C020','ห้อง 3B1','rooms_Images/C020.jpg','ICT','ชั้น 3',7),
  ('C021','ห้อง 3B2','rooms_Images/C021.jpg','ICT','ชั้น 3',7),
  ('C022','ห้อง TownHall 3M','rooms_Images/C022.jpg','ICT','ชั้น 3',40),
  ('C023','PB3A1','rooms_Images/C023.jpg','Phone Booth','ชั้น 3',6),
  ('C024','PB3A2','rooms_Images/C024.png','Phone Booth','ชั้น 3',6),
  ('C025','PB3A3','rooms_Images/C025.jpg','Phone Booth','ชั้น 3',4),
  ('C026','PB3A4','rooms_Images/C026.jpg','Phone Booth','ชั้น 3',4),
  ('C027','PB3B1','rooms_Images/C027.png','Phone Booth','ชั้น 3',8),
  ('C028','PB4A1','rooms_Images/C028.jpg','Phone Booth','ชั้น 4',6),
  ('C029','PB4A2','rooms_Images/C029.png','Phone Booth','ชั้น 4',6),
  ('C030','PB4A3','rooms_Images/C030.png','Phone Booth','ชั้น 4',6),
  ('C031','ห้อง 4A1','rooms_Images/C031.jpg','Comets HQ','ชั้น 4',8),
  ('C032','ห้อง 4A2','rooms_Images/C032.jpg','Comets HQ','ชั้น 4',8),
  ('C033','ห้อง 4A3','rooms_Images/C033.jpg','Comets HQ','ชั้น 4',6),
  ('C034','โต๊ะประชุม 3B3','rooms_Images/C034.jpg','ICT','ชั้น 3',4),
  ('C035','โต๊ะประชุม 3B4','rooms_Images/C035.jpg','ICT','ชั้น 3',4),
  ('C036','PB ชั้น 1','rooms_Images/C036.jpg','Phone Booth','ชั้น 1',10);

-- Sample bookings — anchored to CURRENT_DATE (today) and CURRENT_DATE+1 (tomorrow)
insert into public.bookings (room_id, booking_date, start_min, end_min, title, booker, attendees, purpose, company) values
  ('C003', current_date,      9*60,      10*60+30, 'Sales Weekly Sync',  'ภัทรพล วัฒนกุล',           8,  'ประชุมภายใน', null),
  ('C003', current_date,      13*60,     14*60,    'Customer Review',    'สิริสุดา ชัญถาวร',         5,  'รับรองลูกค้า', 'Lotus Retail'),
  ('C004', current_date,      10*60,     11*60,    'NPD Brainstorm',     'รุ่งรวีวรรณ์ พูลสมบัติ',    6,  'ประชุมภายใน', null),
  ('C008', current_date,      8*60+30,   9*60+30,  'Daily Standup',      'ธนพล อารีรักษ์',           9,  'ประชุมภายใน', null),
  ('C008', current_date,      14*60,     16*60,    'Quarterly Review',   'อภิญญา วงศ์สุข',           12, 'ประชุมภายใน', null),
  ('C009', current_date,      11*60,     12*60,    '1:1 with Manager',   'พิมพ์ชนก กิตติกุล',         2,  'ประชุมภายใน', null),
  ('C016', current_date,      9*60,      11*60,    'Innovation Jam',     'ศุภกร จันทร์เพ็ญ',          10, 'Workshop',    null),
  ('C017', current_date,      13*60+30,  15*60,    'Tech Demo',          'ธนพล อารีรักษ์',           8,  'รับรองลูกค้า', 'AIS Business'),
  ('C022', current_date,      15*60,     17*60,    'Town Hall ไตรมาส',   'ปิยะดา แสงทอง',            40, 'ประชุมภายใน', null),
  ('C014', current_date,      10*60,     11*60+30, 'Color Workshop',     'ชลิตา ภู่ระหงษ์',           6,  'Workshop',    null),
  ('C015', current_date,      14*60,     15*60,    'Design Review',      'ชลิตา ภู่ระหงษ์',           5,  'ประชุมภายใน', null),
  ('C031', current_date,      9*60,      10*60,    'Finance Close',      'กมลชนก สุวรรณ',            4,  'ประชุมภายใน', null),
  ('C019', current_date,      10*60+30,  12*60,    'Live Recording',     'วัชราพร ยิ่งเจริญ',         6,  'อัดคลิป',     null),
  ('C012', current_date,      13*60,     14*60,    'HR Screening',       'เจกิตาน์ ศรีสวัสดิ์',       3,  'สัมภาษณ์งาน',  null),
  ('C001', current_date,      9*60,      12*60,    'Board Meeting',      'สุชาติ มีมุข',             12, 'รับรองลูกค้า', 'SCB'),
  ('C003', current_date + 1,  10*60,     11*60,    'Product Planning',   'พิมพ์ชนก กิตติกุล',         8,  'ประชุมภายใน', null),
  ('C022', current_date + 1,  9*60,      10*60+30, 'All-Hands',          'ปิยะดา แสงทอง',            45, 'ประชุมภายใน', null);
