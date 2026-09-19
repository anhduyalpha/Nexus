import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { join, basename } from 'node:path';
import type { NexusDatabase } from './database.ts';
export function safeFilename(name: string): string { return basename(name.replaceAll('\\', '/')).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 180) || 'file'; }
export function validId(id: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id); }
export class Storage {
  readonly dataDir: string;
  readonly db: NexusDatabase;
  readonly maxBytes: number;
  constructor(dataDir: string, db: NexusDatabase, maxBytes: number) { this.dataDir = dataDir; this.db = db; this.maxBytes = maxBytes; }
  path(id: string) { if (!validId(id)) throw new Error('Invalid file identifier'); return join(this.dataDir, 'storage', id); }
  async save(source: Readable, name: string, mime: string, tool: string) {
    await mkdir(join(this.dataDir, 'storage'), { recursive: true });
    const id = randomUUID();
    const target = this.path(id);
    const temporary = `${target}.part`;
    let bytes = 0;
    const limit = new Transform({ transform: (chunk: Buffer, _encoding, done) => {
      bytes += chunk.length;
      if (bytes > this.maxBytes) return done(Object.assign(new Error('File exceeds the configured limit'), { statusCode: 413 }));
      done(null, chunk);
    } });
    try {
      await pipeline(source, limit, createWriteStream(temporary, { flags: 'wx' }));
      await rename(temporary, target);
      return this.db.addFile({ id, name: safeFilename(name), mime, bytes, createdAt: new Date().toISOString(), tool });
    } catch (error) { await rm(temporary, { force: true }); await rm(target, { force: true }); throw error; }
  }
  async remove(id: string) { await rm(this.path(id), { force: true }); this.db.removeFile(id); }
  stream(id: string, range?: { start: number; end: number }) { return createReadStream(this.path(id), range); }
}
export function byteRange(header: string, size: number): { start: number; end: number } | undefined {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || size === 0 || (!match[1] && !match[2])) return undefined;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] ? (match[2] ? Math.min(Number(match[2]), size - 1) : size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size || (!match[1] && Number(match[2]) === 0)) return undefined;
  return { start, end };
}
