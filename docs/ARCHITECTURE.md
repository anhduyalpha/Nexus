# Nexus Architecture

## System Shape

Nexus is a modular monolith with a plugin runtime.

```text
Frontend
Vue 3 + Vite + PWA
        |
        v
Core
Fastify
        |
  +-----+-------------+
  |     |             |
  v     v             v
 DB    Jobs         Events
SQLite Redis          SSE
 WAL   BullMQ
        |
        v
      Workers
        |
        v
    OSS engines
 FFmpeg / 7z / ...
        |
        v
    Filesystem
```

## Package Responsibilities

### `packages/core`

Owns platform/runtime concerns:

- HTTP/API
- authentication
- persistence orchestration
- storage
- uploads/downloads
- jobs
- events
- database integration
- plugin runtime

Core must not contain plugin-specific processing logic.

### `packages/shared`

Owns public cross-package contracts:

- TypeScript types
- validation schemas
- plugin contracts
- job/event contracts
- storage-facing public interfaces where needed

Keep this package dependency-light and free of Core internals.

### `packages/web`

Owns the Vue 3 frontend/PWA.

The web package consumes public API/contracts and must not depend on server internals.

### `plugins/<id>`

Owns plugin-specific functionality:

- plugin business logic
- adapters to mature OSS tools/libraries
- plugin jobs
- plugin UI integration

Plugins must use public Nexus contracts/services and must not import Core internals.

## Data and Storage

SQLite stores metadata and application state.
SQLite runs in WAL mode.

Binary file contents belong in filesystem storage, not SQLite.
Temporary artifacts belong in `.tmp/` or a job-specific workspace.

## Jobs

Long-running processing uses Redis + BullMQ.
Workers execute adapters around mature OSS engines.

External CLI execution should:

- use execa
- support AbortController when cancellable
- surface progress when practical
- handle non-zero exit codes
- clean temporary resources with try/finally

## Uploads and Downloads

Resumable uploads use Tus.
Downloads should support streaming and HTTP range behavior where applicable.

## Events

Realtime server-to-client progress/events use SSE.

## Architecture Boundaries

Core != plugin logic.
Plugin != Core internals.
SQLite != binary storage.
OSS engine != Nexus implementation.

## Change Policy

Normal feature tasks must not alter foundational architecture.
Architecture changes require an explicit task and an updated decision record.
