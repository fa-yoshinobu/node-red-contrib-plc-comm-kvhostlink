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
        $smokePath = Join-Path $consumerDirectory "package-consumer-smoke.js"
        $smoke = @'
const assert = require("node:assert/strict");
const hostlink = require("@fa_yoshinobu/node-red-contrib-plc-comm-kvhostlink");
assert.equal(typeof hostlink.HostLinkClient.prototype.readComments, "function");
assert.equal(typeof hostlink.HostLinkClient.prototype.readCommentBytes, "function");
assert.equal(typeof hostlink.readComments, "function");
assert.equal(typeof hostlink.readCommentBytes, "function");
assert.equal(hostlink.decodeCommentResponse(Buffer.from([0xc2, 0xa2]), "utf8"), "¢");
assert.equal(hostlink.decodeCommentResponse(Buffer.from([0xc2, 0xa2]), "cp932"), "ﾂ｢");
assert.equal(hostlink.decodeCommentResponse(Buffer.from([0xef, 0xbb, 0xbf, 0x41]), "utf8"), "\uFEFFA");
assert.throws(() => hostlink.decodeCommentResponse(Buffer.from([0xef, 0xbb, 0xbf, 0x41]), "cp932"), hostlink.HostLinkProtocolError);
assert.deepEqual(Array.from(hostlink.decodeCommentResponse(Buffer.from([0x1a, 0x1c, 0x7f]), "cp932"), c => c.codePointAt(0)), [0x1a, 0x1c, 0x7f]);
assert.equal(hostlink.decodeCommentResponse(Buffer.from([0x87, 0x90]), "cp932"), "≒");
assert.equal(hostlink.decodeCommentResponse(Buffer.from([0xed, 0x40]), "cp932"), "纊");
assert.equal(hostlink.decodeCommentResponse(Buffer.from([0xfa, 0x4a]), "cp932"), "Ⅰ");
for (const invalidByte of [0x80, 0xa0, 0xfd, 0xfe, 0xff]) assert.throws(() => hostlink.decodeCommentResponse(Buffer.from([invalidByte]), "cp932"), hostlink.HostLinkProtocolError);
for (const invalidPair of [[0x82, 0x20], [0x81, 0xad]]) assert.throws(() => hostlink.decodeCommentResponse(Buffer.from(invalidPair), "cp932"), hostlink.HostLinkProtocolError);
assert.deepEqual(hostlink.decodeCommentBytes(Buffer.from([0x82, 0xa0, 0x20, 0x0d])), Buffer.from([0x82, 0xa0, 0x20]));
assert.throws(() => hostlink.decodeCommentResponse(Buffer.from([0x82]), "cp932"), hostlink.HostLinkProtocolError);
console.log("[OK] packed RDC text/raw contract reached");
'@
        [System.IO.File]::WriteAllText($smokePath, $smoke, [System.Text.UTF8Encoding]::new($false))
        & node $smokePath
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
