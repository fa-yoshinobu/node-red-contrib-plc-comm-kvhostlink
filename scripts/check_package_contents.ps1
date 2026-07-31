[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$workspaceRoot = Split-Path -Parent $repositoryRoot
$workDirectory = Join-Path $workspaceRoot (".kvhostlink-npm-package-" + [guid]::NewGuid().ToString("N"))

try {
    [void](New-Item -ItemType Directory -Path $workDirectory)
    Push-Location $repositoryRoot
    try {
        $json = (& npm pack --json --pack-destination $workDirectory | Out-String)
        if ($LASTEXITCODE -ne 0) { throw "npm pack --json failed." }
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
    $required = @(
        "LICENSE",
        "README.md",
        "package.json",
        "lib/index.js",
        "examples/flows/README.md",
        "examples/flows/kvhostlink-basic-read-write.json"
    )
    $missing = @($required | Where-Object { $_ -notin $files })
    if ($missing.Count -ne 0) { throw "npm package is missing required files: $($missing -join ', ')" }

    $manifest = Get-Content -LiteralPath (Join-Path $repositoryRoot "package.json") -Raw | ConvertFrom-Json
    $forbiddenScripts = @(@("test", "check", "smoke:editor") | Where-Object {
        $null -ne $manifest.scripts -and $null -ne $manifest.scripts.PSObject.Properties[$_]
    })
    if ($forbiddenScripts.Count -ne 0) {
        throw "npm manifest advertises excluded developer commands: $($forbiddenScripts -join ', ')"
    }

    $tarballPath = Join-Path $workDirectory ([string]$result[0].filename)
    if (-not (Test-Path -LiteralPath $tarballPath -PathType Leaf)) {
        throw "npm pack did not create the reported tarball: $tarballPath"
    }

    $consumerDirectory = Join-Path $workDirectory "consumer"
    [void](New-Item -ItemType Directory -Path $consumerDirectory)
    Push-Location $consumerDirectory
    try {
        & npm install --ignore-scripts --no-audit --no-fund $tarballPath
        if ($LASTEXITCODE -ne 0) { throw "Packed npm consumer install failed." }
        & node -e "require('@fa_yoshinobu/node-red-contrib-plc-comm-kvhostlink')"
        if ($LASTEXITCODE -ne 0) { throw "Packed npm consumer import failed." }
    }
    finally {
        Pop-Location
    }

    $installedPackage = Join-Path $consumerDirectory "node_modules/@fa_yoshinobu/node-red-contrib-plc-comm-kvhostlink"
    $flowFiles = @(Get-ChildItem -LiteralPath (Join-Path $installedPackage "examples/flows") -Filter "*.json" -File)
    if ($flowFiles.Count -eq 0) { throw "Installed npm package has no importable Node-RED example flows." }
    foreach ($flow in $flowFiles) {
        Get-Content -LiteralPath $flow.FullName -Raw | ConvertFrom-Json *> $null
    }

    Write-Host "[OK] npm package content/consumer passed: tarball=$([System.IO.Path]::GetFileName($tarballPath)) files=$($files.Count) flows=$($flowFiles.Count)"
}
finally {
    if (Test-Path -LiteralPath $workDirectory) {
        Remove-Item -LiteralPath $workDirectory -Recurse -Force
    }
}
