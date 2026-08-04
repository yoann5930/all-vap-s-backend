# AGENTS.md

## Cursor Cloud specific instructions

Product is a single **Next.js 15 + TypeScript + Prisma + PostgreSQL** app (`all-vaps`).
Standard commands live in `README.md` and `package.json` scripts (`dev`, `build`, `lint`,
`prisma:*`, `prisma:seed`). Only the non-obvious, environment-specific notes are below.

### Database (PostgreSQL)
- Docker is not used here. Postgres 16 is installed as a native apt cluster
  (`16 main`) listening on **port 5433** to match the app's default
  `DATABASE_URL` (`postgresql://allvaps:allvaps@localhost:5433/allvaps`). The cluster
  is NOT auto-started on boot — start it before running anything DB-backed:
  `sudo pg_ctlcluster 16 main start` (check with `pg_lsclusters`).
- Role and database are both `allvaps` (password `allvaps`), created manually to match
  `.env.example`.
- Alternative with no database: set `DEMO_MODE="true"` in `.env` to run against the
  in-memory demo Prisma client (`lib/demo/`). Default is `DEMO_MODE="false"` (real Postgres).

### Environment file
- `.env` is gitignored; create it once with `cp .env.example .env`. Defaults already point
  at the local 5433 cluster and enable `PAYMENT_TEST_MODE`, so no third-party credentials
  are needed for local dev.

### Seeding gotcha
- `npm run prisma:seed` runs `tsx prisma/seed.ts`, which does **not** auto-load `.env`
  (only the Prisma CLI and `next dev` do). Export the env first, e.g.:
  `set -a; . ./.env; set +a; npm run prisma:seed`.
  Prisma CLI commands (`prisma migrate deploy`, `prisma generate`) and `npm run dev`
  load `.env` automatically.
- Seed creates the admin login **`admin@allvaps.fr` / `Admin123!`** plus demo catalog data.

### Running / testing
- Dev server: `npm run dev` → http://localhost:3000 (port 3000). Health check at
  `GET /api/health` (returns `"mode":"database"` when Postgres-backed).
- There is no automated test runner; the CI gates are `npm run lint` and `npm run build`
  (see `.github/workflows/ci.yml`). Utility/smoke scripts live in `scripts/`.
- Node 22 is present locally; CI uses Node 20. Both work for Next 15.
