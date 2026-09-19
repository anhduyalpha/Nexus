import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, stat } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { Readable } from 'node:stream';
import type { JsonValue, StoredFile, TaskJob, ToolPlugin } from '@nexus/shared';
import type { Config } from './config.ts';
import type { NexusDatabase } from './database.ts';
import type { Storage } from './storage-service.ts';
import { JobStore } from './job-store.ts';

export interface JobRuntime {
  readonly store: JobStore;
  readonly available: boolean;
  readonly reason: string | undefined;
  submit(tool: string, input: JsonValue, fileIds: string[]): Promise<TaskJob>;
  cancel(id: string): Promise<TaskJob | undefined>;
  close(): Promise<void>;
}
export async function setupJobs(config: Config, db: NexusDatabase, storage: Storage, plugins: ReadonlyMap<string, ToolPlugin>, changed: () => void): Promise<JobRuntime> {
  const store = new JobStore(db);
  const controllers = new Map<string, AbortController>();
  let queue: Queue<{ id: string }> | undefined;
  let worker: Worker<{ id: string }> | undefined;
  let closing = false;
  let reason: string | undefined;
  for (const record of store.list(true)) if (record.status === 'running') store.patch(record.id, { status: 'failed', message: 'Server stopped during processing. Submit the task again.' });

  async function execute(id: string): Promise<void> {
    const record = store.get(id);
    if (!record || record.status !== 'pending') return;
    const plugin = plugins.get(record.tool);
    if (!plugin) { store.patch(id, { status: 'failed', message: 'Tool is not installed.' }); changed(); return; }
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(180000)]);
    controllers.set(id, controller);
    const outputs: StoredFile[] = [];
    let dir: string | undefined;
    store.patch(id, { status: 'running', percent: 1, message: 'Starting' }, true); changed();
    try {
      const files = record.fileIds.map(fileId => {
        const file = db.file(fileId);
        if (!file) throw new Error('An input file was deleted.');
        return { ...file, path: storage.path(fileId) };
      });
      const root = join(config.dataDir, '.work');
      await mkdir(root, { recursive: true });
      dir = await mkdtemp(join(root, `job-${id}-`));
      const canonical = await realpath(dir);
      const artifacts = await plugin.run(record.input, {
        signal, workDir: dir, files,
        progress(percent, message = 'Processing') {
          if (!Number.isFinite(percent)) return;
          store.patch(id, { percent: Math.max(1, Math.min(99, Math.round(percent))), message: message.slice(0, 200) }, true);
          changed();
        },
      });
      signal.throwIfAborted();
      if (artifacts.length > 200) throw new Error('Too many output files.');
      let totalBytes = 0;
      for (const artifact of artifacts) {
        signal.throwIfAborted();
        let source: Readable;
        if (artifact.data !== undefined) {
          totalBytes += artifact.data.byteLength;
          source = Readable.from([artifact.data]);
        } else {
          const path = await realpath(artifact.path);
          const child = relative(canonical, path);
          if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Output escaped the job workspace.');
          const metadata = await stat(path);
          if (!metadata.isFile()) throw new Error('Output is not a regular file.');
          totalBytes += metadata.size;
          source = createReadStream(path);
        }
        if (totalBytes > config.maxFileBytes) { source.destroy(); throw new Error('Combined output exceeds the file limit.'); }
        outputs.push(await storage.save(source, artifact.name, artifact.mime, record.tool));
      }
      signal.throwIfAborted();
      if (store.get(id)?.status !== 'running') throw new Error('Job is no longer active.');
      store.patch(id, { status: 'completed', percent: 100, output: outputs, message: 'Completed' }, true);
      changed();
    } catch (error) {
      for (const file of outputs) await storage.remove(file.id).catch(() => undefined);
      if (store.get(id)?.status !== 'cancelled') store.patch(id, { status: 'failed', output: [], message: signal.aborted ? 'Processing interrupted or exceeded the 3-minute limit.' : 'Could not process this input. Check the format, selected pages, file count and size limits.' }, true);
      changed();
      if (store.get(id)?.status !== 'cancelled') throw new Error('Nexus processing failed');
    } finally {
      controllers.delete(id);
      if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  if (config.redisUrl) {
    let probe: Redis | undefined;
    try {
      const url = new URL(config.redisUrl);
      if (!['redis:', 'rediss:'].includes(url.protocol)) throw new Error('Unsupported Redis protocol');
      probe = new Redis(config.redisUrl, { lazyConnect: true, connectTimeout: 1500, maxRetriesPerRequest: 1, retryStrategy: () => null, enableOfflineQueue: false });
      probe.on('error', () => undefined);
      await probe.connect(); await probe.ping(); probe.disconnect();
      const connection: ConnectionOptions = {
        host: url.hostname, port: Number(url.port || 6379),
        ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
        ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
        db: Number(url.pathname.slice(1) || 0),
        ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
        maxRetriesPerRequest: null,
      };
      const prefix = `nexus-${createHash('sha256').update(config.dataDir).digest('hex').slice(0, 12)}`;
      queue = new Queue<{ id: string }>('tools', { connection: { ...connection, maxRetriesPerRequest: 1, enableOfflineQueue: false }, prefix });
      queue.on('error', () => undefined);
      await queue.waitUntilReady();
      worker = new Worker<{ id: string }>('tools', job => execute(job.data.id), { connection, prefix, concurrency: 1, autorun: false });
      worker.on('error', () => undefined);
      worker.on('failed', job => {
        if (job) store.patch(job.data.id, { status: 'failed', message: 'Worker could not finish this task.' }, true);
        changed();
      });
      for (const record of store.list(true)) if (!await queue.getJob(record.id)) store.patch(record.id, { status: 'failed', message: 'Queue state was lost. Submit this task again.' });
      void worker.run().catch(() => undefined);
    } catch {
      probe?.disconnect();
      await worker?.close(true).catch(() => undefined);
      await queue?.close().catch(() => undefined);
      worker = undefined; queue = undefined;
      reason = 'Redis is unavailable. Start Redis and restart Nexus to enable processing tools.';
    }
  } else reason = 'Start Redis and set NEXUS_REDIS_URL to enable queued processing. QR and the file library work without it.';

  return {
    store, available: Boolean(queue), reason,
    async submit(tool, input, fileIds) {
      if (closing || !queue || (await queue.client).status !== 'ready') throw Object.assign(new Error(reason || 'Queue is unavailable.'), { statusCode: 503 });
      if (store.list(true).length >= 20) throw Object.assign(new Error('At most 20 jobs may be pending or running.'), { statusCode: 429 });
      const now = new Date().toISOString();
      const record: TaskJob = { id: randomUUID(), tool, input, fileIds, status: 'pending', output: [], percent: 0, message: 'Queued', createdAt: now, updatedAt: now };
      store.add(record);
      try { await queue.add('process', { id: record.id }, { jobId: record.id, attempts: 1, removeOnComplete: { count: 100 }, removeOnFail: { count: 100 } }); }
      catch { store.patch(record.id, { status: 'failed', message: 'Could not enqueue. Check Redis and submit again.' }); changed(); throw Object.assign(new Error('Queue is unavailable.'), { statusCode: 503 }); }
      changed(); return store.get(record.id)!;
    },
    async cancel(id) {
      const record = store.get(id);
      if (!record || !['pending', 'running'].includes(record.status)) return record;
      store.patch(id, { status: 'cancelled', message: 'Cancelled', output: [] }, true);
      controllers.get(id)?.abort();
      if (queue) { const queued = await queue.getJob(id).catch(() => undefined); if (queued) await queued.remove().catch(() => undefined); }
      changed(); return store.get(id);
    },
    async close() {
      closing = true;
      for (const controller of controllers.values()) controller.abort();
      await worker?.close(); await queue?.close();
    },
  };
}
