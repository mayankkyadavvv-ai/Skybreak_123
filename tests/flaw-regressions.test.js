import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { parseHTML } from 'linkedom';
import { Game } from '../src/game/Game.js';
import { Jet } from '../src/game/Jet.js';
import { Weapons } from '../src/game/Weapons.js';
import { Input } from '../src/game/Input.js';
import { normalizeSettings } from '../src/game/Settings.js';
import { terrainHeight } from '../src/shared/WorldGeometry.js';
import { handleOperationEvents } from '../src/game/MissionIntegration.js';
import { UI } from '../src/ui/UI.js';
import { MultiplayerManager } from '../src/multiplayer/MultiplayerManager.js';
import { NetworkManager } from '../src/multiplayer/NetworkManager.js';
import { bindingLabel, bindingError, actionForCode } from '../src/game/InputActions.js';
import { flightCommands, updateFlight } from '../src/game/FlightPhysics.js';
import { FlightSchool } from '../src/game/FlightSchool.js';
import { openSkiesFlightSettings } from '../src/game/FlightAssists.js';
import { battleGuide } from '../src/ui/OpenSkiesUI.js';
import { LocalCoop } from '../src/game/LocalCoop.js';
import { MultiplayerUI } from '../src/ui/MultiplayerUI.js';

const control = (...keys) => ({ keys: new Set(keys), heldActions: new Set(), mouse: { x: 0, y: 0 }, axes: {}, look: { x: 0, y: 0 }, levelTimer: 0,
  clear() { this.keys.clear(); this.heldActions.clear(); this.levelTimer = 0; } });
function harness(t, id = 3) {
  const g = Object.create(Game.prototype), effects = { emit() {}, burst() {}, smoke() {}, clear() {} };
  Object.assign(g, { scene: new T.Scene(), camera: new T.PerspectiveCamera(), cam: { mode: 'chase', reset() {}, cycle() {} },
    effects, audio: { init() {}, play() {} }, settings: normalizeSettings().settings,
    state: 'menu', enemies: [], allies: [], player: new Jet('player'), input: control(), messages: [],
    world: { collision: p => p.y < Math.max(3, terrainHeight(p.x, p.z)) + 3 },
    ui: { modalType: null, inGame() { this.modalType = null; }, message(text) { g.messages.push(text); }, closePanel() { this.modalType = null; },
      showMenu() { this.modalType = null; }, showResult(success, reason) { g.result = { success, reason }; } } });
  g.input.player = g.player;
  g.weapons = new Weapons(g.scene, effects, g.damage.bind(g), () => {});
  g.start(id, { seed: 4422 });
  t.after(() => { g.stopLocalCoop(); for (const p of [g.player, ...g.enemies, ...g.allies]) p.dispose(); g.weapons.dispose(); });
  return g;
}
function restart(g) { UI.prototype.action.call({ game: g, experienceAction() { return false; } }, 'restart'); }
function online(g, options = { mode: '1v1', weather: 'storm', timeOfDay: 'night', weaponsEnabled: true }) {
  const mp = Object.create(MultiplayerManager.prototype), sent = [];
  Object.assign(mp, { game: g, active: false, sync: { beginEpoch() {} }, prediction: { clear() {} }, pings: new Map(),
    weapons: { clear() {} }, clearRemotePlayers() {}, network: { send(type, payload) { sent.push({ type, payload }); } },
    leaveMatch() { this.active = false; } });
  g.multiplayer = mp; mp.onGameStarted({ myId: 'audit-pilot', epoch: 'audit-match', options });
  return { mp, sent };
}
function globals(t, values) {
  const previous = Object.fromEntries(Object.keys(values).map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  for (const [k, value] of Object.entries(values)) Object.defineProperty(globalThis, k, { value, configurable: true, writable: true });
  t.after(() => { for (const [k, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k]; } });
}

test('Friends offline Free Flight clears the old battle, damage and controls and restarts the chosen mode', t => {
  const g = harness(t, 2), oldAircraft = [...g.enemies, ...g.allies];
  let disposed = 0;
  for (const jet of oldAircraft) { const dispose = jet.dispose.bind(jet); jet.dispose = () => { disposed++; dispose(); }; }
  g.player.systems.engine = .2; g.player.angular.x = 1; g.input.keys.add('ArrowUp');
  g.menu();
  MultiplayerUI.prototype.launchInstantDuel.call({ game: g, ui: g.ui }, 'free_flight');
  assert.equal(g.openSkies, null); assert.equal(g.operation, null);
  assert.equal(g.mission.freeFlight, true); assert.equal(g.enemies.length, 0);
  assert.equal(disposed, oldAircraft.length); assert.equal(g.player.systems.engine, 1);
  assert.equal(g.player.angular.length(), 0); assert.equal(g.input.keys.size, 0);
  const sortie = g.sortieId;
  restart(g);
  assert.equal(g.mission.freeFlight, true); assert.equal(g.openSkies, null);
  assert.equal(g.enemies.length, 0); assert.notEqual(g.sortieId, sortie);
});

test('Friends offline Ace Duel leaves campaign runtime and restarts with one valid hostile', t => {
  const g = harness(t);
  g.newCampaign(912); g.startCampaignSector('strait');
  const campaign = JSON.stringify(g.campaignState);
  g.menu();
  MultiplayerUI.prototype.launchInstantDuel.call({ game: g, ui: g.ui });
  assert.equal(g.operation, null); assert.equal(g.training, false);
  assert.equal(g.mission.duel, true); assert.equal(g.state, 'playing');
  assert.equal(g.enemies.length, 1); assert.equal(g.enemies[0].modelId, 'su57');
  assert.equal(g.target, g.enemies[0]); assert.equal(g.player.gearDown, false);
  const sortie = g.sortieId, mission = g.mission.id;
  restart(g);
  assert.equal(g.mission.id, mission); assert.equal(g.enemies.length, 1);
  assert.equal(g.enemies[0].modelId, 'su57'); assert.notEqual(g.sortieId, sortie);
  assert.equal(JSON.stringify(g.campaignState), campaign);
  assert.equal(normalizeSettings({ lastMissionId: mission }).settings.lastMissionId, mission);
});

test('A01 UI Restart preserves custom preset and new campaign attempt advances its sector exactly once', t => {
  const g = harness(t);
  assert.equal(g.startOperation('intercept', { seed: 9876, location: 'ridge', weather: 'storm', difficulty: 'hard', pacing: 'fixed', enemyBudget: 10, routeVariant: 1 }).ok, true);
  const preset = { ...g.operation.preset }, initialId = g.sortieId;
  restart(g);
  assert.deepEqual(g.operation.preset, preset); assert.notEqual(g.sortieId, initialId);
  g.newCampaign(9876); assert.equal(g.startCampaignSector('strait').ok, true);
  const context = { ...g.operation.campaignContext }, oldId = g.sortieId;
  restart(g);
  assert.deepEqual(g.operation.campaignContext, context); assert.notEqual(g.sortieId, oldId);
  const events = g.operation.finish(true, 'Transport extracted');
  handleOperationEvents(g, events); handleOperationEvents(g, events);
  assert.equal(g.state, 'result'); assert.equal(g.result.success, true);
  assert.equal(g.campaignState.sectors.strait.attempts, 1);
  assert.equal(g.campaignState.sectors.strait.status, 'secured');
  assert.equal(g.campaignState.sectors.ridge.status, 'available');
});

test('A01 Open Skies Restart retains seed/difficulty while a new sortie uses new preferences', t => {
  const g = harness(t, 2), seed = g.openSkies.seed, id = g.sortieId;
  g.settings.difficulty = 'hard'; restart(g);
  assert.equal(g.openSkies.seed, seed); assert.equal(g.openSkies.difficulty, 'easy'); assert.notEqual(g.sortieId, id);
  g.start(2, { seed: 999 }); assert.equal(g.openSkies.seed, 999); assert.equal(g.openSkies.difficulty, 'hard');
});

test('operation failure reaches the debrief and a restarted attempt can finish successfully', t => {
  const g = harness(t); g.startOperation('intercept', { seed: 123 });
  handleOperationEvents(g, g.operation.finish(false, 'Bomber crossed the release line'));
  assert.deepEqual(g.result, { success: false, reason: 'Bomber crossed the release line' }); assert.equal(g.state, 'result');
  restart(g); assert.equal(g.state, 'playing'); assert.equal(g.operation.preset.seed, 123);
  handleOperationEvents(g, g.operation.finish(true, 'All bombers intercepted'));
  assert.equal(g.state, 'result'); assert.equal(g.result.success, true);
});

test('local co-op seat Restart retains both seats and encounter seed with refreshed aircraft', t => {
  const { document } = parseHTML('<html><body><main id="app"><div id="hud"></div></main></body></html>');
  const pad = { index: 1, mapping: 'standard', connected: true, axes: [0,0,0,0], buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false })) };
  globals(t, { document, innerWidth: 1366, innerHeight: 768, navigator: { getGamepads: () => [pad] } });
  const g = harness(t, 2); g.ui.root = document.getElementById('app'); g.ui.hudEl = document.getElementById('hud');
  g.renderer = { domElement: { clientWidth: 1366, clientHeight: 768 } };
  g.localCoop = new LocalCoop(g, { mode: 'open_skies', inputMode: 'keyboard-controller' }, { primary: null, secondary: 1 });
  g.localCoop.start(); const oldSecond = g.localCoop.players[1], seed = g.openSkies.seed;
  g.localCoop.seats[0].menu.querySelector('[data-local="restart"]').click();
  assert.equal(g.localCoop.active, true); assert.equal(g.localCoop.players.length, 2); assert.notEqual(g.localCoop.players[1], oldSecond);
  assert.equal(g.openSkies.seed, seed); assert.equal(document.querySelectorAll('.seat-hud').length, 2);
  assert.match(g.localCoop.seats[0].notice.textContent, /E \/ RMB missile/); assert.match(g.localCoop.seats[1].notice.textContent, /A missile/);
});

test('A02 online pilot menu hides Restart and both UI action and direct solo start preserve match state', t => {
  const g = harness(t, 0), { sent } = online(g);
  g.player.position.set(7000, 2500, -9000);
  const position = g.player.position.clone();
  let html; UI.prototype.showPause.call({ game: g, settings: g.settings, panel(a, b, value) { html = value; } });
  assert.doesNotMatch(html, /data-action="restart"/);
  restart(g); assert.equal(g.start(0).ok, false);
  assert.equal(g.mission.id, 'multiplayer'); assert.equal(g.multiplayer.active, true);
  assert.ok(g.player.position.equals(position)); assert.equal(g.enemies.length, 0); assert.equal(sent.length, 0);
});

test('A03 settings and hangar keep room time/weather; leaving an operation restores solo preferences', t => {
  const g = harness(t);
  globals(t, { window: { devicePixelRatio: 1 }, innerWidth: 1280, innerHeight: 720 });
  g.renderer = { setPixelRatio() {}, setSize() {}, shadowMap: {} };
  g.atmosphere = { hasApplied: true, timeOfDay: 'day', weather: 'clear', setTimeOfDay(value) { this.timeOfDay = value; }, setWeather(value) { this.weather = value; } };
  g.settings.timeOfDay = 'day'; g.settings.weather = 'clear'; online(g);
  const sky = () => [g.atmosphere.timeOfDay, g.atmosphere.weather];
  assert.deepEqual(sky(), ['night', 'storm']);
  g.settings.sensitivity = 1.2; g.applySettings(); assert.deepEqual(sky(), ['night', 'storm']);
  g.action('timeOfDay'); assert.deepEqual(sky(), ['night', 'storm']);
  g.beginHangarPreview(); g.applySettings(); assert.deepEqual(sky(), ['midday', 'clear']);
  g.endHangarPreview(); assert.deepEqual(sky(), ['night', 'storm']);
  g.multiplayer.active = false; g.startOperation('escort', { weather: 'storm' }); assert.deepEqual(sky(), ['midday', 'storm']);
  g.start(3); assert.deepEqual(sky(), ['day', 'clear']);
});

function networkFixture(t) {
  const timers = new Map(), sockets = [], attempts = []; let id = 0, time = 0, failures = 0;
  globals(t, { setTimeout(fn, delay) { const next = ++id; timers.set(next, { fn, at: time + delay }); return next; },
    clearTimeout(id) { timers.delete(id); }, setInterval() { return ++id; }, clearInterval() {} });
  const net = new NetworkManager({ clock: () => time, sessionStore: {}, socketFactory() {
    const ws = { readyState: 0, bufferedAmount: 0, send() {}, close() { this.readyState = 3; } }; sockets.push(ws); return ws;
  } });
  t.after(() => net.dispose());
  net.on('reconnecting', msg => attempts.push(msg)); net.on('reconnect_failed', () => failures++);
  const advance = ms => { const target = time + ms; while (true) { const entry = [...timers].filter(([,v]) => v.at <= target).sort((a,b) => a[1].at - b[1].at)[0]; if (!entry) break; timers.delete(entry[0]); time = entry[1].at; entry[1].fn(); } time = target; };
  return { net, attempts, sockets, advance, get failures() { return failures; },
    open() { const ws = sockets.at(-1); ws.readyState = 1; ws.onopen(); },
    close() { const ws = sockets.at(-1); ws.readyState = 3; ws.onclose({ code: 1013, reason: 'Server capacity reached' }); },
    welcome() { sockets.at(-1).onmessage({ data: JSON.stringify({ type: 'welcome', protocol: 2, id: 'pilot' }) }); } };
}

test('A04 accepted but rejected connections stop after seven retries with increasing backoff', t => {
  const f = networkFixture(t); f.net.connect('ws://localhost:8080');
  for (let cycle = 0; cycle < 8; cycle++) { f.open(); f.close(); if (cycle < 7) f.advance(f.attempts.at(-1).delay); }
  assert.deepEqual(f.attempts.map(a => a.attempt), [1,2,3,4,5,6,7]);
  assert.deepEqual(f.attempts.map(a => a.delay), [600,1200,2400,4800,6000,6000,6000]);
  assert.equal(f.failures, 1); assert.equal(f.net.reconnecting, false);
  f.advance(60000); assert.equal(f.sockets.length, 8);
  f.net.connect('ws://localhost:8080'); f.open(); f.close(); assert.equal(f.attempts.at(-1).attempt, 1);
});

test('A04 retry budget resets only after a ready session stays connected, and dispose clears it', t => {
  const f = networkFixture(t); f.net.connect('ws://localhost:8080'); f.open(); f.close(); f.advance(600); f.open();
  assert.equal(f.net.reconnectAttempts, 1); f.welcome(); f.advance(9999); assert.equal(f.net.reconnectAttempts, 1);
  f.advance(1); assert.equal(f.net.reconnectAttempts, 0); f.close(); assert.equal(f.attempts.at(-1).attempt, 1);
  f.advance(600); f.open(); f.welcome(); f.net.disconnect(); f.advance(20000); assert.equal(f.net.sessionReady, false);
});

test('A05 real missile warning handler uses current custom keyboard and controller flare labels', () => {
  for (const [settings, expected] of [[{ device: 'keyboard', keyBindings: { flare: 'KeyO' } }, 'O'], [{ device: 'gamepad' }, 'B']]) {
    const listeners = new Map(), messages = [], mp = Object.create(MultiplayerManager.prototype);
    Object.assign(mp, { game: { settings, audio: { play() {} }, ui: { message(text) { messages.push(text); } } }, network: { on(event, callback) { listeners.set(event, callback); } } });
    mp.setupNetworkHandlers(); listeners.get('missile_warning')({});
    assert.equal(messages[0], `MISSILE WARNING · DEPLOY FLARES [${expected}]`);
  }
});

test('A06 UI Restart of a long flare lesson resets instructor state and initial threat timing', t => {
  const g = harness(t), launches = [];
  g.world.collision = () => false; g.weapons.missile = () => { launches.push(g.elapsed); return true; };
  const school = new FlightSchool({ onSetup: id => g.prepareTrainingLesson(id), onCleanup: () => g.clearTrainingLesson() }); g.flightSchool = school;
  assert.equal(school.start('flare', g).ok, true);
  for (let i = 0; i < 1800; i++) g.step(1 / 60);
  assert.ok(g.trainingLastMissile > 28);
  school.stage = 1; school.seenThreat = true; restart(g);
  assert.equal(school.stage, 0); assert.equal(school.seenThreat, false); assert.equal(g.trainingLastMissile, null);
  launches.length = 0; g.step(1 / 60); assert.equal(launches.length, 1); assert.equal(g.trainingLesson, 'flare');
  g.start(3); assert.equal(school.active, false); assert.equal(g.trainingLesson, null); assert.equal(g.trainingLastMissile, null);
});

test('E missile migration includes old saved profiles without yaw collisions and preserves later custom choices', () => {
  const saved = { controlsVersion: 4, keyBindings: { missile: 'KeyM', yawRight: 'KeyE', flare: 'KeyO' },
    controlProfiles: [{ id: 'old', name: 'Old keys', settings: { keyBindings: { missile: 'KeyF', yawRight: 'KeyE' }, mouseInvert: true } }] };
  const { settings, notices } = normalizeSettings(saved);
  assert.equal(settings.controlsVersion, 5); assert.equal(actionForCode('KeyE', settings), 'missile');
  assert.equal(flightCommands(control('KeyE'), settings).yaw, 0); assert.equal(flightCommands(control('KeyD'), settings).yaw, 1);
  assert.equal(bindingLabel('flare', settings), 'O'); assert.ok(notices[0].includes('Missile = E'));
  const profile = settings.controlProfiles[0].settings;
  assert.equal(profile.controlsVersion, 5); assert.equal(actionForCode('KeyE', profile), 'missile'); assert.equal(profile.mouseInvert, true);
  const custom = normalizeSettings({ controlsVersion: 5, keyBindings: { missile: 'KeyF' } }).settings;
  assert.equal(actionForCode('KeyF', custom), 'missile'); assert.equal(bindingError('yawRight', 'KeyE', settings).length > 0, true);
  assert.equal(flightCommands(control('ArrowUp'), settings).pitch, 1); assert.equal(flightCommands(control('ArrowDown'), settings).pitch, -1);
  assert.match(battleGuide(settings), /E \/ RMB/);
});

test('actual E key press launches once, held auto-repeat never fires again and E never yaws the jet', t => {
  const { window, document } = parseHTML('<html><body><canvas id="world"></canvas></body></html>'); globals(t, { window, document });
  const g = harness(t, 2), input = new Input(document.querySelector('canvas'), action => g.action(action), () => g.state === 'playing' && !g.ui.modalType, () => g.settings);
  t.after(() => input.dispose()); g.input = input; input.player = g.player;
  let launches = 0; g.weapons.missile = () => { launches++; return true; }; g.target = g.enemies[0]; g.lock = 1.4;
  const key = (type, repeat = false) => { const event = new window.Event(type); Object.assign(event, { code: 'KeyE', repeat }); window.dispatchEvent(event); };
  const ammo = g.missilesLeft; key('keydown'); assert.equal(launches, 1); assert.equal(g.missilesLeft, ammo - 1);
  g.missileCooldown = 0; g.lock = 1.4; key('keydown', true); assert.equal(launches, 1);
  assert.equal(flightCommands(input, g.getFlightSettings()).yaw, 0);
  key('keyup'); key('keydown'); assert.equal(launches, 2);
  key('keyup'); g.ui.modalType = 'settings'; key('keydown'); assert.equal(launches, 2);
});

test('gentler Open Skies controls respond immediately, bank less and settle when released at 30/60/144 render FPS', t => {
  const settings = normalizeSettings().settings, easy = openSkiesFlightSettings(settings, true), positions = [];
  for (const fps of [30,60,144]) {
    const jet = new Jet('player'), throttle = jet.throttle; t.after(() => jet.dispose()); let accumulator = 0, ticks = 0;
    for (let frame = 0; frame < fps * 8; frame++) {
      accumulator += 1 / fps;
      while (accumulator + 1e-10 >= 1 / 60) {
        updateFlight(jet, control(...(ticks < 120 ? ['ArrowUp', 'ArrowRight'] : [])), 1 / 60, easy);
        if (ticks === 0) assert.ok(jet.forward.y > 0 && jet.forward.x > 0);
        accumulator -= 1 / 60; ticks++;
      }
    }
    assert.equal(ticks, 480); const attitude = new T.Euler().setFromQuaternion(jet.quaternion, 'YXZ');
    assert.ok(Math.abs(attitude.x) < .01 && Math.abs(attitude.z) < .01); assert.equal(jet.throttle, throttle);
    positions.push(jet.position.clone());
  }
  assert.ok(positions[0].distanceTo(positions[2]) < .001);
  const pair = [new Jet('player'), new Jet('player')]; t.after(() => pair.forEach(p => p.dispose()));
  for (let i = 0; i < 120; i++) { updateFlight(pair[0], control('ArrowUp', 'ArrowRight'), 1 / 60, easy); updateFlight(pair[1], control('ArrowUp', 'ArrowRight'), 1 / 60, settings); }
  const [a,b] = pair.map(j => new T.Euler().setFromQuaternion(j.quaternion, 'YXZ'));
  assert.ok(a.x > .15 && a.x < b.x); assert.ok(Math.abs(a.z) > .2 && Math.abs(a.z) < Math.abs(b.z));
  const manual = { ...settings, flightMode: 'manual' };
  assert.equal(openSkiesFlightSettings(manual, true), manual); assert.equal(openSkiesFlightSettings(settings, false), settings);
  const off = { ...settings, openSkiesEasyControls: false }; assert.equal(openSkiesFlightSettings(off, true), off);
});

test('Open Skies cooperative prediction and local second seat receive the same gentler pilot settings', t => {
  const g = harness(t, 2); const solo = g.getFlightSettings();
  const second = Object.create(g); second.settings = { ...g.settings, device: 'gamepad' };
  assert.equal(second.getFlightSettings().rollSensitivity, solo.rollSensitivity);
  const { mp } = online(g, { mode: 'open_skies_coop', weather: 'clear', timeOfDay: 'midday' });
  g.input.keys.add('ArrowUp'); g.input.keys.add('ArrowRight');
  let sent; mp.comms = { isOpen: false }; mp.inputSendTimer = 0;
  mp.prediction = { state: {}, predict(command) { sent = command; return true; }, applyToJet() {} };
  mp.predictLocalFlight(1 / 60);
  assert.equal(sent.pitch, solo.pitchSensitivity); assert.equal(sent.roll, solo.rollSensitivity); assert.equal(sent.assisted, true);
});
