import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
const root = fileURLToPath(new URL('../', import.meta.url));
const vite = fileURLToPath(new URL('../packages/web/node_modules/vite/bin/vite.js', import.meta.url));
if (!existsSync(vite)) { console.error('Run pnpm install --frozen-lockfile first.'); process.exit(1); }
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}
for (const [args, cwd] of [
  [['--env-file-if-exists=.env', '--experimental-strip-types', 'packages/core/src/main.ts'], root],
  [[vite, '--host', '127.0.0.1'], fileURLToPath(new URL('../packages/web/', import.meta.url))],
]) {
  const child = spawn(process.execPath, args, { cwd, stdio: 'inherit', env: process.env });
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => { if (!stopping) stop(code || 0); });
  children.push(child);
}
process.once('SIGINT', () => stop());
process.once('SIGTERM', () => stop());
console.log('Nexus development: http://127.0.0.1:5173 (frontend hot reload; restart for backend changes)');
