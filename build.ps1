$ErrorActionPreference = "Stop"

# Use build.bat which correctly inherits vcvarsall environment
# PowerShell cannot reliably capture all env vars from vcvarsall.bat
$buildBat = Join-Path $PSScriptRoot "build.bat"
if (Test-Path $buildBat) {
    cmd.exe /c $buildBat
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Build failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
} else {
    Write-Error "build.bat not found at $buildBat"
    exit 1
}
