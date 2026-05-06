"""
Generate SQL seed for public.employees from รายชื่อพนักงาน.xlsx.
Filters: only active employees (no resignation date) with numeric code.
Strips internal A##_/B##_ code prefixes from แผนก / ตำแหน่ง.

Usage:
    python scripts/generate_employee_seed.py > supabase/seed_employees.sql
"""

import openpyxl
import re
import sys
import os

XLSX = os.path.join(os.path.dirname(__file__), '..', 'รายชื่อพนักงาน.xlsx')

PREFIX_RE = re.compile(r'^[A-Z]\d+_')


def clean(s):
    if s is None:
        return ''
    s = str(s).strip()
    s = PREFIX_RE.sub('', s)
    return s


def sql_escape(s):
    if s is None or s == '':
        return 'null'
    return "'" + str(s).replace("'", "''") + "'"


def main():
    wb = openpyxl.load_workbook(XLSX, data_only=True)
    ws = wb['Employee']

    rows_out = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        code, _pwd, _company, first, last, _div, dept_raw, position_raw, nickname, _start, resign, *_rest = row
        if code is None:
            continue
        code_str = str(code).strip()
        if not code_str.isdigit():
            continue
        if resign is not None:
            continue
        first = (first or '').strip()
        last = (last or '').strip()
        full_name = (first + ' ' + last).strip()
        if not full_name:
            continue
        nickname = (nickname or '').strip() or None
        dept = clean(dept_raw) or None
        position = clean(position_raw) or None

        rows_out.append((code_str, full_name, nickname, dept, position))

    print('-- Auto-generated from รายชื่อพนักงาน.xlsx')
    print('-- Active employees only (no resignation date)')
    print(f'-- Total rows: {len(rows_out)}')
    print()
    print('truncate public.employees cascade;')
    print()
    print('insert into public.employees (code, name, nickname, dept, position) values')
    chunks = []
    for code, name, nick, dept, pos in rows_out:
        chunks.append(f"  ({sql_escape(code)}, {sql_escape(name)}, {sql_escape(nick)}, {sql_escape(dept)}, {sql_escape(pos)})")
    print(',\n'.join(chunks) + ';')


if __name__ == '__main__':
    main()
