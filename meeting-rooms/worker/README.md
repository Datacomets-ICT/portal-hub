# Ollama Summary Worker

Background worker that summarizes meetings using a self-hosted Ollama model. Runs next to the Ollama server (same machine), calls `localhost:11434`, no public tunnel needed.

## How it fits

```
[user clicks ✨สร้างสรุป]
    └─► Vercel /api/meeting-auto-summary
         └─► INSERT mtg_summary_jobs (queued)
                       │
                       │ (Supabase Realtime)
                       ▼
[this worker, running on the office PC]
  poll → claim job → pipeline → save → mark done
                       │
          ┌────────────┴────────────┐
          ▼                          ▼
   audio attachment?          localhost:11434
   whisper.cpp (local STT)    (Ollama qwen2.5:14b)
   → transcript ─────────────► summarize
```

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Windows / macOS / Linux | — | Any OS that runs Ollama |
| Ollama | 0.3+ | https://ollama.com/download |
| Node.js | 20+ | https://nodejs.org |
| ffmpeg | any recent | decodes audio attachments before transcription. `winget install Gyan.FFmpeg` |
| whisper.cpp + ggml model | — | local speech-to-text for audio attachments. See step 1b. |
| RAM | 12 GB free | `qwen2.5:14b` needs ~9 GB. Use `7b` if tight. |
| Disk | 13 GB free | LLM model + cache + ~0.6 GB whisper model |

## First-time setup (Windows PC)

### 1. Install Ollama and pull the model

PowerShell:

```powershell
winget install Ollama.Ollama
# Add to PATH for this session (winget doesn't auto-add):
$env:Path = "$env:LOCALAPPDATA\Programs\Ollama;$env:Path"

# Verify
ollama --version

# Pull the model (~9 GB, takes 5-15 min on a decent connection)
ollama pull qwen2.5:14b

# Quick smoke test
ollama run qwen2.5:14b "สรุปข้อความนี้ใน 1 ประโยค: วันนี้ทีมตัดสินใจเลื่อนการประชุมเป็นวันศุกร์"
```

The Ollama server auto-starts as a background service on Windows. Confirm with:

```powershell
curl http://localhost:11434/api/version
```

### 1b. Set up speech-to-text (whisper.cpp)

Audio attachments (`.mp3`, `.wav`, `.m4a`, …) are transcribed locally with
[whisper.cpp](https://github.com/ggml-org/whisper.cpp) before being summarized —
same "nothing leaves the machine" principle as the local LLM. The binary + model
live under `worker/stt/` and are **gitignored** (the model is ~0.6 GB), so each
machine downloads them once.

PowerShell, from the `worker` directory:

```powershell
$stt = "stt"
New-Item -ItemType Directory -Force $stt | Out-Null

# 1. Prebuilt Windows binary (CPU) — gives stt\Release\whisper-cli.exe
Invoke-WebRequest "https://github.com/ggml-org/whisper.cpp/releases/latest/download/whisper-bin-x64.zip" -OutFile "$stt\whisper.zip"
Expand-Archive "$stt\whisper.zip" -DestinationPath $stt -Force

# 2. Thai-capable model — large-v3-turbo quantized (~0.55 GB; best speed/quality on CPU)
Invoke-WebRequest "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin" -OutFile "$stt\ggml-large-v3-turbo-q5_0.bin"

# 3. VAD model — tiny (~0.9 MB). Stops whisper hallucinating "oh oh oh…" over music/silence.
curl.exe -L -o "$stt\ggml-silero-v5.1.2.bin" "https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin"
```

Smoke-test (should print model-load lines and exit 0):

```powershell
ffmpeg -y -f lavfi -i "sine=frequency=440:duration=2" -ar 16000 -ac 1 "$env:TEMP\t.wav"
stt\Release\whisper-cli.exe -m stt\ggml-large-v3-turbo-q5_0.bin -f "$env:TEMP\t.wav" -l th -nt
```

Paths are auto-resolved relative to `worker/`; override via `.env`
(`WHISPER_CLI`, `WHISPER_MODEL`, `WHISPER_VAD_MODEL`, `WHISPER_LANG`,
`WHISPER_THREADS`, `STT_TIMEOUT_MS`) only if you move them.

> Transcription is CPU-bound: roughly **1 minute of wall-clock per ~1 minute of
> audio** with the turbo model on a typical office CPU. A job with audio will
> sit in `processing` for several minutes — that's normal.

### 2. Install worker dependencies

```powershell
cd D:\Backup\ProjectCode\meeting-rooms\worker
npm install
```

### 3. Configure environment

```powershell
Copy-Item .env.example .env
notepad .env
```

Fill in:

- `SUPABASE_URL` — from Supabase dashboard → Project Settings → API
- `SUPABASE_SERVICE_KEY` — **service_role** key from the same page

> ⚠ The service role key bypasses RLS. Treat it like a database password. Never commit, never put in client code, never paste into Slack.

### 4. Test once

```powershell
npm run once
```

You should see:

```
[2026-06-11 14:30:00] worker starting
[2026-06-11 14:30:00] Ollama OK · version 0.30.7
[2026-06-11 14:30:00] Model qwen2.5:14b OK
[2026-06-11 14:30:01] no queued jobs
```

If there's a queued job, it'll process it and exit. To loop forever:

```powershell
npm start
```

### 5. Trigger a real job

In the meeting-rooms web app:

1. Open a past booking from "ประวัติการจอง"
2. Click ✨สร้างสรุป AI
3. The worker terminal should pick it up within 10 seconds
4. After ~30-180 seconds (depending on transcript length) the UI auto-updates with the summary

## Auto-start on boot (Windows)

Use **Task Scheduler** so the worker survives reboots without you having to log in.

1. Open **Task Scheduler** → Create Task
2. **General tab**
   - Name: `Ollama Summary Worker`
   - Run whether user is logged on or not: ✅
   - Run with highest privileges: ✅
3. **Triggers tab** → New
   - Begin: At startup
4. **Actions tab** → New
   - Program: `C:\Program Files\nodejs\node.exe` (verify path with `where.exe node`)
   - Arguments: `ollama-worker.mjs`
   - Start in: `D:\Backup\ProjectCode\meeting-rooms\worker`
5. **Conditions tab**: uncheck "Start only if on AC power" (if laptop)
6. **Settings tab**: ✅ "If task fails, restart every 1 minute, attempt up to 3 times"
7. OK → enter your password when prompted

Verify:

```powershell
schtasks /Run /TN "Ollama Summary Worker"
schtasks /Query /TN "Ollama Summary Worker"
```

## Logs

Default: stdout/stderr. To capture to a file when running via Task Scheduler, edit the Action's Arguments to:

```
ollama-worker.mjs >> D:\Backup\ProjectCode\meeting-rooms\worker\worker.log 2>&1
```

(Use `cmd /c` as the program if you want shell redirection — Node alone won't redirect.)

Tail the log:

```powershell
Get-Content worker.log -Tail 50 -Wait
```

## Troubleshooting

**`ollama` command not found**
PATH wasn't picked up. The installer drops `ollama.exe` in `%LOCALAPPDATA%\Programs\Ollama`. Either:
- Open a NEW terminal (PATH updates only apply to new sessions), or
- Add manually: `setx PATH "$env:Path;$env:LOCALAPPDATA\Programs\Ollama"`

**`preflight: cannot reach Ollama`**
Ollama service isn't running. Start it:
```powershell
ollama serve
```
(On a fresh install it auto-starts; after Ollama updates you may need to relaunch the tray app.)

**`preflight: model "qwen2.5:14b" not pulled`**
```powershell
ollama pull qwen2.5:14b
```

**Worker is slow (>3 min per job)**
14b on CPU is the floor. To speed up:
- Switch to a smaller model: edit `.env` → `OLLAMA_MODEL=qwen2.5:7b` (~3× faster, slightly lower quality)
- Run on a machine with a discrete GPU (NVIDIA only — Ollama auto-detects CUDA)
- Trim transcript: shorter input → shorter wait

**Audio attachment shows "อ่านไม่ได้" / not transcribed**
The whisper toolchain isn't set up or isn't found. Check:
- `stt\Release\whisper-cli.exe` and `stt\ggml-large-v3-turbo-q5_0.bin` exist (step 1b)
- `ffmpeg` is on PATH (`where.exe ffmpeg`)
- worker.err.log shows the actual error (e.g. `whisper-cli not found at …`)

**Job with audio sits in 'processing' for minutes**
Expected — transcription is CPU-bound (~1 min per 1 min of audio). Not a hang.
It only counts as stuck past `STT_TIMEOUT_MS` (default 20 min) or the row below.

**Job stuck in 'processing' forever**
The worker crashed mid-job. The job won't auto-recover (intentional — avoids loops on poison inputs). Manually reset in Supabase SQL Editor:
```sql
update mtg_summary_jobs set status = 'queued', started_at = null
 where status = 'processing' and started_at < now() - interval '30 minutes';
```

**`Supabase auth: JWT expired` or `permission denied`**
The `SUPABASE_SERVICE_KEY` in `.env` is wrong. Re-copy from dashboard. Make sure you grabbed the **service_role** key, not the anon key.

## Switching to qwen2.5:7b

If 14b is too slow on your hardware:

```powershell
ollama pull qwen2.5:7b
```

Edit `.env`:
```
OLLAMA_MODEL=qwen2.5:7b
```

Restart the worker. Quality drops a notch but throughput roughly 3× higher.

## Architecture notes

- **No tunnel, no inbound exposure.** The worker pulls from Supabase and calls `localhost:11434`. Ollama never accepts connections from outside this machine.
- **One job at a time.** The claim RPC uses `FOR UPDATE SKIP LOCKED` so multiple workers can run safely, but for ~5 meetings/day a single worker is plenty.
- **Crash-safe queue.** If the worker dies mid-job, the job stays `processing` until manually reset (or the user re-triggers, which dedupes to the same row). We don't auto-retry to avoid amplifying broken inputs.
- **No Gemini fallback.** If Ollama is offline, the worker stops claiming jobs. Users see "🤖 กำลังสรุป..." until you bring it back up; no data loss.
