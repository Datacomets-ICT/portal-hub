// Silent audio compression for big meeting recordings.
//
// Why: Supabase Free caps uploads at 50 MB. A 1-2 hr Zoom export is
// often 70-200 MB. Browser-side re-encoding to 32 kbps mono MP3
// shrinks those by ~7–10× (96 MB → ~12 MB) without hurting Whisper
// transcription quality.
//
// "Silent" = the user never sees a "compressing..." stage. We
// piggyback on the existing storage progress callback so they think
// the upload is just slow at the start.
//
//   onProgress(percent, info?)  // 0..100, called repeatedly
//
// Returns a new File (or the original if compression skipped/failed).

const TARGET_SAMPLE_RATE = 22050;
const COMPRESSION_THRESHOLD_BYTES = 30 * 1024 * 1024;

// Audio-context creation can throw on iOS Safari without a user gesture.
function makeAudioContext() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw new Error('AudioContext not supported');
  return new Ctx();
}

// Decode the file via Web Audio + downmix to mono + resample to
// 22 050 Hz, all in an OfflineAudioContext (faster than realtime).
async function decodeAndDownsample(file) {
  const ctx = makeAudioContext();
  try {
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    const offline = new OfflineAudioContext(
      1,
      Math.ceil(buf.duration * TARGET_SAMPLE_RATE),
      TARGET_SAMPLE_RATE
    );
    const src = offline.createBufferSource();
    src.buffer = buf;
    src.connect(offline.destination);
    src.start(0);
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0); // Float32Array (mono)
  } finally {
    try { await ctx.close(); } catch {}
  }
}

// Encode in a Web Worker so the main thread stays smooth and the
// browser doesn't need to be focused.
function encodeMp3InWorker(samples, sampleRate, onPartialProgress) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(
        new URL('./mp3Worker.js', import.meta.url),
        { type: 'module' }
      );
    } catch (err) {
      reject(err);
      return;
    }
    worker.onmessage = (e) => {
      const d = e.data;
      if (d?.error) {
        worker.terminate();
        reject(new Error(d.error));
      } else if (d?.progress !== undefined && onPartialProgress) {
        onPartialProgress(d.progress);
      } else if (d?.done) {
        worker.terminate();
        resolve(new Uint8Array(d.mp3));
      }
    };
    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };
    // Transfer ArrayBuffer ownership — zero-copy across thread boundary
    worker.postMessage(
      { samplesBuffer: samples.buffer, sampleRate },
      [samples.buffer]
    );
  });
}

// Public entry. Set onProgress to surface 0..100; the value covers
// the entire compression phase (consumer maps it onto whatever portion
// of the upload bar makes sense).
export async function compressIfLarge(file, onProgress) {
  if (!file || file.size <= COMPRESSION_THRESHOLD_BYTES) return file;
  try {
    if (onProgress) onProgress(2);
    const samples = await decodeAndDownsample(file);
    if (onProgress) onProgress(15);

    const mp3 = await encodeMp3InWorker(samples, TARGET_SAMPLE_RATE, (frac) => {
      if (onProgress) {
        // Map encoding progress (0..1) into the 15-95 % range so the
        // bar keeps moving smoothly during the slow part.
        onProgress(15 + Math.round(frac * 80));
      }
    });
    if (onProgress) onProgress(100);

    const baseName = (file.name || 'meeting').replace(/\.[^.]+$/, '');
    return new File([mp3], `${baseName}.mp3`, {
      type: 'audio/mpeg',
      lastModified: Date.now(),
    });
  } catch (err) {
    // Compression is opportunistic — if it fails, fall through to the
    // original file and let the storage layer surface the real error.
    console.warn('[audioCompressor] failed, using original file:', err);
    return file;
  }
}
