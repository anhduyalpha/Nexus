import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qrPlugin } from '../src/index.ts';
const context = { signal: new AbortController().signal, workDir: '', files: [], progress() {} };
test('QR adapter returns a real PNG from the selected engine', async () => {
  const [artifact] = await qrPlugin.run({ text: 'Nexus' }, context);
  assert.equal(artifact.mime, 'image/png');
  assert.deepEqual(Buffer.from(artifact.data!).subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
});
test('QR adapter returns SVG and rejects unbounded input', async () => {
  const [artifact] = await qrPlugin.run({ text: 'Nexus', format: 'svg' }, context);
  assert.match(Buffer.from(artifact.data!).toString(), /<svg/);
  assert.throws(() => qrPlugin.validate({ text: 'x'.repeat(2001) }));
  assert.throws(() => qrPlugin.validate({ text: 'ok', size: 99999 }));
});
test('QR respects cancellation', async () => {
  await assert.rejects(qrPlugin.run({ text: 'Nexus' }, { ...context, signal: AbortSignal.abort() }));
});
