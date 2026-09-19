import type { JobId, PluginId } from './ids.ts';
import type { JobError, JobStatus } from './jobs.ts';
import type { JobProgress } from './progress.ts';

/**
 * Serializable envelope for Nexus events suitable for SSE and internal event propagation.
 */
export interface NexusEventEnvelope<TType extends string = string, TPayload = unknown> {
  readonly id: string;
  readonly type: TType;
  readonly timestamp: string;
  readonly payload: TPayload;
}

export interface JobStateChangedEventPayload {
  readonly jobId: JobId;
  readonly pluginId: PluginId;
  readonly status: JobStatus;
  readonly previousStatus?: JobStatus;
}

export interface JobProgressEventPayload {
  readonly jobId: JobId;
  readonly pluginId: PluginId;
  readonly progress: JobProgress;
}

export interface JobCompletedEventPayload<TOutput = unknown> {
  readonly jobId: JobId;
  readonly pluginId: PluginId;
  readonly output?: TOutput;
}

export interface JobFailedEventPayload {
  readonly jobId: JobId;
  readonly pluginId: PluginId;
  readonly error: JobError;
}

export type JobStateChangedEvent = NexusEventEnvelope<'job:state-changed', JobStateChangedEventPayload>;
export type JobStateEvent = JobStateChangedEvent;
export type JobProgressEvent = NexusEventEnvelope<'job:progress', JobProgressEventPayload>;
export type JobCompletedEvent<TOutput = unknown> = NexusEventEnvelope<'job:completed', JobCompletedEventPayload<TOutput>>;
export type JobFailedEvent = NexusEventEnvelope<'job:failed', JobFailedEventPayload>;

/**
 * Discriminated union of public Nexus cross-boundary job events.
 */
export type NexusEvent =
  | JobStateChangedEvent
  | JobProgressEvent
  | JobCompletedEvent
  | JobFailedEvent;

export function createNexusEvent<TType extends string, TPayload>(
  type: TType,
  payload: TPayload,
  id?: string,
  timestamp?: string
): NexusEventEnvelope<TType, TPayload> {
  return {
    id: id ?? crypto.randomUUID(),
    type,
    timestamp: timestamp ?? new Date().toISOString(),
    payload,
  };
}
