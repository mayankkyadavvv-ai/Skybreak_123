import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { FlightPrediction } from '../src/multiplayer/FlightPrediction.js';
import { createFlightState, stepFlight, serializeFlightState } from '../src/shared/FlightCore.js';
import { SyncManager } from '../src/multiplayer/SyncManager.js';
import { NetworkManager } from '../src/multiplayer/NetworkManager.js';
import { VoiceManager } from '../src/multiplayer/VoiceManager.js';
import { inviteURL, parseInvite } from '../src/multiplayer/Invites.js';
import { validateEndpoint } from '../src/multiplayer/Endpoint.js';

const commands = n => Array.from({ length: n }, (_, i) => ({ seq: i + 1, pitch: i < n / 2 ? .7 : -.2, roll: .4, yaw: .1, throttle: .3, assisted: true, boost: i % 20 < 4, gearDown: false, landingMode: false, flaps: false }));
const raw = () => serializeFlightState(createFlightState());
const memoryStore = () => { const data = new Map(); return { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }; };

test('F33 full-state rollback restores angular, velocity, systems and replays actual unacknowledged intents', () => {
  const prediction = new FlightPrediction(), inputs = commands(30), server = createFlightState();
  prediction.reset(raw(), 'sortie1', 'seat1');
  for (const input of inputs) prediction.predict(input);
  for (const input of inputs.slice(0, 20)) stepFlight(server, input);
  server.velocity.x += 7; server.angular.y -= .08; server.systems.engine = .6; server.systems.wing = .8;
  const authoritative = serializeFlightState(server);
  const expected = createFlightState(authoritative);
  for (const input of inputs.slice(20)) stepFlight(expected, input);
  assert.equal(prediction.reconcile({ ack: 20, inputEpoch: 'seat1', flight: authoritative }, { epoch: 'sortie1', tick: 20 }), true);
  assert.equal(prediction.pending.length, 10); assert.equal(prediction.pending[0].input.seq, 21);
  assert.ok(prediction.state.position.distanceTo(expected.position) < 1e-9);
  assert.ok(prediction.state.velocity.distanceTo(expected.velocity) < 1e-9);
  assert.ok(prediction.state.angular.distanceTo(expected.angular) < 1e-9);
  assert.equal(prediction.state.systems.engine, .6); assert.equal(prediction.state.systems.wing, .8);
  assert.ok(prediction.metrics.corrections > 0);
});

test('F33 new respawn generation clears queued controls and stale epochs/ticks never rewind it', () => {
  const prediction = new FlightPrediction(); prediction.reset(raw(), 'sortie1', 'seat1'); prediction.predict({ pitch: 1 });
  const changed = raw(); changed.position = { x: 4000, y: 1800, z: 9000 };
  prediction.reconcile({ ack: 0, inputEpoch: 'seat2', flight: changed }, { epoch: 'sortie1', tick: 50 });
  assert.equal(prediction.pending.length, 0); assert.equal(prediction.seq, 0); assert.equal(prediction.state.position.x, 4000);
  assert.equal(prediction.reconcile({ ack: 0, inputEpoch: 'seat1', flight: raw() }, { epoch: 'sortie1', tick: 10 }), false);
  assert.equal(prediction.reconcile({ ack: 0, inputEpoch: 'old', flight: raw() }, { epoch: 'sortie0', tick: 70 }), false);
  assert.equal(prediction.state.position.x, 4000);
});

for (const latency of [50, 100, 180]) test(`F33 simulated ${latency} ms RTT with jitter acknowledges and converges after TCP-style stall`, () => {
  const prediction = new FlightPrediction(), server = createFlightState(), inputs = commands(180), snapshots = [], rttTicks = Math.ceil(latency / (1000 / 60));
  prediction.reset(raw(), 'sortie', 'seat');
  for (let tick = 0; tick < inputs.length; tick++) {
    prediction.predict(inputs[tick]); stepFlight(server, inputs[tick]);
    if (tick % 3 === 0) snapshots.push({ due: tick + rttTicks + (tick % 9 ? 0 : 2) + (tick > 55 && tick < 76 ? 12 : 0), tick, ack: tick + 1, flight: serializeFlightState(server) });
    // TCP is ordered: a stalled packet holds later snapshots as well.
    while (snapshots[0]?.due <= tick) { const s = snapshots.shift(); prediction.reconcile({ ack: s.ack, inputEpoch: 'seat', flight: s.flight }, { epoch: 'sortie', tick: s.tick }); }
  }
  prediction.reconcile({ ack: 180, inputEpoch: 'seat', flight: serializeFlightState(server) }, { epoch: 'sortie', tick: 180 });
  assert.ok(prediction.state.position.distanceTo(server.position) < 1e-8);
  assert.equal(prediction.pending.length, 0); assert.ok(Number.isFinite(prediction.metrics.maxCorrection));
});

test('F33 output queue retains unsent input in bounded batches and stops predicting a stalled backlog', () => {
  const prediction = new FlightPrediction(); prediction.reset(raw(), 'sortie', 'seat');
  for (let i = 0; i < 15; i++) prediction.predict({ pitch: 0 });
  assert.equal(prediction.flush({ send: () => false }), false); assert.equal(prediction.outbound.length, 15);
  let packet; prediction.flush({ send: (type, data) => { packet = { type, ...data }; return true; } });
  assert.equal(packet.type, 'input'); assert.equal(packet.inputs.length, 12); assert.equal(prediction.outbound.length, 3);
  for (let i = 0; i < 200; i++) prediction.predict({ pitch: 0 });
  assert.equal(prediction.pending.length, 180); assert.ok(prediction.metrics.stalls > 0);
});

test('F33 remote Hermite curve uses server timestamps, grows jitter buffer and bounds extrapolation', () => {
  let clock = 0; const sync = new SyncManager(100, { clock: () => clock }), snapshot = (z, speed = 200) => ({ pos: [0, 1600, z], quat: [0, 0, 0, 1], vel: [0, 0, -speed], spd: speed, thr: .6, alive: true, inputEpoch: 'seat' });
  sync.observeClock(1000, 0, 1000); sync.addSnapshot('p', 1000, snapshot(0));
  clock = 50; sync.observeClock(1050, clock, 1000); sync.addSnapshot('p', 1050, snapshot(-10));
  clock = 100; sync.observeClock(1100, clock, 1000); sync.addSnapshot('p', 1100, snapshot(-20));
  const pos = new T.Vector3(), quat = new T.Quaternion(); sync.getInterpolatedState('p', pos, quat, 175);
  assert.ok(Math.abs(pos.z + 15) < .05, `server-time position ${pos.z}`);
  clock = 400; sync.observeClock(1150, clock, 1000); sync.addSnapshot('p', 1150, snapshot(-30));
  assert.ok(sync.interpDelay > 100); assert.equal(sync.addSnapshot('p', 1050, snapshot(999)), false);
  sync.getInterpolatedState('p', pos, quat, 5000); assert.ok(pos.z >= -60.001); assert.ok(sync.metrics.frozenFrames > 0);
});

test('F34 invite URLs retain only room identity, reject malformed codes and round-trip on LAN', () => {
  const url = inviteURL('SKY-A1B2', 'https://skybreak-iota.vercel.app/?token=secret&ws=evil#private');
  assert.equal(url, 'https://skybreak-iota.vercel.app/?join=SKY-A1B2'); assert.equal(parseInvite(url), 'SKY-A1B2');
  assert.equal(parseInvite('https://x.test/?join=SKY-<bad>'), null); assert.throws(() => inviteURL('not-a-code', 'https://x.test'));
  assert.equal(parseInvite(inviteURL('SKY-1234', 'http://192.168.1.4:8080/')), 'SKY-1234');
});

test('F35 welcome preserves private resume credential until successful identity rotation', () => {
  const store = memoryStore(), net = new NetworkManager({ sessionStore: store }); const sent = [];
  net.url = 'wss://match.test/'; net.ws = { readyState: 1, bufferedAmount: 0, send: value => sent.push(JSON.parse(value)), close() {} };
  net.saveSession('a'.repeat(48), null, 'SKY-1234');
  net.handleIncomingMessage(JSON.stringify({ type: 'welcome', protocol: 2, id: 'temporary', resumeToken: 'b'.repeat(48), serverTime: Date.now() }));
  assert.equal(net.pendingResume, true); assert.equal(sent[0].type, 'resume_session'); assert.equal(sent[0].token, 'a'.repeat(48));
  net.handleIncomingMessage(JSON.stringify({ type: 'session_resumed', id: 'original', resumeToken: 'c'.repeat(48), room: { roomCode: 'SKY-1234' } }));
  assert.equal(net.clientId, 'original'); assert.equal(net.pendingResume, false); assert.equal(net.session.token, 'c'.repeat(48));
  net.forgetSession(); assert.equal(new NetworkManager({ sessionStore: store }).session, null); net.dispose();
});

test('F33 network backpressure never adds messages to an excessive socket queue', () => {
  const net = new NetworkManager(), sent = []; let closed = false;
  net.ws = { readyState: 1, bufferedAmount: 600000, send: msg => sent.push(msg), close: () => { closed = true; } };
  assert.equal(net.send('input', { inputs: [] }), false); assert.equal(sent.length, 0); assert.equal(closed, true); net.dispose();
});

test('F39 only same-origin private HTTP LAN can use insecure WebSocket', () => {
  const location = { protocol: 'http:', hostname: '192.168.1.4', host: '192.168.1.4:8080', port: '8080' };
  assert.equal(validateEndpoint('ws://192.168.1.4:8080/ws', location), 'ws://192.168.1.4:8080/ws');
  assert.throws(() => validateEndpoint('ws://192.168.1.9:8080/ws', location)); assert.throws(() => validateEndpoint('ws://192.168.1.4:8081/ws', location));
  assert.throws(() => validateEndpoint('ws://192.168.1.4:8080/ws', { ...location, protocol: 'https:' }));
});

function voiceFixture({ denied = false } = {}) {
  const listeners = new Map(), sent = [], network = { clientId: 'a', on(type, fn) { listeners.set(type, fn); return () => listeners.delete(type); }, send(type, data) { sent.push({ type, ...data }); return true; } };
  let calls = 0, stopped = false; const track = { enabled: true, stop() { stopped = true; } }, stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const mediaDevices = { async getUserMedia() { calls++; if (denied) throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }); return stream; }, addEventListener() {}, removeEventListener() {} };
  const voice = new VoiceManager(network, { mediaDevices, PeerConnection: class {} });
  return { voice, listeners, sent, track, get calls() { return calls; }, get stopped() { return stopped; } };
}

test('F38 microphone is opt-in, PTT gated, muted and fully stopped on disconnect', async () => {
  const f = voiceFixture(); assert.equal(f.calls, 0); assert.equal(await f.voice.enable(), true); assert.equal(f.calls, 1); assert.equal(f.track.enabled, false);
  f.voice.setTalking(true); assert.equal(f.track.enabled, true); f.voice.setMuted(true); assert.equal(f.track.enabled, false);
  f.voice.setTalking(true); assert.equal(f.track.enabled, false); f.listeners.get('disconnected')(); assert.equal(f.stopped, true); assert.equal(f.voice.enabled, false); f.voice.dispose();
});

test('F38 denied mic is a recoverable explicit error and missing TURN is never claimed available', async () => {
  const denied = voiceFixture({ denied: true }); assert.equal(await denied.voice.enable(), false); assert.match(denied.voice.error, /permission denied/i); denied.voice.dispose();
  const f = voiceFixture(); await f.voice.enable(); f.voice.configure({ peers: [], iceServers: [], relayAvailable: false });
  assert.equal(f.voice.relayAvailable, false); assert.match(f.voice.error, /not verified/); f.voice.dispose();
});
