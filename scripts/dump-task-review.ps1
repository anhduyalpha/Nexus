[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Task,

    [string]$Base = "HEAD",

    [string]$OutputDir = ".tmp/review-dumps",

    [int64]$MaxUntrackedBytes = 2097152
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-GitLines {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [switch]$AllowNonZero
    )

    $raw = & git @Arguments 2>&1
    $exitCode = $LASTEXITCODE

    if (-not $AllowNonZero -and $exitCode -ne 0) {
        $message = @($raw | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
        throw "git $($Arguments -join ' ') failed with exit code $exitCode.`n$message"
    }

    if ($null -eq $raw) {
        return @()
    }

    return @($raw | ForEach-Object { [string]$_ })
}

function Normalize-TaskId {
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyString()]
        [string]$Value
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        throw "Task cannot be empty."
    }

    $trimmed = $Value.Trim().ToUpperInvariant()

    if ($trimmed -match '^TASK[-_ ]?(\d+)$') {
        return ('TASK-{0:D3}' -f [int]$Matches[1])
    }

    if ($trimmed -match '^(\d+)$') {
        return ('TASK-{0:D3}' -f [int]$Matches[1])
    }

    throw "Task must look like 1, 001, TASK-001, or TASK001. Received: $Value"
}

$script:Report = [System.Collections.Generic.List[string]]::new()

function Add-ReportLine {
    param(
        [AllowNull()]
        [AllowEmptyString()]
        [string]$Text = ""
    )

    if ($null -eq $Text) {
        [void]$script:Report.Add("")
    }
    else {
        [void]$script:Report.Add($Text)
    }
}

function Add-ReportSection {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Title
    )

    Add-ReportLine
    Add-ReportLine "## $Title"
    Add-ReportLine
}

function Add-ReportCodeBlock {
    param(
        [string]$Language = "text",
        [AllowNull()]
        [object]$Content
    )

    Add-ReportLine ('````' + $Language)

    $items = @()
    if ($null -ne $Content) {
        $items = @($Content)
    }

    $hasUsefulContent = $false
    foreach ($item in $items) {
        if ($null -ne $item -and -not [string]::IsNullOrEmpty([string]$item)) {
            $hasUsefulContent = $true
            break
        }
    }

    if (-not $hasUsefulContent) {
        Add-ReportLine "(none)"
    }
    else {
        foreach ($item in $items) {
            if ($null -eq $item) {
                Add-ReportLine
            }
            else {
                Add-ReportLine ([string]$item)
            }
        }
    }

    Add-ReportLine '````'
}

$taskId = Normalize-TaskId -Value $Task

try {
    $repoRootLines = @(Invoke-GitLines -Arguments @('rev-parse', '--show-toplevel'))
    $repoRoot = ($repoRootLines -join [Environment]::NewLine).Trim()

    if ([string]::IsNullOrWhiteSpace($repoRoot)) {
        throw "Git returned an empty repository root."
    }
}
catch {
    throw "Run this script from anywhere inside the Nexus Git repository. $($_.Exception.Message)"
}

Push-Location -LiteralPath $repoRoot
try {
    $statusPorcelain = @(Invoke-GitLines -Arguments @('status', '--porcelain=v1', '--untracked-files=all'))
    $statusShort = @(Invoke-GitLines -Arguments @('status', '--short', '--branch', '--untracked-files=all'))

    $branchLines = @(Invoke-GitLines -Arguments @('branch', '--show-current'))
    $branch = ($branchLines -join '').Trim()
    if ([string]::IsNullOrWhiteSpace($branch)) {
        $branch = '(detached HEAD)'
    }

    $headLines = @(Invoke-GitLines -Arguments @('rev-parse', '--short=12', 'HEAD'))
    $head = ($headLines -join '').Trim()

    $headLineLines = @(Invoke-GitLines -Arguments @('log', '-1', '--oneline', '--decorate'))
    $headLine = ($headLineLines -join '').Trim()

    $recentCommits = @(Invoke-GitLines -Arguments @('log', '-5', '--oneline', '--decorate'))

    $effectiveBase = $Base
    $comparisonMode = 'requested base'

    & git rev-parse --verify --quiet $effectiveBase 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Git base '$effectiveBase' does not exist. Pass -Base with a valid commit/ref."
    }

    if ($Base -eq 'HEAD' -and $statusPorcelain.Count -eq 0) {
        & git rev-parse --verify --quiet 'HEAD~1' 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $effectiveBase = 'HEAD~1'
            $comparisonMode = 'working tree clean; automatic last-commit fallback'
        }
    }

    $nameStatus = @(Invoke-GitLines -Arguments @('diff', '--no-ext-diff', '--no-color', '--name-status', $effectiveBase, '--', '.'))
    $diffStat = @(Invoke-GitLines -Arguments @('diff', '--no-ext-diff', '--no-color', '--stat', $effectiveBase, '--', '.'))
    $fullDiff = @(Invoke-GitLines -Arguments @('diff', '--no-ext-diff', '--no-color', '--unified=5', $effectiveBase, '--', '.'))

    $diffCheckRaw = & git diff --no-ext-diff --no-color --check $effectiveBase -- . 2>&1
    $diffCheckExit = $LASTEXITCODE
    $diffCheckLines = if ($null -eq $diffCheckRaw) {
        @()
    }
    else {
        @($diffCheckRaw | ForEach-Object { [string]$_ })
    }

    $untracked = @(Invoke-GitLines -Arguments @('ls-files', '--others', '--exclude-standard')) | Where-Object {
        -not [string]::IsNullOrWhiteSpace([string]$_)
    }

    $taskSpecRelative = "docs/tasks/$taskId.md"
    $taskSpecFull = Join-Path $repoRoot $taskSpecRelative
    $taskSpecLines = @()
    if (Test-Path -LiteralPath $taskSpecFull -PathType Leaf) {
        $taskSpecText = Get-Content -LiteralPath $taskSpecFull -Raw
        if ($null -ne $taskSpecText) {
            $taskSpecLines = @($taskSpecText -split '\r?\n')
        }
    }

    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    if ([System.IO.Path]::IsPathRooted($OutputDir)) {
        $resolvedOutputDir = $OutputDir
    }
    else {
        $resolvedOutputDir = Join-Path $repoRoot $OutputDir
    }

    New-Item -ItemType Directory -Path $resolvedOutputDir -Force | Out-Null
    $outputFile = Join-Path $resolvedOutputDir ("{0}_git-review_{1}.md" -f $taskId, $timestamp)

    Add-ReportLine "# $taskId Git Review Dump"
    Add-ReportLine
    Add-ReportLine "Generated for review. This file does not modify the repository."
    Add-ReportLine
    Add-ReportLine ('- Task: `{0}`' -f $taskId)
    Add-ReportLine ('- Repository: `{0}`' -f $repoRoot)
    Add-ReportLine ('- Branch: `{0}`' -f $branch)
    Add-ReportLine ('- HEAD: `{0}`' -f $head)
    Add-ReportLine ('- Comparison base: `{0}`' -f $effectiveBase)
    Add-ReportLine "- Comparison mode: $comparisonMode"
    Add-ReportLine "- Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')"

    Add-ReportSection -Title 'Review notes'
    if ($Base -eq 'HEAD' -and $effectiveBase -eq 'HEAD~1') {
        Add-ReportLine 'The working tree was clean, so the script automatically compared the current HEAD against HEAD~1.'
        Add-ReportLine 'If this task spans multiple commits, rerun with the commit immediately before the task:'
        Add-ReportLine
        Add-ReportCodeBlock -Language 'powershell' -Content @('.\scripts\dump-task-review.ps1 -Task 1 -Base <commit-before-task>')
    }
    else {
        Add-ReportLine ('Tracked changes are compared from `{0}` to the current working tree/index.' -f $effectiveBase)
    }
    Add-ReportLine 'Untracked non-ignored files are listed separately and included when small enough.'

    Add-ReportSection -Title 'Task specification'
    if ($taskSpecLines.Count -gt 0) {
        Add-ReportCodeBlock -Language 'markdown' -Content $taskSpecLines
    }
    else {
        Add-ReportLine ('Not found or empty at `{0}`.' -f $taskSpecRelative)
    }

    Add-ReportSection -Title 'Git status'
    Add-ReportCodeBlock -Language 'text' -Content $statusShort

    Add-ReportSection -Title 'Recent commits'
    Add-ReportCodeBlock -Language 'text' -Content $recentCommits

    Add-ReportSection -Title 'Changed files'
    Add-ReportCodeBlock -Language 'text' -Content $nameStatus

    Add-ReportSection -Title 'Diff stat'
    Add-ReportCodeBlock -Language 'text' -Content $diffStat

    Add-ReportSection -Title 'git diff --check'
    if ($diffCheckExit -eq 0) {
        Add-ReportLine 'PASS - no whitespace errors reported by `git diff --check`.'
    }
    else {
        Add-ReportLine "FAIL - `git diff --check` returned exit code $diffCheckExit."
        Add-ReportCodeBlock -Language 'text' -Content $diffCheckLines
    }

    Add-ReportSection -Title 'Tracked patch'
    Add-ReportCodeBlock -Language 'diff' -Content $fullDiff

    Add-ReportSection -Title 'Untracked files'
    if ($untracked.Count -eq 0) {
        Add-ReportLine 'None.'
    }
    else {
        foreach ($relativePathValue in $untracked) {
            $relativePath = [string]$relativePathValue
            if ([string]::IsNullOrWhiteSpace($relativePath)) {
                continue
            }

            $fullPath = Join-Path $repoRoot $relativePath
            if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
                continue
            }

            $item = Get-Item -LiteralPath $fullPath
            $hash = (Get-FileHash -LiteralPath $fullPath -Algorithm SHA256).Hash.ToLowerInvariant()

            Add-ReportLine
            Add-ReportLine ('### `{0}`' -f $relativePath)
            Add-ReportLine
            Add-ReportLine "- Size: $($item.Length) bytes"
            Add-ReportLine ('- SHA256: `{0}`' -f $hash)
            Add-ReportLine

            if ($item.Length -gt $MaxUntrackedBytes) {
                Add-ReportLine "Content omitted because the file exceeds MaxUntrackedBytes ($MaxUntrackedBytes bytes)."
                continue
            }

            $emptyFile = [System.IO.Path]::GetTempFileName()
            try {
                [System.IO.File]::WriteAllBytes($emptyFile, [byte[]]@())
                $patchRaw = & git diff --no-index --no-ext-diff --no-color --unified=5 -- $emptyFile $fullPath 2>&1
                $patchExit = $LASTEXITCODE
                $patchLines = if ($null -eq $patchRaw) {
                    @()
                }
                else {
                    @($patchRaw | ForEach-Object { [string]$_ })
                }

                if ($patchExit -gt 1) {
                    Add-ReportLine "Could not render an untracked-file patch; git exited with code $patchExit."
                    Add-ReportCodeBlock -Language 'text' -Content $patchLines
                }
                else {
                    $normalizedEmpty = $emptyFile.Replace('\', '/')
                    $cleanedPatch = @($patchLines | ForEach-Object {
                        ([string]$_).Replace($emptyFile, '/dev/null').Replace($normalizedEmpty, '/dev/null')
                    })
                    Add-ReportCodeBlock -Language 'diff' -Content $cleanedPatch
                }
            }
            finally {
                Remove-Item -LiteralPath $emptyFile -Force -ErrorAction SilentlyContinue
            }
        }
    }

    Add-ReportSection -Title 'HEAD'
    Add-ReportCodeBlock -Language 'text' -Content @($headLine)

    Set-Content -LiteralPath $outputFile -Value $script:Report -Encoding utf8

    Write-Host ''
    Write-Host 'Review dump created:' -ForegroundColor Green
    Write-Host $outputFile
    Write-Host ''
    Write-Host 'Upload this .md file for task review.'
}
finally {
    Pop-Location
}
