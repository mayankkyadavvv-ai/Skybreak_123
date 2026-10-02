import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import WebSocket from 'ws';
import { PROTOCOL_VERSION } from '../src/shared/Protocol.js';
import { inventory, inventoryDigest, sha256 } from './build-manifest.mjs';

const folder = resolve(process.env.SKYBREAK_LAN_PACKAGE || 'qa-artifacts/skybreak-lan-release'), out = resolve(process.env.SKYBREAK_LAN_EVIDENCE || 'evidence/upgrade40/qa-lan.json');
const report = { feature: 'F39', started: new Date().toISOString(), package: folder, status: 'running', kind: 'scripted local HTTP/WebSocket package acceptance', physicalDeviceCount: 1, twoDeviceLanVerified: false, internetDisconnected: false, assertions: [], errors: [], unverified: ['two physical devices on one trusted LAN with internet disconnected', 'Windows double-click launcher and Private-network firewall prompt', 'actual gameplay rendering, input feel and human match completion'] };
let child;
const assert = (condition, label) => { if (!condition) throw Error(label); report.assertions.push(label); };
const pause = ms => new Promise(resolvePause => setTimeout(resolvePause, ms));
function pilot(url) {
  const ws = new WebSocket(url), messages = [], pending = [];
  ws.on('error', error => report.errors.push(`Socket: ${error.message}`));
  ws.on('message', raw => {
    const message = JSON.parse(raw);
    if (message.type === 'server_ping') ws.send(JSON.stringify({ type: 'server_pong', t: message.t }));
    const index = pending.findIndex(waiter => waiter.accept(message));
    if (index < 0) messages.push(message); else { const waiter = pending.splice(index, 1)[0]; clearTimeout(waiter.timer); waiter.resolve(message); }
  });
  return { ws, send: message => ws.send(JSON.stringify(message)), receive(type, predicate = () => true) {
    const accept = message => message.type === type && predicate(message), index = messages.findIndex(accept);
    if (index >= 0) return Promise.resolve(messages.splice(index, 1)[0]);
    return new Promise((resolveReceive, reject) => { const waiter = { accept, resolve: resolveReceive, timer: setTimeout(() => { pending.splice(pending.indexOf(waiter), 1); reject(Error(`Timed out: ${type}`)); }, 7000) }; pending.push(waiter); });
  } };
}

const pilots = [];
try {
  const manifest = JSON.parse(await readFile(join(folder, 'package-manifest.json'), 'utf8'));
  assert(manifest.protocol === PROTOCOL_VERSION, 'Packaged protocol matches the tested client/server protocol');
  for (const file of manifest.files) { const data = await readFile(join(folder, file.path)); assert(createHash('sha256').update(data).digest('hex') === file.sha256, `Package hash: ${file.path}`); }
  const provenance = await readFile(join(folder, 'source-manifest.json'));
  const build = JSON.parse(provenance);
  assert(sha256(provenance) === manifest.sourceManifestSha256, 'Package identifies the current build manifest');
  assert(provenance.equals(await readFile(join(folder, 'dist/build-manifest.json'))), 'Game and launcher refer to the same source manifest');
  assert(inventoryDigest(build.source) === manifest.sourceDigest, 'Source inventory matches the packaged build identity');
  assert(inventoryDigest(await inventory(join(folder, 'dist'), ['.'], new Set(['build-manifest.json']))) === manifest.assetsDigest, 'Every bundled game asset belongs to the identified build');
  report.manifest = { protocol: manifest.protocol, builtAt: manifest.builtAt, sourceRevision: manifest.sourceRevision, sourceDigest: manifest.sourceDigest, assetsDigest: manifest.assetsDigest, files: manifest.files.length };
  const reservation = createServer(); await new Promise(resolveListen => reservation.listen(0, '127.0.0.1', resolveListen)); const port = reservation.address().port; await new Promise(resolveClose => reservation.close(resolveClose));
  const origin = `http://127.0.0.1:${port}`; report.origin = origin;
  child = spawn(process.execPath, ['skybreak-lan.cjs'], { cwd: folder, env: { ...process.env, SKYBREAK_LAN_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  report.serverOutput = ''; child.stdout.on('data', data => { report.serverOutput = (report.serverOutput + data).slice(-12000); }); child.stderr.on('data', data => { report.serverOutput = (report.serverOutput + data).slice(-12000); });
  let health;
  for (let attempt = 0; attempt < 80; attempt++) { try { const response = await fetch(origin + '/health', { signal: AbortSignal.timeout(1000) }); if (response.ok) { health = await response.json(); break; } } catch {} if (child.exitCode !== null) break; await pause(100); }
  assert(health?.status === 'healthy', 'Standalone bundled server starts without node_modules or runtime downloads');
  assert(health.protocol === PROTOCOL_VERSION, 'Health endpoint reports the matching protocol');
  const index = await (await fetch(origin + '/?lan=1')).text(); assert(index.includes('/lan/runtime.js'), 'Game page receives same-origin LAN runtime config');
  const assetPaths = [...index.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(match => match[1]).filter(path => path.startsWith('/assets/'));
  for (const path of assetPaths) assert((await fetch(origin + path)).status === 200, `Local startup asset: ${path}`);
  const entry = await fetch(origin + '/lan'); assert(entry.status === 200, 'LAN QR/help entry page is served');
  if (health.addresses?.length) assert((await fetch(origin + '/lan/qr.svg?address=0')).status === 200, 'Actual advertised adapter address has an offline-generated QR');
  const a = pilot(health.websocket), b = pilot(health.websocket); pilots.push(a, b);
  const [welcomeA, welcomeB] = await Promise.all([a.receive('welcome'), b.receive('welcome')]);
  assert(welcomeA.id !== welcomeB.id, 'Two scripted clients have independent identities');
  for (const [index, p] of pilots.entries()) { p.send({ type: 'hello', protocol: PROTOCOL_VERSION }); p.send({ type: 'set_name', name: `LAN Bot ${index + 1}` }); }
  a.send({ type: 'create_room', options: { mode: '1v1', killLimit: 5, matchDuration: 300 } }); const room = (await a.receive('room_joined')).room;
  b.send({ type: 'join_room', code: room.roomCode }); assert((await b.receive('room_joined')).room.players.length === 2, 'Both clients join one local room');
  for(const p of pilots)p.send({type:'loaded'});
  b.send({ type: 'set_ready', ready: true }); await a.receive('lobby_update', message => message.players.length === 2 && message.players.every(player => player.ready));
  a.send({ type: 'start_match' }); const [startA, startB] = await Promise.all([a.receive('game_started'), b.receive('game_started')]);
  assert(startA.snapshot.roster.length === 2 && startB.snapshot.roster.length === 2, 'Both clients start a match with the same two public player identities');
  const [snapshotA, snapshotB] = await Promise.all([a.receive('snapshot'), b.receive('snapshot')]);
  assert(snapshotA.s.roster.map(player => player.id).sort().join() === snapshotB.s.roster.map(player => player.id).sort().join(), 'Both clients receive synchronized match snapshots');
  const closed = Promise.all(pilots.map(p => once(p.ws, 'close'))); child.kill('SIGTERM'); const closures = await closed;
  assert(closures.every(([code]) => code === 1001), 'Stopping launcher closes connected clients with shutdown status');
  if (child.exitCode === null) await once(child, 'exit').catch(() => {}); assert(child.exitCode === 0, 'Launcher process exits cleanly');
  let stillOpen = false; try { await fetch(origin + '/health', { signal: AbortSignal.timeout(1000) }); stillOpen = true; } catch {}
  assert(!stillOpen, 'Stopped launcher no longer serves the local port');
  report.status = report.errors.length ? 'failed' : 'passed-automated';
} catch (error) { report.status = 'failed'; report.errors.push(error.message); }
finally { for (const p of pilots) p.ws.terminate(); if (child && child.exitCode === null) child.kill('SIGTERM'); report.finished = new Date().toISOString(); await mkdir(resolve(out, '..'), { recursive: true }); await writeFile(out, JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ status: report.status, report: out, assertions: report.assertions.length, errors: report.errors, physicalLanTest: 'unverified' })); }
if (report.status !== 'passed-automated') process.exitCode = 1;
