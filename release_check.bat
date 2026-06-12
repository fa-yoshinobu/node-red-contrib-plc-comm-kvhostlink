@echo off
setlocal

echo ===================================================
echo [RELEASE] Node-RED KV HostLink release check
echo ===================================================

echo [1/3] Checking registry version...
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\check_registry_duplicate.ps1 -Registry npm -Package "@fa_yoshinobu/node-red-contrib-plc-comm-kvhostlink" -VersionSource package-json -ManifestPath package.json
if %errorlevel% neq 0 (
    echo [ERROR] Release version check failed.
    exit /b %errorlevel%
)

echo [2/3] Running tests...
npm test
if %errorlevel% neq 0 (
    echo [ERROR] Tests failed.
    exit /b %errorlevel%
)

echo [3/3] Packing dry run...
npm pack --dry-run
if %errorlevel% neq 0 (
    echo [ERROR] npm pack dry run failed.
    exit /b %errorlevel%
)

echo ===================================================
echo [SUCCESS] Release check passed.
echo ===================================================
endlocal
