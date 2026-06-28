# Build the React frontend first
Push-Location .\web
npm run build
Pop-Location

# Build the Rust project in release mode
$targetDir = Join-Path $env:TEMP "clipboard_rust_target"
cargo build --release --target-dir $targetDir

# Copy output to ./bin/
if (-not (Test-Path .\bin)) { New-Item -ItemType Directory -Path .\bin }
Get-Process -Name clipboard -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1
Copy-Item -Force (Join-Path $targetDir "release\clipboard.exe") .\bin\

# Compress with UPX if installed
if (Get-Command upx -ErrorAction SilentlyContinue) {
    Write-Host "Compressing with UPX..." -ForegroundColor Yellow
    upx --best ".\bin\clipboard.exe"
} else {
    Write-Host "UPX not found on PATH. Skipping compression." -ForegroundColor Gray
}

Write-Host "Build complete. Executable at .\bin\clipboard.exe"