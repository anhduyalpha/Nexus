import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { byteRange } from '../src/storage-service.ts';
async function fixture(t: TestContext, token?: string) {
  const dataDir = await mkdtemp(join(tmpdir(), 'nexus-test-'));
  const config = { ...loadConfig({}), dataDir, webDir: join(dataDir, 'no-web'), token };
  const app = await createApp(config);
  t.after(async () => { await app.close(); await rm(dataDir, { recursive: true, force: true }); });
  return app;
}
test('HTTP QR -> persisted library -> download -> range -> delete', async t => {
  const app = await fixture(t);
  assert.equal((await app.inject('/api/health')).statusCode, 200);
  const response = await app.inject({ method: 'POST', url: '/api/tools/qr/run', payload: { text: 'Nexus' } });
  assert.equal(response.statusCode, 200, response.body);
  const file = response.json().files[0];
  assert.equal((await app.inject('/api/files')).json().files[0].id, file.id);
  const download = await app.inject(`/api/files/${file.id}`);
  assert.equal(download.rawPayload[0], 137);
  assert.match(download.headers['content-disposition'] as string, /attachment/);
  const range = await app.inject({ url: `/api/files/${file.id}`, headers: { range: 'bytes=0-7' } });
  assert.equal(range.statusCode, 206); assert.equal(range.rawPayload.length, 8);
  assert.equal((await app.inject({ url: `/api/files/${file.id}`, headers: { range: 'bytes=999999999-' } })).statusCode, 416);
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/files/${file.id}` })).statusCode, 204);
  assert.equal((await app.inject(`/api/files/${file.id}`)).statusCode, 404);
});
test('Input validation and origin/host protection', async t => {
  const app = await fixture(t);
  assert.equal((await app.inject({ method: 'POST', url: '/api/tools/qr/run', payload: { text: '' } })).statusCode, 400);
  assert.equal((await app.inject({ url: '/api/health', headers: { host: 'attacker.example' } })).statusCode, 403);
  assert.equal((await app.inject({ method: 'POST', url: '/api/tools/qr/run', headers: { origin: 'https://attacker.example' }, payload: { text: 'x' } })).statusCode, 403);
  assert.equal((await app.inject('/api/files/not-a-uuid')).statusCode, 404);
});
test('Token login uses a signed HttpOnly session; no token in query URLs', async t => {
  const app = await fixture(t, 'a-private-test-token');
  assert.equal((await app.inject('/api/files')).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/api/session', payload: { token: 'wrong' } })).statusCode, 401);
  const login = await app.inject({ method: 'POST', url: '/api/session', payload: { token: 'a-private-test-token' } });
  assert.equal(login.statusCode, 200);
  assert.match(String(login.headers['set-cookie']), /HttpOnly/);
  const cookie = String(login.headers['set-cookie']).split(';')[0];
  assert.equal((await app.inject({ url: '/api/files', headers: { cookie } })).statusCode, 200);
});
test('Config refuses remote binding without a token', () => { assert.throws(() => loadConfig({ NEXUS_HOST: '0.0.0.0' })); });
test('Range parser covers suffix, bounds and multi-range rejection', () => {
  assert.deepEqual(byteRange('bytes=-4', 10), { start: 6, end: 9 });
  assert.deepEqual(byteRange('bytes=3-', 10), { start: 3, end: 9 });
  for (const value of ['bytes=-0', 'bytes=4-3', 'bytes=0-1,4-5', 'bytes=-', 'invalid']) assert.equal(byteRange(value, 10), undefined);
});
