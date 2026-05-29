"""
Build knowledge base from:
1. Resolved ticket replies in Supabase
2. IT manual documents (PDF, DOCX)

Usage:
    set SUPABASE_URL=https://rthsmtimvqjnfvgepqpk.supabase.co
    set SUPABASE_SERVICE_KEY=sb_secret_...
    python build_knowledge.py

Run schema_v5.sql in Supabase SQL Editor BEFORE running this script.
"""

import os
import re
import glob
from pathlib import Path

import pdfplumber
from docx import Document
from supabase import create_client

BASE_DIR = os.path.dirname(__file__)

SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    raise SystemExit('ERROR: set SUPABASE_URL and SUPABASE_SERVICE_KEY')

sb = create_client(SUPABASE_URL, SUPABASE_KEY)


def extract_keywords(text, extra=''):
    """Extract simple Thai+English keywords from text."""
    words = re.findall(r'[\u0E00-\u0E7F]+|[a-zA-Z0-9]+', (text or '') + ' ' + (extra or ''))
    # Dedupe, lowercase English, keep Thai as-is
    seen = set()
    out = []
    for w in words:
        wl = w.lower() if w.isascii() else w
        if len(wl) < 2 or wl in seen:
            continue
        seen.add(wl)
        out.append(wl)
    return ' '.join(out[:50])  # limit to 50 keywords


def chunk_text(text, max_len=800, overlap=100):
    """Split long text into overlapping chunks."""
    text = text.strip()
    if len(text) <= max_len:
        return [text] if text else []
    chunks = []
    start = 0
    while start < len(text):
        end = start + max_len
        chunk = text[start:end]
        if chunk.strip():
            chunks.append(chunk.strip())
        start = end - overlap
    return chunks


# ============================================================
# Source 1: Ticket replies
# ============================================================
def build_from_tickets():
    print('Loading resolved tickets with replies...')
    all_rows = []
    PAGE = 1000
    offset = 0
    while True:
        r = sb.table('tickets') \
            .select('ticket_no, job_type, issue_type, symptom, request, reply') \
            .neq('reply', '') \
            .neq('status', 'เปิด Ticket') \
            .range(offset, offset + PAGE - 1) \
            .execute()
        if not r.data:
            break
        all_rows.extend(r.data)
        if len(r.data) < PAGE:
            break
        offset += PAGE

    print(f'  Found {len(all_rows)} tickets with replies')

    # Group by issue_type+symptom to consolidate similar solutions
    groups = {}
    for t in all_rows:
        key = f"{t.get('job_type','')}/{t.get('issue_type','')}/{t.get('symptom','')}"
        if key not in groups:
            groups[key] = []
        groups[key].append(t)

    entries = []
    for key, tickets in groups.items():
        # Dedupe replies
        seen_replies = set()
        unique_replies = []
        for t in tickets:
            reply = (t.get('reply') or '').strip()
            if not reply or reply in seen_replies or reply == 'ซ้ำ ยกเลิก':
                continue
            seen_replies.add(reply)
            request = (t.get('request') or '').strip()[:200]
            unique_replies.append(f"ปัญหา: {request}\nวิธีแก้: {reply}")

        if not unique_replies:
            continue

        parts = key.split('/')
        job_type = parts[0] if len(parts) > 0 else ''
        issue_type = parts[1] if len(parts) > 1 else ''
        symptom = parts[2] if len(parts) > 2 else ''

        # Combine up to 5 examples per group
        for i in range(0, len(unique_replies), 5):
            batch = unique_replies[i:i+5]
            content = '\n\n'.join(batch)
            title = f"{job_type} > {issue_type} > {symptom}" if symptom else f"{job_type} > {issue_type}"
            keywords = extract_keywords(f"{job_type} {issue_type} {symptom}", content)
            entries.append({
                'source': 'ticket_reply',
                'source_ref': f"{len(batch)} tickets",
                'category': job_type,
                'title': title,
                'content': content,
                'keywords': keywords,
            })

    print(f'  Created {len(entries)} knowledge entries from tickets')
    return entries


# ============================================================
# Source 2: Manual documents
# ============================================================
def extract_pdf(path):
    """Extract text from PDF."""
    text = ''
    try:
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                t = page.extract_text()
                if t:
                    text += t + '\n'
    except Exception as e:
        print(f'    WARN: PDF read error {path}: {e}')
    return text.strip()


def extract_docx(path):
    """Extract text from DOCX."""
    text = ''
    try:
        doc = Document(path)
        for para in doc.paragraphs:
            if para.text.strip():
                text += para.text.strip() + '\n'
    except Exception as e:
        print(f'    WARN: DOCX read error {path}: {e}')
    return text.strip()


def build_from_text_knowledge():
    """Read knowledge_manual.txt — manually written knowledge entries."""
    fpath = os.path.join(BASE_DIR, 'knowledge_manual.txt')
    if not os.path.exists(fpath):
        return []

    print('Loading knowledge_manual.txt...')
    entries = []
    with open(fpath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Split by '---' separator into sections
    sections = [s.strip() for s in content.split('---') if s.strip()]
    for section in sections:
        lines = section.split('\n')
        title = ''
        category = 'คู่มือ IT'
        source_ref = ''
        body_lines = []

        for line in lines:
            line = line.strip()
            if line.startswith('### คู่มือ:'):
                title = line.replace('### คู่มือ:', '').strip()
            elif line.startswith('หมวด:'):
                category = line.replace('หมวด:', '').strip()
            elif line.startswith('แหล่ง:'):
                source_ref = line.replace('แหล่ง:', '').strip()
            elif line and not line.startswith('#'):
                body_lines.append(line)

        body = '\n'.join(body_lines).strip()
        if not body:
            continue

        chunks = chunk_text(body, max_len=800, overlap=100)
        for i, chunk in enumerate(chunks):
            t = title if len(chunks) == 1 else f"{title} (ส่วนที่ {i+1})"
            keywords = extract_keywords(chunk, f"{title} {category}")
            entries.append({
                'source': 'manual',
                'source_ref': source_ref or 'knowledge_manual.txt',
                'category': category,
                'title': t,
                'content': chunk,
                'keywords': keywords,
            })

    print(f'  Created {len(entries)} entries from knowledge_manual.txt')
    return entries


def build_from_manuals():
    print('Loading manual documents...')
    entries = []

    # Find all PDF and DOCX files
    patterns = ['*.pdf', '*.docx', '**/*.pdf', '**/*.docx']
    files = set()
    for pat in patterns:
        for f in glob.glob(os.path.join(BASE_DIR, pat), recursive=True):
            # Skip node_modules, .vercel, etc.
            if '.vercel' in f or 'node_modules' in f or '__pycache__' in f:
                continue
            files.add(f)

    for fpath in sorted(files):
        fname = os.path.basename(fpath)
        rel = os.path.relpath(fpath, BASE_DIR)
        print(f'  Processing: {rel}')

        if fpath.lower().endswith('.pdf'):
            text = extract_pdf(fpath)
        elif fpath.lower().endswith('.docx'):
            text = extract_docx(fpath)
        else:
            continue

        if not text or len(text) < 20:
            print(f'    SKIP: too short ({len(text)} chars)')
            continue

        # Determine category from filename/folder
        category = 'คู่มือ IT'
        low = fname.lower() + ' ' + rel.lower()
        if 'email' in low or 'อีเมล' in low or 'เมล' in low:
            category = 'อีเมล'
        elif 'password' in low or 'รหัสผ่าน' in low:
            category = 'รหัสผ่าน'
        elif 'วิดเจ็ต' in low or 'widget' in low:
            category = 'Windows'
        elif 'ticket' in low:
            category = 'วิธีใช้ระบบ ticket'
        elif 'welcome' in low:
            category = 'พนักงานใหม่'

        # Chunk long documents
        chunks = chunk_text(text, max_len=800, overlap=100)
        print(f'    Extracted {len(text)} chars → {len(chunks)} chunks')

        for i, chunk in enumerate(chunks):
            title = fname
            if len(chunks) > 1:
                title = f"{fname} (ส่วนที่ {i+1}/{len(chunks)})"
            keywords = extract_keywords(chunk, f"{fname} {category}")
            entries.append({
                'source': 'manual',
                'source_ref': rel,
                'category': category,
                'title': title,
                'content': chunk,
                'keywords': keywords,
            })

    print(f'  Created {len(entries)} knowledge entries from manuals')
    return entries


# ============================================================
# Upload to Supabase
# ============================================================
def upload(entries):
    print(f'\nUploading {len(entries)} entries to knowledge_base...')

    # Clear existing entries
    sb.table('knowledge_base').delete().gte('id', 0).execute()
    print('  Cleared old entries')

    # Insert in batches — strip null bytes that Postgres rejects
    def clean(s):
        return s.replace('\x00', '') if isinstance(s, str) else s

    BATCH = 200
    for i in range(0, len(entries), BATCH):
        batch = [{k: clean(v) for k, v in e.items()} for e in entries[i:i+BATCH]]
        sb.table('knowledge_base').insert(batch).execute()
        print(f'  Inserted {i + len(batch)}/{len(entries)}')

    print('Done!')


if __name__ == '__main__':
    ticket_entries = build_from_tickets()
    manual_entries = build_from_manuals()
    text_entries   = build_from_text_knowledge()
    all_entries = ticket_entries + manual_entries + text_entries
    upload(all_entries)
