export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export interface ToolDescriptor {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: 'create' | 'image' | 'document' | 'archive' | 'media';
  readonly mode: 'instant' | 'job';
}
export interface StoredFile {
  readonly id: string;
  readonly name: string;
  readonly mime: string;
  readonly bytes: number;
  readonly createdAt: string;
  readonly tool: string;
}
/** Host-only service context. Paths and signals never cross the HTTP/JSON boundary. */
export interface ToolContext {
  readonly signal: AbortSignal;
  readonly workDir: string;
  readonly files: readonly (StoredFile & { readonly path: string })[];
  readonly progress: (percent: number, message?: string) => void;
}
export type GeneratedArtifact = { readonly name: string; readonly mime: string } & (
  { readonly data: Uint8Array; readonly path?: never } |
  { readonly path: string; readonly data?: never }
);
export interface ToolPlugin {
  readonly descriptor: ToolDescriptor;
  validate(input: unknown): void;
  run(input: unknown, context: ToolContext): Promise<readonly GeneratedArtifact[]>;
}
