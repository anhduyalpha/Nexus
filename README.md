# Nexus

A private, single-user utility workspace on your hardware. Public source code does not make your local files public.

## Local preview (Windows, macOS, Linux)

Requirements: Node 24 and pnpm 12.4.2.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open **http://127.0.0.1:5173**. The API listens on 127.0.0.1:4310.

For a single-process production build:

```sh
pnpm build
pnpm start
```

Open **http://127.0.0.1:4310**. `pnpm start` needs the built Web distribution.

## Implemented in the first preview

- QR PNG/SVG generation using node-qrcode.
- Persistent local file library (SQLite WAL + Drizzle metadata, filesystem binaries).
- Download, HTTP single-range responses, and explicit file deletion.
- Mobile/desktop Vue interface; no cloud processing, analytics, or external fonts.
- Token-protected access when configured, signed HttpOnly session cookies, origin/host checks.

## Data and configuration

Defaults are intentionally local-only. `.env.example` documents supported variables; copy it to `.env` to override them. `NEXUS_DATA_DIR` defaults to this repository's `data/` directory. The production and development commands both resolve storage independently of the shell's working directory.

Back up the data directory with the server stopped so SQLite and files form a consistent snapshot. `.env`, data, and temporary test output must not be committed.

For remote access, set `NEXUS_HOST`, an explicit `NEXUS_ORIGIN`, and a private `NEXUS_TOKEN` of at least 16 characters, and put the application behind HTTPS. This is not a hardened public multi-user service. Do not expose the Vite development server publicly.

## Verification

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Browser tests use a separate `.tmp/e2e` data directory. GitHub Actions runs frozen-install, typechecks, tests and the production build on Ubuntu and Windows, plus browser checks on Ubuntu.

## Roadmap status

See `docs/CURRENT.md` and `docs/tasks/BATCH-001.md`. Queue/upload/converter/archive expansion is tracked separately; the existence of an architecture document is not evidence that a subsystem is implemented.
