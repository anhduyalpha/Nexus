import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import serveStatic from '@fastify/static';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z, ZodError } from 'zod';
import { tools } from '@nexus/tools';
import type { ToolPlugin } from '@nexus/shared';
import { loadConfig, type Config } from './config.ts';
import { openDatabase } from './database.ts';
import { Storage, byteRange, validId } from './storage-service.ts';
export async function createApp(config: Config = loadConfig(), plugins: readonly ToolPlugin[] = tools) {
  const app = Fastify({ logger: { level: 'warn', redact: ['req.headers.cookie', 'req.headers.authorization', 'body.token'] }, bodyLimit: 1024 * 1024, requestTimeout: 120000 });
  const db = openDatabase(config.dataDir);
  const storage = new Storage(config.dataDir, db, config.maxFileBytes);
  const registry = new Map(plugins.map(plugin => [plugin.descriptor.id, plugin]));
  if (registry.size !== plugins.length) throw new Error('Duplicate tool id');
  await app.register(cookie, { secret: randomBytes(32).toString('hex') });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  const allowedHosts = new Set(config.origins.map(origin => new URL(origin).hostname));
  function authorized(request: { cookies: Record<string, string | undefined>; unsignCookie(value: string): { valid: boolean; value: string | null } }) {
    if (!config.token) return true;
    const raw = request.cookies.nexus;
    if (!raw) return false;
    const value = request.unsignCookie(raw);
    return value.valid && value.value !== null && Number(value.value) > Date.now();
  }
  app.addHook('onRequest', async (request, reply) => {
    let host: URL;
    try { host = new URL(`http://${request.headers.host || ''}`); } catch { return reply.code(400).send({ error: 'Invalid host' }); }
    if (host.username || host.password || !allowedHosts.has(host.hostname)) return reply.code(403).send({ error: 'Host not allowed' });
    const origin = request.headers.origin;
    if (origin && !config.origins.includes(origin)) return reply.code(403).send({ error: 'Origin not allowed' });
    reply.header('X-Content-Type-Options', 'nosniff').header('Referrer-Policy', 'no-referrer').header('Cross-Origin-Resource-Policy', 'same-origin');
    reply.header('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    if (request.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
    const path = request.url.split('?')[0];
    if (path.startsWith('/api/') && path !== '/api/health' && path !== '/api/session' && !authorized(request)) return reply.code(401).send({ error: 'Sign in with your Nexus access token' });
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ error: error.issues.map(item => `${item.path.join('.') || 'input'}: ${item.message}`).join('; ') });
    const code = error instanceof Error && 'statusCode' in error ? error.statusCode : undefined;
    const status = typeof code === 'number' && code >= 400 && code < 500 ? code : 500;
    if (status === 500) request.log.error({ err: error }, 'Request failed');
    return reply.code(status).send({ error: status === 500 || !(error instanceof Error) ? 'Processing failed. Check the input format or server log.' : error.message });
  });
  app.get('/api/health', async () => ({ status: 'ok', version: '0.2.0' }));
  app.get('/api/session', async request => ({ authenticated: authorized(request), protected: Boolean(config.token) }));
  app.post('/api/session', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const input = z.object({ token: z.string().max(512) }).strict().parse(request.body);
    const hash = (text: string) => createHash('sha256').update(text).digest();
    if (config.token && !timingSafeEqual(hash(input.token), hash(config.token))) return reply.code(401).send({ error: 'Invalid access token' });
    reply.setCookie('nexus', String(Date.now() + 86400000), { path: '/', httpOnly: true, sameSite: 'strict', secure: config.origins.some(origin => origin.startsWith('https:')), signed: true, maxAge: 86400 });
    return { authenticated: true };
  });
  app.delete('/api/session', async (_request, reply) => { reply.clearCookie('nexus', { path: '/' }); return { authenticated: false }; });
  app.get('/api/tools', async () => ({ tools: plugins.map(plugin => ({ ...plugin.descriptor, available: plugin.descriptor.mode === 'instant' })), jobsAvailable: false, maxFileBytes: config.maxFileBytes }));
  app.get('/api/files', async () => ({ files: db.files() }));
  app.get<{ Params: { id: string }; Querystring: { preview?: string } }>('/api/files/:id', async (request, reply) => {
    const file = validId(request.params.id) ? db.file(request.params.id) : undefined;
    if (!file || !existsSync(storage.path(file.id))) return reply.code(404).send({ error: 'File not found' });
    const inline = request.query.preview === '1' && file.tool !== 'upload' && file.mime === 'image/png';
    reply.type(inline ? 'image/png' : 'application/octet-stream').header('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="download"; filename*=UTF-8''${encodeURIComponent(file.name).replaceAll("'", '%27')}`).header('Accept-Ranges', 'bytes');
    if (request.headers.range) {
      const range = byteRange(request.headers.range, file.bytes);
      if (!range) return reply.code(416).header('Content-Range', `bytes */${file.bytes}`).send();
      return reply.code(206).header('Content-Range', `bytes ${range.start}-${range.end}/${file.bytes}`).header('Content-Length', range.end - range.start + 1).send(storage.stream(file.id, range));
    }
    return reply.header('Content-Length', file.bytes).send(storage.stream(file.id));
  });
  app.delete<{ Params: { id: string } }>('/api/files/:id', async (request, reply) => {
    if (!validId(request.params.id) || !db.file(request.params.id)) return reply.code(404).send({ error: 'File not found' });
    await storage.remove(request.params.id);
    return reply.code(204).send();
  });
  app.post<{ Params: { id: string } }>('/api/tools/:id/run', async (request, reply) => {
    const plugin = registry.get(request.params.id);
    if (!plugin) return reply.code(404).send({ error: 'Tool not found' });
    if (plugin.descriptor.mode !== 'instant') return reply.code(503).send({ error: 'This tool requires the job worker' });
    plugin.validate(request.body);
    const root = join(config.dataDir, '.work');
    await mkdir(root, { recursive: true });
    const dir = await mkdtemp(join(root, 'instant-'));
    try {
      const artifacts = await plugin.run(request.body, { signal: AbortSignal.timeout(30000), files: [], workDir: dir, progress() {} });
      const files = [];
      for (const artifact of artifacts) {
        if (!artifact.data) throw new Error('Instant tools must return bounded output buffers');
        files.push(await storage.save(Readable.from([artifact.data]), artifact.name, artifact.mime, plugin.descriptor.id));
      }
      return { files };
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  if (existsSync(join(config.webDir, 'index.html'))) {
    await app.register(serveStatic, { root: config.webDir });
    app.setNotFoundHandler((request, reply) => request.url.startsWith('/api/') ? reply.code(404).send({ error: 'Not found' }) : reply.sendFile('index.html'));
  }
  app.addHook('onClose', async () => { db.close(); });
  return app;
}
