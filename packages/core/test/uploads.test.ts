import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { qrPlugin } from '@nexus/tools';
const tus = { 'Tus-Resumable': '1.0.0' };
test('Tus resumes chunks, rejects wrong offsets and persists its library mapping', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nexus-tus-'));
  const config = { ...loadConfig({}), dataDir: root, webDir: join(root, 'no-web'), redisUrl: undefined };
  let app = await createApp(config, [qrPlugin]);
  try {
    let address = await app.listen({ host: '127.0.0.1', port: 0 });
    const body = Buffer.from('resumable-content');
    const creation = await fetch(`${address}/api/uploads`, { method: 'POST', headers: { ...tus, 'Upload-Length': String(body.length), 'Upload-Metadata': `filename ${Buffer.from('note.txt').toString('base64')}` } });
    assert.equal(creation.status, 201, await creation.text());
    const location = creation.headers.get('location')!;
    const url = new URL(location, address).href;
    const first = await fetch(url, { method: 'PATCH', headers: { ...tus, 'Upload-Offset': '0', 'Content-Type': 'application/offset+octet-stream' }, body: body.subarray(0, 4) });
    assert.equal(first.status, 204, await first.text());
    const head = await fetch(url, { method: 'HEAD', headers: tus });
    assert.equal(head.headers.get('upload-offset'), '4');
    const wrong = await fetch(url, { method: 'PATCH', headers: { ...tus, 'Upload-Offset': '1', 'Content-Type': 'application/offset+octet-stream' }, body: body.subarray(4) });
    assert.equal(wrong.status, 409);
    const finish = await fetch(url, { method: 'PATCH', headers: { ...tus, 'Upload-Offset': '4', 'Content-Type': 'application/offset+octet-stream' }, body: body.subarray(4) });
    assert.equal(finish.status, 204, await finish.text());
    const uploadId = location.split('/').pop();
    const completed = await (await fetch(`${address}/api/upload-results/${uploadId}`)).json() as { file: { id: string } };
    const download = await fetch(`${address}/api/files/${completed.file.id}`);
    assert.equal(await download.text(), body.toString());
    assert.match(download.headers.get('content-disposition')!, /attachment/);
    await app.close(); app = await createApp(config, [qrPlugin]); address = await app.listen({ host: '127.0.0.1', port: 0 });
    const restored = await (await fetch(`${address}/api/upload-results/${uploadId}`)).json() as { file: { id: string } };
    assert.equal(restored.file.id, completed.file.id);
    assert.equal((await app.inject('/api/files')).json().files.length, 1);
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});
test('Tus is protected by the same session boundary as file APIs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nexus-tus-auth-'));
  const app = await createApp({ ...loadConfig({}), dataDir: root, webDir: join(root, 'none'), token: 'private-testing-token', redisUrl: undefined }, [qrPlugin]);
  try {
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    assert.equal((await fetch(`${address}/api/uploads`, { method: 'POST', headers: { ...tus, 'Upload-Length': '10' } })).status, 401);
    assert.equal((await fetch(`${address}/api/events`)).status, 401);
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});
