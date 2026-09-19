import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
const config = loadConfig();
const app = await createApp(config);
let closing = false;
async function close() { if (closing) return; closing = true; const deadline = setTimeout(() => process.exit(1), 10000); deadline.unref(); await app.close(); clearTimeout(deadline); }
process.once('SIGINT', () => { void close(); });
process.once('SIGTERM', () => { void close(); });
try { await app.listen({ host: config.host, port: config.port }); console.log(`Nexus API: http://${config.host}:${config.port}`); }
catch (error) { console.error(error instanceof Error ? error.message : 'Startup failed'); await close(); process.exitCode = 1; }
