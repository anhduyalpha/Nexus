# BATCH-002 - Resumable files and useful processing tools

Authorized by the owner's request for consecutive implementation, PR review and merge into a runnable website. This builds on the tested website/QR/library PR, not on an assumed empty repository.

## Deliverables

- Tus upload with resumable chunks, pause/resume UI, persistent completion mapping and bounded staging retention.
- Redis + BullMQ execution with SQLite history, finite states, progress, cancellation, output cleanup and restart handling.
- Authenticated SSE invalidation events, with throttled REST snapshots on the browser; reconnects re-fetch state.
- Trusted bundled adapters: Sharp image resize/conversion, pdf-lib merge/page extraction, Yazl/Yauzl ZIP creation/listing/extraction, FFmpeg audio/video conversion.
- Input/file-count/pixel/page/archive expansion limits; no arbitrary paths, shell commands or remote media URLs.
- Redis is optional for QR and the file library. Job tools show an explicit setup requirement when Redis or their engine is missing.
- Local and Docker start instructions, precise limitations and current-state documentation.

## Verification

Fresh pinned-manager frozen install; all package typechecks and focused tests; production build on Linux and Windows. Real Redis job lifecycle tests and browser upload -> conversion -> download flow on Linux. Malicious archive-path, invalid request, interrupted/cancelled processing and authentication tests must run, not merely exist.

Review and merge only checked commits. Temporary dependency bootstrap must be removed before merge. No automatic execution outside the owner's requested release batch. Do not describe unimplemented advanced office/PDF/audio or archive formats as complete.
