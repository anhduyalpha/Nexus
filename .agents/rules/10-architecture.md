# Nexus Architecture Rules

Primary reference:

@../../docs/ARCHITECTURE.md

## Structure

`packages/core`
→ Nexus backend/runtime

`packages/shared`
→ shared types/contracts/schemas

`packages/web`
→ Vue frontend/PWA

`plugins/<id>`
→ plugin-specific functionality

## Core owns

- HTTP/API
- authentication
- storage
- uploads
- downloads
- jobs
- events
- database
- plugin runtime

## Plugins own

- plugin-specific business logic
- processing adapters
- plugin jobs
- plugin UI

## Dependency rule

Prefer:

Plugin
→ public Nexus contract/service
→ Core

Avoid:

Plugin
→ Core internal module

## Processing

Preferred:

Nexus Worker
→ Adapter
→ OSS CLI/library
→ Output
→ Nexus Storage

Do not move mature engine logic into Core.

## Architecture changes

Do not change foundational architecture inside a normal feature task.
Architectural changes require an explicit task.
