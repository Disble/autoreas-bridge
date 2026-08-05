param(
    [ValidateSet("base", "advanced", "all")]
    [string]$Profile = "base"
)

# Runs the repo's golangci-lint profiles.
#
# Both linter binaries are BUILT ONCE into .tools/bin and reused. Previously
# this script called `go run <module>@<version>` on every invocation and
# rebuilt the 42 MB custom binary unconditionally, which meant every single
# commit paid a link step plus a module-proxy round trip — so a commit failed
# outright with no network. The binaries are rebuilt only when the pinned
# version or .custom-gcl.yml changes, which is the only time their contents
# can differ.
#
# Analysis concurrency is pinned so one lint pass cannot claim every logical
# CPU and starve the desktop; see the concurrency budget note in lefthook.yml.

$ErrorActionPreference = "Stop"
$golangciVersion = "v2.12.2"
$golangciModule = "github.com/golangci/golangci-lint/v2/cmd/golangci-lint@$golangciVersion"
$root = Split-Path -Parent $PSScriptRoot
$binDir = Join-Path $root ".tools/bin"
$exe = if ($env:OS -eq "Windows_NT") { ".exe" } else { "" }

$concurrency = if ($env:GOLANGCI_CONCURRENCY) { $env:GOLANGCI_CONCURRENCY } else { "4" }

# Stamp files record what a cached binary was built from. A binary whose stamp
# does not match the current inputs is rebuilt; anything else is reused.
function Test-Stamp {
    param([string]$StampPath, [string]$Binary, [string]$Expected)
    if (-not (Test-Path $Binary)) { return $false }
    if (-not (Test-Path $StampPath)) { return $false }
    return (Get-Content $StampPath -Raw).Trim() -eq $Expected.Trim()
}

Push-Location $root
try {
    New-Item -ItemType Directory -Force -Path $binDir | Out-Null

    $goFiles = @(git ls-files --cached --others --exclude-standard -- "*.go")
    if ($LASTEXITCODE -ne 0) {
        throw "git ls-files for owned Go source failed"
    }
    $packages = @($goFiles | ForEach-Object {
        $directory = Split-Path -Parent $_
        if ([string]::IsNullOrEmpty($directory)) { "." } else { "./" + $directory.Replace("\", "/") }
    } | Sort-Object -Unique)

    if ($Profile -eq "base" -or $Profile -eq "all") {
        $baseBinary = Join-Path $binDir "golangci-lint$exe"
        $baseStamp = Join-Path $binDir "golangci-lint.stamp"

        if (-not (Test-Stamp -StampPath $baseStamp -Binary $baseBinary -Expected $golangciVersion)) {
            Write-Host "lint: building golangci-lint $golangciVersion (cached for later runs)"
            $env:GOBIN = $binDir
            & go install $golangciModule
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
            Set-Content -Path $baseStamp -Value $golangciVersion -NoNewline
        }

        & $baseBinary run --config .golangci.yml --show-stats --concurrency $concurrency @packages
        if ($LASTEXITCODE -ne 0) {
            exit $LASTEXITCODE
        }
    }

    if ($Profile -eq "advanced" -or $Profile -eq "all") {
        $customBinary = Join-Path $binDir "dlinter-gcl$exe"
        $customStamp = Join-Path $binDir "dlinter-gcl.stamp"
        $customSpec = Join-Path $root ".custom-gcl.yml"
        $expected = "$golangciVersion|" + (Get-FileHash $customSpec -Algorithm SHA256).Hash

        if (-not (Test-Stamp -StampPath $customStamp -Binary $customBinary -Expected $expected)) {
            Write-Host "lint: building custom linter from .custom-gcl.yml (cached for later runs)"
            & go run $golangciModule custom
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
            Set-Content -Path $customStamp -Value $expected -NoNewline
        }

        & $customBinary run --config .golangci.dlinter.yml --show-stats --concurrency $concurrency @packages
        exit $LASTEXITCODE
    }
}
finally {
    Pop-Location
}
