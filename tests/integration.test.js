import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import WebSocket, { WebSocketServer } from "ws";
import { GameServer } from "../server/GameServer.js";
import { MatchState } from "../server/MatchState.js";
import { IAF_BASES } from "../src/game/GeoWorld.js";
import { Game } from "../src/game/Game.js";
import { Jet } from "../src/game/Jet.js";
import { updateFlight } from "../src/game/FlightPhysics.js";
import { MultiplayerUI } from "../src/ui/MultiplayerUI.js";
import { parseHTML } from "linkedom";

function observe(ws) {
  const messages = [];
  const waiters = [];
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    messages.push(msg);
    for (const waiter of [...waiters]) {
      if (waiter.predicate(msg)) {
        clearTimeout(waiter.timer);
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(msg);
      }
    }
  });
  return {
    messages,
    waitFor(predicate, timeout = 6000) {
      const existing = messages.find(predicate);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const waiter = { predicate, resolve, timer: null };
        waiter.timer = setTimeout(() => {
          waiters.splice(waiters.indexOf(waiter), 1);
          reject(new Error("Timed out waiting for WebSocket message"));
        }, timeout);
        waiters.push(waiter);
      });
    }
  };
}

test("two clients create, join, ready, and start a real WebSocket match", async (t) => {
  const server = http.createServer();
  const wss = new WebSocketServer({ server });
  const gameServer = new GameServer(wss);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `ws://127.0.0.1:${server.address().port}`;
  const a = new WebSocket(url), b = new WebSocket(url);
  const pilotA = observe(a), pilotB = observe(b);
  t.after(async () => {
    a.terminate();
    b.terminate();
    gameServer.cleanup();
    for (const room of gameServer.roomManager.rooms.values()) room.cleanup();
    await new Promise((resolve) => wss.close(resolve));
    await new Promise((resolve) => server.close(resolve));
  });
  await Promise.all([once(a, "open"), once(b, "open")]);
  await Promise.all([pilotA.waitFor((m) => m.type === "welcome"), pilotB.waitFor((m) => m.type === "welcome")]);
  a.send(JSON.stringify({type:'hello',protocol:2}));b.send(JSON.stringify({type:'hello',protocol:2}));

  a.send(JSON.stringify({ type: "set_name", name: "Pilot A" }));
  b.send(JSON.stringify({ type: "set_name", name: "Pilot B" }));
  a.send(JSON.stringify({ type: "create_room", options: { mode: "1v1", killLimit: 3, matchDuration: 300 } }));
  const created = await pilotA.waitFor((m) => m.type === "room_joined");
  assert.match(created.room.roomCode, /^SKY-[A-Z0-9]{4}$/);
  assert.equal(created.room.options.killLimit, 3);

  b.send(JSON.stringify({ type: "join_room", code: created.room.roomCode }));
  const joined = await pilotB.waitFor((m) => m.type === "room_joined");
  assert.equal(joined.room.players.length, 2);
  a.send(JSON.stringify({type:'loaded'}));b.send(JSON.stringify({type:'loaded'}));
  b.send(JSON.stringify({ type: "set_ready", ready: true }));
  await pilotA.waitFor((m) => m.type === "lobby_update" && m.players.length === 2 && m.players.every((p) => p.ready));
  a.send(JSON.stringify({ type: "start_match" }));
  const [startedA, startedB] = await Promise.all([
    pilotA.waitFor((m) => m.type === "game_started"),
    pilotB.waitFor((m) => m.type === "game_started")
  ]);
  assert.equal(startedA.snapshot.roster.length, 2);
  assert.ok(startedA.snapshot.players.some(p => p.id === startedA.myId));
  assert.ok(startedB.snapshot.players.some(p => p.id === startedB.myId));
  assert.ok(startedA.snapshot.roster.every(p => !('pos' in p) && !('flight' in p)));
  assert.notEqual(startedA.myTeam, startedB.myTeam);
  assert.ok(startedA.snapshot.players.every((p) => p.ammo.cannon === 1200));

  const room = gameServer.roomManager.getRoom(created.room.roomCode);
  room.endMatch({ name: "Pilot A", team: "blue" });
  await pilotA.waitFor((m) => m.type === "match_ended");
  a.send(JSON.stringify({ type: "rematch" }));
  const reset = await pilotB.waitFor((m) => m.type === "lobby_update" && m.state === "lobby");
  assert.ok(reset.players.every((p) => p.ready === p.isHost));
});

test("server rejects teleport, bad aim, and remote airbase rearm", () => {
  const state = new MatchState({ broadcast() {} }, { mode: "1v1" });
  const a = state.initPlayer({ id: "a", team: "blue" });
  const b = state.initPlayer({ id: "b", team: "red" });
  const spawn = { ...a.position };
  state.updateTelemetry("a", { position: { x: 90000, y: 1500, z: 90000 }, velocity: { x: NaN, y: 0, z: 0 } });
  assert.deepEqual({...a.position}, spawn);
  assert.ok(Number.isFinite(a.velocity.x));

  assert.equal(state.handleFireCannon("a", { origin: { x: b.position.x, y: b.position.y, z: b.position.z }, direction: { x: 0, y: 0, z: 1 } }), null);
  const bullet = state.handleFireCannon("a", { origin: { x: b.position.x, y: b.position.y, z: b.position.z }, direction: { x: 0, y: 0, z: -1 } });
  assert.deepEqual(bullet.position, spawn);
  a.hp = 40;
  assert.equal(state.canRearmAtBase("a", IAF_BASES[0].id), false);
  assert.equal(a.hp, 40);
});

test("missile collision crosses its full flight segment each tick", () => {
  const state = new MatchState({ broadcast() {} }, { mode: "1v1" });
  const target = state.initPlayer({ id: "target", team: "red" });
  target.position = { x: 0, y: 1000, z: -100 };
  target.spawnProtectedUntil = 0;
  state.missiles.push({ ownerId: "shooter", targetId: "target", position: { x: 0, y: 1000, z: 0 }, direction: { x: 0, y: 0, z: -1 }, speed: 900, life: 2 });
  state.tick(0.2);
  assert.equal(target.alive, false);
  assert.equal(state.missiles.length, 0);
});

test("offline instant duel starts with a valid hostile jet", () => {
  const player = new Jet("player");
  const game = {
    audio: { init() {} }, enemies: [], allies: [],
    scene: { add() {}, remove() {} },
    weapons: { clear() {} }, effects: { clear() {} },
    resetSessionCounters() {},
    player,
    lastPlayerPos: player.position.clone(),
    cam: { reset() {} },
    ui: { inGame() {} }
  };
  const ui = { game, ui: { closePanel() {}, message() {} } };
  MultiplayerUI.prototype.launchInstantDuel.call(ui);
  assert.equal(game.state, "playing");
  assert.equal(game.enemies.length, 1);
  assert.equal(game.enemies[0].modelId, "su57");
});

test("scoreboard renders remote jet models without treating a Three.js object as text", () => {
  const originalDocument = globalThis.document;
  const { document } = parseHTML("<html><body></body></html>");
  globalThis.document = document;
  try {
    const mp = {
      localId: "me", localName: "Ace", localTeam: "blue", network: { ping: 30 },
      teamScores: { blue: 0, red: 0 },
      remotePlayers: new Map([["r", { id: "r", name: "Bandit", team: "red", jetModel: "su57", model: {}, alive: true }]])
    };
    const ui = { mpManager: mp, game: { player: { modelId: "x17", hp: 100, alive: true }, stats: { kills: 0 } }, scoreboardVisible: true };
    MultiplayerUI.prototype.renderScoreboardOverlay.call(ui);
    assert.match(document.body.textContent, /SU57/);
  } finally {
    globalThis.document = originalDocument;
  }
});

test("assisted keys and weapon shortcuts match the HUD; rebound airbrake is respected", () => {
  const called = [];
  const game = {
    state: "playing", settings: {}, multiplayer: { active: false },
    ui: { toggleMap: () => called.push("map") },
    launch: () => called.push("missile"), flare: () => called.push("flare")
  };
  for (const key of ["KeyN", "KeyE", "KeyX"]) Game.prototype.action.call(game, key);
  assert.deepEqual(called, ["map", "missile", "flare"]);

  const jet = new Jet("player");
  const settings = { input: "keyboard", sensitivity: 1, invert: false, keyBindings: { airBrake: "KeyJ" } };
  const input = (...keys) => ({ keys: new Set(keys), mouse: { x: 0, y: 0 }, levelTimer: 0, touchActive: false, boost: false });
  for (let i = 0; i < 60; i++) updateFlight(jet, input("KeyW"), 1 / 60, settings);
  assert.ok(Math.abs(jet.forward.y) < 0.02, "W changes throttle without pitching the jet");
  updateFlight(jet, input("KeyB"), 1 / 60, settings);
  assert.equal(jet.airBrake, false);
  updateFlight(jet, input("KeyJ"), 1 / 60, settings);
  assert.equal(jet.airBrake, true);
});
