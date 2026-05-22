// Global recording state — holds the MediaRecorder + bookingId + blob
// at App level so the recording survives:
//   - closing the meeting modal mid-recording
//   - switching tabs in the SPA (ตาราง → ประวัติ → กลับ)
//   - the MeetingSummaryPanel unmounting and remounting
//
// Before: MediaRecorder lived in panel component → unmount = data lost.
// Now: panel just reads/sends to this context. Recording survives.
//
// A small floating pill at App level shows "🔴 กำลังอัด ..." with timer
// while recording is active anywhere in the app; click to jump back to
// that booking's modal.

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';

const RecordingCtx = createContext(null);

export function useRecording() {
  const ctx = useContext(RecordingCtx);
  if (!ctx) throw new Error('useRecording must be inside <RecordingProvider>');
  return ctx;
}

export function RecordingProvider({ children }) {
  const [recording, setRecording] = useState(false);
  const [bookingId, setBookingId] = useState(null);
  const [bookingTitle, setBookingTitle] = useState('');
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedSec, setRecordedSec] = useState(0);
  const [err, setErr] = useState('');
  // tick once a second while recording so consumers re-render with the
  // live elapsed time (computed off recStartRef so we don't drift)
  const [, forceTick] = useState(0);

  const mediaRecRef = useRef(null);
  const streamRef = useRef(null);
  const recStartRef = useRef(0);
  const wakeLockRef = useRef(null);
  const beforeUnloadRef = useRef(null);
  const visListenerRef = useRef(null);
  const tickRef = useRef(null);

  // Tick timer
  useEffect(() => {
    if (!recording) return;
    tickRef.current = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); tickRef.current = null; };
  }, [recording]);

  // Cleanup on unmount (provider lives at App root, so this effectively
  // only fires when the user fully unloads the page — but it's also
  // belt-and-suspenders during hot reload in dev).
  useEffect(() => () => {
    try { mediaRecRef.current?.stop(); } catch {}
    try { streamRef.current?.getTracks?.().forEach((t) => t.stop()); } catch {}
    try { wakeLockRef.current?.release?.(); } catch {}
    if (beforeUnloadRef.current) window.removeEventListener('beforeunload', beforeUnloadRef.current);
    if (visListenerRef.current) document.removeEventListener('visibilitychange', visListenerRef.current);
  }, []);

  // Live elapsed seconds, computed from start time
  const elapsedSec = recording && recStartRef.current
    ? Math.round((Date.now() - recStartRef.current) / 1000)
    : 0;

  const start = useCallback(async (bId, bTitle) => {
    if (recording) {
      setErr('ยังมี trip กำลังอัดอยู่ — หยุดก่อนถึงจะเริ่มใหม่ได้');
      return false;
    }
    setErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus' : 'audio/webm',
        audioBitsPerSecond: 24000,
      });
      const chunks = [];
      mr.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
        setRecordedBlob(blob);
        setRecordedSec(Math.round((Date.now() - recStartRef.current) / 1000));
        try { stream.getTracks().forEach((t) => t.stop()); } catch {}
        streamRef.current = null;
      };
      mr.start(5000);
      mediaRecRef.current = mr;
      recStartRef.current = Date.now();
      setRecording(true);
      setBookingId(bId);
      setBookingTitle(bTitle || '');
      setRecordedBlob(null);
      setRecordedSec(0);

      // Wake lock + unload guard (same as before, just here once)
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          wakeLockRef.current.addEventListener?.('release', () => { wakeLockRef.current = null; });
        }
      } catch (_) {}
      const beforeUnload = (ev) => { ev.preventDefault(); ev.returnValue = ''; return ''; };
      window.addEventListener('beforeunload', beforeUnload);
      beforeUnloadRef.current = beforeUnload;
      const onVis = async () => {
        if (document.visibilityState === 'visible' && !wakeLockRef.current && 'wakeLock' in navigator) {
          try { wakeLockRef.current = await navigator.wakeLock.request('screen'); } catch (_) {}
        }
      };
      document.addEventListener('visibilitychange', onVis);
      visListenerRef.current = onVis;
      return true;
    } catch (e) {
      setErr('ไม่สามารถใช้ไมค์ได้: ' + (e.message || e));
      return false;
    }
  }, [recording]);

  const stop = useCallback(() => {
    try { mediaRecRef.current?.stop(); } catch {}
    setRecording(false);
    try { wakeLockRef.current?.release?.(); } catch {}
    wakeLockRef.current = null;
    if (beforeUnloadRef.current) {
      window.removeEventListener('beforeunload', beforeUnloadRef.current);
      beforeUnloadRef.current = null;
    }
    if (visListenerRef.current) {
      document.removeEventListener('visibilitychange', visListenerRef.current);
      visListenerRef.current = null;
    }
  }, []);

  // Called by the panel after it successfully uploads the blob — clears
  // the staged data so the user can record a new trip.
  const clearBlob = useCallback(() => {
    setRecordedBlob(null);
    setRecordedSec(0);
    setBookingId(null);
    setBookingTitle('');
  }, []);

  // Called by the panel when user manually sets a file (via upload). The
  // booking context still needs to be set so the floating indicator can
  // jump back to it.
  const setFileForBooking = useCallback((bId, bTitle, file) => {
    setBookingId(bId);
    setBookingTitle(bTitle || '');
    setRecordedBlob(file);
    setRecordedSec(0);
  }, []);

  return (
    <RecordingCtx.Provider value={{
      recording, bookingId, bookingTitle,
      recordedBlob, recordedSec, elapsedSec,
      err, setErr,
      start, stop, clearBlob, setFileForBooking,
    }}>
      {children}
    </RecordingCtx.Provider>
  );
}

// Small floating pill that's visible app-wide while recording.
// Renders only when `recording === true`. Clicking it fires a callback
// the parent app uses to open the booking modal.
export function RecordingIndicator({ onClick }) {
  const { recording, bookingTitle, elapsedSec, stop } = useRecording();
  if (!recording) return null;
  const m = Math.floor(elapsedSec / 60);
  const s = Math.floor(elapsedSec % 60);
  const time = `${m}:${String(s).padStart(2, '0')}`;
  return (
    <div
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 14px)',
        right: 14,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 14px 8px 12px',
        background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
        color: '#fff',
        borderRadius: 999,
        boxShadow: '0 8px 24px rgba(220, 38, 38, 0.35), 0 0 0 4px rgba(220, 38, 38, 0.2)',
        fontSize: 13,
        fontFamily: 'inherit',
        fontWeight: 600,
        cursor: onClick ? 'pointer' : 'default',
        animation: 'recPulse 1.4s ease-in-out infinite',
      }}
      onClick={onClick}
      title="คลิกเพื่อกลับไปที่ booking"
    >
      <span style={{
        width: 10, height: 10, borderRadius: '50%', background: '#fff',
        boxShadow: '0 0 8px rgba(255,255,255,0.85)',
        animation: 'recDot 1s ease-in-out infinite',
      }}/>
      <span>กำลังอัด {bookingTitle ? `· ${bookingTitle.slice(0, 24)}` : ''}</span>
      <span style={{ opacity: 0.85, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{time}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); stop(); }}
        style={{
          marginLeft: 4, padding: '4px 8px', background: 'rgba(255,255,255,0.2)',
          border: 0, borderRadius: 6, color: '#fff', cursor: 'pointer',
          fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
        }}
      >
        ⏹ หยุด
      </button>
      <style>{`
        @keyframes recDot { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes recPulse { 0%,100% { box-shadow: 0 8px 24px rgba(220,38,38,0.35), 0 0 0 4px rgba(220,38,38,0.2); } 50% { box-shadow: 0 8px 24px rgba(220,38,38,0.5), 0 0 0 8px rgba(220,38,38,0.1); } }
      `}</style>
    </div>
  );
}
