import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { request } from 'node:http';
import WebSocket from 'ws';
import { createLanServer, lanAddresses } from '../server/lan.js';
import { PROTOCOL_VERSION } from '../src/shared/Protocol.js';

async function fixture(t) {
  const folder = await mkdtemp(join(tmpdir(), 'skybreak-lan-'));
  await mkdir(join(folder, 'dist/assets'), { recursive: true });
  await writeFile(join(folder, 'dist/index.html'), '<!doctype html><html><head><title>Skybreak LAN fixture</title></head><body><script type="module" src="/assets/game.js"></script></body></html>');
  await writeFile(join(folder, 'dist/assets/game.js'), 'window.fixture=true;');
  const service = createLanServer({ directory: join(folder, 'dist'), interfaces: { wifi: [{ family: 'IPv4', internal: false, address: '192.168.20.8' }] } });
  await service.listen(0, '127.0.0.1');
  t.after(async () => { await service.close(); await rm(folder, { recursive: true, force: true }); });
  const origin = `http://127.0.0.1:${service.server.address().port}`;
  return { folder, service, origin, ws: origin.replace('http:', 'ws:') + '/ws' };
}

function peer(url, origin) {
  const ws = new WebSocket(url, { origin }), queued = [], waiters = [];
  ws.on('error', () => {});
  ws.on('message', raw => {
    const message = JSON.parse(raw);
    if (message.type === 'server_ping') ws.send(JSON.stringify({ type: 'server_pong', t: message.t }));
    const index = waiters.findIndex(waiter => waiter.type === message.type);
    if (index < 0) queued.push(message); else { const waiter = waiters.splice(index, 1)[0]; clearTimeout(waiter.timer); waiter.resolve(message); }
  });
  return { ws, send: message => ws.send(JSON.stringify(message)), receive(type) {
    const index = queued.findIndex(message => message.type === type); if (index >= 0) return Promise.resolve(queued.splice(index, 1)[0]);
    return new Promise((resolve, reject) => { const waiter = { type, resolve, timer: setTimeout(() => { waiters.splice(waiters.indexOf(waiter), 1); reject(Error(`No ${type} from LAN server`)); }, 2000) }; waiters.push(waiter); });
  } };
}

test('LAN addresses exclude loopback and expose real IPv4 adapters once', () => {
  assert.deepEqual(lanAddresses({ loopback: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }], wifi: [{ family: 'IPv4', internal: false, address: '192.168.1.12' }, { family: 'IPv6', internal: false, address: 'fe80::1' }], duplicate: [{ family: 4, internal: false, address: '192.168.1.12' }] }), ['192.168.1.12']);
});

test('LAN game, runtime, diagnostics and QR need only local assets', async t => {
  const { origin } = await fixture(t);
  const page = await fetch(origin + '/?lan=1'), html = await page.text();
  assert.equal(page.status, 200); assert.match(html, /<head><script src="\/lan\/runtime.js"><\/script>/);
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
  assert.doesNotMatch(page.headers.get('content-security-policy'), /script-src[^;]*unsafe-inline/);
  assert.equal((await fetch(origin + '/assets/game.js')).status, 200);
  const config = await (await fetch(origin + '/lan/runtime.js')).text(); assert.match(config, /"websocketPath":"\/ws"/); assert.match(config, new RegExp(`"protocolVersion":${PROTOCOL_VERSION}`));
  const entry = await (await fetch(origin + '/lan')).text(); assert.match(entry, /192\.168\.20\.8/); assert.match(entry, /localhost sirf host device/); assert.doesNotMatch(entry, /src="https?:\/\//);
  assert.equal((await fetch(origin + '/lan/qr.svg?address=0')).headers.get('content-type'), 'image/svg+xml');
  assert.match(await (await fetch(origin + '/lan/qr.svg?address=0')).text(), /<svg/);
  assert.equal((await fetch(origin + '/lan/qr.svg?address=20')).status, 404);
  const health = await (await fetch(origin + '/lan/status')).json(); assert.equal(health.status, 'healthy'); assert.equal(health.buildReady, true); assert.equal(health.protocol, PROTOCOL_VERSION); assert.equal(health.websocket, origin.replace('http:', 'ws:') + '/ws');
});

test('LAN rejects cross-site socket origins, unknown hosts, traversal and non-GET requests', async t => {
  const { origin, ws, folder } = await fixture(t);
  assert.equal((await fetch(origin + '/assets/game.js', { method: 'POST' })).status, 405);
  assert.equal((await fetch(origin + '/%2eenv')).status, 404);
  assert.equal((await fetch(origin + '/assets/%2e%2e/%2e%2e/package.json')).status, 404);
  await writeFile(join(folder, 'outside.txt'), 'private fixture'); await symlink(join(folder, 'outside.txt'), join(folder, 'dist/external.txt'));
  assert.equal((await fetch(origin + '/external.txt')).status, 404);
  const unknownHostStatus = await new Promise((resolve, reject) => { const req = request(origin, { headers: { Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); }); req.on('error', reject); req.end(); });
  assert.equal(unknownHostStatus, 403);
  const rejected = new WebSocket(ws, { origin: 'https://evil.example' }); rejected.on('error', () => {});
  const [error] = await once(rejected, 'error'); assert.match(error.message, /403/);
});

test('same-origin LAN sockets create/join one room and graceful shutdown releases the service', async t => {
  const { origin, ws, service } = await fixture(t), a = peer(ws, origin), b = peer(ws, origin);
  t.after(() => { a.ws.terminate(); b.ws.terminate(); });
  await Promise.all([a.receive('welcome'), b.receive('welcome')]);
  a.send({ type: 'hello', protocol: PROTOCOL_VERSION }); b.send({ type: 'hello', protocol: PROTOCOL_VERSION });
  a.send({ type: 'create_room', options: { mode: '1v1' } });
  const room = (await a.receive('room_joined')).room;
  b.send({ type: 'join_room', code: room.roomCode }); assert.equal((await b.receive('room_joined')).room.players.length, 2);
  const closed = once(a.ws, 'close'); await service.close(); assert.equal((await closed)[0], 1001); assert.equal(service.gameServer.clients.size, 0); assert.equal(service.server.listening, false);
});
