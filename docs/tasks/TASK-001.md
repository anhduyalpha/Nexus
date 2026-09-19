# TASK-001 — Establish Nexus Core Contracts

## Goal

Create the first stable public contracts for Nexus before implementing Fastify, persistence, queues, uploads, UI, or plugins.

This task establishes the dependency direction that later packages must follow.

## Read

Before editing:

- `AGENTS.md`
- `.agents/rules/00-nexus.md`
- `.agents/rules/10-architecture.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`

Do not read unrelated docs unless needed.

## Scope

Implement only the initial `packages/shared` package and the minimum root tooling needed to typecheck/test it.

Create or update only files required for:

- workspace-level TypeScript configuration
- `packages/shared/package.json`
- `packages/shared/tsconfig.json`
- public contract source files under `packages/shared/src/`
- focused tests for those contracts

Do not implement Core runtime behavior.

## Required Public Contracts

Define small, explicit contracts for:

### Plugin identity

A plugin descriptor/manifest that can represent at minimum:

- stable plugin id
- display name
- version
- optional description

Do not add discovery/loading behavior yet.

### Job model

Public types for a generic Nexus job lifecycle that can represent at minimum:

- job id
- plugin id
- job kind/type
- state
- progress
- created/started/completed timestamps where applicable
- failure information where applicable

Keep job state generic enough for future BullMQ integration without importing BullMQ types.

### Event model

Public event types suitable for future SSE transport.

At minimum support:

- job state change
- job progress
- job completion
- job failure

Transport concerns do not belong in these contracts.

### Storage references

A public file/storage reference type that identifies stored artifacts without exposing filesystem implementation details.

Do not implement storage services yet.

### Cancellation boundary

Define the minimal public shape needed for cancellable processing without creating a custom cancellation framework.

Prefer platform primitives such as `AbortSignal` where possible.

## Validation

Use a lightweight schema validation approach only if it is clearly useful at the public boundary.

Do not add a large dependency graph.
Do not add runtime frameworks.

## Dependency Rules

`packages/shared` must:

- not import from `packages/core`
- not import from `packages/web`
- not import from `plugins/*`
- not import Fastify, BullMQ, Redis, Drizzle, Tus, Vue, or filesystem-specific modules

It should remain portable and dependency-light.

## Do Not

- Do not scaffold Fastify.
- Do not implement SQLite/Drizzle.
- Do not configure Redis/BullMQ.
- Do not implement Tus.
- Do not implement SSE endpoints.
- Do not implement plugin loading/discovery.
- Do not create the QR plugin.
- Do not create frontend code.
- Do not redesign the architecture.
- Do not research alternative stacks.

## Acceptance Criteria

The task is complete when:

1. `packages/shared` is a valid workspace package.
2. Public contracts are exported through a clear package entrypoint.
3. The package typechecks successfully.
4. Focused tests pass.
5. No runtime/framework dependency has leaked into the shared contracts.
6. No Core, Web, or plugin implementation has been created as part of this task.
7. `git diff` contains only the minimum files needed for TASK-001.

## Completion Report

Return exactly these sections:

### Changed

List files and contracts created.

### Verified

List commands run and their results.

### Remaining

List intentionally deferred work.
