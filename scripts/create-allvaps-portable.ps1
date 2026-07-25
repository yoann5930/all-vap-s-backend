#Requires -Version 5.1
param(
    [string]$ProjectRoot = (Split-Path $PSScriptRoot -Parent),
    [string]$OutputName = "ALLVAPS_PORTABLE",
    [switch]$SkipVerification,
    [switch]$SkipZip
)

$ErrorActionPreference = "Stop"
$PortableRoot = Join-Path $ProjectRoot $OutputName

Write-Host "========================================"
Write-Host "  ALL VAPS - Generation Portable"
Write-Host "========================================"
Write-Host ""

if (Test-Path $PortableRoot) {
    Write-Host "[1/8] Suppression ancien dossier..."
    Remove-Item $PortableRoot -Recurse -Force
}

Write-Host "[2/8] Creation structure..."
$dirs = @(
    "frontend", "backend", "prisma", "public", "src", "components", "app", "lib", "hooks",
    "styles", "types", "scripts", "database", "uploads", "docs", "assets",
    "avatars", "logos", "fonts", "animations", "sounds", "ai", "exports", "backups"
)
New-Item -ItemType Directory -Path $PortableRoot -Force | Out-Null
foreach ($d in $dirs) {
    New-Item -ItemType Directory -Path (Join-Path $PortableRoot $d) -Force | Out-Null
}

Write-Host "[3/8] Copie fichiers projet..."

$excludeDirs = @("node_modules", ".next", ".git", "ALLVAPS_PORTABLE", "EXPORT", "exports")
$excludeFiles = @(".env")

function Copy-ProjectItem {
    param([string]$Source, [string]$Dest)
    if (-not (Test-Path -LiteralPath $Source)) { return }
    $item = Get-Item -LiteralPath $Source
    if ($item.PSIsContainer) {
        if ($excludeDirs -contains $item.Name) { return }
        if (-not (Test-Path -LiteralPath $Dest)) { New-Item -ItemType Directory -Path $Dest -Force | Out-Null }
        Get-ChildItem -LiteralPath $Source -Force | ForEach-Object {
            Copy-ProjectItem $_.FullName (Join-Path $Dest $_.Name)
        }
    } else {
        if ($excludeFiles -contains $item.Name) { return }
        $destDir = Split-Path -Parent $Dest
        if ($destDir -and -not (Test-Path -LiteralPath $destDir)) {
            New-Item -ItemType Directory -Path $destDir -Force | Out-Null
        }
        Copy-Item -LiteralPath $Source -Destination $Dest -Force
    }
}

$copyItems = @(
    "app", "components", "hooks", "lib", "prisma", "public",
    "package.json", "package-lock.json", "tsconfig.json", "next.config.ts",
    "next-env.d.ts", "middleware.ts", "postcss.config.mjs", "tailwind.config.ts",
    ".eslintrc.json", ".gitignore", "render.yaml", "docker-compose.yml", ".env.example"
)
if (Test-Path (Join-Path $ProjectRoot ".github")) {
    $copyItems += ".github"
}

foreach ($item in $copyItems) {
    $src = Join-Path $ProjectRoot $item
    $dst = Join-Path $PortableRoot $item
    Copy-ProjectItem $src $dst
}

Write-Host "[4/8] Organisation assets..."

if (Test-Path (Join-Path $PortableRoot "public\brand")) {
    Copy-Item (Join-Path $PortableRoot "public\brand\*") (Join-Path $PortableRoot "logos\") -Recurse -Force -ErrorAction SilentlyContinue
}
if (Test-Path (Join-Path $PortableRoot "public\ava")) {
    Copy-Item (Join-Path $PortableRoot "public\ava\*") (Join-Path $PortableRoot "avatars\") -Recurse -Force -ErrorAction SilentlyContinue
}
if (Test-Path (Join-Path $PortableRoot "lib\ai")) {
    Copy-Item (Join-Path $PortableRoot "lib\ai\*") (Join-Path $PortableRoot "ai\") -Recurse -Force -ErrorAction SilentlyContinue
}
if (Test-Path (Join-Path $PortableRoot "app\globals.css")) {
    Copy-Item (Join-Path $PortableRoot "app\globals.css") (Join-Path $PortableRoot "styles\globals.css") -Force
}
if (Test-Path (Join-Path $PortableRoot "prisma\schema.prisma")) {
    Copy-Item (Join-Path $PortableRoot "prisma\*") (Join-Path $PortableRoot "database\") -Recurse -Force
}

@("uploads", "exports", "backups", "fonts", "animations", "sounds", "assets") | ForEach-Object {
    $keep = Join-Path $PortableRoot "$_\.gitkeep"
    if (-not (Test-Path $keep)) { "" | Out-File $keep -Encoding utf8 }
}

$gitCommit = "unknown"
$gitBranch = "unknown"
try {
    Push-Location $ProjectRoot
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $gc = git rev-parse --short HEAD 2>$null
    if ($LASTEXITCODE -eq 0 -and $gc) { $gitCommit = "$gc".Trim() }
    $gb = git rev-parse --abbrev-ref HEAD 2>$null
    if ($LASTEXITCODE -eq 0 -and $gb) { $gitBranch = "$gb".Trim() }
    $ErrorActionPreference = $prevEap
} catch {
    # ignore git metadata failures (ex. dubious ownership Windows)
} finally {
    Pop-Location
}

$version = "1.0.0"
$pkgJson = Join-Path $ProjectRoot "package.json"
if (Test-Path $pkgJson) {
    $pkg = Get-Content $pkgJson -Raw | ConvertFrom-Json
    if ($pkg.version) { $version = $pkg.version }
}

$now = Get-Date
$dateStr = $now.ToString("yyyy-MM-dd")
$timeStr = $now.ToString("HH:mm:ss")

$versionContent = @"
ALL VAPS - Version Portable
=============================
Version     : $version
Date        : $dateStr
Heure       : $timeStr
Commit Git  : $gitCommit
Branche     : $gitBranch
"@
$versionContent | Out-File (Join-Path $PortableRoot "VERSION.txt") -Encoding utf8

Write-Host "[5/8] Generation documentation et scripts..."
& (Join-Path $PSScriptRoot "write-portable-files.ps1") -PortableRoot $PortableRoot -Version $version -GitCommit $gitCommit -DateStr $dateStr

if (-not $SkipVerification) {
    Write-Host "[6/8] Verifications automatiques (projet source)..."
    $srcVerify = Join-Path $PSScriptRoot "verify-source.ps1"
    & $srcVerify $ProjectRoot
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERREUR: Verifications en echec."
        exit 1
    }
} else {
    Write-Host "[6/8] Verifications ignorees"
}

if (-not $SkipZip) {
    Write-Host "[7/8] Creation archive ZIP..."
    $zipPath = Join-Path $ProjectRoot "ALLVAPS_PORTABLE.zip"
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
    Compress-Archive -Path $PortableRoot -DestinationPath $zipPath -CompressionLevel Optimal
    $zipSize = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
    Write-Host "  Archive creee : $zipPath ($zipSize Mo)"
}

Write-Host "[8/8] Termine !"
Write-Host "Package portable : $PortableRoot"
