# AI Party School - Windows Server deployment
# Run from the repository root:
# powershell -ExecutionPolicy Bypass -File scripts/deploy-windows.ps1

$ErrorActionPreference = "Stop"
$root = Resolve-Path "$PSScriptRoot\.."
Set-Location $root

function Test-Command($name) {
    try {
        Get-Command $name -ErrorAction Stop | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Invoke-Native($label, [scriptblock]$command) {
    Write-Host "  -> $label" -ForegroundColor Gray
    & $command
    if ($LASTEXITCODE -ne 0) {
        throw "$label failed with exit code $LASTEXITCODE"
    }
}

Write-Host "AI Party School deployment" -ForegroundColor Cyan

Write-Host "`n[1/7] Checking runtime..." -ForegroundColor Yellow
if (-not (Test-Command node)) {
    throw "Node.js 20+ is required"
}
if (-not (Test-Command pnpm)) {
    npm install -g pnpm@11.15.0
    if ($LASTEXITCODE -ne 0) { throw "pnpm installation failed" }
}
if (-not (Test-Command pm2)) {
    npm install -g pm2@latest
    if ($LASTEXITCODE -ne 0) { throw "PM2 installation failed" }
}
Write-Host "  Node: $(node -v); pnpm: $(pnpm -v); PM2: $(pm2 -v)" -ForegroundColor Green

Write-Host "`n[2/7] Checking production configuration..." -ForegroundColor Yellow
$envFile = "$root\packages\server\.env"
$envTemplate = "$root\.env.production"
if (-not (Test-Path -LiteralPath $envFile)) {
    if (-not (Test-Path -LiteralPath $envTemplate)) {
        throw ".env.production is missing"
    }
    Copy-Item -LiteralPath $envTemplate -Destination $envFile -ErrorAction Stop
    Write-Host "  Created packages/server/.env from the template." -ForegroundColor Yellow
    Write-Host "  Set database, JWT, AI, and SEED_* values, then run this script again." -ForegroundColor Red
    exit 1
}

$envText = Get-Content -LiteralPath $envFile -Raw
if ($envText -match 'YOUR_PASSWORD|please-change|CHANGE_ME|sk-your') {
    throw "packages/server/.env still contains placeholder secrets"
}
if ($envText -notmatch '(?m)^ENCRYPT_KEY=.{32,}$') {
    throw "packages/server/.env must contain a persistent ENCRYPT_KEY of at least 32 characters"
}

Write-Host "`n[3/7] Installing dependencies..." -ForegroundColor Yellow
Invoke-Native "pnpm install" { pnpm install --prod=false --frozen-lockfile }

Write-Host "`n[4/7] Building with the MySQL Prisma schema..." -ForegroundColor Yellow
$mysqlSchema = "$root\packages\server\prisma\schema.mysql.prisma"
if (-not (Test-Path -LiteralPath $mysqlSchema)) {
    throw "schema.mysql.prisma is missing"
}
Invoke-Native "shared build" { pnpm --filter shared build }
Invoke-Native "Prisma client generation" { pnpm --filter server prisma:generate:mysql }
Invoke-Native "server build" { pnpm --filter server build }
Invoke-Native "admin build" { pnpm --filter admin build }
Invoke-Native "mobile build" { pnpm --filter mobile build }

Write-Host "`n[5/7] Applying database migrations and seed data..." -ForegroundColor Yellow
Push-Location "$root\packages\server"
try {
    Invoke-Native "Prisma migrate deploy" { npx prisma migrate deploy --schema prisma/schema.mysql.prisma }
    $env:NODE_ENV = "production"
    Invoke-Native "Prisma seed" { npx prisma db seed --schema prisma/schema.mysql.prisma }
} finally {
    Pop-Location
}

Write-Host "`n[6/7] Creating runtime directories..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "$root\packages\server\uploads" | Out-Null
New-Item -ItemType Directory -Force -Path "$root\packages\server\logs" | Out-Null

Write-Host "`n[7/7] Starting PM2..." -ForegroundColor Yellow
pm2 delete party-school-api 2>$null
Invoke-Native "PM2 start" { pm2 start ecosystem.config.cjs }
Invoke-Native "PM2 save" { pm2 save }

Write-Host "`nDeployment completed." -ForegroundColor Green
Write-Host "  Mobile: http://localhost:3000/"
Write-Host "  Admin:  http://localhost:3000/admin/"
Write-Host "  Health: http://localhost:3000/api/health"
