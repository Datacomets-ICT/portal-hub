"""
Read 'เบอร์ติดต่อบริษัทในเครือ 05_05_2026.xlsx' → output an idempotent SQL
file that fills in employees.email + employees.phone for matching rows.

Match strategy (ordered, first hit wins per Excel row):
  1. (first_name = X AND last_name = Y)    — exact split on first space
  2. (first_name = X)                      — Excel has only one Thai name token
  3. (nickname  ILIKE Y)                   — Excel nickname matches

We never overwrite a non-empty existing value: every UPDATE uses
COALESCE(NULLIF(email,''), 'new'). So re-running is safe and won't
clobber data the user typed in profile.

Run: python scripts/generate_contact_updates.py
Outputs: scripts/contact_updates.sql + a summary printed to stdout.
"""
import io
import re
import sys
from pathlib import Path
import openpyxl

# Force UTF-8 stdout on Windows so we can print Thai
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

XLSX = Path(__file__).parent.parent / 'เบอร์ติดต่อบริษัทในเครือ 05_05_2026.xlsx'
OUT  = Path(__file__).parent / 'contact_updates.sql'

# Sheet → column index of each field (0-based). Sheets aren't all the
# same shape — HQ has an extra "Eng" column, JA drops "เบอร์ภายใน".
SHEETS = {
    # name,          rownum, fullname, eng, nickname, email, ext, mobile
    'HQ':  {'name': 1, 'nick': 3, 'email': 4, 'ext': 5, 'mobile': 6},
    'Fac': {'name': 1, 'nick': 2, 'email': 3, 'ext': 4, 'mobile': 5},
    'ICT': {'name': 1, 'nick': 2, 'email': 3, 'ext': 4, 'mobile': 5},
    'JA':  {'name': 1, 'nick': 2, 'email': 3, 'ext': None, 'mobile': 4},
}

# ────────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────────

NAME_PREFIXES = ['คุณ', 'ดร.', 'ผศ.', 'รศ.', 'นาย', 'นาง', 'นางสาว', 'น.ส.', 'นพ.', 'พญ.']

def strip_name_prefix(s):
    s = (s or '').strip()
    for p in NAME_PREFIXES:
        if s.startswith(p):
            return s[len(p):].strip()
    return s

def clean_phone(s):
    """Normalize phone to digits only, drop dashes/spaces. Return ''
    for placeholders like '-' or 'NA'."""
    if s is None:
        return ''
    raw = str(s).strip()
    if raw in ('', '-', 'NA', 'N/A', 'na'):
        return ''
    digits = re.sub(r'\D', '', raw)
    return digits if len(digits) >= 4 else ''

def clean_email(s):
    if s is None:
        return ''
    raw = str(s).strip().lower()
    if '@' not in raw or '.' not in raw:
        return ''
    return raw

def sql_escape(s):
    return s.replace("'", "''")

def split_thai_name(full_name):
    """'วสวัตติ์ โอฬารอธิสิทธิ์' → ('วสวัตติ์', 'โอฬารอธิสิทธิ์')
       'จุ๋ม' → ('จุ๋ม', None)"""
    parts = full_name.split()
    if len(parts) >= 2:
        return parts[0], ' '.join(parts[1:])
    if len(parts) == 1:
        return parts[0], None
    return None, None

# ────────────────────────────────────────────────────────────────────
# Parse the Excel
# ────────────────────────────────────────────────────────────────────

wb = openpyxl.load_workbook(XLSX, data_only=True)
contacts = []  # list of dicts

for sheet_name, cols in SHEETS.items():
    ws = wb[sheet_name]
    for row in ws.iter_rows(min_row=4, values_only=True):
        # The first column in every sheet is a row number for actual
        # people; group/category rows have it blank or non-numeric.
        first_cell = row[0]
        if first_cell is None or not str(first_cell).strip().isdigit():
            continue

        full_raw = row[cols['name']] if len(row) > cols['name'] else None
        if not full_raw:
            continue

        full = strip_name_prefix(full_raw)
        if not full:
            continue
        first, last = split_thai_name(full)

        nick_raw = row[cols['nick']] if cols['nick'] is not None and len(row) > cols['nick'] else None
        nick = strip_name_prefix(nick_raw) if nick_raw else ''

        email = clean_email(row[cols['email']]) if len(row) > cols['email'] else ''

        mobile = clean_phone(row[cols['mobile']]) if len(row) > cols['mobile'] else ''
        ext = ''
        if cols['ext'] is not None and len(row) > cols['ext']:
            ext = clean_phone(row[cols['ext']])

        # Prefer mobile, fall back to internal extension if no mobile
        phone = mobile or ext

        if not email and not phone:
            continue   # nothing to set, skip

        contacts.append({
            'sheet': sheet_name,
            'full': full,
            'first': first,
            'last': last,
            'nick': nick,
            'email': email,
            'phone': phone,
        })

print(f'Parsed {len(contacts)} contact rows across 4 sheets:')
by_sheet = {}
for c in contacts:
    by_sheet[c['sheet']] = by_sheet.get(c['sheet'], 0) + 1
for s, n in by_sheet.items():
    print(f'  {s}: {n}')
print()

# ────────────────────────────────────────────────────────────────────
# Generate SQL
# ────────────────────────────────────────────────────────────────────

lines = [
    "-- Contact backfill from 'เบอร์ติดต่อบริษัทในเครือ 05_05_2026.xlsx'",
    "-- Auto-generated. Each UPDATE only fills BLANK fields in employees",
    "-- — never overwrites values the user already set in their profile.",
    "-- Match strategy: STRICT (first_name + last_name). Falls back to",
    "-- first_name only when Excel has a single Thai token AND the employee",
    "-- row also has no last_name. Nickname matching was REMOVED — common",
    "-- Thai nicknames (บี, นัท, มด) caused one Excel contact to inflate",
    "-- in_directory across 5-10 unrelated employees.",
    "-- Run in Supabase SQL Editor. Idempotent — safe to re-run.",
    "--",
    "-- Each row also flips `in_directory = true` so the /people page",
    "-- shows only this month's contact list (RPC list_active_employees",
    "-- filters by this flag — see schema_v49_directory_filter.sql).",
    "-- Anyone NOT in this Excel keeps in_directory = false → hidden from",
    "-- the directory but can still log in.",
    "--",
    "-- Initial password is set to employee_id ONLY when password is empty.",
    "-- Existing custom passwords are kept (re-running monthly won't reset",
    "-- people who already set their own).",
    "",
    "begin;",
    "",
    "-- Step 1: clear in_directory for everyone, so people removed from",
    "-- this month's Excel drop out of the directory automatically.",
    "update public.employees set in_directory = false;",
    "",
    "-- Step 2: per-person updates — contact info + in_directory flag",
    "-- + initial password + auto-approve.",
    "",
]

for c in contacts:
    fn = sql_escape(c['first']) if c['first'] else ''
    ln = sql_escape(c['last']) if c['last'] else ''
    nk = sql_escape(c['nick']) if c['nick'] else ''
    em = sql_escape(c['email']) if c['email'] else ''
    ph = sql_escape(c['phone']) if c['phone'] else ''

    # STRICT match — first_name + last_name only.
    # Earlier versions also matched by nickname which inflated the
    # in_directory count 4× because Thai nicknames repeat heavily (บี,
    # นัท, มด, อ้อ — one Excel contact would match 5-10 unrelated staff).
    where_parts = []
    if fn and ln:
        where_parts.append(f"(first_name = '{fn}' and last_name = '{ln}')")
    elif fn:
        # Excel only has a single Thai token — match first_name only when
        # the employee row also has no last_name (true single-name people).
        where_parts.append(f"(first_name = '{fn}' and (last_name is null or last_name = ''))")
    if not where_parts:
        continue
    where = ' or '.join(where_parts)

    # Always set these for matched rows (flag + auth bootstrap).
    set_parts = [
        "in_directory = true",
        "is_approved  = true",
        "password     = coalesce(nullif(password, ''), employee_id)",
    ]
    if em:
        set_parts.append(f"email = coalesce(nullif(email, ''), '{em}')")
    if ph:
        set_parts.append(f"phone = coalesce(nullif(phone, ''), '{ph}')")

    lines.append(f"-- [{c['sheet']}] {c['full']}" + (f" ({c['nick']})" if c['nick'] else ''))
    lines.append(f"update public.employees set {', '.join(set_parts)} where {where};")
    lines.append('')

lines.append("commit;")
lines.append("")
lines.append("-- After running, sanity-check matched rows:")
lines.append("-- select employee_id, first_name, last_name, nickname, email, phone")
lines.append("-- from public.employees where email is not null and phone is not null;")

OUT.write_text('\n'.join(lines), encoding='utf-8')

print(f'Wrote {OUT} ({len(contacts)} UPDATE statements)')
print()
print('Sample of first 3 statements:')
for c in contacts[:3]:
    print(f"  -- [{c['sheet']}] {c['full']} ({c['nick']})")
    print(f"     email={c['email'] or '(none)'} phone={c['phone'] or '(none)'}")
