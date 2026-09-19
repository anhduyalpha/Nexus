/**
 * Serializable reference identifying a stored artifact without exposing filesystem details.
 */
export interface StorageReference {
  readonly key: string;
  readonly namespace?: string;
}

export function createStorageReference(key: string, namespace?: string): StorageReference {
  if (!key || typeof key !== 'string' || key.trim().length === 0) {
    throw new TypeError('StorageReference key must be a non-empty string');
  }
  return namespace ? { key, namespace } : { key };
}
