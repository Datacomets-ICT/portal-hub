@echo off
cd /d "%~dp0"
set SUPABASE_URL=https://rthsmtimvqjnfvgepqpk.supabase.co
set SUPABASE_KEY=sb_publishable_Fm1h_tWmoNMkkF-ioZnKOQ_ka1P0ViA
python export_excel.py
echo.
pause
