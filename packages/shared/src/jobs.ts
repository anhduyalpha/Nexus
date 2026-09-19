import type { JobId, PluginId } from './ids.ts';
import type { JobProgress } from './progress.ts';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface JobError {
  readonly message: string;
  readonly code?: string;
  readonly details?: unknown;
}

export function createJobError(message: string, code?: string, details?: unknown): JobError {
  return {
    message,
    ...(code !== undefined ? { code } : {}),
    ...(details !== undefined ? { details } : {}),
  };
}

/**
 * Public representation of a generic Nexus job.
 * Fully serializable across persistence, workers, and API/SSE boundaries.
 */
export interface Job<TInput = unknown, TOutput = unknown> {
  readonly id: JobId;
  readonly pluginId: PluginId;
  readonly type: string;
  readonly status: JobStatus;
  readonly input: TInput;
  readonly output?: TOutput;
  readonly progress?: JobProgress;
  readonly error?: JobError;
  readonly createdAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
}

export const TERMINAL_JOB_STATUSES: ReadonlySet<JobStatus> = new Set([
  'completed',
  'failed',
  'cancelled',
]);

export function isJobTerminal(status: JobStatus): boolean {
  return TERMINAL_JOB_STATUSES.has(status);
}
