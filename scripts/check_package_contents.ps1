[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
Push-Location $repositoryRoot
try {
    $json = (& npm pack --dry-run --json | Out-String)
    if ($LASTEXITCODE -ne 0) { throw "npm pack --dry-run --json failed." }
    $result = $json | ConvertFrom-Json
}
finally {
    Pop-Location
}

$files = @($result[0].files | ForEach-Object { $_.path.Replace("\", "/") } | Sort-Object -Unique)
$forbiddenPrefixes = @(".github/", "internal_docs/", "scripts/", "test/", "tests/", "tools/")
$forbiddenNames = @("AGENTS.md", "TODO.md", "release_check.bat", "run_ci.bat")
$forbidden = @(
    foreach ($path in $files) {
        if ($path -in $forbiddenNames) { $path; continue }
        foreach ($prefix in $forbiddenPrefixes) {
            if ($path.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) { $path; break }
        }
    }
)
if ($forbidden.Count -ne 0) {
    throw "npm package contains repository-only files: $($forbidden -join ', ')"
}
$required = @("LICENSE", "README.md", "package.json", "lib/index.js")
$missing = @($required | Where-Object { $_ -notin $files })
if ($missing.Count -ne 0) { throw "npm package is missing required files: $($missing -join ', ')" }
Write-Host "[OK] npm package content passed: files=$($files.Count)"
