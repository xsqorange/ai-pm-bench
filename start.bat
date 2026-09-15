@echo off
setlocal
set ROOT=%~dp0
set BACKEND=%ROOT%backend
set FRONTEND=%ROOT%frontend
echo ============================================================
echo   AI Workbench Launcher
echo ============================================================
echo.
if not exist "%ROOT%.env" (
  echo [ERROR] .env not found.
  pause
  exit /b 1
)
call "%BACKEND%\.venv\Scripts\activate.bat"
if errorlevel 1 (
  echo [ERROR] venv activate failed
  pause
  exit /b 1
)
echo [start.bat] Initializing database...
set PYTHONPATH=%BACKEND%
python "%BACKEND%\scripts\init_db.py"
if errorlevel 1 (
  echo [ERROR] DB init failed. Is PostgreSQL running?
  pause
  exit /b 1
)
echo [start.bat] Starting backend on port 8000...
start "Workbench-Backend" cmd /k "cd /d %BACKEND% && set PYTHONPATH=%BACKEND% && .venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
if exist "%FRONTEND%\node_modules" (
  echo [start.bat] Starting frontend on port 3000...
  start "Workbench-Frontend" cmd /k "cd /d %FRONTEND% && npm run dev"
) else (
  echo [WARN] Frontend deps missing - run npm install
)
echo ============================================================
echo   Backend   -^> http://127.0.0.1:8000
echo   API Docs  -^> http://127.0.0.1:8000/docs
echo   Frontend  -^> http://127.0.0.1:3000
echo   Stop      -^> stop.bat
echo ============================================================
pause >nul