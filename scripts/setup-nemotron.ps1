$ErrorActionPreference = 'Stop'

Write-Host 'SKYBREAK Nemotron setup' -ForegroundColor Cyan

if (-not (Get-Command code -ErrorAction SilentlyContinue)) {
  throw 'VS Code CLI (code) was not found. In VS Code run: Shell Command: Install code command in PATH, then rerun this script.'
}

Write-Host 'Installing/updating Continue extension...'
code --install-extension Continue.continue --force

$continueDir = Join-Path $HOME '.continue'
$configPath = Join-Path $continueDir 'config.yaml'
$repoRoot = Split-Path -Parent $PSScriptRoot
$templatePath = Join-Path $repoRoot 'continue-nemotron.yaml'

New-Item -ItemType Directory -Force -Path $continueDir | Out-Null

if (Test-Path $configPath) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $backup = "$configPath.$stamp.bak"
  Copy-Item $configPath $backup
  Write-Host "Backed up existing Continue config to $backup"
}

Copy-Item $templatePath $configPath -Force
Write-Host "Installed Continue config at $configPath"

Write-Host ''
Write-Host 'Next required step:' -ForegroundColor Yellow
Write-Host 'Open Continue in VS Code and add a secret named NVIDIA_API_KEY using your NVIDIA API key.'
Write-Host 'Do not paste the key into this repository or commit it.'
Write-Host ''
Write-Host 'Then reload VS Code and select: NVIDIA Nemotron 3.5 Lightning'
Write-Host 'Setup files are now in place.' -ForegroundColor Green
