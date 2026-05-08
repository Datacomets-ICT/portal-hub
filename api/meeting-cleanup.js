// Vercel cron / on-demand endpoint that reaps expired meeting audio.
//
// Triggered two ways:
//   1. Daily by Vercel cron (vercel.json → /api/meeting-cleanup)
//   2. On-demand by the frontend when a user opens a note whose
//      audio_expires_at < now() — clears storage immediately so the
//      page reflects reality without waiting for the next cron tick.
//
// What gets reaped: the file in the `mtg-audio` bucket + the
// audio_path / audio_url columns. The summary, transcript, action
// items, decisions, etc. all stay intact — only the heavy audio is
// removed so the 1 GB Supabase free tier doesn't fill up.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dixechuojsfaypagbfqu.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

async function sb(path, init = {}) {
  if (!SUPABASE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY missing');
  const r = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      ...(init.headers || {}),
    },
  });
  return r;
}

async function listExpired(limit = 100) {
  const nowIso = new Date().toISOString();
  const url = `/rest/v1/mtg_meeting_notes`
    + `?select=id,audio_path&audio_path=not.is.null`
    + `&audio_expires_at=lt.${encodeURIComponent(nowIso)}`
    + `&limit=${limit}`;
  const r = await sb(url);
  if (!r.ok) throw new Error(`list expired ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return await r.json();
}

async function deleteFromStorage(paths) {
  if (paths.length === 0) return;
  const r = await sb(`/storage/v1/object/mtg-audio`, {
    method: 'DELETE',
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!r.ok) {
    const txt = (await r.text()).slice(0, 200);
    console.warn(`[cleanup] storage delete ${r.status}: ${txt}`);
  }
}

async function clearAudioColumns(ids) {
  if (ids.length === 0) return;
  const orFilter = ids.map(id => `id.eq.${id}`).join(',');
  const r = await sb(`/rest/v1/mtg_meeting_notes?or=(${orFilter})`, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      audio_path: null,
      audio_url: null,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!r.ok) {
    console.warn(`[cleanup] PATCH rows ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Allow GET for Vercel cron + manual ping; POST for explicit triggers
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const expired = await listExpired(200);
    if (expired.length === 0) {
      return res.status(200).json({ ok: true, reaped: 0 });
    }
    const paths = expired.map(r => r.audio_path).filter(Boolean);
    const ids = expired.map(r => r.id);
    await deleteFromStorage(paths);
    await clearAudioColumns(ids);
    console.log(`[cleanup] reaped ${expired.length} expired audio file(s)`);
    return res.status(200).json({ ok: true, reaped: expired.length, ids });
  } catch (err) {
    console.error('[cleanup]', err);
    return res.status(500).json({ error: String(err.message || err) });
  }
}
