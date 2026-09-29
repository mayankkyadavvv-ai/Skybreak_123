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
import { flightCommands } from '../game/FlightPhysics.js';
import { bindingLabel } from '../game/InputActions.js';
import { FlightPrediction } from './FlightPrediction.js';
import { VoiceManager } from './VoiceManager.js';
import { terrainHeight, RUNWAYS } from '../shared/WorldGeometry.js';
import { FIXED_DT } from '../shared/Protocol.js';
import { clearMissionExtensions } from '../game/MissionIntegration.js';
import { multiplayerMission } from '../game/Missions.js';

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
    this.voice = new VoiceManager(this.network);
    this.prediction = new FlightPrediction({ environment: { terrainHeight, runways: RUNWAYS } });
    this.pings = new Map(); this.room = null; this.missionState = null; this.zoneState = null;
    this.inputSendTimer = 0; this.snapshotTick = -1; this.matchEpoch = null;
    this.authoritativeLock = { locked: false, progress: 0, targetId: null };
    this.matchRewardIds = new Set();

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

    this.network.on('welcome', msg => {
      if (!msg.pendingResume) this.localId = msg.id;
      this.network.send('set_name', { name: this.localName });
    });
    this.network.on('session_resumed', msg => {
      this.localId = msg.id; this.lostConnectionDuringMatch = false;
      this.room = msg.room || this.room; this.roomCode = this.room?.roomCode || this.roomCode;
      this.isHost = this.room?.hostId === this.localId;
      if (this.room?.state !== 'in_game') { this.active = false; this.game.state = 'menu'; this.game.ui?.multiplayerUI?.showLobby?.(this.room); }
      this.game.ui?.message?.('SQUADRON CONNECTION RESTORED · SAME SORTIE', 3);
    });
    this.network.on('resume_error', msg => {
      this.lostConnectionDuringMatch = false;
      this.active = false; this.prediction.clear(); this.clearRemotePlayers();
      this.game.ui?.message?.(`Session could not resume: ${msg.reason || msg.message || 'reservation expired'}. Join the room again.`, 5);
      this.game.state = 'menu'; this.game.ui?.showMenu?.();
    });
    this.network.on('room_joined', msg => { this.rememberRoom(msg.room || msg); this.network.send('loaded'); });
    this.network.on('countdown', msg => this.game.ui?.message?.(`SQUADRON LAUNCH IN ${msg.count}`, 1.1));
    this.network.on('countdown_cancelled', msg => this.game.ui?.message?.(msg.reason || 'Launch cancelled. Check party readiness.', 4));
    this.network.on('room_expired', msg => { this.network.forgetSession(); this.room = null; this.roomCode = null; this.game.ui?.message?.(msg.reason || 'Party expired.', 4); });
    this.network.on('activity_snapshot', msg => { this.game.activitySnapshot = msg.activity || msg.snapshot; });
    this.network.on('lobby_update', msg => this.rememberRoom(msg));
    for (const event of ['join_error', 'room_error', 'action_error', 'action_rejected', 'settings_error', 'start_error', 'protocol_error', 'endpoint_error']) this.network.on(event, msg => this.game.ui?.message?.(msg.reason || msg.message || 'Room action was rejected.', 4));
    this.network.on('team_ping', msg => {
      const ping = msg.ping || msg;
      if (!ping.id || !ping.position) return;
      this.pings.set(ping.id, { ...ping, expiresAt: ping.expiresAt || this.network.serverNow() + 8000 });
      while (this.pings.size > 12) this.pings.delete(this.pings.keys().next().value);
      this.game.audio?.play?.('lock');
    });
    this.network.on('ping_ack', msg => { const ping = this.pings.get(msg.pingId); if (ping) ping.acknowledged = true; });

    this.network.on("game_started", (msg) => {
      this.onGameStarted(msg);
    });

    this.network.on("snapshot", (msg) => { this.onSnapshot(msg.s); });

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
      this.game.ui?.message?.(`MISSILE WARNING · DEPLOY FLARES [${bindingLabel('flare', this.game.settings)}]`, 2.5);
    });

    this.network.on("rearmed", () => {
      this.game.ui?.message?.("AIRBASE REARMED · HP AND AMMO RESTORED", 3);
    });

    this.network.on("flares_deployed", (msg) => {
      this.weapons.handleFlaresDeployed(msg);
    });

    this.network.on("kill", (msg) => {
      this.onPlayerKilled(msg);
    });
    this.network.on('damage',msg=>{if(msg.victimId===this.localId){this.game.damageFlash=.5;this.game.cam.shake=.5;this.game.audio?.play?.('hit');}this.game.ui?.recordReplayEvent?.('damage',`${msg.victimId} hit`,msg.victimId);});

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
    this.localName = name.replace(/[\x00-\x1f\x7f<>]/g, '').trim().slice(0, 16) || 'Ace Pilot';
    try {
      localStorage.setItem("skybreak_pilot_name", this.localName);
    } catch {}
    this.network.send("set_name", { name: this.localName });
  }

  onGameStarted(msg) {
    this.game.stopLocalCoop?.();clearMissionExtensions(this.game);
    this.game.flightSchool?.stop();this.game.clearTrainingLesson?.();this.game.launchContext=null;
    this.game.endHangarPreview?.();
    this.game.openSkies?.abort();
    this.game.openSkies = null;
    this.game.squadronReturnState = null;
    this.game.input.menuMode = null;
    this.game.hostileLock=false;
    this.active = true;
    this.localId = msg.myId || this.localId;
    this.matchEpoch = msg.snapshot?.epoch || msg.epoch;
    this.snapshotTick = -1; this.sync.beginEpoch(this.matchEpoch);
    this.prediction.clear(); this.pings.clear();
    this.lostConnectionDuringMatch = false;
    this.matchOptions = msg.options;
    this.matchStatus = "playing";
    this.localTeam = msg.myTeam || "blue";

    // Clear single player objects and old remote models
    this.clearRemotePlayers();
    this.weapons.clear();

    // Configure single player game loop to host multiplayer
    this.game.mission = multiplayerMission(msg.options);

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
    if (!msg.resumed) this.game.resetSessionCounters();
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
    if (msg.snapshot) this.onSnapshot(msg.snapshot);
    this.game.player.resetInterpolation?.();
    this.game.lastPlayerPos.copy(this.game.player.position);

    // Set atmosphere from room options
    this.game.applyMissionEnvironment?.();

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
    if (!snapshot || !this.active || !Array.isArray(snapshot.players)) return;
    if (this.matchEpoch && snapshot.epoch && snapshot.epoch !== this.matchEpoch) return;
    if (Number.isFinite(snapshot.tick) && snapshot.tick <= this.snapshotTick) return;
    this.snapshotTick = snapshot.tick ?? this.snapshotTick + 1;
    this.matchEpoch = snapshot.epoch || this.matchEpoch;
    this.sync.observeClock(snapshot.t, undefined, this.network.serverOffset);
    this.missionState = snapshot.mission || snapshot.coop || null;
    this.zoneState = snapshot.zone || snapshot.objective || null;
    this.game.activitySnapshot = snapshot.activity || null;
    this.publicRoster=snapshot.roster || [];
    this.game.hostileLock=(snapshot.threats || []).some(t=>t.kind==='lock');
    this.threats=snapshot.threats || [];
    if (Array.isArray(snapshot.pings)) for (const ping of snapshot.pings) if (ping.team === this.localTeam) this.pings.set(ping.id, { ...this.pings.get(ping.id), ...ping });
    if (Array.isArray(snapshot.missiles)) this.weapons.syncMissiles?.(snapshot.missiles);
    this.teamScores = snapshot.scores || this.teamScores;
    this.timeRemaining = snapshot.rem;
    const serverTime = snapshot.t || Date.now();

    const activeIds = new Set(snapshot.players.map((p) => p.id));
    if(this.game.target && !activeIds.has(this.game.target.id)){this.game.target=null;this.game.lock=0;this.authoritativeLock={targetId:null,progress:0,locked:false};}
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
        const wasAlive=this.game.player.alive;
        // Roll back every complete state, then replay every unacknowledged intent.
        if (p.model && p.model !== this.game.player.modelId) this.game.equipJet?.({ modelId: p.model, liveryId: p.livery || 'grey' });
        if (p.flight) {
          const newGeneration = this.prediction.inputEpoch !== p.inputEpoch;
          this.prediction.reconcile(p, { epoch: this.matchEpoch, tick: this.snapshotTick });
          this.prediction.applyToJet(this.game.player);
          if (newGeneration) this.game.player.resetInterpolation?.();
        }
        if (p.lock) { this.authoritativeLock = p.lock; this.game.lock = p.lock.targetId === this.game.target?.id ? (p.lock.progress || 0)*1.4 : 0; }
        if (Number.isFinite(p.hp)) {
          this.game.player.hp = p.hp;
          this.game.player.maxHp=p.maxHp || 100;
        }
        if (p.ammo) {
          this.game.cannonLeft = p.ammo.cannon;
          this.game.missilesLeft = p.ammo.missiles;
          this.game.flaresLeft = p.ammo.flares;
        }
        this.localStats = p;
        this.game.stats.kills = p.kills || 0;
        this.game.score = p.score || 0;
        if (!p.alive && wasAlive) {
          // Local player was destroyed by server
          this.game.player.alive = false;
          this.game.input.clear();this.spectator.startSpectating();
        }
        if (p.alive && !wasAlive) {
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
      remote.respawn = p.respawn; remote.shield = p.shield;
      remote.connected = p.connected !== false; remote.bot = !!p.bot;
      remote.role = p.role; remote.name = p.name || remote.name; remote.maxHp = p.maxHp || 100;
      remote.callsign=remote.name;if(p.vel)remote.velocity.fromArray(p.vel);remote.systems={...(p.systems || p.flight?.systems)};
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
      hp: p.hp ?? 100,
      maxHp: p.maxHp || 100, bot: !!p.bot, role: p.role, connected: p.connected !== false,
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
    this.game.input.clear();this.game.target=null;this.game.lock=0;this.authoritativeLock={locked:false,progress:0,targetId:null};
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

    this.prediction.applyToJet(this.game.player);
    this.spectator.stopSpectating();
    this.game.cam?.reset?.(this.game.player);
    this.game.ui?.message?.("RESPAWNED · 3S SPAWN SHIELD ACTIVE 🛡️", 3.0);
  }

  onPlayerKilled(msg) {
    this.game.ui?.recordReplayEvent?.('destroyed',`${msg.victimName || 'Aircraft'} down`,msg.victimId);
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
    this.lastResult=msg;
    this.game.ui?.finalizeReplay?.((msg.winner?.team || msg.winner)===this.localTeam,msg.mission?.reason || 'Shared match ended');
    this.active = false;
    this.matchStatus = "ended";
    this.matchWinner = msg.winner;
    if (this.room) this.room = { ...this.room, state: 'post_match' };
    this.missionState = msg.mission || this.missionState; this.teamScores = msg.teamScores || this.teamScores;
    this.scoreboard = msg.scoreboard || [];
    this.game.state = "result";
    this.game.input.clear();

    // Show cinematic victory modal
    this.game.ui?.showMultiplayerResult?.(msg);
  }

  // Update loop called from Game.js step(dt)
  step(dt) {
    if (!this.active) return;

    for (const [id, ping] of this.pings) if (ping.expiresAt < this.network.serverNow()) this.pings.delete(id);

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

  rememberRoom(room) {
    if (!room || !(room.roomCode || room.code)) return;
    this.room = room; this.roomCode = room.roomCode || room.code; this.isHost = room.hostId === this.localId;
    const me = room.players?.find(p => p.id === this.localId); if (me) this.localTeam = me.team;
  }

  // Game.step calls this INSTEAD of offline updateFlight at the fixed simulation rate.
  predictLocalFlight(dt = FIXED_DT) {
    if (!this.active || !this.game.player.alive || this.lostConnectionDuringMatch || this.network.pendingResume) return false;
    const player = this.game.player, input = this.game.input, settings = this.game.getFlightSettings?.() || this.game.settings;
    if (!this.prediction.state) return false;
    const suppressed = !!this.game.ui?.modalType || !!input.menuMode || this.comms.isOpen;
    const command = suppressed ? { pitch: 0, roll: 0, yaw: 0, throttle: 0, brake: 0, boost: false } : flightCommands(input, settings);
    Object.assign(command, { gearDown: player.gearDown, landingMode: player.landingMode, flaps: player.flaps, assisted: settings.flightMode !== 'manual', recover: !suppressed && input.levelTimer > 0, targetId: this.game.target?.alive ? this.game.target.id : null });
    if(!suppressed && settings.autoCruise && !command.throttle && !player.isLanded && !player.landingMode)command.throttleSet=player.throttle+((settings.cruiseThrottle ?? .58)-player.throttle)*(1-Math.exp(-1.3*dt));
    if (!suppressed && Number.isFinite(input.touchThrottle)) command.throttleSet = input.touchThrottle;
    input.levelTimer = Math.max(0, (input.levelTimer || 0) - dt);
    const advanced = this.prediction.predict(command, dt);
    this.inputSendTimer += dt;
    if (this.inputSendTimer >= 1 / 30) { this.inputSendTimer = 0; this.prediction.flush(this.network); }
    this.prediction.applyToJet(player);
    player.animate?.(performance.now() / 1000, player.boost, command.pitch, command.roll, player.speed);
    return advanced;
  }

  startActivity(activity, options = {}) { return this.network.send('activity_start', { activity, options }); }
  cancelActivity() { return this.network.send('activity_cancel'); }

  sendPing(kind = 'attack', target = this.game.target) {
    if (!this.active) return false;
    const position = target?.alive ? target.position : this.game.player.position;
    return this.network.send('team_ping', { kind, ...(target?.alive && target.id ? { targetId: target.id } : { position: { x: position.x, y: position.y, z: position.z } }) });
  }
  acknowledgePing(id) { if (this.pings.has(id)) this.network.send('ping_ack', { pingId: id }); }
  getScreenPings(camera, width, height) {
    return [...this.pings.values()].map(ping => {
      const target = this.remotePlayers.get(ping.targetId), pos = target?.alive ? target.position : new T.Vector3(ping.position.x, ping.position.y, ping.position.z);
      const screen = pos.clone().project(camera);
      return { ...ping, visible: screen.z <= 1, x: Math.max(40, Math.min(width - 40, (screen.x + 1) * width / 2)), y: Math.max(90, Math.min(height - 130, (1 - screen.y) * height / 2)), distance: this.game.player.position.distanceTo(pos) };
    });
  }
  returnToParty() {
    this.active = false; this.game.state = 'menu'; this.clearRemotePlayers(); this.weapons.clear(); this.prediction.clear();
    this.game.input.clear(); this.game.ui?.multiplayerUI?.showLobby?.(this.room || {});
  }

  // Weapon Actions
  fireCannon(origin, direction) {
    if (!this.active) return;
    this.network.send("fire_cannon", { origin, direction, epoch: this.matchEpoch, inputSeq: this.prediction.seq, serverTime: this.network.serverNow() });
  }

  fireMissile(targetId, origin, direction) {
    if (!this.active || !targetId) return;
    this.network.send("fire_missile", { targetId, origin, direction, epoch: this.matchEpoch, inputSeq: this.prediction.seq });
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

  dispose() {
    this.active = false; this.clearRemotePlayers(); this.weapons.dispose?.(); this.voice.dispose(); this.network.dispose(); this.prediction.clear(); this.pings.clear();
  }

  leaveMatch() {
    this.active = false;
    this.clearRemotePlayers();
    this.weapons.clear();
    this.spectator.stopSpectating();
    this.network.send("leave_room"); this.network.forgetSession(); this.voice.disable();
    this.room = null; this.roomCode = null; this.prediction.clear(); this.pings.clear(); this.comms.close();
    this.game.state = "menu";
    this.game.ui?.showMenu();
  }
}
