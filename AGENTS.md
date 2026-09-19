# Nexus Agent Context

## Identity

Nexus is a private, single-user, self-hosted personal utility platform.

It replaces many everyday utility websites with one private application running on the owner's hardware.

Typical capabilities:

- file conversion
- PDF tools
- archive tools
- QR generation
- image/media processing
- future utility plugins

## Product Principle

Nexus integrates proven software instead of reinventing mature processing logic.

Preferred model:

Nexus UI
→ Plugin
→ Adapter
→ Existing OSS engine/library/CLI
→ Nexus Storage

## Agent Role

The Lead Orchestrator defines:

- product requirements
- architecture
- repository research
- upstream implementation selection
- task decomposition
- implementation prompts

Antigravity agents implement those predefined tasks.

Do not independently redesign established architecture.
Do not independently research alternative repositories when the task already specifies an upstream implementation.

## Engineering Principles

- Reuse before create.
- Keep changes narrowly scoped.
- Prefer existing Nexus abstractions.
- Do not refactor unrelated code.
- Do not invent speculative abstractions.
- Verify before declaring completion.
- Keep context and tool output small.
- Inspect targeted files before editing.

## Processing

Long-running external processing should normally:

- run through the Nexus job system
- use execa for CLI execution
- support AbortController
- report progress where practical
- clean temporary resources with try/finally

## Files

Large files should be streamed whenever practical.
Binary file contents belong in filesystem storage, not SQLite.
Temporary files belong in `.tmp/` or the job-specific temporary workspace.

## Architecture

Read `docs/ARCHITECTURE.md` before architecture-sensitive changes.

Core and plugins have separate responsibilities.
Plugins must not depend on Core internals.

## Documentation

- Product: `docs/PRODUCT.md`
- Architecture: `docs/ARCHITECTURE.md`
- Roadmap: `docs/ROADMAP.md`
- Architecture decisions: `docs/DECISIONS.md`
- Task specifications: `docs/tasks/`
- Upstream research: `docs/research/`

## Completion

Every implementation task must report:

- Changed
- Verified
- Remaining

Also identify the upstream implementation reused when applicable.
