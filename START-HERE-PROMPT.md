# Antigravity Start Prompt — TASK-001

Use the `nexus-builder` agent for this task.

Implement `docs/tasks/TASK-001.md` exactly as written.

Before editing:

1. Read `AGENTS.md`.
2. Read `.agents/rules/00-nexus.md`.
3. Read `.agents/rules/10-architecture.md`.
4. Read `docs/ARCHITECTURE.md`.
5. Read `docs/DECISIONS.md`.
6. Read `docs/tasks/TASK-001.md`.
7. Inspect the current workspace before creating files.

Constraints:

- Foundation → Core contracts → implementation.
- Do not implement Fastify, SQLite/Drizzle, Redis/BullMQ, Tus, SSE endpoints, plugin runtime, plugins, or frontend yet.
- Do not redesign the architecture.
- Do not research alternative stacks.
- Keep `packages/shared` portable and dependency-light.
- Prefer TypeScript/platform primitives over custom abstractions.
- Do not modify unrelated files.
- Run focused verification before completion.

When implementation is complete, invoke the `nexus-reviewer` agent against TASK-001 and fix any concrete failures that are within TASK-001 scope.

Final response must contain only:

### Changed
### Verified
### Remaining
