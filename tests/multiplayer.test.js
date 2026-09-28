import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { RoomManager } from "../server/RoomManager.js";
import { MatchState } from "../server/MatchState.js";
import { Matchmaker } from "../server/Matchmaker.js";
import { SyncManager } from "../src/multiplayer/SyncManager.js";

test("RoomManager: generates unique valid SKY-XXXX codes and manages rooms", () => {
  const rm = new RoomManager();
  const hostClient = { id: "pilot-alpha", name: "Maverick", ws: { readyState: 1, send: () => {} } };
  const room = rm.createRoom(hostClient, { mode: "1v1", killLimit: 3 });

  assert.ok(room.code.startsWith("SKY-"), "Room code starts with SKY-");
  assert.equal(room.code.length, 8, "Room code is exactly 8 characters");
  assert.equal(rm.getRoom(room.code), room, "Room is retrievable by code");
  assert.equal(rm.getRoomByClient("pilot-alpha"), room, "Room is retrievable by client ID");

  rm.leaveRoom(hostClient);
  assert.equal(rm.getRoom(room.code), undefined, "Room is removed when host leaves and empty");
  assert.equal(rm.getRoomByClient("pilot-alpha"), null, "Client mapping cleared on room leave");
});

test("MatchState: manages rosters, teams, and safe spawn formations", () => {
  const mockRoom = { broadcast: () => {}, sendToPlayer: () => {} };
  const state = new MatchState(mockRoom, {
    mode: "team_deathmatch",
    killLimit: 5,
    matchDuration: 300
  });

  const p1 = state.initPlayer({ id: "p1", name: "Alpha 1", team: "blue", jetModel: "x17" });
  const p2 = state.initPlayer({ id: "p2", name: "Bravo 1", team: "red", jetModel: "su30" });

  assert.ok(p1, "Player 1 initialized");
  assert.ok(p2, "Player 2 initialized");
  assert.equal(p1.team, "blue", "Player 1 is Blue");
  assert.equal(p2.team, "red", "Player 2 is Red");
  assert.equal(p1.hp, 100, "Initial HP is 100");
  assert.equal(p2.hp, 100, "Initial HP is 100");

  // Spawns should be separated by at least 2000m
  const dist = Math.hypot(p1.position.x - p2.position.x, p1.position.z - p2.position.z);
  assert.ok(dist >= 2000, `Players spawned at combat separation distance: ${dist}m`);
});

test("MatchState: authoritative cannon hit registration, assists and damage attribution", () => {
  const mockRoom = {
    broadcast: () => {},
    sendToPlayer: () => {}
  };

  const state = new MatchState(mockRoom, {
    mode: "1v1",
    killLimit: 1,
    matchDuration: 300
  });

  const p1 = state.initPlayer({ id: "p1", name: "Maverick", team: "blue", jetModel: "x17" });
  const p2 = state.initPlayer({ id: "p2", name: "Iceman", team: "red", jetModel: "rafale" });

  // Clear spawn protection for test
  p1.spawnProtectedUntil = 0;
  p2.spawnProtectedUntil = 0;

  // Position p2 in front of p1
  p1.position = { x: 0, y: 1500, z: 0 };
  p2.position = { x: 0, y: 1500, z: -100 }; // 100m directly ahead

  // Direct damage attribution test (30 damage * 1.5 multiplier = 45 score)
  const damageResult = state.applyDamage("p2", 30, "p1", "cannon");
  assert.ok(damageResult, "Damage applied successfully");
  assert.equal(p2.hp, 70, "Target HP reduced to 70");
  assert.equal(p1.score, 45, "Attacker score increased by damage ratio");

  // Lethal hit test
  const killResult = state.applyDamage("p2", 80, "p1", "cannon");
  assert.ok(killResult, "Lethal hit resolved");
  assert.equal(p2.alive, false, "Target marked destroyed");
  assert.equal(p1.kills, 1, "Attacker credited with kill");
  assert.ok(killResult.killEvent, "Kill event created");
  assert.equal(killResult.killEvent.killerName, "Maverick");
  assert.equal(killResult.killEvent.victimName, "Iceman");
});

test("MatchState: missile tracking and flare countermeasures", () => {
  const mockRoom = { broadcast: () => {}, sendToPlayer: () => {} };
  const state = new MatchState(mockRoom, {
    mode: "1v1",
    killLimit: 1,
    matchDuration: 300
  });

  const p1 = state.initPlayer({ id: "p1", name: "Shooter", team: "blue", jetModel: "x17" });
  const p2 = state.initPlayer({ id: "p2", name: "Target", team: "red", jetModel: "tejas" });

  p1.position = { x: 0, y: 1500, z: 500 };
  p2.position = { x: 0, y: 1500, z: 0 };

  p1.position = { x: -14500, y: 2200, z: 52000 };
  p2.position = { x: -14500, y: 2200, z: 51500 };
  assert.equal(state.handleFireMissile('p1', {targetId:'p2'}), null, 'Client target claim cannot bypass lock acquisition');
  p1.targetId = 'p2';
  state.updateLock(p1, 1.5);
  assert.equal(p1.lock.locked, true, 'Authority acquires lock over simulation time');
  const missile = state.handleFireMissile("p1", {
    targetId: "p2",
    origin: p1.position,
    direction: { x: 0, y: 0, z: -1 }
  });

  assert.ok(missile, "Missile created");
  assert.equal(missile.targetId, "p2", "Missile is locked on p2");

  // Deploy flares
  const diverted = state.handleDeployFlares("p2");
  assert.equal(diverted, 1, "Incoming missile diverted by flares");
  assert.equal(missile.targetId, null, "Missile lost target lock");
});

test("Matchmaker: queues players and automatically forms matches", () => {
  const rm = new RoomManager();
  const mm = new Matchmaker(rm);

  const messages = [];
  const client1 = { id: "p1", name: "Ace 1", ws: { readyState: 1, send: (data) => messages.push(JSON.parse(data)) } };
  const client2 = { id: "p2", name: "Ace 2", ws: { readyState: 1, send: (data) => messages.push(JSON.parse(data)) } };

  // Enqueue 2 players into 1v1 queue
  mm.enqueue(client1, "1v1", "Ace 1");
  mm.enqueue(client2, "1v1", "Ace 2");

  // Room should be formed automatically
  const room1 = rm.getRoomByClient("p1");
  const room2 = rm.getRoomByClient("p2");

  assert.ok(room1, "Room created for p1");
  assert.equal(room1, room2, "Both players placed into the same room");
  assert.equal(room1.players.size, 2, "Room has exactly 2 players");
  assert.ok(room1.code.startsWith("SKY-"), "Room code starts with SKY-");

  // Verify lobby state was broadcast to both
  const lobbyMsgs = messages.filter((m) => m.type === "lobby_update");
  assert.ok(lobbyMsgs.length >= 2, "Lobby state broadcast to both players");

  if (room1) room1.cleanup();
  rm.leaveRoom(client1);
  rm.leaveRoom(client2);
});

test("SyncManager: smoothly interpolates snapshots using Hermite and SLERP", () => {
  const sync = new SyncManager(100);

  const t0 = 1000;
  const t1 = 1100;

  sync.addSnapshot("remote-1", t0, {
    pos: [0, 1000, 0],
    quat: [0, 0, 0, 1],
    vel: [0, 0, -200],
    spd: 200,
    thr: 0.6,
    boost: false,
    gear: false
  });

  sync.addSnapshot("remote-1", t1, {
    pos: [0, 1000, -20],
    quat: [0, 0, 0, 1],
    vel: [0, 0, -200],
    spd: 200,
    thr: 0.6,
    boost: false,
    gear: false
  });

  const currentPos = new T.Vector3(0, 1000, 0);
  const currentQuat = new T.Quaternion(0, 0, 0, 1);

  const state = sync.getInterpolatedState("remote-1", currentPos, currentQuat);
  assert.ok(state, "Interpolated state returned");
  assert.equal(typeof state.spd, "number", "Speed returned as number");
  assert.equal(typeof state.thr, "number", "Throttle returned as number");
  assert.ok(Number.isFinite(currentPos.y), "Current position Y is finite");
  assert.ok(Number.isFinite(currentQuat.w), "Current quaternion W is finite");
});
