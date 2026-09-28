import { readStored } from "../game/Storage.js";
import { disposeJetModel } from "../game/Jet.js";
// MultiplayerManager: Client orchestrator for real-time 3D air combat
import * as T from "three";
import { NetworkManager } from "./NetworkManager.js";
import { SyncManager } from "./SyncManager.js";
import { WeaponNetworkManager } from "./WeaponNetworkManager.js";
import { QuickComms } from "./QuickComms.js";
import { SpectatorManager } from "./SpectatorManager.js";
import { createJet } from "../game/Jet.js";

export class MultiplayerManager {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.active = false;
    this.roomCode = null;
    this.localId = null;
    this.localName = readStored("skybreak_pilot_name") || "Ace Pilot";
    this.localTeam = "blue"; // "blue" | "red"
    this.isHost = false;

    this.network = new NetworkManager();
    this.sync = new SyncManager(100);
    this.weapons = new WeaponNetworkManager(game);
    this.comms = new QuickComms(game);
    this.spectator = new SpectatorManager(game);

    this.remotePlayers = new Map(); // id -> { id, name, team, jetModel, model, hp, alive, ... }
    this.teamScores = { blue: 0, red: 0 };
    this.killFeed = []; // [ { id, killerName, victimName, weapon, assistName, timestamp } ]
    this.scoreboard = [];

    this.lastTelemetry = 0;
    this.respawnCountdown = 0;
    this.isRespawning = false;
    this.lastKillerName = null;
    this.lastWeapon = null;

    this.matchOptions = null;
    this.matchStatus = "lobby";
    this.matchWinner = null;
    this.lostConnectionDuringMatch = false;

    this.setupNetworkHandlers();
  }

  setupNetworkHandlers() {
    this.network.on("disconnected", () => {
      if (this.active) this.lostConnectionDuringMatch = true;
    });

    this.network.on("connected", () => {
      if (!this.lostConnectionDuringMatch || !this.active) return;
      this.lostConnectionDuringMatch = false;
      this.leaveMatch();
      this.game.ui?.message?.("Connection restored. Rejoin a room to start a new match.", 4);
    });

    this.network.on("welcome", (msg) => {
      this.localId = msg.id;
      this.network.send("set_name", { name: this.localName });
    });

    this.network.on("game_started", (msg) => {
      this.onGameStarted(msg);
    });

    this.network.on("snapshot", (msg) => {
      this.onSnapshot(msg.s);
    });

    this.network.on("cannon_fired", (msg) => {
      if (msg.ownerId !== this.localId) {
        this.weapons.handleCannonFired(msg);
      }
    });

    this.network.on("missile_launched", (msg) => {
      if (msg.ownerId !== this.localId) {
        this.weapons.handleMissileLaunched(msg);
      }
    });

    this.network.on("missile_warning", (msg) => {
      this.game.warningTimer = 2.0;
      this.game.audio?.play?.("warning");
      this.game.ui?.message?.("MISSILE WARNING · DEPLOY FLARES [X]", 2.5);
    });

    this.network.on("rearmed", () => {
      this.game.ui?.message?.("AIRBASE REARMED · HP AND AMMO RESTORED", 3);
    });

    this.network.on("flares_deployed", (msg) => {
      if (msg.playerId !== this.localId) {
        this.weapons.handleFlaresDeployed(msg);
      }
    });

    this.network.on("player_killed", (msg) => {
      this.onPlayerKilled(msg);
    });

    this.network.on("quick_comm", (msg) => {
      this.comms.addFeedItem({
        senderName: msg.senderName,
        team: msg.team,
        text: msg.commText,
        teamOnly: msg.targetTeamOnly
      });
    });

    this.network.on("match_ended", (msg) => {
      this.onMatchEnded(msg);
    });

    this.network.on("reconnecting", (msg) => {
      this.game.ui?.message?.(`CONNECTION LOST · RECONNECTING (${msg.attempt}/${msg.max})...`, 2.0);
    });

    this.network.on("reconnect_failed", () => {
      this.lostConnectionDuringMatch = false;
      this.game.ui?.message?.("CONNECTION LOST · RETURNING TO LOBBY", 3.0);
      this.leaveMatch();
    });
  }

  setPilotName(name) {
    if (!name) return;
    this.localName = name.trim().slice(0, 16);
    try {
      localStorage.setItem("skybreak_pilot_name", this.localName);
    } catch {}
    this.network.send("set_name", { name: this.localName });
  }

  onGameStarted(msg) {
    this.game.openSkies?.abort();
    this.game.openSkies = null;
    this.game.squadronReturnState = null;
    this.game.input.menuMode = null;
    this.game.applyMissionEnvironment?.();
    this.active = true;
    this.lostConnectionDuringMatch = false;
    this.matchOptions = msg.options;
    this.matchStatus = "playing";
    this.localTeam = msg.myTeam || "blue";

    // Clear single player objects and old remote models
    this.clearRemotePlayers();
    this.weapons.clear();

    // Configure single player game loop to host multiplayer
    this.game.mission = {
      id: "multiplayer",
      name: `MULTIPLAYER ${msg.options?.mode?.toUpperCase() || "BATTLE"}`,
      freeFlight: msg.options?.mode === "free_flight"
    };

    // Remove single player AI
    for (const j of [...this.game.enemies, ...this.game.allies]) {
      j.dispose?.();
    }
    this.game.enemies = [];
    this.game.allies = [];

    // Reset local player
    this.game.player.hp = 100;
    this.game.player.maxHp = 100;
    this.game.player.alive = true;
    this.game.player.model.visible = true;
    this.game.player.isLanded = false;
    this.game.player.gearDown = false;
    this.game.player.currentBase = null;
    this.game.player.angular.set(0, 0, 0);
    this.game.player.speed = 240;
    this.game.player.throttle = 0.6;
    this.game.cannonLeft = 1200;
    this.game.missilesLeft = 6;
    this.game.flaresLeft = 20;
    this.game.resetSessionCounters();
    this.game.target = null;
    this.game.weapons.clear();
    this.game.effects.clear();

    // Apply spawn position from snapshot
    if (msg.snapshot?.players) {
      const myP = msg.snapshot.players.find((p) => p.id === this.localId);
      if (myP && myP.pos) {
        this.game.player.position.set(myP.pos[0], myP.pos[1], myP.pos[2]);
        this.game.player.quaternion.set(myP.quat[0], myP.quat[1], myP.quat[2], myP.quat[3]);
        this.game.player.velocity.set(myP.vel[0], myP.vel[1], myP.vel[2]);
      }
    }
    this.game.lastPlayerPos.copy(this.game.player.position);

    // Set atmosphere from room options
    if (msg.options?.timeOfDay) this.game.atmosphere?.setTimeOfDay(msg.options.timeOfDay);
    if (msg.options?.weather) this.game.atmosphere?.setWeather(msg.options.weather);

    // Switch game state
    this.game.state = "playing";
    this.game.ui?.closePanel();
    this.game.ui?.inGame();
    this.game.cam.mode = "chase";
    this.game.cam?.reset?.(this.game.player);

    const modeText = msg.options?.mode === "1v1" ? "1 VS 1 DUEL" : msg.options?.mode?.toUpperCase();
    this.game.ui?.message?.(`✈ MULTIPLAYER ${modeText} · ENGAGE!`, 3.0);
  }

  onSnapshot(snapshot) {
    if (!snapshot || !this.active) return;

    this.teamScores = snapshot.scores || this.teamScores;
    this.timeRemaining = snapshot.rem;
    const serverTime = snapshot.t || Date.now();

    const activeIds = new Set(snapshot.players.map((p) => p.id));
    for (const [id, remote] of this.remotePlayers) {
      if (activeIds.has(id)) continue;
      if (remote.model) {
        disposeJetModel(remote.model);
      }
      this.remotePlayers.delete(id);
      this.sync.clearPlayer(id);
    }

    for (const p of snapshot.players) {
      if (p.id === this.localId) {
        // Authoritative health and state confirmation for local player
        if (Number.isFinite(p.hp)) {
          this.game.player.hp = p.hp;
        }
        if (p.ammo) {
          this.game.cannonLeft = p.ammo.cannon;
          this.game.missilesLeft = p.ammo.missiles;
          this.game.flaresLeft = p.ammo.flares;
        }
        this.game.stats.kills = p.kills || 0;
        this.game.score = p.score || 0;
        if (!p.alive && this.game.player.alive) {
          // Local player was destroyed by server
          this.game.player.alive = false;
        }
        if (p.alive && !this.game.player.alive) {
          // Local player respawned
          this.onLocalRespawn(p);
        }
        this.respawnCountdown = p.respawn || 0;
        continue;
      }

      // Handle Remote Players
      let remote = this.remotePlayers.get(p.id);
      if (!remote) {
        remote = this.createRemotePlayer(p);
      }

      // Feed snapshot to interpolator
      this.sync.addSnapshot(p.id, serverTime, p);

      // Update metadata
      remote.alive = p.alive;
      remote.hp = p.hp;
      remote.kills = p.kills;
      remote.deaths = p.deaths;
      remote.assists = p.assists;
      remote.score = p.score;
      remote.ping = p.ping;
      remote.respawn = p.respawn;
      remote.shield = p.shield;
    }
  }

  createRemotePlayer(p) {
    const isEnemy = p.team !== this.localTeam;
    const model = createJet(isEnemy ? "enemy" : "ally", false, p.model || "x17", p.livery || "grey");
    this.scene.add(model);

    // Initial position
    if (p.pos) model.position.set(p.pos[0], p.pos[1], p.pos[2]);
    if (p.quat) model.quaternion.set(p.quat[0], p.quat[1], p.quat[2], p.quat[3]);

    const remoteObj = {
      id: p.id,
      name: p.name || `Pilot_${p.id.slice(0, 4)}`,
      team: p.team || "red",
      jetModel: p.model || "x17",
      model,
      position: model.position,
      quaternion: model.quaternion,
      velocity: new T.Vector3(),
      speed: p.spd || 240,
      throttle: p.thr || 0.6,
      boost: false,
      gearDown: false,
      alive: p.alive !== false,
      hp: p.hp || 100,
      kills: 0,
      deaths: 0,
      assists: 0,
      score: 0,
      ping: p.ping || 30
    };

    this.remotePlayers.set(p.id, remoteObj);
    return remoteObj;
  }

  onLocalRespawn(p) {
    this.game.player.resetInterpolation?.();
    this.game.cam?.reset?.(this.game.player);
    this.game.player.alive = true;
    this.game.player.model.visible = true;
    this.game.player.isLanded = false;
    this.game.player.gearDown = false;
    this.game.player.currentBase = null;
    this.game.state = "playing";
    this.game.player.hp = 100;
    this.game.player.maxHp = 100;
    this.game.player.speed = 240;
    this.game.player.throttle = 0.6;
    this.game.cannonLeft = 1200;
    this.game.missilesLeft = 6;
    this.game.flaresLeft = 20;

    if (p.pos) {
      this.game.player.position.set(p.pos[0], p.pos[1], p.pos[2]);
      this.game.player.quaternion.set(p.quat[0], p.quat[1], p.quat[2], p.quat[3]);
      this.game.player.velocity.set(p.vel[0], p.vel[1], p.vel[2]);
    }

    this.spectator.stopSpectating();
    this.game.cam?.reset?.(this.game.player);
    this.game.ui?.message?.("RESPAWNED · 3S SPAWN SHIELD ACTIVE 🛡️", 3.0);
  }

  onPlayerKilled(msg) {
    const isVictimMe = msg.victimId === this.localId;
    const isKillerMe = msg.killerId === this.localId;

    // Add to kill feed
    this.killFeed.push({
      id: Date.now() + Math.random(),
      killerName: msg.killerName,
      victimName: msg.victimName,
      weapon: msg.weapon === "missile" ? "AIM MISSILE" : "CANNON",
      assistName: msg.assistName,
      timestamp: Date.now()
    });
    if (this.killFeed.length > 6) this.killFeed.shift();

    if (isVictimMe) {
      // Local player died
      this.lastKillerName = msg.killerName;
      this.lastWeapon = msg.weapon;
      this.game.effects?.burst?.(this.game.player.position, 45, 30);
      this.game.audio?.play?.("explosion");
      this.spectator.startSpectating();
    } else if (isKillerMe) {
      this.game.audio?.playLock?.();
      this.game.ui?.message?.(`🎯 ENEMY DESTROYED: ${msg.victimName.toUpperCase()}`, 3.0);
    } else {
      // Remote player explosion
      const remote = this.remotePlayers.get(msg.victimId);
      if (remote?.model) {
        this.game.effects?.burst?.(remote.model.position, 40, 25);
        this.game.audio?.play?.("explosion", { distance: remote.model.position.distanceTo(this.game.camera.position) });
      }
    }
  }

  onMatchEnded(msg) {
    this.active = false;
    this.matchStatus = "ended";
    this.matchWinner = msg.winner;
    this.scoreboard = msg.scoreboard || [];
    this.game.state = "result";
    this.game.input.clear();

    // Show cinematic victory modal
    this.game.ui?.showMultiplayerResult?.(msg);
  }

  // Update loop called from Game.js step(dt)
  step(dt) {
    if (!this.active) return;

    // Send local telemetry (throttled to 25-30 packets/sec)
    const now = performance.now();
    if (now - this.lastTelemetry > 33) {
      this.lastTelemetry = now;
      this.sendLocalTelemetry();
    }

    // Update weapon network manager (remote tracer bullets and missiles)
    this.weapons.update(dt);

    // Update remote players
    for (const [id, remote] of this.remotePlayers.entries()) {
      if (!remote.model) continue;

      if (!remote.alive) {
        remote.model.visible = false;
        continue;
      }

      remote.model.visible = true;
      const state = this.sync.getInterpolatedState(id, remote.model.position, remote.model.quaternion);
      if (state) {
        remote.speed = state.spd;
        remote.throttle = state.thr;
        remote.boost = state.boost;
        remote.gearDown = state.gear;

        // Animate remote jet control surfaces and afterburners
        if (remote.model.userData) {
          const u = remote.model.userData;
          if (u.flames) {
            u.flames.forEach((f, i) => {
              f.scale.set(1, state.boost ? 1.6 : 0.72 + state.thr * 0.7, 1);
              f.material.color?.setHex?.(state.boost ? 16740908 : 6458367);
            });
          }
          if (u.exhaustLight) {
            u.exhaustLight.intensity = state.boost ? 3.0 : state.thr > 0.7 ? 1.5 : 0;
          }
          if (u.gearGroup) {
            u.gearGroup.visible = Boolean(state.gear);
          }
        }
      }
    }

    // Update spectator camera if local player is dead
    if (!this.game.player.alive && this.spectator.isSpectating) {
      const target = this.spectator.getCurrentTarget();
      if (target?.model) {
        const offset = new T.Vector3(0, 7, 28).applyQuaternion(target.model.quaternion);
        this.game.camera.position.lerp(target.model.position.clone().add(offset), 0.1);
        this.game.camera.lookAt(target.model.position);
      }
    }
  }

  sendLocalTelemetry() {
    const p = this.game.player;
    this.network.send("telemetry", {
      t: {
        position: { x: p.position.x, y: p.position.y, z: p.position.z },
        quaternion: { x: p.quaternion.x, y: p.quaternion.y, z: p.quaternion.z, w: p.quaternion.w },
        velocity: { x: p.velocity.x, y: p.velocity.y, z: p.velocity.z },
        speed: p.speed,
        throttle: p.throttle,
        boost: p.boost,
        gearDown: p.gearDown,
        isLanded: p.isLanded
      }
    });
  }

  // Weapon Actions
  fireCannon(origin, direction) {
    if (!this.active) return;
    this.network.send("fire_cannon", { origin, direction });
  }

  fireMissile(targetId, origin, direction) {
    if (!this.active || !targetId) return;
    this.network.send("fire_missile", { targetId, origin, direction });
  }

  deployFlares() {
    if (!this.active) return;
    this.network.send("deploy_flares");
  }

  // Target selection for missile lock in multiplayer
  getLockableTargets() {
    const targets = [];
    const p = this.game.player;
    if (!p.alive) return targets;

    for (const remote of this.remotePlayers.values()) {
      if (!remote.alive || remote.team === this.localTeam) continue;
      const dist = p.position.distanceTo(remote.position);
      if (dist < 8500) {
        targets.push({
          id: remote.id,
          name: remote.name,
          team: remote.team,
          position: remote.position,
          distance: dist
        });
      }
    }
    return targets;
  }

  // 3D Floating Name Tags projected onto screen coordinates
  getScreenNameTags(camera, screenWidth, screenHeight) {
    if (!this.active || !camera) return [];
    const tags = [];
    const pPos = this.game.player.position;

    for (const remote of this.remotePlayers.values()) {
      if (!remote.alive || !remote.model) continue;

      const dist = pPos.distanceTo(remote.model.position);
      // Radar & optical detection range: 8.5 KM
      if (dist > 8500) continue;

      const worldPos = remote.model.position.clone().add(new T.Vector3(0, 3.8, 0));
      const projected = worldPos.project(camera);

      // Behind camera check
      if (projected.z > 1.0) continue;

      const x = ((projected.x + 1) / 2) * screenWidth;
      const y = ((-projected.y + 1) / 2) * screenHeight;

      tags.push({
        id: remote.id,
        name: remote.name,
        team: remote.team,
        isEnemy: remote.team !== this.localTeam,
        distanceKm: (dist / 1000).toFixed(1),
        hp: remote.hp,
        screenX: Math.round(x),
        screenY: Math.round(y),
        isLocked: this.game.target?.id === remote.id
      });
    }

    return tags;
  }

  clearRemotePlayers() {
    for (const remote of this.remotePlayers.values()) {
      if (remote.model) {
        disposeJetModel(remote.model);
      }
    }
    this.remotePlayers.clear();
    this.sync.clearAll();
  }

  leaveMatch() {
    this.active = false;
    this.clearRemotePlayers();
    this.weapons.clear();
    this.spectator.stopSpectating();
    this.network.send("leave_room");
    this.game.state = "menu";
    this.game.ui?.showMenu();
  }
}
