import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { Game } from '../src/game/Game.js';
import { Jet } from '../src/game/Jet.js';
import { Weapons } from '../src/game/Weapons.js';
import { terrainHeight } from '../src/game/World.js';
import { OpenSkiesEncounter, OPEN_SKIES, scoreOpenSkies } from '../src/game/OpenSkies.js';
import { configureSquadronJet, issueSquadronOrder, selectSquadronTarget, updateSquadronAI, COMBAT_DIFFICULTY } from '../src/game/SquadronAI.js';
import { recordOpenSkiesResult } from '../src/game/OpenSkiesProgress.js';
import { ProgressionManager, progression } from '../src/game/Progression.js';
import { normalizeSettings } from '../src/game/Settings.js';
import { updateFlight } from '../src/game/FlightPhysics.js';
import { primaryWarning } from '../src/ui/HUDState.js';

function harness(seed = 42) {
  const game = Object.create(Game.prototype);
  const effects = { emit() {}, burst() {}, smoke() {}, clear() {} };
  Object.assign(game, { scene: new T.Scene(), camera: new T.PerspectiveCamera(), cam: { mode: 'chase' }, effects,
    audio: { init() {}, play() {} }, settings: normalizeSettings().settings, state: 'menu', enemies: [], allies: [], player: new Jet('player'),
    input: { keys: new Set(), mouse: { x: 0, y: 0 }, clear() { this.keys.clear(); } },
    world: { collision: p => p.y < Math.max(3, terrainHeight(p.x, p.z)) + 3 },
    ui: { modalType: null, inGame() { this.modalType = null; }, message() {}, showMenu() { this.modalType = null; }, showPause() { this.modalType = 'pause'; }, showSquadron() { this.modalType = 'squadron'; }, showResult(success, reason) { game.result = { success, reason }; } },
  });
  game.weapons = new Weapons(game.scene, effects, game.damage.bind(game), () => {});
  game.start(2, { seed });
  return game;
}
function cleanup(g) { for (const j of [g.player, ...g.enemies, ...g.allies]) j.dispose(); g.weapons.dispose(); }
function advanceRecovery(g) {
  for (let i = 0; i < 602 && g.openSkies.state === 'recovery'; i++) {
    g.elapsed += 1 / 60;
    g.handleEncounterEvents(g.openSkies.tick(1 / 60, g.enemies, g.player.alive));
  }
}
function clearWave(g) {
  for (const jet of g.enemies.filter(j => j.alive)) g.damage(jet, jet.hp, g.player, 'cannon');
  g.handleEncounterEvents(g.openSkies.tick(1 / 60, g.enemies, g.player.alive));
}

test('encounter advances 3 + 4 + 1 once, freezes during pause, never wins between waves', () => {
  const encounter = new OpenSkiesEncounter(7);
  let events = encounter.start();
  assert.equal(events[0].units.length, 3); assert.deepEqual(encounter.start(), []);
  assert.equal(encounter.tick(.1, [], true)[0].type, 'radio');
  assert.equal(encounter.state, 'recovery');
  const before = encounter.snapshot();
  for (let i = 0; i < 300; i++) assert.deepEqual(encounter.tick(.1, [], true, false), []);
  assert.deepEqual(encounter.snapshot(), before);
  for (let i = 0; i < 100; i++) { const next = encounter.tick(.1, [], true); if (next.length) events = next; }
  assert.equal(events[0].units.length, 4); assert.equal(encounter.phase, 1);
  encounter.tick(.1, [], true);
  for (let i = 0; i < 100; i++) { const next = encounter.tick(.1, [], true); if (next.length) events = next; }
  assert.equal(events[0].units[0].role, 'ace');
  assert.equal(encounter.tick(.1, [], true)[0].type, 'complete');
  assert.deepEqual(encounter.tick(.1, [], true), []); assert.equal(encounter.defeated, 8);
});

test('seeds reproduce spawn routes and variants, abort/death cannot spawn another wave', () => {
  assert.deepEqual(new OpenSkiesEncounter(27).start(), new OpenSkiesEncounter(27).start());
  assert.notDeepEqual(new OpenSkiesEncounter(27).start(), new OpenSkiesEncounter(28).start());
  const e = new OpenSkiesEncounter(27); e.start();
  assert.equal(e.tick(.02, [], false)[0].type, 'failed'); assert.deepEqual(e.tick(.1, [], true), []);
  e.abort(); assert.equal(e.state, 'aborted'); assert.deepEqual(e.start(), []);
});

test('integrated Open Skies preserves wingmen, safe coastal spawns and no premature mission victory', () => {
  const g = harness(), allies = [...g.allies];
  assert.equal(g.enemies.length, 3); assert.equal(g.player.position.z, OPEN_SKIES.start.z);
  for (let phase = 0; phase < 3; phase++) {
    for (const j of g.enemies.filter(j => j.alive)) {
      assert.ok(j.position.distanceTo(g.player.position) >= 4200);
      assert.equal(g.world.collision(j.position), false);
      assert.ok(j.combat.graceUntil >= g.elapsed + 7.9);
    }
    assert.deepEqual(g.allies, allies);
    clearWave(g);
    if (phase < 2) {
      assert.equal(g.state, 'playing'); assert.equal(g.result, undefined);
      g.step(1 / 60); assert.notEqual(g.state, 'result');
      advanceRecovery(g);
      assert.equal(g.openSkies.phase, phase + 1);
    }
  }
  assert.equal(g.result.success, true); assert.equal(g.enemies.length, 8);
  assert.equal(g.battleResult.survivors, 2);
  const xp = progression.profile.xp, wins = progression.profile.missionsWon;
  g.finish(true); g.finish(false); assert.equal(progression.profile.xp, xp); assert.equal(progression.profile.missionsWon, wins);
  cleanup(g);
});

test('real cannon and missile pools can defeat each wave and reach the final debrief', () => {
  const g = harness(17);
  for (let phase = 0; phase < 3; phase++) {
    for (const enemy of g.enemies.filter(j => j.alive)) {
      enemy.position.copy(g.player.position).add(new T.Vector3(0, 0, -1000)); enemy.velocity.set(0, 0, 0);
      g.target = enemy; g.lock = 1.4; g.missileCooldown = 0;
      if (g.missilesLeft) {
        g.launch();
        for (let i = 0; i < 400 && enemy.alive; i++) g.weapons.update(1 / 60, [g.player, enemy]);
      }
      for (let shot = 0; shot < 30 && enemy.alive; shot++) {
        g.stats.shots++; g.weapons.cannon(g.player, enemy, { spread: 0 });
        for (let i = 0; i < 42 && enemy.alive; i++) g.weapons.update(1 / 60, [g.player, enemy]);
      }
      assert.equal(enemy.alive, false);
    }
    g.handleEncounterEvents(g.openSkies.tick(1 / 60, g.enemies, g.player.alive));
    advanceRecovery(g);
  }
  assert.equal(g.result.success, true); assert.equal(g.stats.kills, 8); assert.equal(g.stats.missiles, 6);
  assert.ok(g.battleResult.accuracy <= 100 && g.battleResult.accuracy > 0);
  cleanup(g);
});

test('cover prioritizes threats, attack persists and invalid targets fall back, regroup holds formation intent', () => {
  const g = harness();
  const [wing] = g.allies, [a, b] = g.enemies;
  a.position.copy(wing.position).add(new T.Vector3(0, 0, -1000));
  b.position.copy(wing.position).add(new T.Vector3(0, 0, -1800)); b.combat.target = g.player;
  assert.equal(selectSquadronTarget(wing, g), b);
  g.target = a; assert.equal(issueSquadronOrder(g, 'attack'), true);
  g.target = b; assert.equal(selectSquadronTarget(wing, g), a);
  a.alive = false; assert.equal(selectSquadronTarget(wing, g), b); assert.equal(wing.order, 'cover');
  assert.equal(issueSquadronOrder(g, 'regroup'), true);
  assert.equal(selectSquadronTarget(wing, g), null);
  const initialDistance = wing.position.distanceTo(g.player.position);
  for (let i = 0; i < 600; i++) { g.player.position.addScaledVector(g.player.forward, g.player.speed / 60); updateSquadronAI(wing, g, 1 / 60); }
  assert.equal(wing.aiState, 'formation'); assert.ok(wing.position.distanceTo(g.player.position) < initialDistance + 1500);
  g.target = null; assert.equal(issueSquadronOrder(g, 'attack'), false);
  for (const jet of g.allies) jet.alive = false;
  assert.equal(issueSquadronOrder(g, 'cover'), false);
  cleanup(g);
});

test('orders panel freezes simulation, clears held inputs, respects custom bindings and prior pause; MP keeps routing', () => {
  const g = harness();
  g.settings.keyBindings = { teamComms: 'KeyF', command3: 'KeyJ' };
  g.input.keys.add('ArrowUp'); g.action('KeyF');
  assert.equal(g.state, 'paused'); assert.equal(g.input.keys.size, 0);
  const elapsed = g.elapsed; g.step(.1); assert.equal(g.elapsed, elapsed);
  g.action('KeyJ'); assert.equal(g.state, 'playing'); assert.equal(g.allies[0].order, 'regroup');
  g.action('Digit1'); assert.equal(g.allies[0].order, 'regroup', 'numbers outside panel must not command');
  g.state = 'paused'; g.ui.showPause(); g.openSquadronPanel(); g.action('pause'); assert.equal(g.state, 'paused'); assert.equal(g.ui.modalType, 'pause');
  g.state = 'playing'; g.ui.modalType = null;
  let toggles = 0, command = 0;
  g.multiplayer = { active: true, comms: { isOpen: true, toggle() { toggles++; }, triggerCommand(value) { command = value; } } };
  g.action('KeyF'); g.action('Digit2'); assert.equal(toggles, 1); assert.equal(command, 2); assert.equal(g.state, 'playing');
  cleanup(g);
});

test('AI reaction/grace, real lock, ammo and recovery constrain firing; roles behave differently', () => {
  const g = harness(), enemy = g.enemies.find(j => j.combatRole === 'missile');
  let launches = 0;
  g.weapons.missile = () => { launches++; return true; };
  for (let i = 0; i < 480; i++) {
    enemy.position.copy(g.player.position).add(new T.Vector3(0, 0, 3000)); enemy.quaternion.identity();
    g.elapsed = i / 60; updateSquadronAI(enemy, g, 1 / 60);
  }
  assert.equal(launches, 0);
  for (let i = 0; i < 240; i++) {
    enemy.position.copy(g.player.position).add(new T.Vector3(0, 0, 3000)); enemy.quaternion.identity();
    g.elapsed += 1 / 60; updateSquadronAI(enemy, g, 1 / 60);
  }
  assert.equal(launches, 1); assert.ok(enemy.combat.recovery > 0); assert.equal(enemy.combat.missiles, 3);
  const dogfighter = g.enemies[0]; assert.equal(dogfighter.combat.missiles, 0);
  configureSquadronJet(dogfighter, { role: 'support' }); assert.ok(g.allies.includes(selectSquadronTarget(dogfighter, g)));
  assert.ok(COMBAT_DIFFICULTY.easy.reaction > COMBAT_DIFFICULTY.hard.reaction);
  assert.ok(COMBAT_DIFFICULTY.easy.aimError > COMBAT_DIFFICULTY.hard.aimError);
  g.hostileLock = true; g.incoming = []; assert.equal(primaryWarning(g, 0, 'combat').id, 'lock');
  g.incoming = [{}]; assert.equal(primaryWarning(g, 0, 'combat').id, 'missile');
  cleanup(g);
});

test('losing wingmen does not fail Easy, player death fails from every phase; restart/menu clear battle resources', () => {
  for (let phase = 0; phase < 3; phase++) {
    const g = harness(phase);
    for (let i = 0; i < phase; i++) { clearWave(g); advanceRecovery(g); }
    for (const ally of g.allies) g.damage(ally, 1e3, null, 'terrain');
    assert.equal(g.state, 'playing');
    g.damage(g.player, 1e3, null, 'terrain'); g.step(1 / 60);
    assert.equal(g.result.success, false); assert.equal(g.battleResult.medal, 'No medal');
    const stale = g.openSkies;
    g.start(2, { seed: 123 }); assert.equal(stale.state, 'aborted'); assert.equal(g.enemies.length, 3); assert.ok(g.allies.every(j => j.alive));
    assert.equal(g.stats.damageTaken, 0); assert.equal(g.target.alive, true); assert.equal(g.input.menuMode, null);
    for (const o of [...g.weapons.bullets, ...g.weapons.missiles]) assert.equal(o.owner, null);
    g.menu(); assert.equal(g.openSkies, null); assert.equal(g.target, null); assert.equal(g.enemies.length, 0); assert.equal(g.notifications.length, 0);
    cleanup(g);
  }
});

test('repeated starts preserve bounded scene size and mode switches restore personal sky preferences', () => {
  const g = harness();
  g.settings.timeOfDay = 'night'; g.settings.weather = 'storm';
  g.atmosphere = { setTimeOfDay(v) { this.timeOfDay = v; this.hasApplied = true; }, setWeather(v) { this.weather = v; } };
  g.applyMissionEnvironment(); assert.equal(g.atmosphere.timeOfDay, 'midday'); assert.equal(g.atmosphere.weather, 'clear');
  const nodes = g.scene.children.length;
  for (let i = 0; i < 12; i++) { g.start(2, { seed: i }); assert.equal(g.scene.children.length, nodes); }
  for (const id of [0, 1, 3]) {
    g.start(id); assert.equal(g.openSkies, null); assert.equal(g.atmosphere.timeOfDay, 'night'); assert.equal(g.atmosphere.weather, 'storm');
  }
  assert.equal(g.settings.timeOfDay, 'night'); assert.equal(g.settings.weather, 'storm');
  cleanup(g);
});

test('medals are bounded, zero shots/failures cannot fake accuracy; XP and best scores are once per sortie', () => {
  const result = scoreOpenSkies({ success: true, stats: { shots: 20, hits: 20 }, allies: [{ alive: true }, { alive: true }] });
  assert.equal(result.medal, 'Gold'); assert.equal(result.points, 100);
  const empty = scoreOpenSkies({ success: true, stats: { shots: NaN, hits: Infinity, damageTaken: 10000 }, maxHp: 0 });
  assert.equal(empty.accuracy, 0); assert.equal(empty.points, 50); assert.equal(empty.medal, 'Bronze');
  const failure = scoreOpenSkies({ success: false }); assert.equal(failure.bonusXP, 0); assert.equal(failure.medal, 'No medal');
  const manager = new ProgressionManager(), before = manager.profile.xp;
  const first = recordOpenSkiesResult(manager, 'test-sortie', result, 'easy');
  assert.equal(first.personalBest, true); assert.equal(manager.profile.xp, before + 900);
  recordOpenSkiesResult(manager, 'test-sortie', result, 'easy'); assert.equal(manager.profile.xp, before + 900);
  recordOpenSkiesResult(manager, 'failed-sortie', failure); assert.equal(manager.profile.xp, before + 900);
  assert.equal(manager.profile.openSkies.best.easy.points, 100);
});

test('progress migration preserves legacy XP/unlocks, validates corrupt fields and survives disabled storage', () => {
  const previous = globalThis.localStorage;
  try {
    globalThis.localStorage = { getItem: () => JSON.stringify({ callsign: 'ACE', xp: 8000, kills: 12, customField: true, openSkies: { best: { easy: { points: Infinity, medal: 'Gold' } }, completed: 'invalid' } }), setItem() { throw Error('quota'); } };
    const manager = new ProgressionManager();
    assert.equal(manager.profile.xp, 8000); assert.equal(manager.profile.kills, 12); assert.equal(manager.isUnlocked('jet', 'f22'), true);
    assert.equal(manager.profile.customField, true); assert.equal(manager.profile.openSkies.best.easy.points, 0);
    assert.doesNotThrow(() => recordOpenSkiesResult(manager, 'new', scoreOpenSkies({ success: true })));
    globalThis.localStorage.getItem = () => '{broken'; assert.equal(new ProgressionManager().profile.xp, 0);
    globalThis.localStorage.getItem = () => { throw Error('denied'); }; assert.equal(new ProgressionManager().profile.xp, 0);
  } finally { if (previous === undefined) delete globalThis.localStorage; else globalThis.localStorage = previous; }
});

test('default pitch responds in first simulation tick; release stabilizes without affecting manual choice', () => {
  const g = harness(); g.input.keys.add('ArrowUp');
  const before = g.player.quaternion.clone(); updateFlight(g.player, g.input, 1 / 60, g.settings);
  assert.ok(g.player.forward.y > 0); assert.notDeepEqual(g.player.quaternion, before);
  g.input.keys.clear(); g.input.keys.add('ArrowDown');
  for (let i = 0; i < 120; i++) updateFlight(g.player, g.input, 1 / 60, g.settings);
  assert.ok(g.player.forward.y < -.1);
  g.input.keys.clear(); for (let i = 0; i < 360; i++) updateFlight(g.player, g.input, 1 / 60, g.settings);
  assert.ok(Math.abs(g.player.forward.y) < .03);
  cleanup(g);
});

test('all AI roles keep finite poses and terrain clearance through sustained coastal manoeuvres', () => {
  const g = harness(44);
  clearWave(g); advanceRecovery(g);
  const active = g.enemies.filter(j => j.alive);
  configureSquadronJet(active[0], { role: 'ace', seed: 11 });
  g.weapons.cannon = () => true; g.weapons.missile = () => true; g.weapons.deployFlares = () => 0;
  for (let tick = 0; tick < 5400; tick++) {
    g.elapsed += 1 / 60;
    const angle = tick / 1200;
    g.player.position.set(OPEN_SKIES.center.x + Math.cos(angle) * 4500, 1500, OPEN_SKIES.center.z + Math.sin(angle) * 4500);
    g.player.velocity.set(-Math.sin(angle) * 225, 0, Math.cos(angle) * 225);
    g.player.quaternion.setFromUnitVectors(new T.Vector3(0,0,-1), g.player.velocity.clone().normalize());
    for (const jet of [...active, ...g.allies]) {
      updateSquadronAI(jet, g, 1 / 60);
      assert.ok(jet.position.toArray().every(Number.isFinite));
      assert.equal(g.world.collision(jet.position), false, `${jet.combatRole} terrain collision at ${tick}`);
      assert.ok(Math.abs(jet.quaternion.length() - 1) < 1e-6);
    }
  }
  cleanup(g);
});

test('mission difficulty and medal category are fixed at launch', () => {
  const g = harness(); g.settings.difficulty = 'hard';
  assert.equal(g.openSkies.difficulty, 'easy');
  for (let i = 0; i < 3; i++) { clearWave(g); advanceRecovery(g); }
  assert.equal(g.battleResult.difficulty, 'easy');
  g.start(2); assert.equal(g.openSkies.difficulty, 'hard'); cleanup(g);
});
