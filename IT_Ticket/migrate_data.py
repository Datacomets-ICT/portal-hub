"""
Copy all data from old Supabase project to new one.
Reads credentials from env vars (never committed).

Usage:
  set SRC_URL=https://rthsmtimvqjnfvgepqpk.supabase.co
  set SRC_KEY=<old service_role>
  set DST_URL=https://dixechuojsfaypagbfqu.supabase.co
  set DST_KEY=<new service_role>
  python migrate_data.py
"""
import os, sys, time, traceback
from supabase import create_client

SRC_URL = os.environ['SRC_URL']
SRC_KEY = os.environ['SRC_KEY']
DST_URL = os.environ['DST_URL']
DST_KEY = os.environ['DST_KEY']

src = create_client(SRC_URL, SRC_KEY)
dst = create_client(DST_URL, DST_KEY)

# Migration order: respect FK dependencies
TABLES = [
    # (name, primary_key, on_conflict_cols, page_size)
    ('employees',          'employee_id', 'employee_id', 500),
    ('worklist',           'id',          None,          500),
    ('tickets',            'key',         'key',         200),
    ('ticket_history',     'id',          None,          500),
    ('ticket_messages',    'id',          None,          500),
    ('ticket_message_reads', None,        None,          500),  # composite PK
    ('notifications',      'id',          None,          500),
    ('knowledge_base',     'id',          'id',          500),
    ('chat_logs',          'id',          None,          500),
]


def fetch_all(client, table, page_size):
    """Fetch all rows from source table using pagination."""
    rows = []
    offset = 0
    while True:
        try:
            resp = client.table(table).select('*').range(offset, offset + page_size - 1).execute()
        except Exception as e:
            print(f'  ! fetch error at offset {offset}: {e}')
            return rows
        batch = resp.data or []
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return rows


def insert_batch(client, table, rows, on_conflict, page_size):
    """Insert rows in batches (upsert if on_conflict provided)."""
    if not rows:
        return 0
    inserted = 0
    for i in range(0, len(rows), page_size):
        batch = rows[i:i + page_size]
        try:
            q = client.table(table)
            if on_conflict:
                resp = q.upsert(batch, on_conflict=on_conflict).execute()
            else:
                resp = q.insert(batch).execute()
            inserted += len(resp.data or batch)
        except Exception as e:
            msg = str(e)[:200]
            print(f'  ! insert error batch {i}-{i+len(batch)}: {msg}')
    return inserted


def main():
    print(f'SRC: {SRC_URL}')
    print(f'DST: {DST_URL}')
    print('=' * 60)

    total_read = 0
    total_written = 0

    for table, pk, conflict, page in TABLES:
        print(f'\n▶ {table}')
        t0 = time.time()

        # Check table exists in source
        try:
            rows = fetch_all(src, table, page)
        except Exception as e:
            print(f'  ⚠ skipped (source error): {e}')
            continue

        print(f'  read: {len(rows)} rows')
        total_read += len(rows)

        if not rows:
            continue

        # Write to destination
        written = insert_batch(dst, table, rows, conflict, page)
        total_written += written
        elapsed = time.time() - t0
        print(f'  wrote: {written} rows in {elapsed:.1f}s')

    print('\n' + '=' * 60)
    print(f'Total read:    {total_read}')
    print(f'Total written: {total_written}')
    print('\nDone. Remember to REGENERATE both service_role keys in Supabase Dashboard!')


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\nInterrupted')
        sys.exit(1)
    except Exception as e:
        traceback.print_exc()
        sys.exit(1)
