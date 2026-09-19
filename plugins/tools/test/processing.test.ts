import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import yazl from 'yazl';
import type { GeneratedArtifact, ToolContext } from '@nexus/shared';
import { imagePlugin } from '../src/image.ts';
import { pdfPlugin, parsePages } from '../src/pdf.ts';
import { zipCreatePlugin, zipExtractPlugin, walkZip, safeEntry } from '../src/archive.ts';
import { mediaPlugin } from '../src/media.ts';

async function context(t: TestContext, inputs: { name: string; data: Uint8Array }[]): Promise<ToolContext> {
  const root = await mkdtemp(join(tmpdir(), 'nexus-tools-'));
  const workDir = join(root, 'work'); await mkdir(workDir);
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = [];
  for (const [index, input] of inputs.entries()) {
    const path = join(root, `input-${index}`); await writeFile(path, input.data);
    files.push({ id: randomUUID(), name: input.name, mime: 'application/octet-stream', bytes: input.data.byteLength, createdAt: new Date().toISOString(), tool: 'upload', path });
  }
  return { files, workDir, signal: new AbortController().signal, progress() {} };
}
async function contents(artifact: GeneratedArtifact): Promise<Buffer> { return artifact.data === undefined ? readFile(artifact.path) : Buffer.from(artifact.data); }
async function zipBuffer(name: string, data: Buffer): Promise<Buffer> {
  const zip = new yazl.ZipFile(); const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => { zip.outputStream.on('data', chunk => chunks.push(chunk)); zip.outputStream.on('end', () => resolve(Buffer.concat(chunks))); zip.outputStream.on('error', reject); });
  zip.addBuffer(data, name); zip.end(); return result;
}

test('Sharp creates real resized WebP and rejects non-image input', async t => {
  const source = await sharp({ create: { width: 400, height: 200, channels: 3, background: 'red' } }).png().toBuffer();
  const ctx = await context(t, [{ name: 'source.png', data: source }]);
  const [output] = await imagePlugin.run({ format: 'webp', width: 200, quality: 80 }, ctx);
  const metadata = await sharp(await contents(output)).metadata();
  assert.equal(metadata.format, 'webp'); assert.equal(metadata.width, 200); assert.equal(metadata.height, 100);
  const invalid = await context(t, [{ name: 'fake.png', data: Buffer.from('not an image') }]);
  await assert.rejects(imagePlugin.run({}, invalid));
  await assert.rejects(imagePlugin.run({}, { ...ctx, signal: AbortSignal.abort() }));
});
test('PDF merge and explicit page extraction use real PDF page trees', async t => {
  const first = await PDFDocument.create(); first.addPage([100, 100]); first.addPage([200, 200]);
  const second = await PDFDocument.create(); second.addPage([300, 300]);
  const ctx = await context(t, [{ name: 'one.pdf', data: await first.save() }, { name: 'two.pdf', data: await second.save() }]);
  const [merged] = await pdfPlugin.run({}, ctx);
  assert.equal((await PDFDocument.load(await contents(merged))).getPageCount(), 3);
  const single = await context(t, [{ name: 'one.pdf', data: await first.save() }]);
  const [extracted] = await pdfPlugin.run({ pages: '2' }, single);
  const parsed = await PDFDocument.load(await contents(extracted));
  assert.equal(parsed.getPageCount(), 1); assert.equal(parsed.getPage(0).getWidth(), 200);
  assert.deepEqual(parsePages('1-2,4', 4), [0, 1, 3]);
  for (const value of ['0', '5', '3-1', '../1', '1,,2', '9999999999999999']) assert.throws(() => parsePages(value, 4));
});
test('ZIP creation and extraction round-trip original file bytes', async t => {
  const ctx = await context(t, [{ name: 'note.txt', data: Buffer.from('Nexus archive test') }]);
  const [archive] = await zipCreatePlugin.run({}, ctx);
  const input = await context(t, [{ name: 'archive.zip', data: await contents(archive) }]);
  const [extracted] = await zipExtractPlugin.run({}, input);
  assert.equal((await contents(extracted)).toString(), 'Nexus archive test');
});
test('ZIP reader rejects traversal entries and extreme compression ratios', async t => {
  for (const value of ['../secret', '/absolute', 'a/../../secret', 'C:/file', 'a\\file', 'a\u0000b']) assert.equal(safeEntry(value), false);
  assert.equal(safeEntry('folder/file.txt'), true);
  const normal = await zipBuffer('safe.txt', Buffer.from('hello'));
  const malicious = Buffer.from(normal.toString('latin1').replaceAll('safe.txt', '../x.txt'), 'latin1');
  const ctx = await context(t, [{ name: 'unsafe.zip', data: malicious }]);
  await assert.rejects(walkZip(ctx.files[0].path, ctx, []));
  const bomb = await context(t, [{ name: 'ratio.zip', data: await zipBuffer('large.txt', Buffer.alloc(1024 * 1024)) }]);
  await assert.rejects(walkZip(bomb.files[0].path, bomb, []));
});
test('FFmpeg produces WAV from bounded binary input when installed', async t => {
  const missing = await mediaPlugin.checkAvailability?.();
  if (missing) { t.skip(missing); return; }
  const samples = 8000; const wave = Buffer.alloc(44 + samples * 2);
  wave.write('RIFF', 0); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8);
  wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(8000, 24); wave.writeUInt32LE(16000, 28); wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34);
  wave.write('data', 36); wave.writeUInt32LE(samples * 2, 40);
  const ctx = await context(t, [{ name: 'input.wav', data: wave }]);
  const [output] = await mediaPlugin.run({ format: 'wav' }, ctx);
  const data = await contents(output); assert.equal(data.subarray(0, 4).toString(), 'RIFF'); assert.ok(data.length >= 16000);
  assert.ok((await stat(output.path!)).isFile());
});
