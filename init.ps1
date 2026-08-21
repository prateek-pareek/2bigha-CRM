# 2Bigha CRM - local dev bootstrap (Windows / PowerShell)
# Mirrors init.sh. Safe to re-run: it never touches Docker volumes.

$ErrorActionPreference = 'Stop'

Write-Host "Setting up 2Bigha CRM..." -ForegroundColor Blue

npm run setup

if (-not (Test-Path api/.env)) {
    Copy-Item api/.env.example api/.env
    Write-Host "Created api/.env from example" -ForegroundColor Green
}

if (-not (Test-Path portal/.env.local)) {
    Copy-Item portal/.env.local.example portal/.env.local
    Write-Host "Created portal/.env.local from example" -ForegroundColor Green
}

Write-Host ""
Write-Host "Done. Next steps:" -ForegroundColor Green
Write-Host "  npm run db:up    # start MongoDB + Redis (published on 127.0.0.1)"
Write-Host "  npm run dev      # start API + portal"
Write-Host ""
Write-Host "  Portal: http://localhost:3000  ->  /crm"
Write-Host "  API:    http://localhost:4000/api"
