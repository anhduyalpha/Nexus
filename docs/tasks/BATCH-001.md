# BATCH-001 - Runnable Nexus preview

The owner explicitly requested consecutive implementation, PR review, and merge in one session, with a website they can pull and run. This authorizes a bounded release batch rather than automatic execution of the old tentative task-number map.

## Milestones

1. Core process/configuration, Fastify HTTP shell, local access boundary, and graceful shutdown.
2. Browser application shell using Vue 3, Vite, Tailwind and Lucide; mobile and desktop layouts.
3. SQLite WAL/Drizzle metadata and streamed file storage/download/range/delete.
4. Trusted bundled plugin boundary and real QR creation using node-qrcode.
5. Resumable upload, persistent jobs, progress/cancellation, and file-processing utilities in a subsequent batch PR.
6. End-to-end verification, usage documentation, and truthful current-state/roadmap checkpoint.

Do not claim the unbounded future PDF/Image/Audio expansion roadmap is complete. A feature is complete only if its implementation and checks exist; unavailable engines must be visible as unavailable, never simulated.

## Acceptance for the initial PR

- pnpm dev opens a working website at 127.0.0.1:5173.
- pnpm build + pnpm start serves the website and API at 127.0.0.1:4310.
- QR PNG/SVG creation, file listing, download, range and delete work through HTTP.
- Data stays on the host; no analytics, cloud processing, or external fonts.
- Remote binding without a token is rejected; signed HttpOnly sessions and host/origin checks protect API access.
- Unit/integration typechecks/tests and production build pass on Ubuntu and Windows.
- Browser checks cover the create/download/library journey and responsive overflow.
- Keep main unchanged until PR checks and review pass.
