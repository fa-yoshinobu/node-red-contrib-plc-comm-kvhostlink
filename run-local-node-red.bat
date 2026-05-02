@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "USER_DIR=%USERPROFILE%\.node-red"
set "NODE_RED_CMD=%APPDATA%\npm\node-red.cmd"

where node >nul 2>&1 || goto :missing_node
where npm.cmd >nul 2>&1 || goto :missing_npm
if not exist "%NODE_RED_CMD%" goto :missing_node_red

if /I "%~1"=="--dry-run" (
  echo RepoDir   : %SCRIPT_DIR%
  echo UserDir   : %USER_DIR%
  echo Stop      : existing node-red/node.exe for this userDir
  echo Install   : npm.cmd install --no-save --no-package-lock "%SCRIPT_DIR%"
  echo Launch    : "%NODE_RED_CMD%" --userDir "%USER_DIR%"
  exit /b 0
)

if not exist "%USER_DIR%" (
  mkdir "%USER_DIR%" || goto :mkdir_failed
)

call :stop_existing_node_red
if errorlevel 1 goto :stop_failed

pushd "%USER_DIR%" || goto :pushd_failed
call npm.cmd install --no-save --no-package-lock "%SCRIPT_DIR%"
if errorlevel 1 goto :install_failed

call "%NODE_RED_CMD%" --userDir "%USER_DIR%" %*
set "EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %EXIT_CODE%

:install_failed
set "EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %EXIT_CODE%

:stop_existing_node_red
set "NODE_RED_USER_DIR=%USER_DIR%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference = 'Stop';" ^
  "$userDir = [System.IO.Path]::GetFullPath($env:NODE_RED_USER_DIR);" ^
  "$ids = New-Object 'System.Collections.Generic.HashSet[int]';" ^
  "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | Where-Object { ($_.CommandLine -and ($_.CommandLine -like '*node-red*' -or $_.CommandLine -like ('*' + $userDir + '*'))) } | ForEach-Object { [void]$ids.Add([int]$_.ProcessId) };" ^
  "foreach ($id in $ids) { Write-Host ('Stopping existing Node-RED candidate PID ' + $id); Stop-Process -Id $id -Force -ErrorAction Stop };" ^
  "if ($ids.Count -gt 0) { Start-Sleep -Milliseconds 500 }"
exit /b %ERRORLEVEL%

:stop_failed
echo Failed to stop an existing Node-RED/node.exe process.
echo Close Node-RED manually or run this script from an elevated terminal.
exit /b 1

:missing_node
echo node was not found in PATH.
exit /b 1

:missing_npm
echo npm.cmd was not found in PATH.
exit /b 1

:missing_node_red
echo node-red was not found in PATH.
exit /b 1

:mkdir_failed
echo Failed to create "%USER_DIR%".
exit /b 1

:pushd_failed
echo Failed to enter "%USER_DIR%".
exit /b 1
