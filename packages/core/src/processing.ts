import type { FastifyInstance } from 'fastify';
import type { ServerResponse } from 'node:http';
import { z } from 'zod';
import type { JsonValue, ToolPlugin } from '@nexus/shared';
import type { Config } from './config.ts';
import type { NexusDatabase } from './database.ts';
import type { Storage } from './storage-service.ts';
import { setupJobs } from './jobs-runtime.ts';
import { registerUploads } from './uploads.ts';

export async function registerProcessing(app: FastifyInstance, config: Config, db: NexusDatabase, storage: Storage, registry: ReadonlyMap<string, ToolPlugin>): Promise<{ usesFile(id: string): boolean }> {
  const streams = new Set<ServerResponse>();
  function broadcast(message: string) {
    for (const response of streams) {
      if (response.destroyed || response.writableEnded || response.writableLength > 65536) { response.destroy(); streams.delete(response); continue; }
      try { response.write(message); } catch { response.destroy(); streams.delete(response); }
    }
  }
  // Small invalidation events avoid sending large historical output lists on every progress tick.
  // Clients throttle REST refreshes; reconnecting always starts with a fresh snapshot request.
  const runtime = await setupJobs(config, db, storage, registry, () => broadcast('event: changed\ndata: {}\n\n'));
  const reasons = new Map<string, string>();
  for (const [id, plugin] of registry) {
    if (plugin.checkAvailability) {
      try { const reason = await plugin.checkAvailability(); if (reason) reasons.set(id, reason); }
      catch { reasons.set(id, 'The processing engine is unavailable.'); }
    }
  }
  await registerUploads(app, config, db, storage);
  app.get('/api/tools', async () => ({
    tools: [...registry.values()].map(plugin => {
      const reason = plugin.descriptor.mode === 'job' && !runtime.available ? runtime.reason : reasons.get(plugin.descriptor.id);
      return { ...plugin.descriptor, available: !reason, ...(reason ? { reason } : {}) };
    }),
    jobsAvailable: runtime.available, maxFileBytes: config.maxFileBytes,
  }));
  app.get('/api/jobs', async () => ({ jobs: runtime.store.list() }));
  app.post('/api/jobs', async (request, reply) => {
    const input = z.object({ tool: z.string().min(1).max(80), input: z.record(z.unknown()).default({}), fileIds: z.array(z.string().uuid()).min(1).max(30) }).strict().parse(request.body);
    const plugin = registry.get(input.tool);
    if (!plugin || plugin.descriptor.mode !== 'job') return reply.code(400).send({ error: 'Unknown processing tool' });
    if (reasons.has(input.tool)) return reply.code(503).send({ error: reasons.get(input.tool) });
    plugin.validate(input.input);
    let total = 0;
    for (const id of input.fileIds) { const file = db.file(id); if (!file) return reply.code(400).send({ error: 'An input file was not found' }); total += file.bytes; }
    if (total > config.maxFileBytes) return reply.code(413).send({ error: 'Combined input is limited to 100 MB' });
    return reply.code(202).send({ job: await runtime.submit(input.tool, input.input as JsonValue, input.fileIds) });
  });
  app.get<{ Params: { id: string } }>('/api/jobs/:id', async (request, reply) => {
    const job = runtime.store.get(request.params.id);
    return job ? { job } : reply.code(404).send({ error: 'Job not found' });
  });
  app.post<{ Params: { id: string } }>('/api/jobs/:id/cancel', async (request, reply) => {
    const job = await runtime.cancel(request.params.id);
    return job ? { job } : reply.code(404).send({ error: 'Job not found' });
  });
  app.get('/api/events', async (_request, reply) => {
    if (streams.size >= 16) return reply.code(429).send({ error: 'Too many event connections' });
    reply.hijack();
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff' });
    reply.raw.write('retry: 3000\nevent: changed\ndata: {}\n\n');
    streams.add(reply.raw);
    reply.raw.once('close', () => streams.delete(reply.raw));
    reply.raw.on('error', () => { streams.delete(reply.raw); reply.raw.destroy(); });
  });
  const heartbeat = setInterval(() => broadcast(': heartbeat\n\n'), 15000);
  heartbeat.unref();
  app.addHook('preClose', async () => { clearInterval(heartbeat); for (const stream of streams) stream.end(); streams.clear(); await runtime.close(); });
  return { usesFile: (id: string) => runtime.store.usesFile(id) };
}
