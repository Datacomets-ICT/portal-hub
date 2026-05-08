import { useEffect, useRef, useState } from 'react';
import {
  getNoteForBooking,
  startMeetingSummary,
  resumeMeetingSummary,
  deleteMeetingNote,
} from './api/meetingNotes.js';
import { supabase } from './lib/supabase.js';

const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB — matches v16 bucket limit

const STAGE_LABEL = {
  storage:   '📤 อัปโหลดไฟล์เสียง...',
  process:   '✨ AI กำลังถอดเสียงและสรุป... (Whisper + Groq, ~30-90 วินาที)',
  upload:    '🔄 Whisper ติดขัด — กำลังลอง Gemini สำรอง...',
  processing:'⏳ Gemini กำลังเตรียมประมวลผล... (ไฟล์ใหญ่อาจใช้เวลา 1-3 นาที)',
  generate:  '✨ Gemini กำลังสรุป...',
  done:      '✅ เสร็จแล้ว',
};

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
  const [stage, setStage] = useState('');     // storage | upload | processing | generate | done
  const [err, setErr] = useState('');
  const [tickHack, setTickHack] = useState(0); // re-render to update recording timer

  const mediaRecRef = useRef(null);
  const recStartRef = useRef(0);
  const fileInputRef = useRef(null);
  const tickIntervalRef = useRef(null);

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
        // If we caught a note mid-pipeline (e.g. user reloaded), resume.
        if (n && n.status !== 'done' && n.status !== 'error') {
          handleResume(n);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [booking?.id]);

  // Tick the recording timer while recording
  useEffect(() => {
    if (!recording) {
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
      return;
    }
    tickIntervalRef.current = setInterval(() => setTickHack(t => t + 1), 1000);
    return () => {
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    };
  }, [recording]);

  async function handleStartRecording() {
    setErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Voice-grade settings keep file small enough for long meetings.
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      // 24 kbps opus → ~10 MB/hr → 100 MB bucket fits ~10 hrs of meeting
      const mr = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
        audioBitsPerSecond: 24000,
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

  function handleFileChange(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      setErr(`ไฟล์ใหญ่เกิน 100MB (${(f.size / 1024 / 1024).toFixed(1)}MB)`);
      return;
    }
    setRecordedBlob(f);
    setRecordedSec(0);
  }

  async function handleSubmit() {
    if (!recordedBlob || !booking?.id) return;
    setStage('storage');
    setErr('');
    try {
      const file = recordedBlob instanceof File
        ? recordedBlob
        : new File([recordedBlob], `meeting-${Date.now()}.webm`, { type: recordedBlob.type || 'audio/webm' });
      const finalNote = await startMeetingSummary({
        bookingId: booking.id,
        file,
        createdBy: currentUser?.code || null,
        onProgress: (s, info) => {
          setStage(s);
          if (info?.note) setNote(info.note);
        },
      });
      // Patch duration_sec for recordings
      if (finalNote && recordedSec > 0) {
        await supabase
          .from('mtg_meeting_notes')
          .update({ duration_sec: recordedSec })
          .eq('id', finalNote.id);
        finalNote.duration_sec = recordedSec;
      }
      setNote(finalNote);
      setRecordedBlob(null);
      setRecordedSec(0);
      setStage('done');
    } catch (e) {
      console.error('[MeetingSummary]', e);
      setErr(String(e.message || e));
      setStage('');
      // Refresh note state from DB so the user can see status=error if applicable
      const fresh = await getNoteForBooking(booking.id);
      if (fresh) setNote(fresh);
    }
  }

  async function handleResume(noteToResume) {
    setStage(noteToResume.gemini_file_name ? 'processing' : 'upload');
    setErr('');
    try {
      const fresh = await resumeMeetingSummary(noteToResume, (s) => setStage(s));
      setNote(fresh);
      setStage('done');
    } catch (e) {
      console.error('[MeetingSummary] resume', e);
      setErr(String(e.message || e));
      setStage('');
      const fresh = await getNoteForBooking(booking.id);
      if (fresh) setNote(fresh);
    }
  }

  async function handleDelete() {
    if (!note) return;
    if (!confirm('ลบสรุปการประชุมนี้?')) return;
    try {
      await deleteMeetingNote(note);
      setNote(null);
      setStage('');
    } catch (e) {
      setErr('ลบไม่สำเร็จ: ' + (e.message || e));
    }
  }

  if (loading) {
    return <div className="ms-panel ms-panel-loading">กำลังโหลด...</div>;
  }

  const isProcessing = !!stage && stage !== 'done';

  return (
    <div className="ms-panel">
      <div className="ms-panel-head">
        <div className="ms-panel-title">📝 สรุปการประชุม (AI)</div>
        {note && !isProcessing && (
          <button type="button" className="ms-btn-ghost" onClick={handleDelete} title="ลบ">🗑️</button>
        )}
      </div>

      {/* In-progress UI — covers fresh starts AND resumed pipelines */}
      {isProcessing && (
        <div className="ms-status ms-status-processing">
          {STAGE_LABEL[stage] || 'กำลังประมวลผล...'}
        </div>
      )}

      {!note && !isProcessing && (
        <div className="ms-empty">
          <div className="ms-empty-hint">
            อัดเสียงประชุมหรืออัปโหลดไฟล์เสียงที่อัดไว้แล้ว — AI จะถอดเสียงและสรุปประเด็น/action items ให้
            <br />
            <small style={{opacity:0.7}}>รองรับไฟล์สูงสุด 100MB · 1-3 ชม. (24kbps opus ≈ 10MB/hr)</small>
          </div>
          <div className="ms-empty-actions">
            {!recording && !recordedBlob && (
              <>
                <button type="button" className="ms-btn-primary" onClick={handleStartRecording}>
                  🎤 บันทึกเสียง
                </button>
                <button type="button" className="ms-btn-secondary" onClick={handleFilePick}>
                  📁 อัปโหลดไฟล์
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
                <button type="button" className="ms-btn-primary" onClick={handleSubmit}>
                  🚀 ส่งให้ AI สรุป
                </button>
                <button
                  type="button"
                  className="ms-btn-ghost"
                  onClick={() => { setRecordedBlob(null); setRecordedSec(0); }}
                >
                  ยกเลิก
                </button>
              </>
            )}
          </div>
          {err && <div className="ms-error">{err}</div>}
        </div>
      )}

      {note && note.status === 'error' && !isProcessing && (
        <div className="ms-status ms-status-error">
          ❌ ประมวลผลไม่สำเร็จ
          {note.error_message && <div className="ms-error-msg">{note.error_message}</div>}
          <div className="ms-empty-actions">
            <button type="button" className="ms-btn-secondary" onClick={() => handleResume(note)}>
              🔄 ลองใหม่
            </button>
            <button type="button" className="ms-btn-ghost" onClick={handleDelete}>
              ลบทิ้ง
            </button>
          </div>
        </div>
      )}

      {note && note.status === 'done' && !isProcessing && (
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
