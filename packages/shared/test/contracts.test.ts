import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createJobId,
  createPluginId,
  isJobId,
  isPluginId,
  createStorageReference,
  createJobProgress,
  isAborted,
  createJobError,
  isJobTerminal,
  createPluginDescriptor,
  createNexusEvent,
  type StorageReference,
  type Job,
  type JobStateChangedEvent,
  type JobProgressEvent,
  type JobCompletedEvent,
  type JobFailedEvent,
  type NexusEvent,
} from '../src/index.ts';

describe('Nexus Core Contracts', () => {
  describe('Branded IDs', () => {
    it('creates valid branded IDs', () => {
      const jobId = createJobId('job-456');
      const pluginId = createPluginId('plugin-789');

      assert.equal(jobId, 'job-456');
      assert.equal(pluginId, 'plugin-789');

      assert.equal(isJobId(jobId), true);
      assert.equal(isPluginId(pluginId), true);
    });

    it('rejects empty or whitespace IDs', () => {
      assert.throws(() => createJobId(''), TypeError);
      assert.throws(() => createJobId('   '), TypeError);
      assert.throws(() => createPluginId(''), TypeError);
      assert.throws(() => createPluginId('   '), TypeError);
    });
  });

  describe('Storage Reference Contract', () => {
    it('creates serializable StorageReference with namespace', () => {
      const storageRef: StorageReference = createStorageReference('artifacts/out.png', 'qr-generator');
      assert.equal(storageRef.key, 'artifacts/out.png');
      assert.equal(storageRef.namespace, 'qr-generator');

      const json = JSON.stringify(storageRef);
      const parsed = JSON.parse(json);
      assert.deepEqual(parsed, storageRef);
    });

    it('creates StorageReference without optional namespace', () => {
      const storageRef = createStorageReference('artifacts/raw.dat');
      assert.equal(storageRef.key, 'artifacts/raw.dat');
      assert.equal(storageRef.namespace, undefined);
      assert.equal('namespace' in storageRef, false);
    });

    it('rejects empty or whitespace keys', () => {
      assert.throws(() => createStorageReference(''), TypeError);
      assert.throws(() => createStorageReference('   '), TypeError);
    });
  });

  describe('Job Model & Progress', () => {
    it('clamps progress percentages to [0, 100]', () => {
      assert.equal(createJobProgress(-5).percent, 0);
      assert.equal(createJobProgress(120).percent, 100);
      assert.equal(createJobProgress(45.6).percent, 46);
    });

    it('identifies terminal job statuses', () => {
      assert.equal(isJobTerminal('pending'), false);
      assert.equal(isJobTerminal('running'), false);
      assert.equal(isJobTerminal('completed'), true);
      assert.equal(isJobTerminal('failed'), true);
      assert.equal(isJobTerminal('cancelled'), true);
    });

    it('creates serializable JobError without stack leak', () => {
      const err = createJobError('Conversion failed', 'ERR_CONVERSION_FAILED', { code: 1 });
      assert.equal(err.message, 'Conversion failed');
      assert.equal(err.code, 'ERR_CONVERSION_FAILED');
      assert.equal('stack' in err, false);

      const json = JSON.stringify(err);
      assert.deepEqual(JSON.parse(json), err);
    });

    it('supports generic Job JSON round-trip', () => {
      const job: Job<{ prompt: string }, { resultUrl: string }> = {
        id: createJobId('job-1'),
        pluginId: createPluginId('qr'),
        type: 'generate',
        status: 'completed',
        input: { prompt: 'https://example.com' },
        output: { resultUrl: '/files/file-1' },
        progress: createJobProgress(100, 'Done'),
        createdAt: '2026-09-19T00:00:00.000Z',
        completedAt: '2026-09-19T00:00:01.000Z',
      };

      const json = JSON.stringify(job);
      assert.deepEqual(JSON.parse(json), job);
    });
  });

  describe('Cancellation Boundary', () => {
    it('handles AbortSignal status via isAborted', () => {
      const controller = new AbortController();
      assert.equal(isAborted(controller.signal), false);
      controller.abort();
      assert.equal(isAborted(controller.signal), true);
      assert.equal(isAborted(undefined), false);
    });
  });

  describe('Plugin Contracts', () => {
    it('creates valid plugin descriptor', () => {
      const descriptor = createPluginDescriptor(
        createPluginId('qr-plugin'),
        'QR Code Generator',
        '1.0.0',
        'Generates QR codes'
      );
      assert.equal(descriptor.id, 'qr-plugin');
      assert.equal(descriptor.name, 'QR Code Generator');
      assert.equal(descriptor.version, '1.0.0');
      assert.equal(descriptor.description, 'Generates QR codes');
    });

    it('rejects invalid plugin names or versions', () => {
      assert.throws(() => createPluginDescriptor(createPluginId('p1'), '', '1.0.0'), TypeError);
      assert.throws(() => createPluginDescriptor(createPluginId('p1'), 'Name', ''), TypeError);
    });
  });

  describe('Event Envelope & Discriminators', () => {
    it('creates and discriminates all 4 required job lifecycle events', () => {
      const jobId = createJobId('job-1');
      const pluginId = createPluginId('qr');

      const stateEvent: JobStateChangedEvent = createNexusEvent('job:state-changed', {
        jobId,
        pluginId,
        status: 'running',
        previousStatus: 'pending',
      });

      const progressEvent: JobProgressEvent = createNexusEvent('job:progress', {
        jobId,
        pluginId,
        progress: createJobProgress(50, 'Processing'),
      });

      const completedEvent: JobCompletedEvent<{ fileUrl: string }> = createNexusEvent('job:completed', {
        jobId,
        pluginId,
        output: { fileUrl: '/artifacts/out.png' },
      });

      const failedEvent: JobFailedEvent = createNexusEvent('job:failed', {
        jobId,
        pluginId,
        error: createJobError('Process crashed', 'ERR_CRASH'),
      });

      const events: NexusEvent[] = [stateEvent, progressEvent, completedEvent, failedEvent];

      function handleEvent(event: NexusEvent): string {
        switch (event.type) {
          case 'job:state-changed':
            return `state:${event.payload.status}`;
          case 'job:progress':
            return `progress:${event.payload.progress.percent}%`;
          case 'job:completed':
            return `completed:${JSON.stringify(event.payload.output)}`;
          case 'job:failed':
            return `failed:${event.payload.error.code}`;
        }
      }

      assert.equal(handleEvent(events[0]), 'state:running');
      assert.equal(handleEvent(events[1]), 'progress:50%');
      assert.equal(handleEvent(events[2]), 'completed:{"fileUrl":"/artifacts/out.png"}');
      assert.equal(handleEvent(events[3]), 'failed:ERR_CRASH');

      for (const event of events) {
        assert.ok(event.id);
        assert.ok(event.timestamp);
        const json = JSON.stringify(event);
        assert.deepEqual(JSON.parse(json), event);
      }
    });
  });
});
