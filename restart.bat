@echo off
rem ============================================================
rem AI Workbench restart script
rem Stops existing services, waits for sockets to release, then starts.
rem Pure ASCII (no Chinese) to avoid cmd code-page issues.
rem ============================================================
setlocal

set ROOT=%~dp0

echo [restart.bat] Step 1/3: Stopping existing services...
call "%ROOT%stop.bat"
echo.

echo [restart.bat] Step 2/3: Waiting 3s for sockets to release...
timeout /t 3 /nobreak >nul
echo.

echo [restart.bat] Step 3/3: Starting services...
call "%ROOT%start.bat"

endlocal