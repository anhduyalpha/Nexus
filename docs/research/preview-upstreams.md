# Selected upstreams for the runnable preview

Checked 2026-09-19. These are implementation selections, not claims that every possible engine has been evaluated.

- Fastify 5: https://fastify.dev/docs/latest/Reference/Server/ - HTTP lifecycle, injection tests, shutdown.
- @fastify/static: https://github.com/fastify/fastify-static - built web distribution only; never mount the data directory.
- @fastify/cookie: https://github.com/fastify/fastify-cookie - signed HttpOnly sessions.
- better-sqlite3 and Drizzle: https://github.com/WiseLibs/better-sqlite3 and https://github.com/drizzle-team/drizzle-orm - local metadata, WAL, parameterized queries.
- node-qrcode: https://github.com/soldair/node-qrcode - PNG/SVG QR encoding; Nexus supplies validation, storage and interface, not a new QR engine.
- Vue/Vite/Tailwind: https://vite.dev/guide/ and https://tailwindcss.com/docs/installation/using-vite - browser application and build.

Selected dependency ranges are resolved by the pinned pnpm 12.4.2 on GitHub Actions; committed lockfile and fresh frozen installs are the reproducibility checks.
