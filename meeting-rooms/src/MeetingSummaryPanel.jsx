import { useEffect, useRef, useState } from 'react';
import {
  getNoteForBooking,
  startMeetingSummary,
  resumeMeetingSummary,
  deleteMeetingNote,
  purgeExpiredAudio,
  getResumableUploadStatus,
} from './api/meetingNotes.js';
import { supabase } from './lib/supabase.js';
import {
  exportAsPdf,
  exportAsDoc,
  buildPlainText,
  copyToClipboard,
  summaryToList,
  buildReportHtml,
} from './meetingExport.js';
import MeetingEmailModal from './MeetingEmailModal.jsx';

const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500 MB — matches v18 bucket limit

// User-facing labels stay generic — internally the system might cycle
// through Whisper → Gemini → Deepgram, but the user just wants to know
// "AI is working on it". Hiding the provider name avoids the awkward
// "ลอง provider สำรอง" message that just looked like the system was
// breaking down.
const STAGE_LABEL = {
  storage:   '📤 อัปโหลดไฟล์เสียง...',
  process:   '✨ AI กำลังถอดเสียงและสรุป... (~30-90 วินาที)',
  upload:    '✨ AI กำลังถอดเสียงและสรุป...',
  processing:'✨ AI กำลังประมวลผล...',
  generate:  '✨ AI กำลังสรุป...',
  deepgram:  '✨ AI กำลังถอดเสียงและสรุป...',
  done:      '✅ เสร็จแล้ว',
};

// Format remaining time before audio_expires_at as "X ชม. Y นาที"
// (or "หมดเวลาแล้ว" if past). Returns { label, expired }.
function formatTimeLeft(expiresAt) {
  if (!expiresAt) return { label: '', expired: false };
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (Number.isNaN(ms)) return { label: '', expired: false };
  if (ms <= 0) return { label: 'หมดเวลาแล้ว', expired: true };
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return { label: `${h} ชม. ${m} นาที`, expired: false };
  return { label: `${m} นาที`, expired: false };
}

function fmtDuration(sec) {
  if (!sec || sec < 0) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function MeetingSummaryPanel({ booking, currentUser, room = null, employee = null }) {
  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedSec, setRecordedSec] = useState(0);
  const [stage, setStage] = useState('');     // storage | upload | processing | generate | done
  const [uploadPercent, setUploadPercent] = useState(0);
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
      let n = await getNoteForBooking(booking.id);
      if (!cancelled) {
        // Auto-purge audio if expired (cron may not have fired yet)
        if (n && n.audio_path && n.audio_expires_at &&
            new Date(n.audio_expires_at).getTime() < Date.now()) {
          try { await purgeExpiredAudio(n); } catch {}
          n = await getNoteForBooking(booking.id);
        }
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

  // Tick once a minute to keep the countdown fresh (cheap)
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!note?.audio_expires_at || !note?.audio_path) return;
    const id = setInterval(() => forceTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, [note?.audio_expires_at, note?.audio_path]);

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
          if (typeof info?.uploadPercent === 'number') setUploadPercent(info.uploadPercent);
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

  // ===== Export handlers =====
  function exportArgs() {
    return { booking, room, employee, note };
  }

  const [exporting, setExporting] = useState('');  // 'pdf' | 'doc' | ''

  async function handleExportPdf() {
    if (!note || exporting) return;
    setErr('');
    setExporting('pdf');
    try {
      await exportAsPdf(exportArgs());
    } catch (e) {
      console.error('[export PDF]', e);
      setErr('ดาวน์โหลด PDF ไม่สำเร็จ: ' + (e.message || e));
    } finally {
      setExporting('');
    }
  }

  async function handleExportDoc() {
    if (!note || exporting) return;
    setErr('');
    setExporting('doc');
    try {
      await exportAsDoc(exportArgs());
    } catch (e) {
      console.error('[export DOC]', e);
      setErr('ดาวน์โหลด Word ไม่สำเร็จ: ' + (e.message || e));
    } finally {
      setExporting('');
    }
  }

  const [emailOpen, setEmailOpen] = useState(false);
  const [copiedAt, setCopiedAt] = useState(0);

  // Edit + preview UI state
  const [editMode, setEditMode] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editedNote, setEditedNote] = useState(null); // working copy while editing
  const [savingEdit, setSavingEdit] = useState(false);

  // The "live" view object the preview iframe renders. While editing
  // it tracks editedNote so the preview reflects every keystroke; when
  // not editing it just mirrors the saved note.
  const previewNote = editMode ? editedNote : note;

  function handleStartEdit() {
    if (!note) return;
    // Take a deep-ish copy so edits don't mutate state in place.
    setEditedNote({
      ...note,
      action_items: Array.isArray(note.action_items)
        ? note.action_items.map(a => ({ ...a }))
        : [],
      decisions: Array.isArray(note.decisions) ? [...note.decisions] : [],
      discussion_topics: Array.isArray(note.discussion_topics)
        ? note.discussion_topics.map(t => ({
            ...t,
            points: Array.isArray(t.points) ? [...t.points] : [],
          }))
        : [],
    });
    setEditMode(true);
    setPreviewOpen(true); // auto-open preview alongside edit
    setErr('');
  }

  function handleCancelEdit() {
    setEditMode(false);
    setEditedNote(null);
  }

  async function handleSaveEdit() {
    if (!editedNote?.id) return;
    setSavingEdit(true);
    setErr('');
    try {
      const patch = {
        summary: editedNote.summary || '',
        action_items: editedNote.action_items || [],
        decisions: editedNote.decisions || [],
        discussion_topics: editedNote.discussion_topics || [],
        next_meeting: editedNote.next_meeting || '',
        transcript: editedNote.transcript || '',
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from('mtg_meeting_notes')
        .update(patch)
        .eq('id', editedNote.id);
      if (error) throw error;
      setNote({ ...note, ...patch });
      setEditMode(false);
      setEditedNote(null);
    } catch (e) {
      setErr('บันทึกไม่สำเร็จ: ' + (e.message || e));
    } finally {
      setSavingEdit(false);
    }
  }

  // Field setters used by the form
  const updateField = (field, value) => {
    setEditedNote(prev => ({ ...prev, [field]: value }));
  };
  const updateActionItem = (idx, field, value) => {
    setEditedNote(prev => {
      const next = [...prev.action_items];
      next[idx] = { ...next[idx], [field]: value };
      return { ...prev, action_items: next };
    });
  };
  const removeActionItem = (idx) => {
    setEditedNote(prev => ({
      ...prev,
      action_items: prev.action_items.filter((_, i) => i !== idx),
    }));
  };
  const addActionItem = () => {
    setEditedNote(prev => ({
      ...prev,
      action_items: [...(prev.action_items || []), { task: '', owner: '', due: '' }],
    }));
  };
  const updateDecision = (idx, value) => {
    setEditedNote(prev => {
      const next = [...prev.decisions];
      next[idx] = value;
      return { ...prev, decisions: next };
    });
  };
  const removeDecision = (idx) => {
    setEditedNote(prev => ({
      ...prev,
      decisions: prev.decisions.filter((_, i) => i !== idx),
    }));
  };
  const addDecision = () => {
    setEditedNote(prev => ({
      ...prev,
      decisions: [...(prev.decisions || []), ''],
    }));
  };
  async function handleCopy() {
    if (!note) return;
    const text = buildPlainText(exportArgs());
    const ok = await copyToClipboard(text);
    if (ok) setCopiedAt(Date.now());
    else setErr('คัดลอกไม่สำเร็จ — เบราว์เซอร์ไม่อนุญาตให้เข้าถึง clipboard');
  }
  const justCopied = Date.now() - copiedAt < 2000;

  if (loading) {
    return <div className="ms-panel ms-panel-loading">กำลังโหลด...</div>;
  }

  const isProcessing = !!stage && stage !== 'done';

  return (
    <div className="ms-panel">
      <div className="ms-panel-head">
        <div className="ms-panel-title">📝 สรุปการประชุม (AI)</div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {note && note.status === 'done' && !isProcessing && !editMode && (
            <>
              <button type="button" className="ms-btn-ghost" onClick={handleStartEdit} title="แก้ไข">✏️</button>
              <button type="button" className="ms-btn-ghost" onClick={() => setPreviewOpen(o => !o)} title="ดู Preview">
                {previewOpen ? '🙈' : '👁️'}
              </button>
            </>
          )}
          {note && !isProcessing && !editMode && (
            <button type="button" className="ms-btn-ghost" onClick={handleDelete} title="ลบ">🗑️</button>
          )}
        </div>
      </div>

      {/* In-progress UI — covers fresh starts AND resumed pipelines */}
      {isProcessing && (
        <div className="ms-status ms-status-processing">
          {STAGE_LABEL[stage] || 'กำลังประมวลผล...'}
          {stage === 'storage' && uploadPercent > 0 && uploadPercent < 100 && (
            <div className="ms-upload-progress">
              <div className="ms-upload-bar" style={{ width: `${uploadPercent}%` }} />
              <div className="ms-upload-pct">{uploadPercent}%</div>
            </div>
          )}
        </div>
      )}

      {!note && !isProcessing && (
        <div className="ms-empty">
          <div className="ms-empty-hint">
            อัดเสียงประชุมหรืออัปโหลดไฟล์เสียงที่อัดไว้แล้ว — AI จะถอดเสียงและสรุปประเด็น/action items ให้
            <br />
            <small style={{opacity:0.7}}>
              {(() => {
                const s = getResumableUploadStatus();
                return s.ok
                  ? <>✅ Resumable upload พร้อม (สูงสุด 500MB) · ลบอัตโนมัติ 24 ชม.</>
                  : <>⚠️ Resumable upload <b>ยังไม่พร้อม</b> — สูงสุด 50MB เท่านั้น<br />
                     <span style={{color:'#B45309'}}>
                       ตั้ง <code>VITE_SUPABASE_LEGACY_JWT</code> ใน Vercel เพื่อรองรับไฟล์ใหญ่กว่า
                     </span></>;
              })()}
            </small>
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
          {note.audio_url && (() => {
            const tl = formatTimeLeft(note.audio_expires_at);
            return (
              <div className="ms-audio">
                <audio controls src={note.audio_url} style={{ width: '100%' }} />
                <div className="ms-audio-meta">
                  {note.duration_sec > 0 && <>⏱ {fmtDuration(note.duration_sec)}</>}
                  {tl.label && (
                    <span className={`ms-audio-expiry ${tl.expired ? 'expired' : ''}`}>
                      {tl.expired
                        ? '🕒 ไฟล์เสียงหมดอายุแล้ว — สรุปยังอยู่'
                        : <>🕒 ไฟล์เสียงจะถูกลบใน <b>{tl.label}</b> — โหลดเป็น PDF/Word เก็บไว้ได้</>}
                    </span>
                  )}
                </div>
              </div>
            );
          })()}
          {!note.audio_url && (
            <div className="ms-audio-meta ms-audio-purged">
              🗑 ไฟล์เสียงถูกลบอัตโนมัติแล้ว (เก็บไว้แค่ 24 ชม.) — สรุปด้านล่างยังใช้ได้
            </div>
          )}

          {/* Export toolbar */}
          <div className="ms-export-bar">
            <button type="button" className="ms-export-btn ms-export-pdf" onClick={handleExportPdf} disabled={!!exporting}>
              {exporting === 'pdf' ? '⏳ กำลังสร้าง PDF...' : '📄 บันทึกเป็น PDF'}
            </button>
            <button type="button" className="ms-export-btn ms-export-doc" onClick={handleExportDoc} disabled={!!exporting}>
              {exporting === 'doc' ? '⏳ กำลังสร้าง Word...' : '📝 ดาวน์โหลด Word'}
            </button>
            <button type="button" className={`ms-export-btn ms-export-copy ${justCopied ? 'is-copied' : ''}`} onClick={handleCopy} disabled={!!exporting}>
              {justCopied ? '✓ คัดลอกแล้ว' : '📋 คัดลอกข้อความ'}
            </button>
            <button type="button" className="ms-export-btn ms-export-email" onClick={() => setEmailOpen(true)} disabled={!!exporting}>
              📧 ส่ง Email
            </button>
          </div>
          {err && <div className="ms-error">{err}</div>}

          <MeetingEmailModal
            open={emailOpen}
            onClose={() => setEmailOpen(false)}
            note={note}
            booking={booking}
            defaultSubject={(() => {
              const t = booking?.title || 'ประชุม';
              const d = booking?.bookingDate ? new Date(booking.bookingDate) : null;
              const dateStr = d ? `${d.getDate()}/${d.getMonth() + 1}/${(d.getFullYear() + 543).toString().slice(-2)}` : '';
              return `[สรุปการประชุม] ${t}${dateStr ? ' - ' + dateStr : ''}`;
            })()}
          />

          {/* Two-column layout when editing OR previewing.
              Left = read-only display or edit form. Right = live preview iframe. */}
          {(editMode || previewOpen) && (
            <div className="ms-edit-preview-grid">
              <div className="ms-edit-pane">
                {editMode && editedNote ? (
                  <EditForm
                    edited={editedNote}
                    update={updateField}
                    updateActionItem={updateActionItem}
                    addActionItem={addActionItem}
                    removeActionItem={removeActionItem}
                    updateDecision={updateDecision}
                    addDecision={addDecision}
                    removeDecision={removeDecision}
                    onSave={handleSaveEdit}
                    onCancel={handleCancelEdit}
                    saving={savingEdit}
                  />
                ) : (
                  <ReadOnlyView note={note} />
                )}
              </div>
              <div className="ms-preview-pane">
                <div className="ms-preview-head">
                  <span>👁️ ตัวอย่างที่จะส่ง / โหลด</span>
                  <button
                    type="button"
                    className="ms-btn-ghost"
                    onClick={() => { if (!editMode) setPreviewOpen(false); }}
                    disabled={editMode}
                    title={editMode ? 'ปิดได้หลังจากบันทึก/ยกเลิก' : 'ปิด preview'}
                  >✕</button>
                </div>
                <iframe
                  className="ms-preview-iframe"
                  title="meeting summary preview"
                  srcDoc={buildReportHtml({
                    booking,
                    room,
                    employee,
                    note: previewNote,
                    includeStyles: true,
                  })}
                />
              </div>
            </div>
          )}

          {/* Inline read-only display — only when not in edit/preview mode */}
          {!editMode && !previewOpen && Array.isArray(note.discussion_topics) && note.discussion_topics.length > 0 && (
            <div className="ms-section">
              <div className="ms-section-title">💬 ประเด็นการประชุม</div>
              {note.discussion_topics.map((t, i) => (
                <div key={i} className="ms-topic">
                  <div className="ms-topic-head">{t.topic}</div>
                  {Array.isArray(t.points) && t.points.length > 0 && (
                    <ul className="ms-topic-points">
                      {t.points.map((p, j) => <li key={j}>{p}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}

          {!editMode && !previewOpen && (() => {
            const lines = summaryToList(note.summary);
            return lines.length > 0 ? (
              <div className="ms-section">
                <div className="ms-section-title">💡 ประเด็นหลัก</div>
                <ul className="ms-action-list">
                  {lines.map((line, i) => <li key={i}>{line}</li>)}
                </ul>
              </div>
            ) : null;
          })()}

          {!editMode && !previewOpen && Array.isArray(note.decisions) && note.decisions.length > 0 && (
            <div className="ms-section">
              <div className="ms-section-title">⚖️ ข้อตัดสินใจ</div>
              <ul className="ms-decisions">
                {note.decisions.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            </div>
          )}

          {!editMode && !previewOpen && Array.isArray(note.action_items) && note.action_items.length > 0 && (
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

          {!editMode && !previewOpen && note.next_meeting && (
            <div className="ms-section">
              <div className="ms-section-title">📅 การประชุมครั้งถัดไป</div>
              <div className="ms-next-meeting">{note.next_meeting}</div>
            </div>
          )}

          {!editMode && !previewOpen && note.transcript && (
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

// ===== Sub-components =====

function ReadOnlyView({ note }) {
  const lines = summaryToList(note.summary);
  return (
    <div>
      {Array.isArray(note.discussion_topics) && note.discussion_topics.length > 0 && (
        <div className="ms-section">
          <div className="ms-section-title">💬 ประเด็นการประชุม</div>
          {note.discussion_topics.map((t, i) => (
            <div key={i} className="ms-topic">
              <div className="ms-topic-head">{t.topic}</div>
              {Array.isArray(t.points) && t.points.length > 0 && (
                <ul className="ms-topic-points">
                  {t.points.map((p, j) => <li key={j}>{p}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
      {lines.length > 0 && (
        <div className="ms-section">
          <div className="ms-section-title">💡 ประเด็นหลัก</div>
          <ul className="ms-action-list">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </div>
      )}
      {Array.isArray(note.decisions) && note.decisions.length > 0 && (
        <div className="ms-section">
          <div className="ms-section-title">⚖️ ข้อตัดสินใจ</div>
          <ul className="ms-decisions">{note.decisions.map((d, i) => <li key={i}>{d}</li>)}</ul>
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
      {note.next_meeting && (
        <div className="ms-section">
          <div className="ms-section-title">📅 การประชุมครั้งถัดไป</div>
          <div className="ms-next-meeting">{note.next_meeting}</div>
        </div>
      )}
    </div>
  );
}

function EditForm({
  edited, update, updateActionItem, addActionItem, removeActionItem,
  updateDecision, addDecision, removeDecision, onSave, onCancel, saving,
}) {
  return (
    <div className="ms-edit-form">
      <div className="ms-edit-section">
        <label className="ms-edit-label">💡 ประเด็นหลัก</label>
        <textarea
          className="ms-edit-textarea"
          rows={6}
          value={edited.summary || ''}
          onChange={e => update('summary', e.target.value)}
          placeholder="• ประเด็นที่ 1&#10;• ประเด็นที่ 2"
        />
      </div>

      <div className="ms-edit-section">
        <label className="ms-edit-label">⚖️ ข้อตัดสินใจ</label>
        {(edited.decisions || []).map((d, i) => (
          <div key={i} className="ms-edit-row">
            <input
              type="text"
              className="ms-edit-input"
              value={d}
              onChange={e => updateDecision(i, e.target.value)}
              placeholder="ข้อตัดสินใจ"
            />
            <button type="button" className="ms-btn-ghost" onClick={() => removeDecision(i)} title="ลบ">✕</button>
          </div>
        ))}
        <button type="button" className="ms-btn-secondary ms-edit-add" onClick={addDecision}>+ เพิ่มข้อตัดสินใจ</button>
      </div>

      <div className="ms-edit-section">
        <label className="ms-edit-label">✅ Action Items</label>
        {(edited.action_items || []).map((it, i) => (
          <div key={i} className="ms-edit-action-row">
            <input
              type="text"
              className="ms-edit-input"
              value={it.task || ''}
              onChange={e => updateActionItem(i, 'task', e.target.value)}
              placeholder="งาน"
              style={{ flex: 2 }}
            />
            <input
              type="text"
              className="ms-edit-input"
              value={it.owner || ''}
              onChange={e => updateActionItem(i, 'owner', e.target.value)}
              placeholder="ผู้รับผิดชอบ"
              style={{ flex: 1 }}
            />
            <input
              type="text"
              className="ms-edit-input"
              value={it.due || ''}
              onChange={e => updateActionItem(i, 'due', e.target.value)}
              placeholder="กำหนดเสร็จ"
              style={{ flex: 1 }}
            />
            <button type="button" className="ms-btn-ghost" onClick={() => removeActionItem(i)} title="ลบ">✕</button>
          </div>
        ))}
        <button type="button" className="ms-btn-secondary ms-edit-add" onClick={addActionItem}>+ เพิ่ม Action Item</button>
      </div>

      <div className="ms-edit-section">
        <label className="ms-edit-label">📅 การประชุมครั้งถัดไป</label>
        <input
          type="text"
          className="ms-edit-input"
          value={edited.next_meeting || ''}
          onChange={e => update('next_meeting', e.target.value)}
          placeholder="เช่น พุธหน้า 14:00 ห้อง JUPITER"
        />
      </div>

      <div className="ms-edit-actions">
        <button type="button" className="ms-btn-primary" onClick={onSave} disabled={saving}>
          {saving ? '⏳ กำลังบันทึก...' : '💾 บันทึก'}
        </button>
        <button type="button" className="ms-btn-secondary" onClick={onCancel} disabled={saving}>
          ↩️ ยกเลิก
        </button>
      </div>
    </div>
  );
}
