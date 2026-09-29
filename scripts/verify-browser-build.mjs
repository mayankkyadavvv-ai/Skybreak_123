// Serves the built game and real local match service for browser acceptance.
// Closing the harness always closes both the listener and the browser child.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createLanServer } from '../server/lan.js';
import { verifyBuild } from './build-manifest.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
await verifyBuild({ root });
const service = createLanServer({ directory: join(root, 'dist'), interfaces: {} });
let child;
try {
  await service.listen(0, '127.0.0.1');
  const origin = `http://127.0.0.1:${service.server.address().port}`;
  console.log(`Checking built Skybreak at ${origin}`);
  const code = await new Promise((resolve, reject) => {
    child = spawn(process.execPath, ['scripts/upgrade40-browser.mjs'], { cwd: root, env: { ...process.env, SKYBREAK_QA_URL: origin }, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(signal ? 1 : code));
  });
  process.exitCode = code;
} finally {
  if (child && child.exitCode === null) child.kill('SIGTERM');
  await service.close();
}
