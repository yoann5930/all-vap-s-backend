#Requires -Version 5.1
param(
    [Parameter(Mandatory)][string]$PortableRoot,
    [string]$Version = "1.0.0",
    [string]$GitCommit = "unknown",
    [string]$DateStr = (Get-Date -Format "yyyy-MM-dd")
)

$scriptsDir = Join-Path $PortableRoot "scripts"
$docsDir = Join-Path $PortableRoot "docs"
New-Item -ItemType Directory -Path $scriptsDir -Force | Out-Null
New-Item -ItemType Directory -Path $docsDir -Force | Out-Null

# ==================== .env.example ====================
@'
# Mode démo — données locales sans PostgreSQL (mettre false pour reconnecter la BDD)
DEMO_MODE="true"

# PostgreSQL — requis si DEMO_MODE=false
# DATABASE_URL="postgresql://user:password@localhost:5432/allvaps?schema=public"

NODE_ENV="development"

# Domaine officiel — obligatoire en production :
# NEXT_PUBLIC_APP_URL="https://allvaps.fr"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# JWT — secret de session (générer une chaîne longue et aléatoire en production)
JWT_SECRET="change-me-in-production-use-a-long-random-string"

# Google Search Console — balise meta verification
NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=""

# Google Analytics 4 — ID de mesure (G-XXXXXXXXXX)
NEXT_PUBLIC_GA_MEASUREMENT_ID=""

# Google Merchant Center — compte marchand
GOOGLE_MERCHANT_CENTER_ID=""

# SumUp — paiement
SUMUP_API_KEY=""
SUMUP_MERCHANT_CODE=""

# Viva.com — paiement
VIVA_CLIENT_ID=""
VIVA_CLIENT_SECRET=""
VIVA_MERCHANT_ID=""
VIVA_API_URL="https://demo-api.vivapayments.com"
VIVA_SOURCE_CODE="Default"

# Livraison
MONDIAL_RELAY_API_KEY=""
RELAIS_COLIS_API_KEY=""
COLISSIMO_API_KEY=""

# Intelligence artificielle
AI_PROVIDER="stub"
OPENAI_API_KEY=""
OPENAI_MODEL="gpt-4o-mini"
OPENAI_TTS_VOICE="nova"

# Vercel (auto-injecté en déploiement, ne pas modifier localement)
# VERCEL_URL=""
'@ | Out-File (Join-Path $PortableRoot ".env.example") -Encoding utf8

# ==================== verify-project.ps1 ====================
@'
#Requires -Version 5.1
$ErrorActionPreference = "Continue"
$root = Split-Path $PSScriptRoot -Parent
$errors = 0

function Test-Step {
    param([string]$Name, [scriptblock]$Action)
    Write-Host "  > $Name..." -NoNewline
    try {
        & $Action
        if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne $null) {
            Write-Host " ECHEC (code $LASTEXITCODE)" -ForegroundColor Red
            $script:errors++
        } else {
            Write-Host " OK" -ForegroundColor Green
        }
    } catch {
        Write-Host " ECHEC: $_" -ForegroundColor Red
        $script:errors++
    }
}

Write-Host "Verification du projet All Vaps..." -ForegroundColor Cyan

# Fichiers requis
$required = @(
    "package.json", "package-lock.json", "tsconfig.json", "next.config.ts",
    "prisma\schema.prisma", "app\layout.tsx", "lib\prisma.ts", ".env.example"
)
foreach ($f in $required) {
    $p = Join-Path $root $f
    if (-not (Test-Path $p)) {
        Write-Host "  FICHIER MANQUANT: $f" -ForegroundColor Red
        $errors++
    }
}

Push-Location $root

Test-Step "npm (version)" { npm --version | Out-Null }
Test-Step "Prisma validate" {
    $env:DATABASE_URL = "postgresql://user:pass@localhost:5432/allvaps?schema=public"
    npx prisma validate 2>&1 | Out-Null
}
Test-Step "TypeScript (tsc --noEmit)" { npx tsc --noEmit 2>&1 | Out-Null }
Test-Step "npm run build" { npm run build 2>&1 | Out-Null }

Pop-Location

if ($errors -gt 0) {
    Write-Host "`n$errors vérification(s) en échec." -ForegroundColor Red
    exit 1
}
Write-Host "`nToutes les vérifications ont réussi." -ForegroundColor Green
exit 0
'@ | Out-File (Join-Path $scriptsDir "verify-project.ps1") -Encoding utf8

@'
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ERRORS=0

check() {
  local name="$1"
  shift
  printf "  > %s... " "$name"
  if "$@" >/dev/null 2>&1; then
    echo "OK"
  else
    echo "ECHEC"
    ERRORS=$((ERRORS + 1))
  fi
}

echo "Verification du projet All Vaps..."
REQUIRED=(package.json package-lock.json tsconfig.json next.config.ts prisma/schema.prisma app/layout.tsx lib/prisma.ts .env.example)
for f in "${REQUIRED[@]}"; do
  if [[ ! -f "$ROOT/$f" ]]; then
    echo "  FICHIER MANQUANT: $f"
    ERRORS=$((ERRORS + 1))
  fi
done

cd "$ROOT"
check "npm" npm --version
check "Prisma validate" env DATABASE_URL="postgresql://user:pass@localhost:5432/allvaps?schema=public" npx prisma validate
check "TypeScript" npx tsc --noEmit
check "npm run build" npm run build

if [[ $ERRORS -gt 0 ]]; then
  echo "$ERRORS vérification(s) en échec."
  exit 1
fi
echo "Toutes les vérifications ont réussi."
'@ | Out-File (Join-Path $scriptsDir "verify-project.sh") -Encoding utf8

# ==================== START scripts ====================
@'
@echo off
chcp 65001 >nul
title All Vap's — Démarrage
cd /d "%~dp0"

echo ========================================
echo   ALL VAP'S — Demarrage Windows
echo ========================================
echo.

if not exist "node_modules\" (
    echo Installation des dependances...
    call npm install
    if errorlevel 1 goto :error
)

if not exist ".env" (
    echo Creation du fichier .env depuis .env.example...
    copy /Y ".env.example" ".env" >nul
    echo Fichier .env cree. Modifiez-le si necessaire.
)

echo.
echo Lancement du serveur de developpement...
echo URL : http://localhost:3000
echo Admin : admin@allvaps.fr / Admin123!
echo.
call npm run dev
goto :end

:error
echo.
echo ERREUR lors du demarrage. Verifiez Node.js et npm.
pause
exit /b 1

:end
'@ | Out-File (Join-Path $PortableRoot "START_WINDOWS.bat") -Encoding ascii

@'
#!/bin/bash
cd "$(dirname "$0")"
echo "========================================"
echo "  ALL VAP'S — Démarrage macOS"
echo "========================================"
echo ""

if [ ! -d "node_modules" ]; then
    echo "Installation des dépendances..."
    npm install || exit 1
fi

if [ ! -f ".env" ]; then
    echo "Création du fichier .env depuis .env.example..."
    cp .env.example .env
fi

echo ""
echo "Lancement du serveur de développement..."
echo "URL : http://localhost:3000"
echo "Admin : admin@allvaps.fr / Admin123!"
echo ""
npm run dev
'@ | Out-File (Join-Path $PortableRoot "START_MAC.command") -Encoding utf8

@'
#!/bin/bash
cd "$(dirname "$0")"
echo "========================================"
echo "  ALL VAP'S — Démarrage Linux"
echo "========================================"
echo ""

if [ ! -d "node_modules" ]; then
    echo "Installation des dépendances..."
    npm install || exit 1
fi

if [ ! -f ".env" ]; then
    echo "Création du fichier .env depuis .env.example..."
    cp .env.example .env
fi

echo ""
echo "Lancement du serveur de développement..."
echo "URL : http://localhost:3000"
echo "Admin : admin@allvaps.fr / Admin123!"
echo ""
npm run dev
'@ | Out-File (Join-Path $PortableRoot "START_LINUX.sh") -Encoding utf8

# ==================== EXPORT scripts ====================
@'
@echo off
chcp 65001 >nul
title All Vap's — Export Projet
cd /d "%~dp0"

echo ========================================
echo   ALL VAP'S — Export Projet
echo ========================================
echo.

echo [1/6] Verification du projet...
call scripts\verify-project.ps1
if errorlevel 1 (
    echo Export annule : verifications en echec.
    pause
    exit /b 1
)

set EXPORT_DIR=%~dp0EXPORT
set TIMESTAMP=%date:~-4%%date:~3,2%%date:~0,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set TIMESTAMP=%TIMESTAMP: =0%
set EXPORT_NAME=ALLVAPS_EXPORT_%TIMESTAMP%

echo [2/6] Nettoyage du cache...
if exist ".next" rmdir /s /q ".next"
if exist "node_modules\.cache" rmdir /s /q "node_modules\.cache"
del /q /s *.tsbuildinfo 2>nul
del /q /s npm-debug.log* 2>nul

echo [3/6] Preparation du dossier EXPORT...
if exist "%EXPORT_DIR%" rmdir /s /q "%EXPORT_DIR%"
mkdir "%EXPORT_DIR%\%EXPORT_NAME%"

echo [4/6] Copie du projet (sans node_modules, .next, .env)...
robocopy "%~dp0" "%EXPORT_DIR%\%EXPORT_NAME%" /E /XD node_modules .next .git EXPORT exports backups /XF .env /NFL /NDL /NJH /NJS /nc /ns /np
if errorlevel 8 goto :error

echo [5/6] Creation de l'archive ZIP...
powershell -NoProfile -Command "Compress-Archive -Path '%EXPORT_DIR%\%EXPORT_NAME%' -DestinationPath '%EXPORT_DIR%\%EXPORT_NAME%.zip' -Force"

echo [6/6] Copie dans exports\...
if not exist "exports\" mkdir "exports"
copy /Y "%EXPORT_DIR%\%EXPORT_NAME%.zip" "exports\" >nul

echo.
echo Export termine !
echo Dossier : %EXPORT_DIR%\%EXPORT_NAME%
echo Archive : %EXPORT_DIR%\%EXPORT_NAME%.zip
echo Copie   : exports\%EXPORT_NAME%.zip
echo.
pause
goto :end

:error
echo ERREUR lors de l'export.
pause
exit /b 1

:end
'@ | Out-File (Join-Path $PortableRoot "EXPORT_PROJECT.bat") -Encoding ascii

@'
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "========================================"
echo "  ALL VAP'S — Export Projet"
echo "========================================"
echo ""

echo "[1/6] Vérification du projet..."
bash scripts/verify-project.sh

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
EXPORT_DIR="$ROOT/EXPORT"
EXPORT_NAME="ALLVAPS_EXPORT_${TIMESTAMP}"
EXPORT_PATH="$EXPORT_DIR/$EXPORT_NAME"

echo "[2/6] Nettoyage du cache..."
rm -rf .next node_modules/.cache
find . -name "*.tsbuildinfo" -delete 2>/dev/null || true
find . -name "npm-debug.log*" -delete 2>/dev/null || true

echo "[3/6] Préparation du dossier EXPORT..."
rm -rf "$EXPORT_DIR"
mkdir -p "$EXPORT_PATH"

echo "[4/6] Copie du projet..."
rsync -a --exclude node_modules --exclude .next --exclude .git --exclude EXPORT --exclude exports --exclude backups --exclude .env "$ROOT/" "$EXPORT_PATH/"

echo "[5/6] Création de l'archive ZIP..."
(cd "$EXPORT_DIR" && zip -r "${EXPORT_NAME}.zip" "$EXPORT_NAME")

echo "[6/6] Copie dans exports/..."
mkdir -p exports
cp "$EXPORT_DIR/${EXPORT_NAME}.zip" exports/

echo ""
echo "Export terminé !"
echo "Dossier : $EXPORT_PATH"
echo "Archive : $EXPORT_DIR/${EXPORT_NAME}.zip"
echo "Copie   : exports/${EXPORT_NAME}.zip"
'@ | Out-File (Join-Path $PortableRoot "EXPORT_PROJECT.sh") -Encoding utf8

# ==================== BACKUP scripts ====================
@'
@echo off
chcp 65001 >nul
title All Vap's — Sauvegarde
cd /d "%~dp0"

echo ========================================
echo   ALL VAP'S — Sauvegarde Complete
echo ========================================
echo.

set TIMESTAMP=%date:~-4%%date:~3,2%%date:~0,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set TIMESTAMP=%TIMESTAMP: =0%
set BACKUP_NAME=ALLVAPS_BACKUP_%TIMESTAMP%
set BACKUP_DIR=%~dp0backups\%BACKUP_NAME%

if not exist "backups\" mkdir "backups"

echo [1/3] Creation de la sauvegarde...
mkdir "%BACKUP_DIR%"
robocopy "%~dp0" "%BACKUP_DIR%" /E /XD node_modules .next .git EXPORT exports backups /XF .env /NFL /NDL /NJH /NJS /nc /ns /np

echo [2/3] Creation de l'archive ZIP...
powershell -NoProfile -Command "Compress-Archive -Path '%BACKUP_DIR%' -DestinationPath '%~dp0backups\%BACKUP_NAME%.zip' -Force"

echo [3/3] Nettoyage du dossier temporaire...
rmdir /s /q "%BACKUP_DIR%"

echo.
echo Sauvegarde terminee !
echo Archive : backups\%BACKUP_NAME%.zip
echo.
pause
'@ | Out-File (Join-Path $PortableRoot "BACKUP_PROJECT.bat") -Encoding ascii

@'
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "========================================"
echo "  ALL VAP'S — Sauvegarde Complète"
echo "========================================"
echo ""

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="ALLVAPS_BACKUP_${TIMESTAMP}"
BACKUP_DIR="$ROOT/backups"
BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"

mkdir -p "$BACKUP_DIR"

echo "[1/3] Création de la sauvegarde..."
mkdir -p "$BACKUP_PATH"
rsync -a --exclude node_modules --exclude .next --exclude .git --exclude EXPORT --exclude exports --exclude backups --exclude .env "$ROOT/" "$BACKUP_PATH/"

echo "[2/3] Création de l'archive ZIP..."
(cd "$BACKUP_DIR" && zip -r "${BACKUP_NAME}.zip" "$BACKUP_NAME")

echo "[3/3] Nettoyage du dossier temporaire..."
rm -rf "$BACKUP_PATH"

echo ""
echo "Sauvegarde terminée !"
echo "Archive : backups/${BACKUP_NAME}.zip"
'@ | Out-File (Join-Path $PortableRoot "BACKUP_PROJECT.sh") -Encoding utf8

# ==================== README.md ====================
@'
# All Vap's — Version Portable Complète

Package portable du projet **All Vap's**, prêt à être copié sur disque dur, SSD ou clé USB, et ouvert directement dans **Cursor** sur n'importe quel ordinateur.

## Contenu du package

Ce dossier contient l'intégralité du projet e-commerce All Vap's :

- Boutique en ligne (catalogue, panier, checkout)
- Compte client (commandes, fidélité, profil vape)
- Administration complète
- Assistant IA holographique A.V.A
- API REST Next.js
- Base de données Prisma / PostgreSQL

## Prérequis

| Outil | Version minimale | Téléchargement |
|-------|------------------|----------------|
| **Node.js** | 18.x ou 20.x LTS | https://nodejs.org |
| **npm** | 9+ (inclus avec Node.js) | — |
| **Git** | 2.x+ (optionnel) | https://git-scm.com |
| **PostgreSQL** | 14+ (si mode production BDD) | https://postgresql.org |
| **Cursor** | Dernière version | https://cursor.com |

## Installation rapide

### Windows
1. Copier le dossier `ALLVAPS_PORTABLE` sur votre machine
2. Double-cliquer sur `START_WINDOWS.bat`
3. Ouvrir http://localhost:3000

### macOS
1. Copier le dossier sur votre Mac
2. Double-cliquer sur `START_MAC.command` (autoriser dans Préférences Système si nécessaire)
3. Ouvrir http://localhost:3000

### Linux
```bash
chmod +x START_LINUX.sh
./START_LINUX.sh
```

### Installation manuelle
```bash
npm install
cp .env.example .env
npm run dev
```

Voir **INSTALL.md** pour les commandes détaillées.

## Lancement

| Commande | Description |
|----------|-------------|
| `npm run dev` | Serveur de développement (port 3000) |
| `npm run build` | Build de production |
| `npm run start` | Serveur de production |
| `npm run lint` | Vérification ESLint |

**Compte admin par défaut :** `admin@allvaps.fr` / `Admin123!`

## Mode démo (sans PostgreSQL)

Par défaut, `DEMO_MODE=true` dans `.env.example` permet de travailler **sans base de données** avec des données locales.

Pour activer PostgreSQL :
1. Installer PostgreSQL
2. Créer une base `allvaps`
3. Modifier `.env` : `DEMO_MODE=false` et `DATABASE_URL=postgresql://...`
4. Exécuter `npm run prisma:migrate` puis `npm run prisma:seed`

## Dépendances principales

- **Next.js 15** — Framework React full-stack
- **React 19** — Interface utilisateur
- **TypeScript** — Typage statique
- **Tailwind CSS 4** — Styles
- **Prisma 6** — ORM base de données
- **PostgreSQL** — Base de données relationnelle
- **Three.js / React Three Fiber** — Assistant 3D A.V.A
- **Framer Motion** — Animations
- **Jose** — JWT authentification
- **Zod** — Validation des données

## Prisma

```bash
npx prisma generate    # Génère le client Prisma
npx prisma migrate dev   # Applique les migrations
npx prisma db push       # Push du schéma sans migration
npx prisma studio        # Interface graphique BDD
```

Schéma : `prisma/schema.prisma` · Copie : `database/schema.prisma`

## PostgreSQL

Requis uniquement si `DEMO_MODE=false`. Créer une base locale :

```sql
CREATE DATABASE allvaps;
```

Puis dans `.env` :
```
DATABASE_URL="postgresql://user:password@localhost:5432/allvaps?schema=public"
```

## Git

Le package portable inclut `.gitignore`. Pour versionner :

```bash
git init
git add .
git commit -m "All Vap's portable"
```

## Cursor

1. Ouvrir Cursor
2. **File → Open Folder** → sélectionner `ALLVAPS_PORTABLE`
3. Cursor détecte automatiquement Next.js + TypeScript
4. Installer les extensions recommandées si proposées

L'assistant IA de Cursor peut naviguer dans `app/`, `components/`, `lib/`, `prisma/`.

## Structure du projet

```
ALLVAPS_PORTABLE/
├── app/           Pages Next.js & routes API
├── components/    Composants React (UI, shop, admin, AI)
├── hooks/         Hooks React (voix, A.V.A, souris)
├── lib/           Logique métier (auth, paiements, AI, shipping)
├── prisma/        Schéma & seed base de données
├── public/        Assets statiques (favicon, logos, A.V.A)
├── frontend/      Index documentation interface
├── backend/       Index documentation API
├── database/      Copie schéma Prisma
├── ai/            Modules intelligence artificielle
├── logos/         Logos de marque
├── avatars/       Assets assistant A.V.A
├── scripts/       Scripts utilitaires & vérification
├── docs/          Documentation étendue
├── exports/       Archives d'export
├── backups/       Sauvegardes automatiques
└── uploads/       Fichiers uploadés (futur)
```

## Scripts utilitaires

| Script | Plateforme | Action |
|--------|------------|--------|
| `START_WINDOWS.bat` | Windows | Installe & lance le projet |
| `START_MAC.command` | macOS | Installe & lance le projet |
| `START_LINUX.sh` | Linux | Installe & lance le projet |
| `EXPORT_PROJECT.bat/.sh` | Toutes | Export propre + ZIP |
| `BACKUP_PROJECT.bat/.sh` | Toutes | Sauvegarde complète + ZIP |

## Export & sauvegarde

**Export** (`EXPORT_PROJECT`) : nettoie le cache, supprime `node_modules` et `.next`, vérifie le projet, crée une archive ZIP dans `exports/`.

**Sauvegarde** (`BACKUP_PROJECT`) : copie complète du code source dans `backups/` avec archive ZIP horodatée.

## Vérification automatique

Avant chaque export, le script vérifie :
- Fichiers requis présents
- npm disponible
- Prisma valide
- TypeScript sans erreurs
- Build Next.js réussi

## Fichiers de référence

- `VERSION.txt` — Version, date, commit Git
- `CHANGELOG.md` — Historique des modifications
- `PROJECT_INFO.md` — Technologies & APIs
- `INSTALL.md` — Guide d'installation détaillé

## Support

Projet : All Vap's — Hautmont & Le Quesnoy
Site : https://allvaps.fr

© All Vap's — Tous droits réservés
'@ | Out-File (Join-Path $PortableRoot "README.md") -Encoding utf8

# ==================== INSTALL.md ====================
@'
# All Vap's — Guide d'installation

## 1. Prérequis système

### Node.js & npm
```bash
node --version    # >= 18.x
npm --version     # >= 9.x
```

Télécharger : https://nodejs.org (version LTS recommandée)

### Git (optionnel)
```bash
git --version
```

### PostgreSQL (optionnel — mode production)
```bash
psql --version    # >= 14.x
```

---

## 2. Installation des dépendances

```bash
npm install
```

Cette commande :
- Installe toutes les dépendances (`package.json`)
- Exécute `postinstall` → `prisma generate`

---

## 3. Configuration environnement

```bash
# Windows
copy .env.example .env

# macOS / Linux
cp .env.example .env
```

Modifier `.env` selon vos besoins (voir `.env.example` pour toutes les variables).

---

## 4. Base de données

### Mode démo (par défaut)
Aucune action requise. `DEMO_MODE=true` utilise des données locales.

### Mode PostgreSQL
```bash
# Créer la base de données
createdb allvaps

# Configurer .env
# DEMO_MODE=false
# DATABASE_URL="postgresql://user:password@localhost:5432/allvaps?schema=public"

# Appliquer le schéma
npm run prisma:push

# Peupler avec les données initiales
npm run prisma:seed
```

---

## 5. Commandes de développement

```bash
# Serveur de développement (hot reload)
npm run dev

# Ouvrir dans le navigateur
# http://localhost:3000
```

---

## 6. Commandes Prisma

```bash
# Générer le client Prisma
npm run prisma:generate
# ou
npx prisma generate

# Créer et appliquer une migration
npm run prisma:migrate
# ou
npx prisma migrate dev

# Push du schéma (sans fichier de migration)
npm run prisma:push
# ou
npx prisma db push

# Peupler la base
npm run prisma:seed

# Interface graphique
npx prisma studio
```

---

## 7. Build & production

```bash
# Build de production
npm run build

# Lancer en production
npm run start
```

Le build exécute automatiquement `prisma generate` puis `next build`.

---

## 8. Vérification du projet

```bash
# Windows
powershell -File scripts\verify-project.ps1

# macOS / Linux
bash scripts/verify-project.sh
```

Vérifie : npm, Prisma, TypeScript, build.

---

## 9. Lint

```bash
npm run lint
```

---

## 10. Ouvrir dans Cursor

1. Lancer Cursor
2. File → Open Folder
3. Sélectionner le dossier `ALLVAPS_PORTABLE`
4. Terminal intégré : `npm run dev`

---

## 11. Dépannage

| Problème | Solution |
|----------|----------|
| `EACCES` npm | Ne pas utiliser sudo ; vérifier permissions |
| Port 3000 occupé | `npm run dev -- --port 3001` |
| Erreur Prisma | Vérifier `DATABASE_URL` et que PostgreSQL tourne |
| Module introuvable | Supprimer `node_modules` et relancer `npm install` |
| Erreur build | `npx prisma generate` puis `npm run build` |

---

## Récapitulatif des commandes

```bash
npm install              # Installer les dépendances
npm run dev              # Développement
npm run build            # Build production
npm run start            # Production
npm run lint             # ESLint
npm run prisma:generate  # Client Prisma
npm run prisma:migrate   # Migrations
npm run prisma:push      # Push schéma
npm run prisma:seed      # Données initiales
npm run db:setup         # Push + seed
```
'@ | Out-File (Join-Path $PortableRoot "INSTALL.md") -Encoding utf8

# ==================== CHANGELOG.md ====================
$changelog = @"
# Changelog — All Vap's

Toutes les modifications notables du projet sont documentées ici.

## [$Version] — $DateStr

### Ajouté
- Package portable complet \`ALLVAPS_PORTABLE\`
- Scripts de démarrage Windows / macOS / Linux
- Scripts d'export et de sauvegarde automatique
- Vérification automatique (TypeScript, build, Prisma, npm)
- Documentation complète (README, INSTALL, PROJECT_INFO)
- Archive ZIP prête pour clé USB / SSD

---

## Historique Git

| Commit | Description | Date |
|--------|-------------|------|
| 58232fd | Create official premium All Vap's brand identity | 2026-07-02 |
| 741895d | Improve photorealistic A.V.A holographic assistant | 2026-07-02 |
| bf46b7c | Make AVA realistic holographic human face | 2026-07-02 |
| 74bfe90 | Add microphone permission flow to AVA | 2026-07-02 |
| 6559f40 | Create cinematic voice holographic AVA | 2026-07-02 |
| 65342ce | Add voice interaction to AVA | 2026-07-02 |
| 03c6022 | Create immersive holographic AVA assistant | 2026-07-02 |
| 5d92f7a | Upgrade to A.V.A. premium holographic assistant | 2026-07-02 |
| 71d94ff | Add holographic AI assistant | 2026-07-02 |
| 6362210 | Fix redirect loop | 2026-07-02 |
| e4ddc79 | Fix broken CSS rendering | 2026-07-02 |
| ad95cb1 | Fix CSS and static assets on allvaps.fr | 2026-07-02 |
| 0352704 | Fix redirect loop for allvaps.fr | 2026-07-02 |
| 01bc30f | Version initiale All Vap's | 2026-07-02 |
| fa99dc0 | Add files via upload | 2026-07-01 |

---

Format basé sur [Keep a Changelog](https://keepachangelog.com/).
"@
$changelog | Out-File (Join-Path $PortableRoot "CHANGELOG.md") -Encoding utf8

# ==================== PROJECT_INFO.md ====================
@'
# All Vap's — Informations Projet

## Identité

| Champ | Valeur |
|-------|--------|
| **Nom** | All Vap's |
| **Version** | 1.0.0 |
| **Type** | E-commerce full-stack |
| **Domaine** | https://allvaps.fr |
| **Boutiques** | Hautmont & Le Quesnoy |

## Technologies

### Frontend
- Next.js 15 (App Router)
- React 19
- TypeScript 5.7
- Tailwind CSS 4
- Framer Motion 12
- Three.js + React Three Fiber (A.V.A 3D)
- Lucide React (icônes)

### Backend
- Next.js API Routes
- Prisma ORM 6
- PostgreSQL
- JWT (jose)
- bcryptjs (hash mots de passe)
- Zod (validation)

### Outils
- ESLint + eslint-config-next
- tsx (exécution seed Prisma)
- Cursor IDE (développement)

## APIs & Services intégrés

| Service | Usage | Variables d'environnement |
|---------|-------|---------------------------|
| **SumUp** | Paiement CB | `SUMUP_API_KEY`, `SUMUP_MERCHANT_CODE` |
| **Viva.com** | Paiement CB | `VIVA_CLIENT_ID`, `VIVA_CLIENT_SECRET`, `VIVA_MERCHANT_ID` |
| **Mondial Relay** | Livraison relais | `MONDIAL_RELAY_API_KEY` |
| **Relais Colis** | Livraison relais | `RELAIS_COLIS_API_KEY` |
| **Colissimo** | Livraison domicile | `COLISSIMO_API_KEY` |
| **OpenAI** | IA vocale A.V.A | `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_TTS_VOICE` |
| **Google Analytics** | Statistiques | `NEXT_PUBLIC_GA_MEASUREMENT_ID` |
| **Google Search Console** | SEO | `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` |
| **Google Merchant Center** | Flux produits | `GOOGLE_MERCHANT_CENTER_ID` |

## Structure technique

```
app/
├── (pages)         Boutique, compte, admin, checkout
├── api/            Routes REST (auth, products, orders, AI, payments)
└── globals.css     Styles globaux

components/
├── ai/             Assistant A.V.A holographique
├── admin/          Interface administration
├── shop/           Catalogue, filtres, recherche
├── products/       Fiches produits
├── account/        Espace client
├── layout/         Header, Footer, navigation
└── ui/             Composants UI réutilisables

lib/
├── ai/             Moteur IA & conseil vape
├── payments/       Viva.com + SumUp
├── shipping/       Transporteurs
├── demo/           Mode démo sans BDD
├── prisma.ts       Client base de données
├── auth.ts         Authentification
└── jwt.ts          Tokens JWT

prisma/
├── schema.prisma   Modèles (User, Product, Order, etc.)
└── seed.ts         Données initiales
```

## Modèles de données (Prisma)

- User, Address, VapeProfile
- Product, Category, Brand, ProductImage
- Order, OrderItem, Coupon
- Review, Banner, Favorite
- LoyaltyTransaction

## Routes API principales

- `/api/auth/*` — Authentification
- `/api/products/*` — Catalogue
- `/api/orders` — Commandes
- `/api/payments/checkout` — Paiement unifié
- `/api/ai` — Assistant IA
- `/api/ai-assistant` — A.V.A vocal
- `/api/health` — Health check
- `/api/admin/*` — Administration

## Déploiement

- **Vercel** — Frontend + API (production)
- **Render** — Alternative (render.yaml inclus)
- **PostgreSQL** — Base de données cloud

## Licence

© All Vap's — Propriétaire
'@ | Out-File (Join-Path $PortableRoot "PROJECT_INFO.md") -Encoding utf8

# ==================== Index folders ====================
@'
# Frontend — All Vap's

Ce dossier est l'index de l'interface utilisateur.

## Code source principal

| Dossier | Contenu |
|---------|---------|
| `../app/` | Pages Next.js (boutique, compte, admin) |
| `../components/` | Composants React |
| `../hooks/` | Hooks personnalisés (voix, A.V.A) |
| `../styles/` | Feuilles de style |
| `../public/` | Assets statiques |

## Pages principales

- `/` — Accueil
- `/boutique` — Catalogue
- `/products/[slug]` — Fiche produit
- `/cart` — Panier
- `/checkout` — Paiement
- `/account` — Espace client
- `/admin` — Administration
- `/ia` — Assistant A.V.A
'@ | Out-File (Join-Path $PortableRoot "frontend\README.md") -Encoding utf8

@'
# Backend — All Vap's

Ce dossier est l'index de la logique serveur.

## Code source principal

| Dossier | Contenu |
|---------|---------|
| `../app/api/` | Routes API REST Next.js |
| `../lib/` | Services métier |
| `../prisma/` | Schéma & ORM |
| `../database/` | Copie du schéma Prisma |
| `../middleware.ts` | Middleware Next.js (auth) |

## Modules clés

- `lib/auth.ts` — Authentification
- `lib/payments/` — Viva.com & SumUp
- `lib/shipping/` — Transporteurs
- `lib/ai/` — Intelligence artificielle
- `lib/prisma.ts` — Client base de données
'@ | Out-File (Join-Path $PortableRoot "backend\README.md") -Encoding utf8

@'
# Documentation All Vap's

- [README.md](../README.md) — Guide principal
- [INSTALL.md](../INSTALL.md) — Installation détaillée
- [PROJECT_INFO.md](../PROJECT_INFO.md) — Technologies & APIs
- [CHANGELOG.md](../CHANGELOG.md) — Historique
- [VERSION.txt](../VERSION.txt) — Version actuelle
'@ | Out-File (Join-Path $docsDir "INDEX.md") -Encoding utf8

Write-Host "  Fichiers scripts et documentation générés." -ForegroundColor Gray
