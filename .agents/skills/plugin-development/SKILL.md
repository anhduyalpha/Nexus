---
name: nexus-plugin-development
description: Implement Nexus plugins using established plugin contracts and adapters.
---

# Nexus Plugin Development

Read:

- `docs/ARCHITECTURE.md`
- the relevant task file
- relevant existing plugins

Workflow:

1. Inspect existing plugin patterns.
2. Use the upstream implementation selected by the Lead Orchestrator.
3. Implement only Nexus-specific integration.
4. Use public Nexus contracts.
5. Add cancellation, progress and cleanup for long-running work.
6. Test the plugin through the real Nexus path.

Do not recreate mature processing logic.
Do not redesign the plugin architecture.
