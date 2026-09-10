$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$zipPath = Join-Path $repoRoot "worklog-ultra-deploy.zip"
$stagingRoot = Join-Path $repoRoot "build-package-temp"
$stagingPath = Join-Path $stagingRoot "portable-source-upload"

$rootFiles = @(
  "DEPLOY-CYBERPANEL.md",
  ".env.example",
  "README.md",
  "eslint.config.mjs",
  "next-env.d.ts",
  "next.config.js",
  "next.config.ts",
  "package-lock.json",
  "package.json",
  "postcss.config.mjs",
  "prisma.config.ts",
  "tsconfig.json"
)

$rootDirectories = @(
  "prisma",
  "public",
  "src"
)

function Add-FileToZip {
  param(
    [Parameter(Mandatory = $true)]
    [System.IO.Compression.ZipArchive]$Archive,
    [Parameter(Mandatory = $true)]
    [string]$SourcePath,
    [Parameter(Mandatory = $true)]
    [string]$EntryPath
  )

  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
    $Archive,
    $SourcePath,
    $EntryPath.Replace("\", "/"),
    [System.IO.Compression.CompressionLevel]::Optimal
  ) | Out-Null
}

function Get-RepoRelativePath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RootPath,
    [Parameter(Mandatory = $true)]
    [string]$TargetPath
  )

  $normalizedRoot = [System.IO.Path]::GetFullPath($RootPath).TrimEnd("\")
  $normalizedTarget = [System.IO.Path]::GetFullPath($TargetPath)

  if (-not $normalizedTarget.StartsWith($normalizedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Path is outside repo root: $TargetPath"
  }

  return $normalizedTarget.Substring($normalizedRoot.Length).TrimStart("\")
}

if (Test-Path $stagingPath) {
  Remove-Item -LiteralPath $stagingPath -Recurse -Force
}

New-Item -ItemType Directory -Path $stagingPath | Out-Null

foreach ($file in $rootFiles) {
  $sourceFile = Join-Path $repoRoot $file
  if (-not (Test-Path $sourceFile)) {
    throw "Missing required file: $file"
  }
}

foreach ($directory in $rootDirectories) {
  $sourceDirectory = Join-Path $repoRoot $directory
  if (-not (Test-Path $sourceDirectory)) {
    throw "Missing required directory: $directory"
  }
}

if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$archive = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)

try {
  foreach ($file in $rootFiles) {
    $sourceFile = Join-Path $repoRoot $file
    Add-FileToZip -Archive $archive -SourcePath $sourceFile -EntryPath $file
  }

  foreach ($directory in $rootDirectories) {
    $sourceDirectory = Join-Path $repoRoot $directory
    $files = Get-ChildItem -LiteralPath $sourceDirectory -Recurse -File

    foreach ($file in $files) {
      $relativePath = Get-RepoRelativePath -RootPath $repoRoot -TargetPath $file.FullName

      if (
        $relativePath.StartsWith("public\uploads\", [System.StringComparison]::OrdinalIgnoreCase) -and
        -not $relativePath.EndsWith(".gitkeep", [System.StringComparison]::OrdinalIgnoreCase)
      ) {
        continue
      }

      Add-FileToZip -Archive $archive -SourcePath $file.FullName -EntryPath $relativePath
    }
  }
}
finally {
  $archive.Dispose()
}

Write-Host "Created portable deploy archive at $zipPath"
