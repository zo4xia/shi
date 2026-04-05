param(
  [string]$SourceRoot = 'C:\Users\Administrator\Desktop\baiban',
  [string]$MirrorRoot = 'D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\baiban-sandbox\local-homes\baiban-runtime'
)

$ErrorActionPreference = 'Stop'

function Sync-Tree {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination
  )

  if (-not (Test-Path $Source)) {
    throw "Source path not found: $Source"
  }

  New-Item -ItemType Directory -Force -Path $Destination | Out-Null

  $robocopyArgs = @(
    $Source,
    $Destination,
    '/MIR',
    '/R:1',
    '/W:1',
    '/NFL',
    '/NDL',
    '/NJH',
    '/NJS',
    '/NP',
    '/XD', 'node_modules', '.next', '.git', '.playwright-cli', 'download', 'upload', 'db'
    '/XF', '*.log', '*.tmp', '*.tsbuildinfo'
  )

  & robocopy @robocopyArgs | Out-Null
  $exitCode = $LASTEXITCODE
  if ($exitCode -ge 8) {
    throw "robocopy failed for $Source -> $Destination with exit code $exitCode"
  }
}

if (-not (Test-Path $SourceRoot)) {
  throw "baiban runtime source not found: $SourceRoot"
}

New-Item -ItemType Directory -Force -Path $MirrorRoot | Out-Null

$fileCopies = @(
  'package.json',
  'next.config.ts',
  'tsconfig.json',
  'next-env.d.ts',
  'tailwind.config.ts',
  'postcss.config.mjs',
  'eslint.config.mjs',
  'components.json',
  'README.md',
  'worklog.md'
)

foreach ($relativeFile in $fileCopies) {
  $sourceFile = Join-Path $SourceRoot $relativeFile
  if (Test-Path $sourceFile) {
    $destinationFile = Join-Path $MirrorRoot $relativeFile
    $destinationDir = Split-Path -Parent $destinationFile
    New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null
    Copy-Item -LiteralPath $sourceFile -Destination $destinationFile -Force
  }
}

$treeCopies = @(
  'src',
  'public',
  'docs',
  '.zscripts',
  'mini-services\handwriting-service',
  'prisma'
)

foreach ($relativeDir in $treeCopies) {
  $sourceDir = Join-Path $SourceRoot $relativeDir
  if (Test-Path $sourceDir) {
    $destinationDir = Join-Path $MirrorRoot $relativeDir
    Sync-Tree -Source $sourceDir -Destination $destinationDir
  }
}

$manifest = [PSCustomObject]@{
  sourceRoot = $SourceRoot
  mirrorRoot = $MirrorRoot
  syncedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  copiedFiles = $fileCopies
  copiedDirectories = $treeCopies
  note = 'Mirror excludes node_modules, .next, logs, and transient runtime folders.'
}

$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $MirrorRoot 'SYNC_MANIFEST.json') -Encoding UTF8

Write-Output "Mirrored baiban runtime into $MirrorRoot"
