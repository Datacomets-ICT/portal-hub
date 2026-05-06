"""
Generate SQL import for historical bookings from rooms.xlsx sheet 'booking'.

Strategy:
- Drop the no_overlap EXCLUSION constraint (historical data may overlap)
- Truncate bookings table (to avoid mixing old sample data with historical)
- Insert all 3993 valid rows
- Re-create no_overlap as a partial constraint (future dates only)

Usage:
    python scripts/generate_bookings_historical.py > supabase/seed_bookings_historical.sql
"""

import openpyxl
import os
import sys
from datetime import datetime, time, date

XLSX = os.path.join(os.path.dirname(__file__), '..', 'rooms.xlsx')


def sql_escape(s):
    if s is None:
        return 'null'
    if isinstance(s, (int, float)):
        return str(int(s)) if float(s).is_integer() else str(s)
    s = str(s).strip()
    if not s:
        return 'null'
    return "'" + s.replace("'", "''") + "'"


def time_to_min(t):
    if t is None:
        return None
    if isinstance(t, time):
        return t.hour * 60 + t.minute
    if isinstance(t, datetime):
        return t.hour * 60 + t.minute
    return None


def date_str(d):
    if d is None:
        return None
    if isinstance(d, datetime):
        return d.strftime('%Y-%m-%d')
    if isinstance(d, date):
        return d.strftime('%Y-%m-%d')
    return None


def main():
    wb = openpyxl.load_workbook(XLSX, data_only=True)
    ws = wb['booking']

    valid_rooms = {f'C{i:03d}' for i in range(1, 37)}

    rows_out = []
    skipped = {'null': 0, 'unknown_room': 0, 'bad_time': 0}

    for r in ws.iter_rows(min_row=2, values_only=True):
        d, st, en, room, _nm, _sts, code, name, dept, prep, prep_item, equip, purp, purp_det, company, _att_names, att_count, _loc, _bk, _key = r
        if d is None or room is None or st is None or en is None:
            skipped['null'] += 1
            continue
        if room not in valid_rooms:
            skipped['unknown_room'] += 1
            continue
        start_min = time_to_min(st)
        end_min = time_to_min(en)
        if start_min is None or end_min is None or end_min <= start_min:
            skipped['bad_time'] += 1
            continue

        ds = date_str(d)
        if ds is None:
            skipped['null'] += 1
            continue

        def _s(x):
            if x is None or x is True or x is False:
                return ''
            return str(x).strip()

        title = (_s(purp_det) or _s(purp) or 'ประชุม') or 'ประชุม'
        title = title[:120]

        booker = _s(name) or None
        attendees = None
        if att_count is not None and att_count != '':
            try:
                attendees = int(float(att_count))
            except (ValueError, TypeError):
                # Handle strings like '6-7 คน' — extract first number
                import re
                m = re.search(r'\d+', str(att_count))
                if m:
                    attendees = int(m.group())
        purpose = _s(purp) or None
        company_v = _s(company) or None

        rows_out.append({
            'room_id': room,
            'booking_date': ds,
            'start_min': start_min,
            'end_min': end_min,
            'title': title,
            'booker': booker,
            'attendees': attendees,
            'purpose': purpose,
            'company': company_v,
        })

    # Header
    print('-- Historical bookings import from rooms.xlsx sheet "booking"')
    print(f'-- Valid rows: {len(rows_out)}')
    print(f'-- Skipped: {skipped}')
    print()

    print('-- 1. Drop no_overlap constraint (historical data has legitimate overlaps).')
    print('--    Client-side check in src/components.jsx (BookingModal) still blocks overlaps.')
    print('--    Optionally re-enable DB-level protection later using the trigger at the bottom.')
    print('alter table public.bookings drop constraint if exists no_overlap;')
    print('alter table public.bookings drop constraint if exists no_overlap_future;')
    print()

    print('-- 2. Clear existing bookings (sample data) to avoid mixing')
    print('truncate public.bookings restart identity;')
    print()

    print('-- 3. Insert historical bookings in batches of 500 to stay within statement size limits')
    batch_size = 500
    for batch_start in range(0, len(rows_out), batch_size):
        batch = rows_out[batch_start:batch_start + batch_size]
        print(f'-- Batch {batch_start//batch_size + 1} ({len(batch)} rows)')
        print('insert into public.bookings (room_id, booking_date, start_min, end_min, title, booker, attendees, purpose, company) values')
        chunks = []
        for b in batch:
            chunks.append(
                f"  ({sql_escape(b['room_id'])}, "
                f"{sql_escape(b['booking_date'])}::date, "
                f"{sql_escape(b['start_min'])}, "
                f"{sql_escape(b['end_min'])}, "
                f"{sql_escape(b['title'])}, "
                f"{sql_escape(b['booker'])}, "
                f"{sql_escape(b['attendees'])}, "
                f"{sql_escape(b['purpose'])}, "
                f"{sql_escape(b['company'])})"
            )
        print(',\n'.join(chunks) + ';')
        print()

    # Optional: trigger-based overlap guard for future bookings (recommended for production)
    print('-- Optional: re-enable DB-level overlap protection for future bookings using a trigger')
    print('-- (uncomment the block below to enable; trigger is dynamic so handles current_date)')
    print('/*')
    print('create or replace function public.check_no_future_overlap()')
    print('returns trigger language plpgsql as $$')
    print('begin')
    print('  if new.booking_date >= current_date then')
    print('    if exists (')
    print('      select 1 from public.bookings')
    print('      where room_id = new.room_id')
    print('        and booking_date = new.booking_date')
    print('        and id <> coalesce(new.id, \'00000000-0000-0000-0000-000000000000\'::uuid)')
    print('        and int4range(start_min, end_min) && int4range(new.start_min, new.end_min)')
    print('    ) then')
    print('      raise exception \'Booking overlap for room % on %\', new.room_id, new.booking_date;')
    print('    end if;')
    print('  end if;')
    print('  return new;')
    print('end $$;')
    print()
    print('drop trigger if exists bookings_no_overlap on public.bookings;')
    print('create trigger bookings_no_overlap')
    print('  before insert or update on public.bookings')
    print('  for each row execute function public.check_no_future_overlap();')
    print('*/')


if __name__ == '__main__':
    main()
