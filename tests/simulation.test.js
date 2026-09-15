import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { Jet } from "../src/game/Jet.js";
import { updateFlight } from "../src/game/FlightPhysics.js";
import { Weapons, updateLock } from "../src/game/Weapons.js";
import { missionStatus, MISSIONS, FREE_FLIGHT } from "../src/game/Missions.js";
import { updateAI } from "../src/game/AI.js";
import { BASE, terrainHeight } from "../src/game/World.js";
import { pointSegmentDistance } from "../src/game/math.js";
const settings = { input: "advanced", sensitivity: 1, invert: false, difficulty: "easy" };
const input = (...keys) => ({ keys: new Set(keys), mouse: { x: 0, y: 0 } });
const effects = { emit() {
}, burst() {
}, smoke() {
} };
const makeWeapons = (hit) => new Weapons(new T.Scene(), effects, hit, () => {
});
test("pitch, roll and yaw have the requested signs and forward flight is stable", () => {
  for (const [key, axis, sign] of [["KeyS", "y", 1], ["KeyW", "y", -1], ["KeyQ", "x", -1], ["KeyE", "x", 1]]) {
    const p2 = new Jet("player");
    for (let i = 0; i < 60; i++) updateFlight(p2, input(key), 1 / 60, settings);
    assert.ok(p2.forward[axis] * sign > 0.1, key);
  }
  const a = new Jet("player");
  updateFlight(a, input("KeyA"), 0.1, settings);
  assert.ok(a.quaternion.z > 0);
  const d = new Jet("player");
  updateFlight(d, input("KeyD"), 0.1, settings);
  assert.ok(d.quaternion.z < 0);
  const p = new Jet("player");
  for (let i = 0; i < 600; i++) updateFlight(p, input(), 1 / 60, settings);
  assert.ok(p.position.z < -1800);
  assert.ok(Math.abs(p.position.y) < 0.01);
});
test("mouse steering and inversion, acceleration, braking and speed limits", () => {
  const p = new Jet("player");
  const controls = input();
  controls.mouse = { x: 0.7, y: -0.6 };
  for (let i = 0; i < 60; i++) updateFlight(p, controls, 1 / 60, { ...settings, input: "mouse" });
  assert.ok(p.forward.y > 0.15);
  assert.ok(p.forward.x > 0);
  const invert = new Jet("player");
  for (let i = 0; i < 60; i++) updateFlight(invert, controls, 1 / 60, { ...settings, input: "mouse", invert: true });
  assert.ok(invert.forward.y < 0);
  const b = new Jet("player");
  for (let i = 0; i < 1500; i++) updateFlight(b, input("ShiftLeft"), 1 / 60, settings);
  assert.ok(b.speed > 550 && b.speed <= 590);
  for (let i = 0; i < 1e3; i++) updateFlight(b, input("KeyB"), 1 / 60, settings);
  assert.ok(b.speed < 110 && b.speed >= 56);
});
test("flight is stable across frame rates", () => {
  const a = new Jet("player"), b = new Jet("player");
  for (let i = 0; i < 120; i++) updateFlight(a, input("ShiftLeft"), 1 / 60, settings);
  for (let i = 0; i < 240; i++) updateFlight(b, input("ShiftLeft"), 1 / 120, settings);
  assert.ok(a.position.distanceTo(b.position) < 5);
});
test("target lock needs time, range and forward cone", () => {
  const p = new Jet("player"), e = new Jet();
  e.position.z = -3e3;
  let lock = 0;
  for (let i = 0; i < 84; i++) lock = updateLock(p, e, lock, 1 / 60);
  assert.ok(lock > 1.39);
  e.position.z = 3e3;
  assert.ok(updateLock(p, e, lock, 1) < 0.01);
  e.position.z = -9e3;
  assert.equal(updateLock(p, e, 0, 1), 0);
});
test("swept cannon collisions damage enemies and do not hit allies", () => {
  const p = new Jet("player"), e = new Jet(), a = new Jet("ally");
  e.position.z = -300;
  a.position.z = -100;
  let hits = [];
  const w = makeWeapons((j, amount) => hits.push({ j, amount }));
  w.cannon(p, e);
  for (let i = 0; i < 30; i++) w.update(1 / 60, [p, e, a]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].j, e);
  assert.equal(hits[0].amount, 14);
  assert.ok(pointSegmentDistance(new T.Vector3(0, 0, -100), new T.Vector3(), new T.Vector3(0, 0, -1e3)) < 0.01);
});
test("guided missiles intercept a crossing moving aircraft", () => {
  const p = new Jet("player"), e = new Jet();
  e.position.set(300, 120, -3e3);
  e.velocity.set(120, 0, 0);
  let hits = 0;
  const w = makeWeapons(() => hits++);
  assert.ok(w.missile(p, e));
  for (let i = 0; i < 900 && hits === 0; i++) {
    e.position.addScaledVector(e.velocity, 1 / 60);
    w.update(1 / 60, [p, e]);
  }
  assert.equal(hits, 1);
  assert.equal(w.missiles.filter((m) => m.active).length, 0);
});
test("flares divert incoming missiles and they cannot damage their former target", () => {
  const p = new Jet("player"), e = new Jet();
  e.position.z = 1400;
  let hits = 0;
  const w = makeWeapons(() => hits++);
  w.missile(e, p);
  assert.equal(w.deployFlares(p), 1);
  assert.equal(w.missiles[0].target, null);
  for (let i = 0; i < 300; i++) w.update(1 / 60, [p, e]);
  assert.equal(hits, 0);
  assert.equal(w.missiles[0].active, false);
});
test("all missions complete, player death and bomber arrival fail correctly", () => {
  assert.equal(MISSIONS.length, 3);
  for (const mission of MISSIONS) {
    const enemies = Array.from({ length: mission.fighters + mission.bombers }, () => new Jet());
    const p = new Jet("player");
    assert.equal(missionStatus(enemies, p, BASE), "active");
    enemies.forEach((e) => e.alive = false);
    assert.equal(missionStatus(enemies, p, BASE), "complete");
    p.alive = false;
    assert.equal(missionStatus(enemies, p, BASE), "failed");
  }
  const bomber = new Jet("enemy", true);
  bomber.position.copy(BASE);
  assert.equal(missionStatus([bomber], new Jet("player"), BASE), "base-lost");
});
test("AI maneuvers, keeps finite orientation and stays above terrain", () => {
  const p = new Jet("player"), e = new Jet();
  p.position.set(0, 1500, 0);
  e.position.set(1e3, 1800, -3200);
  const w = makeWeapons(() => {
  });
  const game = { player: p, enemies: [e], allies: [], settings, weapons: w, elapsed: 0 };
  const initial = e.position.clone();
  for (let i = 0; i < 1800; i++) {
    game.elapsed += 1 / 60;
    updateAI(e, game, 1 / 60);
    assert.ok(Number.isFinite(e.position.x));
    assert.ok(e.position.y > terrainHeight(e.position.x, e.position.z));
  }
  assert.ok(e.position.distanceTo(initial) > 1e3);
  assert.ok(["attack", "reposition", "evade"].includes(e.aiState));
});
test("object pools clear all projectiles for mission restart", () => {
  const p = new Jet("player"), e = new Jet();
  e.position.z = -1e3;
  const w = makeWeapons(() => {
  });
  w.cannon(p);
  w.missile(p, e);
  w.clear();
  assert.equal([...w.bullets, ...w.missiles].filter((x) => x.active || x.mesh.visible).length, 0);
});
import { Game } from "../src/game/Game.js";
function harness() {
  const g = Object.create(Game.prototype);
  Object.assign(g, { scene: new T.Scene(), camera: new T.PerspectiveCamera(), cam: { mode: "chase", shake: 0 }, effects: { ...effects, clear() {
  } }, audio: { init() {
  }, play() {
  } }, ui: { inGame() {
  }, message() {
  }, showMenu() {
  }, showPause() {
  }, showResult(success, reason) {
    g.result = { success, reason };
  } }, input: { ...input(), clear() {
    this.keys.clear();
  } }, world: { collision(p) {
    return p.y < Math.max(3, terrainHeight(p.x, p.z)) + 3;
  } }, settings, enemies: [], allies: [], player: new Jet("player"), selectedMission: 0 });
  g.weapons = makeWeapons(g.damage.bind(g));
  return g;
}
test("integrated mission: acquire, launch, hit, score, complete and restart", () => {
  const g = harness();
  g.start(0);
  g.state = "playing";
  for (const enemy of g.enemies) {
    enemy.position.copy(g.player.position).add(new T.Vector3(0, 0, -1300));
    enemy.velocity.set(0, 0, 0);
    g.target = enemy;
    g.lock = 0;
    for (let i = 0; i < 86; i++) g.lock = updateLock(g.player, enemy, g.lock, 1 / 60);
    assert.ok(g.lock >= 1.4);
    g.missileCooldown = 0;
    g.launch();
    for (let i = 0; i < 500 && enemy.alive; i++) g.weapons.update(1 / 60, [g.player, ...g.enemies]);
    assert.equal(enemy.alive, false);
  }
  g.step(1 / 60);
  assert.equal(g.state, "result");
  assert.equal(g.result.success, true);
  assert.equal(g.stats.kills, 3);
  assert.equal(g.stats.missiles, 3);
  assert.ok(g.score >= 8600);
  g.start(0);
  assert.equal(g.player.hp, 100);
  assert.equal(g.stats.kills, 0);
  assert.equal(g.missilesLeft, 6);
  assert.equal(g.flaresLeft, 20);
  assert.equal(g.cannonLeft, 1200);
  assert.equal(g.enemies.filter((e) => e.alive).length, 3);
});
test("all mission spawns are safe and interceptor base-loss reaches debrief", () => {
  for (let i = 0; i < 3; i++) {
    const g2 = harness();
    g2.start(i);
    for (const j of [g2.player, ...g2.enemies, ...g2.allies]) assert.equal(g2.world.collision(j.position), false);
    assert.equal(g2.enemies.length, MISSIONS[i].fighters + MISSIONS[i].bombers);
    assert.equal(g2.allies.length, MISSIONS[i].allies);
  }
  const g = harness();
  g.start(1);
  g.state = "playing";
  const bomber = g.enemies.find((e) => e.bomber);
  bomber.position.copy(BASE).add(new T.Vector3(0, 700, 0));
  g.step(1 / 60);
  assert.equal(g.result.success, false);
  assert.match(g.result.reason, /bomber/);
});
test("empty ammo, lock and cooldown gates prevent unintended launches", () => {
  const g = harness();
  g.start(0);
  g.launch();
  assert.equal(g.missilesLeft, 6);
  g.lock = 1.4;
  g.missileCooldown = 1;
  g.launch();
  assert.equal(g.missilesLeft, 6);
  g.missileCooldown = 0;
  g.missilesLeft = 0;
  g.launch();
  assert.equal(g.stats.missiles, 0);
  g.flaresLeft = 0;
  g.flare();
  assert.equal(g.flaresLeft, 0);
});

const easy = { ...settings, input: 'keyboard' };
test('arrow keys steer intuitively, bank automatically and respect pitch limits', () => {
  for (const [key, axis, sign] of [['ArrowUp', 'y', 1], ['ArrowDown', 'y', -1], ['ArrowLeft', 'x', -1], ['ArrowRight', 'x', 1]]) {
    const p = new Jet('player');
    for (let i = 0; i < 120; i++) updateFlight(p, input(key), 1 / 60, easy);
    assert.ok(p.forward[axis] * sign > .18, key);
    if (axis === 'x') assert.ok(Math.abs(new T.Euler().setFromQuaternion(p.quaternion, 'YXZ').z) > .1);
  }
  const p = new Jet('player');
  for (let i = 0; i < 900; i++) updateFlight(p, input('ArrowUp'), 1 / 60, easy);
  assert.ok(p.forward.y > .35 && p.forward.y < .6, 'held Up should climb without looping');
});
test('releasing arrows levels wings and nose; combined arrows work', () => {
  const p = new Jet('player');
  for (let i = 0; i < 120; i++) updateFlight(p, input('ArrowUp', 'ArrowRight'), 1 / 60, easy);
  assert.ok(p.forward.x > .15 && p.forward.y > .15);
  for (let i = 0; i < 600; i++) updateFlight(p, input(), 1 / 60, easy);
  const angle = new T.Euler().setFromQuaternion(p.quaternion, 'YXZ');
  assert.ok(Math.abs(angle.x) < .025 && Math.abs(angle.z) < .025);
});
test('easy cruise returns automatically after boost/brake and free-look does not steer', () => {
  const p = new Jet('player');
  for (let i = 0; i < 600; i++) updateFlight(p, input('ShiftLeft'), 1 / 60, easy);
  assert.ok(p.speed > 480);
  for (let i = 0; i < 600; i++) updateFlight(p, input(), 1 / 60, easy);
  assert.ok(Math.abs(p.speed - 220) < 1);
  for (let i = 0; i < 600; i++) updateFlight(p, input('KeyB'), 1 / 60, easy);
  assert.ok(p.speed >= 115 && p.speed < 140);
  for (let i = 0; i < 600; i++) updateFlight(p, input(), 1 / 60, easy);
  assert.ok(Math.abs(p.speed - 220) < 1);
  const looking = { ...input(), freeLook: true, mouse: { x: 1, y: -1 } };
  for (let i = 0; i < 300; i++) updateFlight(p, looking, 1 / 60, { ...easy, input: 'mouse' });
  assert.ok(Math.abs(p.forward.x) < .001 && Math.abs(p.forward.y) < .001);
});
test('Free Flight has no enemies, weapons, deadline or automatic completion', () => {
  const g = harness();g.settings = easy;g.start(FREE_FLIGHT.id);g.state = 'playing';
  assert.equal(g.enemies.length, 0);assert.equal(g.allies.length, 0);assert.equal(g.target, null);
  g.launch();g.flare();g.input.keys.add('Space');
  for (let i = 0; i < 3600; i++) g.step(1 / 60);
  assert.equal(g.state, 'playing');assert.ok(g.elapsed > 59);assert.equal(g.score, 0);
  assert.equal(g.player.hp, 100);assert.equal(g.stats.shots, 0);assert.equal(g.stats.missiles, 0);
  assert.equal(g.weapons.missiles.filter(m => m.active).length, 0);
});
test('Free Flight recovers from terrain, boundary and ceiling without ending the flight', () => {
  const g = harness();g.settings = easy;g.start(FREE_FLIGHT.id);g.state = 'playing';
  for (const position of [[0, -10, 5000], [40000, 1500, 0], [0, 16000, 5000]]) {
    g.player.position.set(...position);g.step(1 / 60);
    assert.equal(g.state, 'playing');assert.equal(g.player.alive, true);
    assert.equal(g.player.hp, 100);assert.ok(g.player.position.distanceTo(new T.Vector3(0, 1550, 5200)) < 5);
  }
  g.start();assert.equal(g.mission.freeFlight, true);assert.equal(g.elapsed, 0);
  g.start(0);assert.equal(g.enemies.length, 3);g.state = 'playing';g.lock = 1.4;g.launch();
  assert.equal(g.stats.missiles, 1);
  g.start(FREE_FLIGHT.id);assert.equal(g.enemies.length, 0);
  assert.equal(g.weapons.missiles.filter(m => m.active).length, 0);
});
test('easy targeting selects an enemy in front without requiring the R key', () => {
  const g = harness();g.settings = easy;g.start(0);
  g.target = null;g.chooseEasyTarget();assert.ok(g.target?.alive);
  assert.ok(g.player.forward.dot(g.target.position.clone().sub(g.player.position).normalize()) > .94);
});
