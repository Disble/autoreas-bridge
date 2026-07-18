param(
    [ValidateSet("base", "advanced", "all")]
    [string]$Profile = "base"
)

$ErrorActionPreference = "Stop"
$golangciVersion = "v2.12.2"
$golangciModule = "github.com/golangci/golangci-lint/v2/cmd/golangci-lint@$golangciVersion"
$root = Split-Path -Parent $PSScriptRoot

Push-Location $root
try {
    $goFiles = @(git ls-files --cached --others --exclude-standard -- "*.go")
    if ($LASTEXITCODE -ne 0) {
        throw "git ls-files for owned Go source failed"
    }
    $packages = @($goFiles | ForEach-Object {
        $directory = Split-Path -Parent $_
        if ([string]::IsNullOrEmpty($directory)) { "." } else { "./" + $directory.Replace("\", "/") }
    } | Sort-Object -Unique)

    if ($Profile -eq "base" -or $Profile -eq "all") {
        & go run $golangciModule run --config .golangci.yml --show-stats @packages
        if ($LASTEXITCODE -ne 0) {
            exit $LASTEXITCODE
        }
    }

    if ($Profile -eq "advanced" -or $Profile -eq "all") {
        & go run $golangciModule custom
        if ($LASTEXITCODE -ne 0) {
            exit $LASTEXITCODE
        }

        $customBinary = Join-Path $root ".tools/bin/dlinter-gcl"
        if ($env:OS -eq "Windows_NT") {
            $customBinary += ".exe"
        }
        & $customBinary run --config .golangci.dlinter.yml --show-stats @packages
        exit $LASTEXITCODE
    }
}
finally {
    Pop-Location
}
