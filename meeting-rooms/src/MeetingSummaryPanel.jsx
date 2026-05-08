import { useEffect, useRef, useState } from 'react';
import {
  getNoteForBooking,
  startMeetingSummary,
  retryMeetingSummary,
  deleteMeetingNote,
} from './api/meetingNotes.js';
import { supabase } from './lib/supabase.js';

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB — matches storage bucket limit

function fmtDuration(sec) {
  if (!sec || sec < 0) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function MeetingSummaryPanel({ booking, currentUser }) {
  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedSec, setRecordedSec] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const mediaRecRef = useRef(null);
  const recStartRef = useRef(0);
  const fileInputRef = useRef(null);
  const pollRef = useRef(null);

  // Initial load
  useEffect(() => {
    if (!booking?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const n = await getNoteForBooking(booking.id);
      if (!cancelled) {
        setNote(n);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [booking?.id]);

  // Poll while processing
  useEffect(() => {
    if (!note || note.status !== 'processing') {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = setInterval(async () => {
      const fresh = await getNoteForBooking(booking.id);
      if (fresh && fresh.status !== 'processing') {
        setNote(fresh);
        clearInterval(pollRef.current);
        pollRef.current = null;
      } else if (fresh) {
        setNote(fresh);
      }
    }, 4000);
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [note?.status, booking?.id]);

  async function handleStartRecording() {
    setErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });
      const chunks = [];
      mr.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
        setRecordedBlob(blob);
        setRecordedSec(Math.round((Date.now() - recStartRef.current) / 1000));
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      mediaRecRef.current = mr;
      recStartRef.current = Date.now();
      setRecording(true);
      setRecordedBlob(null);
    } catch (e) {
      setErr('ไม่สามารถใช้ไมค์ได้: ' + (e.message || e));
    }
  }

  function handleStopRecording() {
    try { mediaRecRef.current?.stop(); } catch {}
    setRecording(false);
  }

  function handleFilePick() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      setErr(`ไฟล์ใหญ่เกิน 25MB (${(f.size / 1024 / 1024).toFixed(1)}MB)`);
      return;
    }
    setRecordedBlob(f);
    setRecordedSec(0);
  }

  async function handleSubmit() {
    if (!recordedBlob || !booking?.id) return;
    setUploading(true);
    setErr('');
    try {
      const file = recordedBlob instanceof File
        ? recordedBlob
        : new File([recordedBlob], `meeting-${Date.now()}.webm`, { type: recordedBlob.type || 'audio/webm' });
      const row = await startMeetingSummary({
        bookingId: booking.id,
        file,
        createdBy: currentUser?.code || null,
      });
      // Patch duration_sec for recordings
      if (recordedSec > 0) {
        await supabase
          .from('mtg_meeting_notes')
          .update({ duration_sec: recordedSec })
          .eq('id', row.id);
      }
      setNote({ ...row, duration_sec: recordedSec });
      setRecordedBlob(null);
      setRecordedSec(0);
    } catch (e) {
      setErr('อัปโหลดไม่สำเร็จ: ' + (e.message || e));
    } finally {
      setUploading(false);
    }
  }

  async function handleRetry() {
    if (!note) return;
    setErr('');
    setNote({ ...note, status: 'processing', error_message: null });
    try { await retryMeetingSummary(note); }
    catch (e) { setErr(String(e.message || e)); }
  }

  async function handleDelete() {
    if (!note) return;
    if (!confirm('ลบสรุปการประชุมนี้?')) return;
    try {
      await deleteMeetingNote(note);
      setNote(null);
    } catch (e) {
      setErr('ลบไม่สำเร็จ: ' + (e.message || e));
    }
  }

  if (loading) {
    return <div className="ms-panel ms-panel-loading">กำลังโหลด...</div>;
  }

  return (
    <div className="ms-panel">
      <div className="ms-panel-head">
        <div className="ms-panel-title">📝 สรุปการประชุม (AI)</div>
        {note && (
          <button type="button" className="ms-btn-ghost" onClick={handleDelete} title="ลบ">🗑️</button>
        )}
      </div>

      {!note && (
        <div className="ms-empty">
          <div className="ms-empty-hint">
            อัดเสียงประชุมหรืออัปโหลดไฟล์เสียงที่อัดไว้แล้ว — AI จะถอดเสียงและสรุปประเด็น/action items ให้
          </div>
          <div className="ms-empty-actions">
            {!recording && !recordedBlob && (
              <>
                <button type="button" className="ms-btn-primary" onClick={handleStartRecording}>
                  🎤 บันทึกเสียงเริ่มประชุม
                </button>
                <button type="button" className="ms-btn-secondary" onClick={handleFilePick}>
                  📁 อัปโหลดไฟล์เสียง
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*,video/webm,video/mp4"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
              </>
            )}
            {recording && (
              <button type="button" className="ms-btn-stop" onClick={handleStopRecording}>
                ⏹ หยุดบันทึก ({fmtDuration(Math.floor((Date.now() - recStartRef.current) / 1000))})
              </button>
            )}
            {!recording && recordedBlob && (
              <>
                <div className="ms-blob-preview">
                  ✓ พร้อมส่ง — {recordedBlob instanceof File ? recordedBlob.name : 'เสียงที่อัด'}
                  {recordedSec > 0 && <> · {fmtDuration(recordedSec)}</>}
                  <span className="ms-blob-size"> · {(recordedBlob.size / 1024 / 1024).toFixed(1)}MB</span>
                </div>
                <button type="button" className="ms-btn-primary" onClick={handleSubmit} disabled={uploading}>
                  {uploading ? 'กำลังอัปโหลด...' : '🚀 ส่งให้ AI สรุป'}
                </button>
                <button
                  type="button"
                  className="ms-btn-ghost"
                  onClick={() => { setRecordedBlob(null); setRecordedSec(0); }}
                  disabled={uploading}
                >
                  ยกเลิก
                </button>
              </>
            )}
          </div>
          {err && <div className="ms-error">{err}</div>}
        </div>
      )}

      {note && note.status === 'processing' && (
        <div className="ms-status ms-status-processing">
          ⏳ AI กำลังถอดเสียงและสรุปประชุม... (อาจใช้เวลา 20-60 วินาที)
        </div>
      )}

      {note && note.status === 'error' && (
        <div className="ms-status ms-status-error">
          ❌ ประมวลผลไม่สำเร็จ
          {note.error_message && <div className="ms-error-msg">{note.error_message}</div>}
          <button type="button" className="ms-btn-secondary" onClick={handleRetry}>ลองใหม่</button>
        </div>
      )}

      {note && note.status === 'done' && (
        <div className="ms-result">
          {note.audio_url && (
            <div className="ms-audio">
              <audio controls src={note.audio_url} style={{ width: '100%' }} />
              {note.duration_sec > 0 && (
                <div className="ms-audio-meta">⏱ {fmtDuration(note.duration_sec)}</div>
              )}
            </div>
          )}
          {note.summary && (
            <div className="ms-section">
              <div className="ms-section-title">💡 ประเด็นหลัก</div>
              <pre className="ms-summary-text">{note.summary}</pre>
            </div>
          )}
          {Array.isArray(note.action_items) && note.action_items.length > 0 && (
            <div className="ms-section">
              <div className="ms-section-title">✅ Action Items</div>
              <ul className="ms-action-list">
                {note.action_items.map((it, i) => (
                  <li key={i}>
                    <b>{it.task}</b>
                    {it.owner && <> — <span className="ms-owner">{it.owner}</span></>}
                    {it.due && <> · <span className="ms-due">{it.due}</span></>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {note.transcript && (
            <details className="ms-section ms-transcript">
              <summary>📜 ดู transcript เต็ม</summary>
              <pre className="ms-transcript-text">{note.transcript}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
