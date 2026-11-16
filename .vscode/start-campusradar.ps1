$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\campusradar")).Path
$frontendRoot = Join-Path $projectRoot "frontend"
$composeArgs = @("--env-file", "frontend/.env.local")

Set-Location $projectRoot

Write-Host "Starting CampusRadar backend services..." -ForegroundColor Cyan
$apiImage = docker compose @composeArgs images -q api
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

if ([string]::IsNullOrWhiteSpace($apiImage)) {
  Write-Host "First run: building the backend image..." -ForegroundColor Yellow
  docker compose @composeArgs build api
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} else {
  Write-Host "Backend image found: skipping build." -ForegroundColor Green
}

# The old Docker web service owns port 3000. Stop it so the host Next dev
# server can use the same URL and reflect source changes immediately.
docker compose @composeArgs stop web | Out-Null
docker compose @composeArgs up -d db redis api
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Set-Location $frontendRoot

if (-not (Test-Path "node_modules")) {
  Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
  npm.cmd install
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

# Keep the one-time build check in .next, which is already ignored by git.
if (-not (Test-Path ".next\BUILD_ID")) {
  Write-Host "First frontend run: creating the initial production build..." -ForegroundColor Yellow
  npm.cmd run build
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} else {
  Write-Host "Frontend build found: skipping build; hot reload is enabled." -ForegroundColor Green
}

$url = "http://localhost:3000"
$simpleBrowserArgs = [Uri]::EscapeDataString((ConvertTo-Json @($url) -Compress))

# Open the integrated browser as soon as Next is listening, without taking over
# this task's terminal, which remains attached to the hot-reload dev server.
$browserJob = Start-Job -ArgumentList $url, $simpleBrowserArgs -ScriptBlock {
  param($targetUrl, $commandArgs)

  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    try {
      $response = Invoke-WebRequest -Uri $targetUrl -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        if (Get-Command code.cmd -ErrorAction SilentlyContinue) {
          code.cmd --open-url "vscode://command/simpleBrowser.show?$commandArgs" | Out-Null
        }
        Write-Output "Opened $targetUrl in VS Code Simple Browser."
        return
      }
    } catch {
      Start-Sleep -Seconds 1
    }
  }

  Write-Output "Could not auto-open $targetUrl; the dev server may still be starting."
}

try {
  Write-Host "Starting frontend dev server at $url" -ForegroundColor Green
  npm.cmd run dev
} finally {
  if ($browserJob) {
    Receive-Job $browserJob -ErrorAction SilentlyContinue | ForEach-Object {
      Write-Host $_ -ForegroundColor Green
    }
    Remove-Job $browserJob -Force -ErrorAction SilentlyContinue
  }
}
