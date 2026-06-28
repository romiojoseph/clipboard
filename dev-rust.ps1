#!/usr/bin/env pwsh

Write-Host "Clipboard Rust Development Setup" -ForegroundColor Cyan

# Kill existing processes on ports 1950 and 1947
Write-Host "Cleaning up existing processes..." -ForegroundColor Yellow
$procs = (Get-NetTCPConnection -LocalPort 1950,1947 -State Listen -ErrorAction SilentlyContinue).OwningProcess | Sort-Object -Unique
if ($procs) {
    Stop-Process -Id $procs -Force -ErrorAction SilentlyContinue
    Write-Host "Stopped existing dev processes" -ForegroundColor Green
}

# Ensure web/dist exists for RustEmbed
Write-Host "Checking web/dist..." -ForegroundColor Yellow
if (-not (Test-Path "web/dist")) {
    Write-Host "Building frontend first (needed for RustEmbed)..." -ForegroundColor Yellow
    Push-Location "web"
    npm run build
    Pop-Location
}

# Start Rust backend in new terminal (requires cargo-watch: cargo install cargo-watch)
Write-Host "Starting Rust backend..." -ForegroundColor Yellow
$backendJob = Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; cargo watch -x run -i web/" -PassThru
Write-Host "Backend started (PID: $($backendJob.Id))" -ForegroundColor Green

# Wait a moment for backend to start
Start-Sleep -Seconds 2

# Start frontend in new terminal
Write-Host "Starting React frontend..." -ForegroundColor Yellow
$frontendJob = Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot/web'; npm run dev" -PassThru
Write-Host "Frontend started (PID: $($frontendJob.Id))" -ForegroundColor Green

Write-Host ""
Write-Host "Development servers running:" -ForegroundColor Cyan
Write-Host "Backend: http://localhost:1947" -ForegroundColor Gray
Write-Host "Frontend: http://localhost:1950" -ForegroundColor Gray
Write-Host ""
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow

# Wait for both processes
$backendJob, $frontendJob | Wait-Process
