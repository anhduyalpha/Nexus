export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, { credentials: 'same-origin', ...init, headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } });
  if (!response.ok) { const value = await response.json().catch(() => ({})); throw new Error(value.error || `Request failed (${response.status})`); }
  return response.status === 204 ? undefined as T : await response.json() as T;
}
