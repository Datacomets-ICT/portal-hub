import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';

// /repair/equipment/:stockId — view stock + record movements (รับเข้า / เบิก / คืน).
// New equipment uses /repair/equipment/new (separate page).

export default function RepairEquipmentDetailPage() {
  const { user } = useAuth();
  const { stockId } = useParams();
  const navigate = useNavigate();

  const [eq, setEq] = useState(null);
  const [moves, setMoves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const [moveType, setMoveType] = useState('เบิก');
  const [quantity, setQuantity] = useState('');
  const [jobId, setJobId] = useState('');
  const [floor, setFloor] = useState('');
  const [zone, setZone] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try {
      const [{ data: e, error: eErr }, { data: m, error: mErr }] = await Promise.all([
        supabase.from('rpr_equipment').select('*').eq('stock_id', stockId).maybeSingle(),
        supabase.from('rpr_stock_moves').select('*').eq('stock_id', stockId).order('performed_at', { ascending: false }).limit(50),
      ]);
      if (eErr) throw eErr;
      if (mErr) throw mErr;
      setEq(e); setMoves(m || []);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [stockId]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    const q = parseFloat(quantity);
    if (!q || q <= 0) return setErr('ใส่จำนวน > 0');
    setBusy(true); setErr(null);
    try {
      const { error } = await supabase.rpc('rpr_record_stock_move', {
        p_stock_id: stockId,
        p_movement_type: moveType,
        p_quantity: q,
        p_performed_by: [user?.firstName, user?.lastName].filter(Boolean).join(' ')
          || user?.nickname || user?.name || user?.employeeId || user?.code || '-',
        p_floor: floor || null,
        p_zone: zone || null,
        p_job_id: jobId.trim() || null,
        p_note: note.trim() || null,
      });
      if (error) throw error;
      setQuantity(''); setJobId(''); setFloor(''); setZone(''); setNote('');
      await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const fmt = (s) => s ? new Date(s).toLocaleString('th-TH') : '-';

  if (!user) return null;
  if (loading) return <div className="rpr-shell"><div className="rpr-loading">กำลังโหลด…</div></div>;
  if (!eq) return <div className="rpr-shell"><div className="rpr-empty">ไม่พบ {stockId}</div></div>;

  return (
    <div className="rpr-shell">
      <header className="rpr-head">
        <button className="rpr-back" onClick={() => navigate('/repair/equipment')}>← กลับ</button>
        <h1>{eq.stock_id}</h1>
      </header>

      {err && <div className="rpr-err">{err}</div>}

      <section className="rpr-card-section">
        <h3>{eq.name}</h3>
        <div className="rpr-kv">
          <div><span>ลักษณะ</span>{eq.category || '-'}</div>
          <div><span>คงเหลือ</span><strong>{eq.quantity_on_hand ?? 0}</strong></div>
          <div><span>รับเข้าสะสม</span>{eq.quantity_in ?? 0}</div>
        </div>
      </section>

      <section className="rpr-card-section">
        <h3>บันทึก movement ใหม่</h3>
        <label className="bf-field">
          <span>ประเภท</span>
          <select value={moveType} onChange={(e) => setMoveType(e.target.value)}>
            <option value="เบิก">เบิก (ออก)</option>
            <option value="รับเข้า">รับเข้า (เข้า)</option>
            <option value="คืน">คืน (เข้า)</option>
          </select>
        </label>
        <label className="bf-field">
          <span>จำนวน *</span>
          <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </label>
        {moveType === 'เบิก' && (
          <>
            <label className="bf-field">
              <span>JobID (ถ้ามี)</span>
              <input value={jobId} onChange={(e) => setJobId(e.target.value)} placeholder="JOB-2026-XXX" />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <label className="bf-field" style={{ flex: 1 }}>
                <span>ชั้น</span>
                <input value={floor} onChange={(e) => setFloor(e.target.value)} />
              </label>
              <label className="bf-field" style={{ flex: 1 }}>
                <span>โซน</span>
                <input value={zone} onChange={(e) => setZone(e.target.value)} />
              </label>
            </div>
          </>
        )}
        <label className="bf-field">
          <span>หมายเหตุ</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="rpr-actions">
          <button className="rpr-btn rpr-btn-go" onClick={submit} disabled={busy}>
            {busy ? 'บันทึก…' : '＋ บันทึก'}
          </button>
        </div>
      </section>

      <section className="rpr-card-section">
        <h3>ประวัติ ({moves.length})</h3>
        {!moves.length ? <div className="rpr-empty">ยังไม่มีประวัติ</div> : (
          <div className="rpr-table-wrap">
            <table className="rpr-table">
              <thead><tr><th>เวลา</th><th>ประเภท</th><th>จำนวน</th><th>ผู้ทำ</th><th>JobID</th><th>ตำแหน่ง</th></tr></thead>
              <tbody>
                {moves.map((m) => (
                  <tr key={m.id}>
                    <td className="rpr-td-dim">{fmt(m.performed_at)}</td>
                    <td>{m.movement_type || '-'}</td>
                    <td><strong>{m.quantity ?? '-'}</strong></td>
                    <td>{m.performed_by || '-'}</td>
                    <td className="rpr-td-id">{m.job_id || '—'}</td>
                    <td className="rpr-td-dim">{[m.floor, m.zone].filter(Boolean).join(' · ') || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
