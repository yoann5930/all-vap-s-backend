#Requires -Version 5.1
param([string]$Root = (Get-Location).Path)

$ErrorActionPreference = "Continue"
$errors = 0

function Test-Step {
    param([string]$Name, [scriptblock]$Action)
    Write-Host "  > $Name..." -NoNewline
    try {
        Push-Location $Root
        & $Action
        Pop-Location
        if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne $null) {
            Write-Host " ECHEC (code $LASTEXITCODE)"
            $script:errors++
        } else {
            Write-Host " OK"
        }
    } catch {
        Pop-Location -ErrorAction SilentlyContinue
        Write-Host " ECHEC: $_"
        $script:errors++
    }
}

Write-Host "Verification projet All Vaps (source)..."

$required = @(
    "package.json", "package-lock.json", "tsconfig.json", "next.config.ts",
    "prisma\schema.prisma", "app\layout.tsx", "lib\prisma.ts", ".env.example"
)
foreach ($f in $required) {
    if (-not (Test-Path (Join-Path $Root $f))) {
        Write-Host "  FICHIER MANQUANT: $f"
        $errors++
    }
}

Test-Step "npm version" { npm --version | Out-Null }
Test-Step "Prisma validate" {
    $env:DATABASE_URL = "postgresql://user:pass@localhost:5432/allvaps?schema=public"
    npx prisma validate 2>&1 | Out-Null
}
Test-Step "TypeScript" { npx tsc --noEmit 2>&1 | Out-Null }
Test-Step "npm run build" { npm run build 2>&1 | Out-Null }

if ($errors -gt 0) {
    Write-Host "$errors verification(s) en echec."
    exit 1
}
Write-Host "Toutes les verifications ont reussi."
exit 0
