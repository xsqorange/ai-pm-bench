@echo off
rem ============================================================
rem AI Workbench status script
rem Shows: ports, processes, DB connection, record counts, log tail.
rem Pure ASCII (no Chinese).
rem ============================================================
setlocal EnableDelayedExpansion

set ROOT=%~dp0

echo ============================================================
echo   AI Workbench Status
echo ============================================================
echo.

rem --- Listening Ports ---
echo --- Listening Ports ---
set HAS_BACKEND=0
set HAS_FRONTEND=0
for /f "tokens=5" %%P in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":8000"') do (
  echo   Port 8000 backend PID=%%P LISTENING
  set HAS_BACKEND=1
)
for /f "tokens=5" %%P in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":3000"') do (
  echo   Port 3000 frontend PID=%%P LISTENING
  set HAS_FRONTEND=1
)
if "!HAS_BACKEND!"=="0" echo   Port 8000 backend NOT LISTENING
if "!HAS_FRONTEND!"=="0" echo   Port 3000 frontend NOT LISTENING
echo.

rem --- Database Stats ---
echo --- Database ---
set PY=%ROOT%backend\.venv\Scripts\python.exe
if exist "!PY!" (
  "!PY!" "%ROOT%backend\scripts\status.py" "%ROOT%.env"
) else (
  echo   venv not found at !PY!
)
echo.

rem --- Recent Log ---
echo --- Recent Log - last 5 lines ---
set LOG=%ROOT%data\logs\workbench.log
if exist "!LOG!" (
  powershell -NoProfile -Command "Get-Content '!LOG!' -Tail 5 | ForEach-Object { Write-Output ('   ' + $_) }"
) else (
  echo   No log file yet
)
echo.

echo ============================================================
echo   Commands: start.bat / stop.bat / restart.bat
echo   Backend log: %ROOT%data\logs\workbench.log
echo ============================================================
endlocal