// Compile-only checks, included by this package's tsconfig; never execute this file.
import type {
  Job,
  JobExecutionContext,
  JobId,
  NexusEvent,
  PluginDescriptor,
  PluginId,
  StorageReference,
} from '@nexus/shared';

declare const jobId: JobId;
declare const pluginId: PluginId;
declare const reference: StorageReference;
declare const event: NexusEvent;

const plugin: PluginDescriptor = {
  id: pluginId,
  name: 'Browser contract check',
  version: '0.1.0',
};
const job: Job<{ source: StorageReference }> = {
  id: jobId,
  pluginId: plugin.id,
  type: 'boundary-check',
  status: 'pending',
  input: { source: reference },
  createdAt: '2026-09-19T00:00:00.000Z',
};
const context: JobExecutionContext = { signal: new AbortController().signal };
const element: HTMLElement = document.createElement('div');
void job;
void context;
void element;

if (event.type === 'job:progress') {
  const percent: number = event.payload.progress.percent;
  void percent;
}

// @ts-expect-error Raw strings must not erase the public JobId brand.
const unbrandedId: JobId = 'job-raw';
// @ts-expect-error PluginId and JobId are distinct public contracts.
const mixedId: JobId = pluginId;
// @ts-expect-error Browser source must not acquire ambient Node process globals.
process.cwd();
// @ts-expect-error Browser source must not acquire ambient Node Buffer globals.
Buffer.from('browser');
void unbrandedId;
void mixedId;
