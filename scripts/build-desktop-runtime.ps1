$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $repoRoot "desktop-runtime"
$stagingPath = Join-Path $runtimeRoot "app-staging"
$archivePath = Join-Path $runtimeRoot "app-runtime.7z"
$sevenZip = Join-Path $runtimeRoot "tools\7za.exe"

if (-not (Test-Path -LiteralPath $sevenZip)) {
  throw "Missing 7-Zip runtime: $sevenZip"
}

if (Test-Path -LiteralPath $stagingPath) {
  Remove-Item -LiteralPath $stagingPath -Recurse -Force
}
if (Test-Path -LiteralPath $archivePath) {
  Remove-Item -LiteralPath $archivePath -Force
}

New-Item -ItemType Directory -Path $stagingPath -Force | Out-Null
Copy-Item -Path (Join-Path $repoRoot ".next\standalone\*") -Destination $stagingPath -Recurse -Force

$staticDestination = Join-Path $stagingPath ".next\static"
New-Item -ItemType Directory -Path $staticDestination -Force | Out-Null
Copy-Item -Path (Join-Path $repoRoot ".next\static\*") -Destination $staticDestination -Recurse -Force

$publicDestination = Join-Path $stagingPath "public"
New-Item -ItemType Directory -Path $publicDestination -Force | Out-Null
Get-ChildItem -LiteralPath (Join-Path $repoRoot "public") -Force | Where-Object { $_.Name -ne "uploads" } | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination $publicDestination -Recurse -Force
}

Push-Location $stagingPath
try {
  & $sevenZip a -t7z $archivePath ".\*" -mx=5 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "7-Zip failed with exit code $LASTEXITCODE" }
}
finally {
  Pop-Location
}

Remove-Item -LiteralPath $stagingPath -Recurse -Force

Write-Host "Created desktop runtime archive at $archivePath"
