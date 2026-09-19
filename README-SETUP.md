# Nexus Setup Bundle

Copy the contents of this bundle into the root of the existing Nexus repository.

Do not create a project-local `GEMINI.md`; the project-specific context lives in `AGENTS.md`, `.agents/`, and `docs/`.

After copying:

```powershell
git status
```

Review the new files, then commit the foundation if correct:

```powershell
git add .
git commit -m "chore: initialize Nexus project foundation"
```

Then open `START-HERE-PROMPT.md`, copy its contents into Antigravity, and run TASK-001.

The setup bundle intentionally does not scaffold Core/Web/plugin implementation code. TASK-001 starts with public Core contracts in `packages/shared`.
