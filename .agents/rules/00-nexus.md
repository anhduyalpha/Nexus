# Nexus Core Rules

Apply to all Nexus work.

## Reuse

Reuse mature existing implementations before creating equivalent logic.

When the task provides an upstream repository or implementation:

- inspect the specified source
- reuse it where practical
- do not research alternatives unless it is unusable
- do not recreate equivalent logic

## Scope

- Implement only the requested task.
- Do not modify unrelated modules.
- Do not perform broad refactors.
- Do not replace dependencies without a concrete reason.
- Do not introduce speculative abstractions.

## Verification

Before completion:

- inspect the changed files
- run relevant tests/checks
- verify the resulting behavior

Never report success without verification.

## Runtime

External CLI execution:

- use execa
- use AbortController for cancellable work
- handle non-zero exit codes
- clean temporary resources with try/finally

## Files

- Stream large files where practical.
- Never load entire large files into memory without a concrete reason.
- Keep temporary artifacts out of final storage.

## Boundaries

Plugins use public Nexus contracts/services.
Plugins must not import Core internals.
Core must not contain plugin-specific processing logic.

## Communication

Do not narrate tool execution.

Final task report:

- Changed
- Verified
- Remaining
