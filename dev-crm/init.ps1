# Mathionix CRM Infrastructure Initialization for Windows

Write-Host "Initializing CRM Development Environment..." -ForegroundColor Blue

# Clean up any existing instances
docker-compose down -v

# Start MongoDB first
docker-compose up -d mongodb

# Wait for MongoDB to be ready
Write-Host "Waiting for MongoDB to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Build and start services
docker-compose up --build -d api web

Write-Host "CRM Services started successfully!" -ForegroundColor Green
Write-Host "Web: http://localhost:3000"
Write-Host "API: http://localhost:3001"
Write-Host "MongoDB: localhost:27017"
