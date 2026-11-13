# Greater Cairo Atlas

A documented, source-backed interactive geospatial atlas of Greater Cairo, Egypt.

Greater Cairo Atlas is an **open-evidence urban documentation project**, not a real-estate marketplace or promotional directory:

- **Every fact keeps its source**: no unattributed measurements, dates, or claims.
- **Disagreements coexist**: conflicting claims across sources are stored side by side, never silently overwritten.
- **Lifecycle honesty**: planned, announced, or under-construction projects are never rendered as operational.
- **Spatial lineage**: geometries use WGS 84 (`SRID 4326`) in PostGIS with GiST indexes and preserve upstream OpenStreetMap `type`, `id`, and `version`.

## Current Phase

**Phase 01 — Foundation** (see [`PROJECT_STATE.md`](./PROJECT_STATE.md) for the full phase roadmap and architectural decisions).

- Next.js App Router + TypeScript (`strict: true`) + Tailwind CSS + `shadcn/ui` primitives
- Neon serverless PostgreSQL connection layer (`@neondatabase/serverless`) reading `DATABASE_URL` exclusively from environment variables
- Zod environment validation (`src/lib/env.ts`) with clear missing/malformed `DATABASE_URL` diagnostics
- Plain-SQL migration runner (`db/migrations/` + `scripts/migrate.ts`) with `000_enable_postgis.sql` (`CREATE EXTENSION IF NOT EXISTS postgis;`)
- Structured logging with automatic credential redaction (`src/lib/logger.ts`) and typed error boundaries (`src/lib/errors.ts`)
- Minimal Atlas overview landing page (`/`) and spatial health check endpoint (`/api/health`)

> **Phase 01 Scope Boundary**: Core domain tables (`entities`, `facts`, `evidence`, `features`) and pilot area data ingestion are intentionally deferred to Phase 02+. No fake or placeholder records exist in the repository.

## Tech Stack

- **Web & API**: Next.js 16 (App Router), React 19, TypeScript 5 (`strict`), Tailwind CSS 4, `shadcn/ui`
- **Database**: Neon Serverless PostgreSQL + PostGIS (`@neondatabase/serverless`)
- **Validation & Testing**: Zod 4, Vitest, ESLint 9
- **Hosting**: Vercel (Production & Preview deployments)
- **Planned (Phase 03+)**: MapLibre GL JS, offline/batch Python ingestion scripts (never executed inside Vercel serverless functions), open exports (CSV, JSON, GeoJSON, GeoPackage)

## Repository Structure

```text
.
├── .env.example                    # Environment variable template (no secrets)
├── PROJECT_STATE.md                # Phase tracker, decisions, and limitations
├── components.json                 # shadcn/ui configuration
├── db/
│   └── migrations/
│       └── 000_enable_postgis.sql  # Phase 01 PostGIS extension migration
├── scripts/
│   ├── check-env.ts                # CLI environment validator
│   └── migrate.ts                  # Transactional plain-SQL migration runner
├── src/
│   ├── app/
│   │   ├── api/health/route.ts     # PostGIS + SRID 4326 GeoJSON health endpoint
│   │   ├── error.tsx               # Route segment error boundary
│   │   ├── global-error.tsx        # Root layout error boundary
│   │   ├── globals.css             # Tailwind CSS v4 + theme variables
│   │   ├── layout.tsx              # Root layout
│   │   ├── not-found.tsx           # 404 boundary
│   │   └── page.tsx                # Minimal Atlas foundation landing page
│   ├── components/
│   │   ├── atlas/
│   │   │   └── health-status-panel.tsx
│   │   └── ui/                     # shadcn/ui primitives (badge, button, card)
│   └── lib/
│       ├── atlas/constants.ts      # Phase metadata & planned pilot scope
│       ├── db/
│       │   ├── client.ts           # Neon HTTP & WebSocket session clients
│       │   ├── health.ts           # PostGIS health check query & diagnostics
│       │   └── migrate.ts          # SQL migration discovery, checksums & runner
│       ├── env.ts                  # Zod environment schemas
│       ├── errors.ts               # Typed errors, secret redaction & API responses
│       ├── logger.ts               # Structured logger with secret sanitization
│       └── utils.ts                # Class-name merge helper
└── tests/                          # Unit & route handler tests (Vitest)
```

## Local Setup

### 1. Prerequisites

- Node.js `>= 20.9.0` (Node 22 LTS recommended)
- npm `>= 10`
- A Neon PostgreSQL project (optional if running build/tests/UI without a live database)

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy `.env.example` to `.env.local` and set your Neon connection string:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```dotenv
DATABASE_URL="postgresql://<role>:<password>@<endpoint>.neon.tech/<database>?sslmode=require"
LOG_LEVEL="info"
```

Validate your local environment configuration:

```bash
npm run env:check
```

### 4. Run SQL Migrations

Inspect and verify migration files offline (works without `DATABASE_URL`):

```bash
npm run db:migrate:dry-run
```

Apply pending SQL migrations to Neon (requires `DATABASE_URL`):

```bash
npm run db:migrate
```

The migration runner acquires a PostgreSQL advisory lock, creates the `schema_migrations` ledger table if needed, verifies SHA-256 checksums of previously applied migrations, and runs each pending `.sql` file inside a transaction.

### 5. Start Development Server

```bash
npm run dev
```

- Landing page: `http://localhost:3000`
- Health endpoint: `http://localhost:3000/api/health`

## `/api/health` Behavior

`GET /api/health` is dynamically evaluated (`Cache-Control: no-store, max-age=0`) and executes:

```sql
SELECT
  PostGIS_Version() AS postgis_version,
  ST_AsGeoJSON(ST_SetSRID(ST_MakePoint(31.2357,30.0444),4326)) AS point_geojson
```

- **When `DATABASE_URL` is configured and PostGIS is enabled**: returns `HTTP 200` with `status: "healthy"`, `postgisVersion`, and the SRID `4326` GeoJSON probe result.
- **When `DATABASE_URL` is missing**: returns `HTTP 503` with `status: "not_configured"` and `error.code: "DATABASE_NOT_CONFIGURED"` without crashing the build or server.
- **When `DATABASE_URL` is malformed**: returns `HTTP 500` with `status: "misconfigured"` and `error.code: "ENV_VALIDATION_ERROR"`.
- **When Neon connects but PostGIS is not yet enabled**: returns `HTTP 503` with `error.code: "POSTGIS_NOT_ENABLED"` instructing the operator to run `npm run db:migrate`.

## Quality Checks

```bash
npm run typecheck   # Strict TypeScript check (tsc --noEmit)
npm run lint        # ESLint flat config (Next.js Core Web Vitals + TypeScript)
npm test            # Vitest unit & route tests
npm run build       # Production Next.js build (works with or without DATABASE_URL)
```

## Vercel Preview Compatibility

- `next build` succeeds even before `DATABASE_URL` is set so pull request Preview deployments build cleanly.
- Client components call `/api/health` via relative URLs only, ensuring compatibility across `*.vercel.app` preview domains and custom domains.
- Compatible with the **Neon Vercel Integration** (which can automatically provision isolated preview database branches and inject `DATABASE_URL` per pull request).
