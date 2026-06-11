// Vercel serverless: enqueue a meeting-summary job.
//
// The actual summarization runs on a self-hosted Ollama worker (see
// meeting-rooms/worker/README.md). This endpoint just inserts a row
// into mtg_summary_jobs and returns the job id; the worker picks it
// up within ~10 seconds and writes the result back to mtg_bookings.
//
// POST /api/meeting-auto-summary
//   body: { booking_id, employee_id? }
// returns { ok: true, job_id, status }

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
                  || process.env.VITE_SUPABASE_ANON_KEY
                  || process.env.SUPABASE_ANON_KEY;

async function sbRpc(name, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${name}: ${r.status} ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Use POST' });
  }
  try {
    const { booking_id, employee_id } = req.body || {};
    if (!booking_id) {
      return res.status(400).json({ ok: false, error: 'booking_id required' });
    }

    const jobId = await sbRpc('mtg_enqueue_summary', {
      p_booking_id: booking_id,
      p_emp_id:     employee_id || null,
    });

    return res.status(200).json({
      ok:     true,
      job_id: jobId,
      status: 'queued',
    });
  } catch (err) {
    return res.status(500).json({
      ok:    false,
      error: err.message || String(err),
    });
  }
}
