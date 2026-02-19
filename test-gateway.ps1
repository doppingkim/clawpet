try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:18789/' -UseBasicParsing -TimeoutSec 3
    Write-Host "SUCCESS: Status $($r.StatusCode)"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
