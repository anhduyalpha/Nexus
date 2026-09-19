import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../src/index.ts';
import {
  createJobId,
  createPluginId,
  createPluginDescriptor,
  isJobTerminal,
  type Job,
  type JobExecutionContext,
} from '@nexus/shared';

test('Core consumes Shared through the installed public package entrypoint', () => {
  const plugin = createPluginDescriptor(createPluginId('boundary-check'), 'Boundary check', '0.1.0');
  const job: Job<null> = {
    id: createJobId('job-boundary-check'),
    pluginId: plugin.id,
    type: 'boundary-check',
    status: 'pending',
    input: null,
    createdAt: '2026-09-19T00:00:00.000Z',
  };
  const controller = new AbortController();
  const context: JobExecutionContext = { signal: controller.signal };

  assert.equal(job.pluginId, plugin.id);
  assert.equal(isJobTerminal(job.status), false);
  controller.abort();
  assert.equal(context.signal.aborted, true);
});

test('Shared does not expose private source subpaths to consumers', async () => {
  // A variable keeps this an actual Node package-resolution check, not a TS error.
  const privateSubpath = '@nexus/shared/src/ids.ts';
  await assert.rejects(import(privateSubpath), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
});
