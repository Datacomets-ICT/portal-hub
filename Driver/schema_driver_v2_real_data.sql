-- ============================================================
-- Driver v2 — replace seed/mock data with real company fleet
--
-- Source: Driver/Drivers.xlsx (sheets: Drivers / รถ / สถานที่ / วัตถุประสงค์)
--
-- Strategy: deactivate the v1 seed (active = false) instead of deleting,
-- so any historical bookings still resolve their car/driver via the FK.
-- New rows go in with active = true; the dropdowns filter by active so
-- only the real fleet shows up.
--
-- Idempotent: re-running will leave existing real rows alone and re-set
-- the seed back to inactive.
-- ============================================================

-- ===== 1. Deactivate v1 mock data =====
update drv_cars    set active = false where plate     in ('กท 1234','กท 5678','กท 9012','กท 3456');
update drv_drivers set active = false where driver_no in ('DRV01','DRV02','DRV03');
update drv_places  set active = false where name in (
  'สำนักงานใหญ่ อาคาร A','โรงงาน บางพลี','คลังสินค้า รังสิต','ศูนย์ฝึกอบรม หัวหิน',
  'สนามบินสุวรรณภูมิ','สนามบินดอนเมือง','ศูนย์ประชุมสิริกิติ์','ไบเทค บางนา','IMPACT เมืองทองธานี'
);

-- ===== 2. Real cars (drv_cars) — from sheet "รถ" =====
insert into drv_cars (plate, model, seats, color)
select * from (values
  ('5 ขษ 1285', 'รถเก๋ง ไฟฟ้า',   6, null),
  ('3 กส 1285', 'รถจิ๊บ',         3, null),
  ('6 ขณ 1285', 'รถตู้ ไฟฟ้า',    5, null),
  ('7 กล 1285', 'รถตู้ Alphard',  6, null),
  ('5 ขพ 1285', 'รถตู้ Alphard',  6, null),
  ('3 ขท 1285', 'รถ BM',          3, null),
  ('5 กณ 1285', 'รถตู้ Alphard',  6, null)
) v(plate, model, seats, color)
where not exists (select 1 from drv_cars where drv_cars.plate = v.plate);

-- Make sure they're active in case they already existed but were inactive
update drv_cars set active = true where plate in (
  '5 ขษ 1285','3 กส 1285','6 ขณ 1285','7 กล 1285','5 ขพ 1285','3 ขท 1285','5 กณ 1285'
);

-- ===== 3. Real drivers (drv_drivers) — from sheet "Drivers" =====
insert into drv_drivers (driver_no, name, phone)
select * from (values
  ('D001',  'นัท (คุณจุ๋ม)',         '0808884769'),
  ('D002',  'บาส (ส่วนกลาง)',         '0987130547'),
  ('D003',  'บิ๊ก (คุณเอก)',          '0968590447'),
  ('D004',  'ต้น (คุณโอม)',           '0969368072'),
  ('D005',  'รุตน์ (คุณโอ๋)',          '0809105507'),
  ('D006',  'กุ๊ก ( คุณโอม )',        null),
  ('D007',  'รถโรงงาน FAC',          null),
  ('D008',  'ต้ั๊ก (คุณโอม)',          null),
  ('D009',  'เตย (ส่วนกลาง)',         null),
  ('D0010', 'แม็กซ์ ( คุณโอม )',     null),
  ('D011',  'ชีพ ( ส่วนกลาง )',      null)
) v(driver_no, name, phone)
where not exists (select 1 from drv_drivers where drv_drivers.driver_no = v.driver_no);

update drv_drivers set active = true where driver_no in (
  'D001','D002','D003','D004','D005','D006','D007','D008','D009','D0010','D011'
);

-- ===== 4. Real places (drv_places) — from sheet "สถานที่" =====
-- All listed as kind = 'both' so the same place can be picked as either
-- pickup or dropoff. Generic ones without a map link still show up but
-- the user can override the map URL when picking "อื่น ๆ ระบุเอง".
insert into drv_places (name, detail, map_url, kind)
select * from (values
  ('COMETS HQ',                  'สำนักงานใหญ่',  'https://maps.app.goo.gl/9k3XV9bvRx8j7mCQA', 'both'),
  ('COMETS FAC',                 'โรงงาน',         'https://maps.app.goo.gl/6pqjSHCYNiDiB4Yo7', 'both'),
  ('ICT',                        '',               'https://maps.app.goo.gl/MjcYkpSbMfKSHEZK8', 'both'),
  ('บริษัทลูกค้า',                'ระบุเอง',         null,                                          'both'),
  ('ซีคอนสแควร์ ศรีนครินทร์',     '',               'https://maps.app.goo.gl/uwd1u7MvpTwRUYNfA', 'both'),
  ('โรงพิมพ์',                   'ระบุเอง',         null,                                          'both'),
  ('บิ๊กซีบางพลี',                '',               'https://maps.app.goo.gl/UVnXCpSGtQhvNhPz5', 'both'),
  ('อื่น ๆ',                      'ระบุเอง',         null,                                          'both')
) v(name, detail, map_url, kind)
where not exists (select 1 from drv_places where drv_places.name = v.name);

update drv_places set active = true where name in (
  'COMETS HQ','COMETS FAC','ICT','บริษัทลูกค้า','ซีคอนสแควร์ ศรีนครินทร์','โรงพิมพ์','บิ๊กซีบางพลี','อื่น ๆ'
);

-- ===== Verify =====
-- select 'cars'    as t, count(*) from drv_cars    where active union all
-- select 'drivers' as t, count(*) from drv_drivers where active union all
-- select 'places'  as t, count(*) from drv_places  where active;
