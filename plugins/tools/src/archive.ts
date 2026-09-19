import yauzl from 'yauzl';
import yazl from 'yazl';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { join, posix } from 'node:path';
import { z } from 'zod';
import type { GeneratedArtifact, ToolContext, ToolPlugin } from '@nexus/shared';
const emptyInput = z.object({}).strict();
const extractInput = z.object({ entries: z.array(z.string().min(1).max(512)).max(200).default([]) }).strict();
const MAX_BYTES = 100 * 1024 * 1024;
export function safeEntry(entry: string): boolean {
  return entry.length > 0 && entry.length <= 512 && !/[\\:\x00-\x1f]/.test(entry) && !entry.startsWith('/') && !entry.split('/').includes('..');
}
type ListedEntry = { name: string; bytes: number; directory: boolean };
export async function walkZip(path: string, context: ToolContext, selected: readonly string[] | undefined): Promise<{ entries: ListedEntry[]; artifacts: GeneratedArtifact[] }> {
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => yauzl.open(path, { lazyEntries: true, autoClose: false, strictFileNames: true, validateEntrySizes: true }, (error, value) => error || !value ? reject(error || new Error('Invalid archive')) : resolve(value)));
  const entries: ListedEntry[] = []; const artifacts: GeneratedArtifact[] = [];
  let declaredBytes = 0; let actualBytes = 0; let settled = false;
  return new Promise((resolve, reject) => {
    const fail = (error: unknown) => { if (settled) return; settled = true; zip.close(); context.signal.removeEventListener('abort', abort); reject(error); };
    const abort = () => fail(context.signal.reason || new Error('Cancelled'));
    context.signal.addEventListener('abort', abort, { once: true });
    zip.on('error', fail);
    zip.on('end', () => {
      if (settled) return;
      if (selected?.some(name => !entries.some(entry => entry.name === name && !entry.directory))) return fail(new Error('Selected archive entry was not found.'));
      settled = true; zip.close(); context.signal.removeEventListener('abort', abort); resolve({ entries, artifacts });
    });
    zip.on('entry', (entry: yauzl.Entry) => { void (async () => {
      context.signal.throwIfAborted();
      const unixType = (entry.externalFileAttributes >>> 16) & 0xf000;
      if (!safeEntry(entry.fileName) || unixType === 0xa000 || (entry.generalPurposeBitFlag & 1)) throw new Error('Unsafe, encrypted or symlink archive entry.');
      declaredBytes += entry.uncompressedSize;
      if (entries.length >= 200 || !Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0 || declaredBytes > MAX_BYTES || entry.uncompressedSize > Math.max(1, entry.compressedSize) * 200) throw new Error('Archive exceeds safety limits.');
      if (entries.some(previous => previous.name === entry.fileName)) throw new Error('Duplicate archive entry.');
      const directory = entry.fileName.endsWith('/');
      entries.push({ name: entry.fileName, bytes: entry.uncompressedSize, directory });
      if (selected !== undefined && !directory && (selected.length === 0 || selected.includes(entry.fileName))) {
        const source = await new Promise<NodeJS.ReadableStream>((resolveStream, rejectStream) => zip.openReadStream(entry, (error, stream) => error || !stream ? rejectStream(error || new Error('Unreadable entry')) : resolveStream(stream)));
        const target = join(context.workDir, `entry-${entries.length}`);
        const limit = new Transform({ transform(chunk: Buffer, _encoding, done) { actualBytes += chunk.length; done(actualBytes > MAX_BYTES ? new Error('Expanded archive is too large.') : null, chunk); } });
        await pipeline(source, limit, createWriteStream(target, { flags: 'wx' }), { signal: context.signal });
        artifacts.push({ path: target, name: posix.basename(entry.fileName), mime: 'application/octet-stream' });
      }
      context.progress(Math.min(90, Math.round(entries.length / Math.max(1, zip.entryCount) * 90)), 'Reading archive');
      if (!settled) zip.readEntry();
    })().catch(fail); });
    if (context.signal.aborted) abort(); else zip.readEntry();
  });
}
export const zipCreatePlugin: ToolPlugin = {
  descriptor: { id: 'zip-create', name: 'Create ZIP', description: 'Pack files from your library into one portable archive.', category: 'archive', mode: 'job' },
  validate(input) { emptyInput.parse(input); },
  async run(input, context) {
    emptyInput.parse(input);
    if (!context.files.length || context.files.length > 30) throw new Error('Choose 1–30 files.');
    const zip = new yazl.ZipFile();
    const path = join(context.workDir, 'archive.zip');
    const completion = pipeline(zip.outputStream, createWriteStream(path, { flags: 'wx' }), { signal: context.signal });
    context.files.forEach((file, index) => zip.addFile(file.path, `${index + 1}-${posix.basename(file.name.replaceAll('\\', '/')).replace(/[\x00-\x1f:]/g, '_') || 'file'}`));
    zip.end(); await completion;
    return [{ path, name: 'archive.zip', mime: 'application/zip' }];
  },
};
export const zipExtractPlugin: ToolPlugin = {
  descriptor: { id: 'zip-extract', name: 'Extract ZIP', description: 'Unpack a ZIP, with limits against unsafe paths and oversized archives.', category: 'archive', mode: 'job' },
  validate(input) { extractInput.parse(input); },
  async run(input, context) {
    const value = extractInput.parse(input);
    if (context.files.length !== 1) throw new Error('Choose one ZIP file.');
    return (await walkZip(context.files[0].path, context, value.entries)).artifacts;
  },
};
export const zipListPlugin: ToolPlugin = {
  descriptor: { id: 'zip-list', name: 'Inspect ZIP', description: 'Read an archive directory and export its file listing as JSON.', category: 'archive', mode: 'job' },
  validate(input) { emptyInput.parse(input); },
  async run(input, context) {
    emptyInput.parse(input);
    if (context.files.length !== 1) throw new Error('Choose one ZIP file.');
    const result = await walkZip(context.files[0].path, context, undefined);
    return [{ name: 'archive-listing.json', mime: 'application/json', data: Buffer.from(JSON.stringify(result.entries, null, 2)) }];
  },
};
