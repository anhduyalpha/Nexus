import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { openDatabase } from '../src/database.ts';
import { Storage, safeFilename } from '../src/storage-service.ts';
import { JobStore } from '../src/job-store.ts';
import { setupJobs } from '../src/jobs-runtime.ts';
import { loadConfig } from '../src/config.ts';

test('Storage bounds streams, cleans partial outputs and survives reopening', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nexus-store-'));
  let db = openDatabase(root);
  try {
    assert.equal(db.sqlite.pragma('journal_mode', { simple: true }), 'wal');
    let storage = new Storage(root, db, 8);
    await assert.rejects(storage.save(Readable.from([Buffer.alloc(9)]), 'large.bin', 'application/octet-stream', 'test'));
    assert.deepEqual(db.files(), []);
    assert.deepEqual(await readdir(join(root, 'storage')), []);
    assert.throws(() => storage.path('../outside'));
    const saved = await storage.save(Readable.from([Buffer.from('bounded')]), '../../input.txt', 'text/plain', 'test');
    assert.equal(saved.name, 'input.txt');
    db.close(); db = openDatabase(root); storage = new Storage(root, db, 8);
    assert.equal(db.file(saved.id)?.bytes, 7);
    await storage.remove(saved.id); assert.equal(db.file(saved.id), undefined);
    assert.equal(safeFilename('C:\\private\\note.txt'), 'note.txt');
  } finally { db.close(); await rm(root, { recursive: true, force: true }); }
});
test('Interrupted jobs are marked failed on restart, not falsely completed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nexus-recovery-'));
  const db = openDatabase(root);
  try {
    const store = new JobStore(db);
    const now = new Date().toISOString();
    store.add({ id: 'interrupted', tool: 'image', status: 'running', input: {}, fileIds: [], output: [], percent: 42, message: 'Working', createdAt: now, updatedAt: now });
    const runtime = await setupJobs({ ...loadConfig({}), dataDir: root, redisUrl: undefined }, db, new Storage(root, db, 1000), new Map(), () => undefined);
    assert.equal(runtime.store.get('interrupted')?.status, 'failed');
    assert.match(runtime.store.get('interrupted')!.message, /Server stopped/);
    assert.equal(runtime.available, false);
    await runtime.close();
  } finally { db.close(); await rm(root, { recursive: true, force: true }); }
});
