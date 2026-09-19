declare const brand: unique symbol;

export type Brand<T, TBrand extends string> = T & { readonly [brand]: TBrand };

export type JobId = Brand<string, 'JobId'>;
export type PluginId = Brand<string, 'PluginId'>;

export function createJobId(id: string): JobId {
  if (!id || typeof id !== 'string' || id.trim().length === 0) {
    throw new TypeError('JobId must be a non-empty string');
  }
  return id as JobId;
}

export function createPluginId(id: string): PluginId {
  if (!id || typeof id !== 'string' || id.trim().length === 0) {
    throw new TypeError('PluginId must be a non-empty string');
  }
  return id as PluginId;
}

export function isJobId(value: unknown): value is JobId {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isPluginId(value: unknown): value is PluginId {
  return typeof value === 'string' && value.trim().length > 0;
}
