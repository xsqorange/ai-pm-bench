@echo off
rem ============================================================
rem AI Workbench stop script
rem Pure ASCII (no Chinese) to avoid cmd code-page issues.
rem Kills processes holding ports 8000 (backend) and 3000 (frontend).
rem Safe: does NOT touch unrelated node.exe processes.
rem ============================================================
setlocal

echo [stop.bat] Scanning for processes on ports 8000 and 3000...

set FOUND=0

rem --- Backend (port 8000) ---
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8000" ^| findstr "LISTENING"') do (
  echo [stop.bat] Killing backend PID=%%P
  taskkill /PID %%P /F /T >nul 2>&1
  set FOUND=1
)

rem --- Frontend (port 3000) ---
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
  echo [stop.bat] Killing frontend PID=%%P
  taskkill /PID %%P /F /T >nul 2>&1
  set FOUND=1
)

rem Also clean up stale cmd windows from prior runs
taskkill /FI "WINDOWTITLE eq Workbench-Backend*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Workbench-Frontend*" /T /F >nul 2>&1

rem Give Windows a moment to release sockets
timeout /t 2 /nobreak >nul

if "%FOUND%"=="1" (
  echo [stop.bat] Done. Ports should now be free.
) else (
  echo [stop.bat] Nothing running on 8000 or 3000.
)
endlocal