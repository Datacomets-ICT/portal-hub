@echo off
REM Launches the Ollama meeting-summary worker. Run by Task Scheduler at logon
REM (via start-worker-hidden.vbs so no console window appears).
cd /d "D:\Backup\ProjectCode\meeting-rooms\worker"
"C:\Program Files\nodejs\node.exe" ollama-worker.mjs >> worker.log 2>&1
