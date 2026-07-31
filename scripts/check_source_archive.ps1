[CmdletBinding()]
param(
    [string]$Treeish = "HEAD",
    [switch]$UseWorktreeAttributes
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$workspaceRoot = [System.IO.Directory]::GetParent($repositoryRoot).FullName
$runId = [guid]::NewGuid().ToString("N")
$archivePath = Join-Path $workspaceRoot ("plc-source-archive-$runId.zip")
$extractPath = Join-Path $workspaceRoot ("plc-source-archive-$runId")
$stagePath = Join-Path $workspaceRoot ("plc-source-archive-$runId-stage")

$forbiddenFileNames = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
@(
    ".gitattributes",
    ".gitignore"
) | ForEach-Object { [void]$forbiddenFileNames.Add($_) }

$forbiddenPrefixes = @(
    ".codex",
    ".pio",
    ".tools",
    "build",
    "build_win",
    "local_folder",
    "release-artifacts"
)

try {
    & git -C $repositoryRoot rev-parse --verify "$Treeish`^{tree}" *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Cannot resolve treeish '$Treeish'."
    }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $worktreeFiles = @()
    if ($UseWorktreeAttributes) {
        $worktreeFiles = @(& git -C $repositoryRoot ls-files --cached --others --exclude-standard |
            ForEach-Object { $_.Replace("\", "/") } |
            Where-Object {
                $sourcePath = Join-Path $repositoryRoot $_
                (Test-Path -LiteralPath $sourcePath -PathType Leaf) -and
                $_ -notin @(".gitattributes", ".gitignore") -and
                $_ -notmatch '^(build|build_win|release-artifacts)/'
            } |
            Sort-Object -Unique)
        if ($LASTEXITCODE -ne 0) { throw "Cannot enumerate current worktree files." }
        [void](New-Item -ItemType Directory -Path $stagePath)
        foreach ($path in $worktreeFiles) {
            $destination = Join-Path $stagePath $path
            [void](New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force)
            Copy-Item -LiteralPath (Join-Path $repositoryRoot $path) -Destination $destination -Force
        }
        [System.IO.Compression.ZipFile]::CreateFromDirectory($stagePath, $archivePath)
    }
    else {
        & git -C $repositoryRoot archive --format=zip --output=$archivePath $Treeish
        if ($LASTEXITCODE -ne 0) { throw "git archive failed for '$Treeish'." }
    }
    if (-not (Test-Path -LiteralPath $archivePath)) {
        throw "Source archive was not created for '$Treeish'."
    }

    $archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
    try {
        $archiveFiles = @(
            $archive.Entries |
                ForEach-Object { $_.FullName.Replace("\", "/") } |
                Where-Object { -not $_.EndsWith("/") } |
                Sort-Object -Unique
        )
    }
    finally {
        $archive.Dispose()
    }
    $trackedFiles = if ($UseWorktreeAttributes) { $worktreeFiles } else {
        @(& git -C $repositoryRoot ls-tree -r --name-only $Treeish |
            ForEach-Object { $_.Replace("\", "/") } |
            Sort-Object -Unique)
    }
    if ($LASTEXITCODE -ne 0) { throw "Cannot enumerate source files for '$Treeish'." }

    $requiredTracked = @($trackedFiles | Where-Object {
        $_ -match '^(test|tests|\.github|docsrc/maintainer|internal_docs|scripts|tools)/' -or
        $_ -in @("AGENTS.md", "TODO.md", "release_check.bat", "run_ci.bat")
    })
    $missingTracked = @($requiredTracked | Where-Object { $_ -notin $archiveFiles })
    if ($missingTracked.Count -ne 0) {
        throw "Source archive omits tracked validation or maintainer material: $($missingTracked -join ', ')"
    }

    foreach ($guide in @("GETTING_STARTED.md", "USAGE_GUIDE.md", "PROFILES.md", "GOTCHAS.md", "API_REFERENCE.md")) {
        $guideCandidates = @("docsrc/user/$guide", "docs/$guide")
        if (@($guideCandidates | Where-Object { $_ -in $archiveFiles }).Count -eq 0) {
            throw "Source archive is missing standard user guide '$guide'."
        }
    }


    $forbidden = @(
        foreach ($path in $archiveFiles) {
            $fileName = [System.IO.Path]::GetFileName($path)
            $lowerPath = $path.ToLowerInvariant()
            $hasForbiddenPrefix = $false
            foreach ($prefix in $forbiddenPrefixes) {
                $lowerPrefix = $prefix.ToLowerInvariant()
                if ($lowerPath -eq $lowerPrefix -or $lowerPath.StartsWith("$lowerPrefix/")) {
                    $hasForbiddenPrefix = $true
                    break
                }
            }
            if ($forbiddenFileNames.Contains($fileName) -or $hasForbiddenPrefix) {
                $path
            }
        }
    )
    if ($forbidden.Count -ne 0) {
        throw "Source archive contains forbidden generated or release-output files: $($forbidden -join ', ')"
    }

    $requiredRootFiles = @("CHANGELOG.md", "LICENSE", "README.md")
    $missingRootFiles = @($requiredRootFiles | Where-Object { $_ -notin $archiveFiles })
    if ($missingRootFiles.Count -ne 0) {
        throw "Source archive is missing required root files: $($missingRootFiles -join ', ')"
    }

    $expectedSamples = @($trackedFiles |
        Where-Object { $_.StartsWith("examples/") -or $_.StartsWith("samples/") } |
        Sort-Object -Unique)
    if ($expectedSamples.Count -eq 0) {
        throw "No tracked files were found under examples/ or samples/."
    }

    $actualSamples = @(
        $archiveFiles |
            Where-Object { $_.StartsWith("examples/") -or $_.StartsWith("samples/") } |
            Sort-Object -Unique
    )
    $sampleDifference = @(Compare-Object -ReferenceObject $expectedSamples -DifferenceObject $actualSamples -CaseSensitive)
    if ($sampleDifference.Count -ne 0) {
        $differenceText = ($sampleDifference | ForEach-Object { "$($_.SideIndicator) $($_.InputObject)" }) -join "; "
        throw "Source archive sample set differs from the tracked sample set: $differenceText"
    }

    $expectedTests = @($trackedFiles |
        Where-Object { $_.StartsWith("test/") -or $_.StartsWith("tests/") } |
        Sort-Object -Unique)
    if ($expectedTests.Count -eq 0) {
        throw "Cannot enumerate a nonempty test set for '$Treeish'."
    }
    $actualTests = @(
        $archiveFiles |
            Where-Object { $_.StartsWith("test/") -or $_.StartsWith("tests/") } |
            Sort-Object -Unique
    )
    $testDifference = @(Compare-Object -ReferenceObject $expectedTests -DifferenceObject $actualTests -CaseSensitive)
    if ($testDifference.Count -ne 0) {
        $differenceText = ($testDifference | ForEach-Object { "$($_.SideIndicator) $($_.InputObject)" }) -join "; "
        throw "Source archive test set differs from the tracked test set: $differenceText"
    }

    Expand-Archive -LiteralPath $archivePath -DestinationPath $extractPath
    Push-Location $extractPath
    try {
        & npm ci --ignore-scripts
        if ($LASTEXITCODE -ne 0) { throw "npm ci failed from the extracted source archive." }
        $javaScriptFiles = @(Get-ChildItem -Recurse -File -Filter *.js | Where-Object { $_.FullName -notmatch '[\\/]node_modules[\\/]' })
        foreach ($file in $javaScriptFiles) {
            & node --check $file.FullName
            if ($LASTEXITCODE -ne 0) { throw "JavaScript syntax check failed: $($file.FullName)" }
        }
        $sampleJsonFiles = @(Get-ChildItem -Path examples -Recurse -File -Filter *.json)
        if ($sampleJsonFiles.Count -eq 0) { throw "No sample flow JSON files were found." }
        foreach ($file in $sampleJsonFiles) {
            Get-Content -LiteralPath $file.FullName -Raw | ConvertFrom-Json *> $null
        }
        & node test/run-tests.js
        if ($LASTEXITCODE -ne 0) { throw "node test/run-tests.js failed from the extracted source archive." }
        & npm pack --dry-run --json | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "npm pack --dry-run failed from the extracted source archive." }
    }
    finally {
        Pop-Location
    }

    Write-Host "[OK] Source archive contract passed: treeish=$Treeish files=$($archiveFiles.Count) samples=$($actualSamples.Count) tests=$($actualTests.Count)"
}
finally {
    Remove-Item -LiteralPath $archivePath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $extractPath -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $stagePath -Recurse -Force -ErrorAction SilentlyContinue
}
