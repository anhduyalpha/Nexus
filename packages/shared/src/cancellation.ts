/**
 * Context passed to cancellable job execution units.
 * Reuses the platform standard AbortSignal without speculative custom frameworks.
 */
export interface JobExecutionContext {
  readonly signal: AbortSignal;
}

export function isAborted(signal?: AbortSignal): boolean {
  return signal?.aborted ?? false;
}
