@echo off
setlocal

echo ===================================================
echo [CI] Node-RED KV Host Link local gate
echo ===================================================

echo [1/3] Installing dependencies...
call npm ci
if %errorlevel% neq 0 exit /b %errorlevel%

echo [2/3] Running tests...
call npm test
if %errorlevel% neq 0 exit /b %errorlevel%

echo [3/3] Validating package contents...
call npm pack --dry-run
if %errorlevel% neq 0 exit /b %errorlevel%

echo ===================================================
echo [SUCCESS] CI passed.
echo ===================================================
endlocal
