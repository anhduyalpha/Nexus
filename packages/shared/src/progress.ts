/**
 * Portable representation of job progress (0-100%).
 * Suitable for workers, job state, SSE events, and frontend displays.
 */
export interface JobProgress {
  readonly percent: number;
  readonly message?: string;
  readonly current?: number;
  readonly total?: number;
  readonly etaSeconds?: number;
}

export function createJobProgress(
  percent: number,
  message?: string,
  options?: { current?: number; total?: number; etaSeconds?: number }
): JobProgress {
  const clampedPercent = Math.max(0, Math.min(100, Math.round(percent)));
  return {
    percent: clampedPercent,
    ...(message !== undefined ? { message } : {}),
    ...(options?.current !== undefined ? { current: options.current } : {}),
    ...(options?.total !== undefined ? { total: options.total } : {}),
    ...(options?.etaSeconds !== undefined ? { etaSeconds: options.etaSeconds } : {}),
  };
}
