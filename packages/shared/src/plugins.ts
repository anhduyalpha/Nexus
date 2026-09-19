import type { PluginId } from './ids.ts';

/**
 * Public plugin descriptor / manifest identity contract.
 * Lightweight declaration without runtime lifecycle or dynamic loader coupling.
 */
export interface PluginDescriptor {
  readonly id: PluginId;
  readonly name: string;
  readonly version: string;
  readonly description?: string;
}

export type PluginManifest = PluginDescriptor;

export function createPluginDescriptor(
  id: PluginId,
  name: string,
  version: string,
  description?: string
): PluginDescriptor {
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new TypeError('Plugin name must be a non-empty string');
  }
  if (!version || typeof version !== 'string' || version.trim().length === 0) {
    throw new TypeError('Plugin version must be a non-empty string');
  }
  return {
    id,
    name,
    version,
    ...(description !== undefined ? { description } : {}),
  };
}
