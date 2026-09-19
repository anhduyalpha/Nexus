import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { TaskJob, ToolPlugin } from '@nexus/shared';
import { tools, qrPlugin } from '@nexus/tools';
import { createApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
const enabled = Boolean(process.env.NEXUS_TEST_REDIS_URL);
async function fixture(t: TestContext, plugins: readonly ToolPlugin[] = tools) {
  const root = await mkdtemp(join(tmpdir(), 'nexus-jobs-'));
  const app = await createApp({ ...loadConfig({}), dataDir: root, webDir: join(root, 'none'), redisUrl: process.env.NEXUS_TEST_REDIS_URL }, plugins);
  t.after(async () => { await app.close(); await rm(root, { recursive: true, force: true }); });
  const generated = await app.inject({ method: 'POST', url: '/api/tools/qr/run', payload: { text: 'Job input' } });
  assert.equal(generated.statusCode, 200, generated.body);
  return { app, root, fileId: generated.json().files[0].id as string };
}
async function waitFor(get: () => Promise<TaskJob>, predicate: (value: TaskJob) => boolean): Promise<TaskJob> {
  for (let index = 0; index < 100; index++) { const value = await get(); if (predicate(value)) return value; await delay(100); }
  throw new Error('Job did not reach the expected state');
}
test('Real Redis worker converts a file and persists its output metadata', { skip: !enabled, timeout: 30000 }, async t => {
  const { app, fileId } = await fixture(t);
  const queued = await app.inject({ method: 'POST', url: '/api/jobs', payload: { tool: 'image', input: { format: 'webp', width: 128 }, fileIds: [fileId] } });
  assert.equal(queued.statusCode, 202, queued.body);
  const id = queued.json().job.id;
  const result = await waitFor(async () => (await app.inject(`/api/jobs/${id}`)).json().job, job => ['completed', 'failed'].includes(job.status));
  assert.equal(result.status, 'completed', result.message); assert.equal(result.percent, 100); assert.equal(result.output[0].mime, 'image/webp');
  const downloaded = await app.inject(`/api/files/${result.output[0].id}`);
  assert.equal(downloaded.rawPayload.subarray(0, 4).toString(), 'RIFF');
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/files/${fileId}` })).statusCode, 204);
});
test('Cancellation aborts active work, prevents deletion races and cleans temporary files', { skip: !enabled, timeout: 30000 }, async t => {
  const slow: ToolPlugin = {
    descriptor: { id: 'test-delay', name: 'Test delay', description: 'Test fixture only', category: 'create', mode: 'job' },
    validate() {},
    async run(_input, context) { context.progress(25, 'Working'); await delay(10000, undefined, { signal: context.signal }); return [{ name: 'should-not-exist.txt', mime: 'text/plain', data: Buffer.from('unexpected') }]; },
  };
  const { app, root, fileId } = await fixture(t, [qrPlugin, slow]);
  const queued = await app.inject({ method: 'POST', url: '/api/jobs', payload: { tool: 'test-delay', input: {}, fileIds: [fileId] } });
  assert.equal(queued.statusCode, 202, queued.body); const id = queued.json().job.id;
  await waitFor(async () => (await app.inject(`/api/jobs/${id}`)).json().job, job => job.status === 'running');
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/files/${fileId}` })).statusCode, 409);
  assert.equal((await app.inject({ method: 'POST', url: `/api/jobs/${id}/cancel` })).json().job.status, 'cancelled');
  for (let index = 0; index < 50 && (await readdir(join(root, '.work'))).length; index++) await delay(50);
  assert.deepEqual(await readdir(join(root, '.work')), []);
  assert.equal((await app.inject('/api/files')).json().files.length, 1);
  assert.equal((await app.inject(`/api/jobs/${id}`)).json().job.output.length, 0);
});
test('Worker failure is persisted without publishing partial results', { skip: !enabled, timeout: 30000 }, async t => {
  const broken: ToolPlugin = { descriptor: { id: 'test-failure', name: 'Failure', description: 'Test fixture only', category: 'create', mode: 'job' }, validate() {}, async run() { throw new Error('Intentional failure'); } };
  const { app, fileId } = await fixture(t, [qrPlugin, broken]);
  const response = await app.inject({ method: 'POST', url: '/api/jobs', payload: { tool: 'test-failure', input: {}, fileIds: [fileId] } });
  assert.equal(response.statusCode, 202, response.body); const id = response.json().job.id;
  const result = await waitFor(async () => (await app.inject(`/api/jobs/${id}`)).json().job, job => job.status === 'failed');
  assert.deepEqual(result.output, []); assert.equal((await app.inject('/api/files')).json().files.length, 1);
});
