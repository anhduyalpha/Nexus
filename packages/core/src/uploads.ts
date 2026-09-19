import { Server } from '@tus/server';
import { FileStore } from '@tus/file-store';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { StoredFile } from '@nexus/shared';
import type { Config } from './config.ts';
import type { NexusDatabase } from './database.ts';
import { Storage, safeFilename, validId } from './storage-service.ts';

export async function registerUploads(app: FastifyInstance, config: Config, db: NexusDatabase, storage: Storage): Promise<void> {
  const directory = join(config.dataDir, '.uploads');
  await mkdir(directory, { recursive: true });
  db.sqlite.exec('CREATE TABLE IF NOT EXISTS upload_results (id TEXT PRIMARY KEY, file_id TEXT NOT NULL)');
  const store = new FileStore({ directory, expirationPeriodInMilliseconds: 24 * 60 * 60 * 1000 });
  const finalizing = new Map<string, Promise<StoredFile | undefined>>();
  async function finalize(id: string): Promise<StoredFile | undefined> {
    const existing = db.sqlite.prepare('SELECT file_id FROM upload_results WHERE id = ?').get(id) as { file_id: string } | undefined;
    if (existing) return db.file(existing.file_id);
    const pending = finalizing.get(id);
    if (pending) return pending;
    const completion = (async () => {
      const upload = await store.getUpload(id);
      if (upload.size === undefined || upload.offset !== upload.size) return undefined;
      const file = await storage.save(store.read(id), safeFilename(upload.metadata?.filename || 'upload.bin'), 'application/octet-stream', 'upload');
      try { db.sqlite.prepare('INSERT INTO upload_results (id,file_id) VALUES (?,?)').run(id, file.id); }
      catch (error) { await storage.remove(file.id); throw error; }
      return file;
    })();
    finalizing.set(id, completion);
    try { return await completion; } finally { finalizing.delete(id); }
  }
  const tus = new Server({
    path: '/api/uploads', datastore: store, maxSize: config.maxFileBytes, relativeLocation: true,
    allowedOrigins: config.origins, allowedCredentials: true,
    namingFunction: () => randomUUID(),
    onIncomingRequest: async (_request, id) => { if (id && !validId(id)) throw { status_code: 400, body: 'Invalid upload identifier' }; },
    onUploadCreate: async (_request, upload) => {
      if (!Number.isSafeInteger(upload.size) || !upload.size || upload.size > config.maxFileBytes) throw { status_code: 400, body: 'A known upload size between 1 byte and 100 MB is required' };
      const filename = upload.metadata?.filename;
      if (typeof filename !== 'string' || !filename.length || filename.length > 512) throw { status_code: 400, body: 'A filename is required' };
      return { metadata: { filename: safeFilename(filename) } };
    },
    onUploadFinish: async (_request, upload) => { await finalize(upload.id); return {}; },
  });
  await app.register(async scope => {
    scope.addContentTypeParser('application/offset+octet-stream', (_request, payload, done) => done(null, payload));
    for (const path of ['/api/uploads', '/api/uploads/*']) scope.all(path, async (request, reply) => {
      reply.hijack();
      for (const [name, value] of Object.entries(reply.getHeaders())) if (value !== undefined) reply.raw.setHeader(name, value);
      await tus.handle(request.raw, reply.raw);
    });
  });
  app.get<{ Params: { id: string } }>('/api/upload-results/:id', async (request, reply) => {
    if (!validId(request.params.id)) return reply.code(404).send({ error: 'Upload not found' });
    try {
      const file = await finalize(request.params.id);
      return file ? { file } : reply.code(409).send({ error: 'Upload is incomplete or its library file was deleted' });
    } catch { return reply.code(404).send({ error: 'Upload expired or was not found' }); }
  });
  const cleanup = setInterval(() => { void store.deleteExpired().catch(() => undefined); }, 60 * 60 * 1000);
  cleanup.unref();
  app.addHook('onClose', async () => { clearInterval(cleanup); await Promise.allSettled(finalizing.values()); });
}
