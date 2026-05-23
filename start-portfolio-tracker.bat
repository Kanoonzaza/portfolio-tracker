@echo off
REM === Portfolio Tracker Launcher ===
REM Double-click this file to start the portfolio tracker properly.
REM It runs a tiny local web server so the browser can make network
REM requests (live prices, currency conversion, etc.) — which is blocked
REM when you open the HTML file directly via file://.

cd /d "%~dp0"

echo.
echo ============================================================
echo   Portfolio Tracker - Local Server
echo ============================================================
echo.
echo   Starting server at http://localhost:8000 ...
echo   Opening browser in 2 seconds...
echo.
echo   KEEP THIS WINDOW OPEN while using the app.
echo   Close this window when you're done.
echo.
echo ============================================================
echo.

REM Open browser after a short delay so the server has time to start
start "" /B cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:8000/portfolio-tracker.html"

REM Start the custom Python server that includes a CORS-bypass proxy.
REM If local-server.py is missing for some reason, fall back to the built-in
REM http.server (live prices won't work but the page will load).
if exist "%~dp0local-server.py" (
  python "%~dp0local-server.py" 8000
) else (
  echo WARNING: local-server.py not found - falling back to plain http.server.
  echo Live prices will NOT work without the proxy. Re-download local-server.py.
  python -m http.server 8000
)

REM If python fails, show error and pause
if errorlevel 1 (
  echo.
  echo ERROR: Could not start Python web server.
  echo Make sure Python is installed and in your PATH.
  echo.
  pause
)
