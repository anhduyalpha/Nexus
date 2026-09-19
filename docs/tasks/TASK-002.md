# TASK-002 - Establish Monorepo Package Foundation

## Goal

Establish the package-level foundation of the Nexus pnpm workspace around the public contracts accepted in TASK-001. Do not implement application runtime behavior yet.

## Read

- `AGENTS.md`
- `.agents/rules/00-nexus.md`
- `.agents/rules/10-architecture.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/CURRENT.md`
- Root package/workspace/TypeScript configuration
- Existing `packages/shared`

## Scope

Create the minimum private TypeScript package foundation for `packages/core` and `packages/web`. Each package needs a package manifest, package-specific tsconfig, and a minimal source boundary.

Core and Web must consume `@nexus/shared` through its public package entrypoint, using `workspace:*` dependencies. Do not add speculative domain APIs or re-export Shared under redundant wrapper types merely to populate the new packages.

An empty source module is sufficient for the application boundary. Prove actual consumption of Shared with focused package-resolution tests and compile-only contract fixtures.

## Dependency direction

- `@nexus/core` -> `@nexus/shared`
- `@nexus/web` -> `@nexus/shared`
- Shared must remain independent of Core and Web.
- No Core -> Web dependency or Web -> Core internals.
- No circular workspace dependencies.
- No production code using Shared private source subpaths.

A negative test may attempt a private import specifically to prove it is rejected.

## TypeScript and package tooling

Reuse the root TypeScript configuration. Keep overrides package-specific.

Core targets the Node environment. Web targets browser globals and must not implicitly inherit ambient Node globals from root development dependencies. Shared contracts must typecheck in both environments.

Keep typechecking non-emitting. Do not introduce a build system, bundler, task runner, or monorepo framework. Keep the existing root recursive typecheck/test scripts unless a concrete blocker requires a change.

Preserve the accepted Shared contracts. Do not add runtime dependencies except the local Shared workspace dependency. Retain the existing Node 24 runtime target and pinned pnpm version.

Update dependency state with the configured package manager, then verify a frozen install. A minimal CI job running the same required checks is verification support only, not application runtime.

## Focused checks

- Core can import public Shared runtime helpers and contract types by package name.
- Private Shared subpaths remain blocked by the existing exports map.
- Web can consume public Shared contracts with browser platform types.
- Compile-only negative checks reject mixed identifier brands and Node-only browser globals.
- Do not add placeholder tests that only assert true.
- Browser fixtures are typechecked, not executed as Node tests; no UI or browser runtime exists yet.

## Do not

Do not initialize Fastify, Vue, Vite, Tailwind, shadcn-vue, database libraries, Redis/BullMQ, storage, jobs, workers, uploads/downloads, SSE, plugin runtime, or utility plugins.

Do not redesign Shared contracts or the repository architecture. Do not add Turborepo, Nx, Rush, or speculative package abstractions. Do not start TASK-003.

## Verification

Run and record actual results:

```text
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
git diff --check
```

Also typecheck each package independently and inspect workspace manifests for the required acyclic dependency direction. Do not claim checks executed on an environment or runtime that was not used.

## Acceptance criteria

1. `@nexus/core` and `@nexus/web` are valid private workspace packages.
2. Internal dependencies use `workspace:*`.
3. Both packages consume Shared public contracts without production deep imports.
4. Shared remains independent and its TASK-001 implementation is preserved.
5. All workspace packages typecheck, including browser isolation checks.
6. Existing tests and focused package-boundary tests pass.
7. A frozen install accepts the package-manager-generated lockfile.
8. No application framework or runtime subsystem is introduced.
9. Changes are limited to package foundation, its task specification, and focused verification support.
10. TASK-003 is not started.

## Completion report

### Changed

List package foundation changes.

### Verified

List commands actually executed, environment, and results.

### Remaining

List unresolved TASK-002 work and pending review/merge status.
