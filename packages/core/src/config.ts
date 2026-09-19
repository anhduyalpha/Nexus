import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
const root = fileURLToPath(new URL('../../../', import.meta.url));
export interface Config { host: string; port: number; dataDir: string; webDir: string; token?: string; origins: string[]; maxFileBytes: number; redisUrl?: string; }
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const host = env.NEXUS_HOST || '127.0.0.1';
  const port = z.coerce.number().int().min(1).max(65535).parse(env.NEXUS_PORT || '4310');
  const token = env.NEXUS_TOKEN || undefined;
  if (token && token.length < 16) throw new Error('NEXUS_TOKEN must contain at least 16 characters.');
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !token) throw new Error('Non-loopback binding requires NEXUS_TOKEN.');
  const origins = [`http://localhost:${port}`, `http://127.0.0.1:${port}`, 'http://localhost:5173', 'http://127.0.0.1:5173'];
  if (env.NEXUS_ORIGIN) {
    const url = new URL(env.NEXUS_ORIGIN);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/') throw new Error('NEXUS_ORIGIN must be an HTTP(S) origin.');
    origins.push(url.origin);
  }
  return { host, port, token, origins, dataDir: resolve(root, env.NEXUS_DATA_DIR || 'data'), webDir: resolve(root, 'packages/web/dist'), maxFileBytes: 100 * 1024 * 1024, redisUrl: env.NEXUS_REDIS_URL || undefined };
}
