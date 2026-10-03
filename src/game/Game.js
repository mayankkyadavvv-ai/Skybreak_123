import * as T from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Jet } from "./Jet.js";
import { World, BASE, terrainHeight } from "./World.js";
import { Effects } from "./Effects.js";
import { damp } from "./math.js";
import { Input } from "./Input.js";
import { ACTIONS, actionForCode, isHeld, bindingLabel } from "./InputActions.js";
import { updateFlight } from "./FlightPhysics.js";
import { Weapons, updateLock } from "./Weapons.js";
import { updateAI } from "./AI.js";
import { FREE_FLIGHT, getMission, missionStatus } from "./Missions.js";
import { CameraController } from "./Camera.js";
import { AudioManager } from "./Audio.js";
import { Atmosphere } from "./Atmosphere.js";
import { getAirspaceAt, getNearestCity, checkBoundaryCrossing, CITIES, INTERNATIONAL_BORDERS, IAF_BASES, getNearestIAFBase } from "./GeoWorld.js";
import { loadPlayerJetConfig, savePlayerJetConfig, JET_MODELS } from "./JetConfigs.js";
import { MultiplayerManager } from "../multiplayer/MultiplayerManager.js";
import { progression } from "./Progression.js";
import { canTouchdown, assessTouchdown, runwayPoint, onRunway, GLIDE_ANGLE } from "./Landing.js";
import { configureRenderer, qualityFor } from "./Quality.js";
import { EnvironmentLighting } from "./Environment.js";
import { SpeedEffects } from "./SpeedEffects.js";
import { OpenSkiesEncounter, OPEN_SKIES, scoreOpenSkies } from './OpenSkies.js';
import { configureSquadronJet, updateSquadronAI, issueSquadronOrder } from './SquadronAI.js';
import { recordOpenSkiesResult } from './OpenSkiesProgress.js';

let sortieSequence = 0;

class Game {
  constructor(canvas, ui, settings) {
    this.ui = ui;
    this.settings = settings;
    this.state = "menu";
    this.menuTime = 0;
    this.elapsed = 0;
    this.enemies = [];
    this.allies = [];
    this.stats = {};
    this.fps = 60;
    this.accumulator = 0;
    this.audio = new AudioManager(settings);
    this.renderer = new T.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
      logarithmicDepthBuffer: true
    });
    this.renderer.info.autoReset=false;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.4));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(68, innerWidth / innerHeight, 1.2, 95e3);
    this.world = new World(this.scene);
    this.atmosphere = new Atmosphere(this.world, this.scene);
    this.effects = new Effects(this.scene);
    this.speedEffects = new SpeedEffects(this.scene, this.camera);
    this.weapons = new Weapons(this.scene, this.effects, this.damage.bind(this), (type, position) => this.audio.play(type, { position, cameraPos: this.camera.position, cameraRight: this.cameraRightForAudio || (this.cameraRightForAudio = new T.Vector3()), distance: position ? position.distanceTo(this.camera.position) : 0 }));
    this.jetConfig = loadPlayerJetConfig();
    this.player = new Jet("player", false, this.jetConfig);
    this.scene.add(this.player.model);
    this.player.position.set(0, 1550, 5200);
    this.hangarLight = new T.SpotLight(0xffffff, 0, 50, Math.PI / 3.5, 0.4, 1.2);
    this.hangarLight.position.set(0, 1568, 5200);
    this.hangarLight.target = this.player.model;
    this.scene.add(this.hangarLight);
    this.lastPlayerPos = new T.Vector3().copy(this.player.position);
    this.currentAirspace = getAirspaceAt(this.player.position.x, this.player.position.z);
    this.nearestCityInfo = getNearestCity(this.player.position.x, this.player.position.z);
    this.camera.position.copy(this.player.position).add(new T.Vector3(-22, 10, 30));
    this.cam = new CameraController(this.camera);
    this.input = new Input(canvas, this.action.bind(this), () => this.state === "playing" && !this.ui.modalType, () => this.settings);
    this.selectedMission = FREE_FLIGHT.id;
    this.target = null;
    this.lock = 0;
    this.notifications = [];
    this.multiplayer = new MultiplayerManager(this);

    // Post-Processing Pipeline (HDR Bloom & Tone Mapping)
    this.composer = null;
    this.bloomPass = null;
    try {
      if (typeof window !== "undefined" && this.renderer && this.renderer.capabilities?.isWebGL2 && this.renderer.extensions.has("EXT_color_buffer_float")) {
        const target = new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,depthBuffer:true});
        this.composer = new EffectComposer(this.renderer, target);
        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        this.bloomPass = new UnrealBloomPass(
          new T.Vector2(innerWidth, innerHeight),
          0.38,  // Intensity: crisp cinematic emissive glow
          0.32,  // Radius
          0.88   // Threshold: strict cutoff so daylight terrain/sky never blooms or bleeds
        );
        this.composer.addPass(this.bloomPass);

        const outputPass = new OutputPass();
        this.composer.addPass(outputPass);
      }
    } catch {
      this.composer = null;
    }

    try { this.environment=new EnvironmentLighting(this.renderer,this.scene); } catch { this.environment=null; }
    this.world.onLightingChange=()=>{try{this.environment?.update(`${this.atmosphere.timeOfDay}:${this.atmosphere.weather}`,this.world);}catch{this.environment?.dispose();this.environment=null;}};
    this.applySettings();
    this.onResize=()=>this.resize();window.addEventListener("resize",this.onResize);
    this.onContextLost=(e)=>{
      e.preventDefault();
      this.pause();
      ui.message("Graphics connection interrupted. Reload the page to reconnect.");
    };canvas.addEventListener("webglcontextlost",this.onContextLost);
    this.last = performance.now();
    this.frame = this.frame.bind(this);
    this.animationFrame=requestAnimationFrame(this.frame);
  }

  applySettings() {
    const quality=configureRenderer(this,innerWidth,innerHeight,window.devicePixelRatio || 1);
    this.world?.setQuality?.(this.settings.quality);
    this.effects?.setQuality?.(quality.particles,this.settings.effectIntensity ?? .8);
    this.speedEffects?.setQuality?.(quality.streaks,this.settings.reducedMotion ? 0 : this.settings.effectIntensity ?? .8);
    this.applyMissionEnvironment();
  }

  applyMissionEnvironment() {
    const time = this.openSkies ? 'midday' : this.settings.timeOfDay || 'day';
    const weather = this.openSkies ? 'clear' : this.settings.weather || 'clear';
    if (this.atmosphere) {
      if (!this.atmosphere.hasApplied || this.atmosphere.timeOfDay !== time) this.atmosphere.setTimeOfDay(time);
      if (this.atmosphere.weather !== weather) this.atmosphere.setWeather(weather);
    }
    if (this.bloomPass) this.bloomPass.strength = Math.min(qualityFor(this.settings.quality).bloom, this.openSkies ? .18 : 1);
  }

  equipJet(config) {
    if (!config) return;
    this.jetConfig = { ...this.jetConfig, ...config };
    savePlayerJetConfig(this.jetConfig);
    this.player.applyCustomization(this.jetConfig);
    this.recalculateLoadout();
    this.cam?.reset?.(this.player);
    if (this.ui?.onJetChanged) this.ui.onJetChanged(this.jetConfig, this.player.stats);
  }

  recalculateLoadout() {
    if (!this.player?.stats) return;
    this.player.hp = this.player.stats.maxHp;
    this.player.maxHp = this.player.stats.maxHp;
    this.missilesLeft = this.player.stats.missiles;
    this.cannonLeft = this.player.stats.cannon;
    this.flaresLeft = this.player.stats.flares;
  }

  resize() {
    configureRenderer(this,innerWidth,innerHeight,window.devicePixelRatio || 1);
    this.ui.resize();
  }

  action(code) {
    const action = ACTIONS[code] || ['uiNext', 'uiPrevious', 'uiConfirm'].includes(code) ? code : actionForCode(code, this.settings);
    if (this.openSkies && !this.multiplayer?.active && this.ui.modalType === 'squadron') {
      if (action === 'pause' || action === 'teamComms') { this.closeSquadronPanel(); return; }
      if (['command1', 'command2', 'command3'].includes(action)) {
        this.commandSquadron(['cover', 'attack', 'regroup'][Number(action.at(-1)) - 1]); return;
      }
      if (action === 'uiNext' || action === 'uiPrevious' || action === 'uiConfirm') { this.ui.navigateSquadron?.(action); return; }
    }
    if (action === "pause") {
      if (this.ui.modalType && this.state === "playing") { this.ui.closePanel(); return; }
      if (this.state === "playing" || this.state === "intro") this.pause();
      else if (this.state === "paused") this.ui.closePanel();
      else this.ui.closePanel();
      return;
    }
    if (code === "Blur") {
      this.pause();
      return;
    }
    if (this.state !== "playing") return;
    if (this.multiplayer?.active) {
      if (action === "teamComms" || action === "allComms") {
        this.multiplayer.comms?.toggle?.(action === "teamComms");
        return;
      }
      if (action?.startsWith("command") && this.multiplayer.comms?.isOpen) {
        const num = parseInt(action.replace("command", ""), 10);
        if (num >= 1 && num <= 7) {
          this.multiplayer.comms.triggerCommand(num);
          return;
        }
      }
      if (!this.player.alive && this.multiplayer.spectator?.isSpectating) {
        if (action === "yawLeft") { this.multiplayer.spectator.selectNextTeammate(-1); return; }
        if (action === "yawRight") { this.multiplayer.spectator.selectNextTeammate(1); return; }
      }
    }
    if (this.ui.modalType) {
      if (action === 'tacticalMap' && this.ui.modalType === 'map') this.ui.closePanel();
      return;
    }
    if (action === 'teamComms' && this.openSkies) { this.openSquadronPanel(); return; }
    if (action === 'help') { this.pause(); this.ui.showControls(); return; }
    if (action === 'tacticalMap') { this.input?.clear?.(); this.ui.toggleMap(); return; }
    if (action === 'missile') { this.launch(); return; }
    if (action === 'targetNext') { this.cycleTarget(1); return; }
    if (action === 'targetPrev') { this.cycleTarget(-1); return; }
    if (action === 'landingGear') { this.toggleGear(); return; }
    if (action === 'landingAssist') { this.input?.clear?.(); this.ui.showAirbaseLandingModal(); return; }
    if (action === "timeOfDay" && this.atmosphere) {
      if (this.openSkies) { this.ui.message('Aegis Strait uses clear daylight. Your sky preference returns after this sortie.', 3); return; }
      const cycle = { morning: "midday", midday: "day", day: "sunset", sunset: "night", night: "morning" };
      const next = cycle[this.atmosphere.timeOfDay] || "morning";
      this.atmosphere.setTimeOfDay(next);
      this.settings.timeOfDay = next;
      this.ui.message(`TIME OF DAY: ${next.toUpperCase()}`, 2);
      return;
    }
    if (action === "flare") { this.flare(); return; }
    if (action === "camera") { this.cam.cycle(); return; }
    if (action === "cockpit") { this.cam.mode = this.cam.mode === "cockpit" ? "chase" : "cockpit"; return; }
  }

  resetSessionCounters() {
    this.missileCooldown = 0;
    this.flareCooldown = 0;
    this.cannonCooldown = 0;
    this.warningTimer = 0;
    this.incoming = [];
    this.outOfArea = false;
    this.elapsed = 0;
    this.score = 0;
    this.lock = 0;
    this.lockSound = false;
    this.lastKill = -20;
    this.combo = 0;
    this.damageFlash = 0;
    this.weaponHitUntil = 0; this.weaponHitKill = false; this.weaponLaunchUntil = 0;
    this.notifications = [];
    this.stats = { kills: 0, hits: 0, shots: 0, missiles: 0, missileHits: 0, damageTaken: 0 };
    this.resultCommitted = false;
    this.battleResult = null;
    this.hostileLock = false;
    this.accumulator = 0;
    this.input.clear();
  }

  start(id = this.selectedMission, options = {}) {
    this.audio.stopPreview?.();
    this.audio.init();
    this.mission = getMission(id);
    this.openSkies?.abort();
    this.openSkies = this.mission.id === 2 && !this.multiplayer?.active ? new OpenSkiesEncounter(options.seed) : null;
    if (this.openSkies) this.openSkies.difficulty = this.settings.difficulty || 'easy';
    this.sortieId = `skies-${Date.now().toString(36)}-${++sortieSequence}`;
    this.squadronReturnState = null;
    this.input.menuMode = null;
    this.applyMissionEnvironment();
    this.selectedMission = this.mission.id;
    for (const j of [...this.enemies, ...this.allies]) {
      j.dispose?.();
    }
    this.enemies = [];
    this.allies = [];
    this.weapons.clear();
    this.effects.clear();
    this.input.clear();
    this.player.hp = this.player.stats?.maxHp || 100;
    this.player.maxHp = this.player.hp;
    if (this.openSkies) this.openSkies.startMaxHp = this.player.maxHp;
    this.player.alive = true;
    this.player.deadTime = 0;
    this.player.speed = 245;
    this.player.throttle = 0.6;
    this.player.angular.set(0, 0, 0);
    this.player.quaternion.identity();
    this.player.position.set(0, id === 1 ? 1800 : 1550, id === 1 ? -500 : 5200);
    if (this.openSkies) this.player.position.set(OPEN_SKIES.start.x, OPEN_SKIES.start.y, OPEN_SKIES.start.z);
    if (!this.lastPlayerPos) this.lastPlayerPos = new T.Vector3();
    this.lastPlayerPos.copy(this.player.position);
    this.currentAirspace = getAirspaceAt(this.player.position.x, this.player.position.z);
    this.nearestCityInfo = getNearestCity(this.player.position.x, this.player.position.z);
    this.player.velocity.set(0, 0, -245);
    this.player.boost = false;
    this.player.model.visible = true;
    this.player.isLanded = false;
    this.player.currentBase = null;
    this.player.landingMode = false;
    this.player.flaps = false;
    this.player.takeoffCooldown = 0;
    this.missilesLeft = this.player.stats?.missiles ?? 6;
    this.cannonLeft = this.player.stats?.cannon ?? 1200;
    this.flaresLeft = this.player.stats?.flares ?? 20;
    this.resetSessionCounters();
    this.player.stall = false;
    for (let i = 0; i < (this.openSkies ? 0 : this.mission.fighters); i++) {
      const j = new Jet("enemy");
      j.position.set((i % 3 - 1) * 850, 1650 + i % 2 * 250, this.player.position.z - 3600 - Math.floor(i / 3) * 1700 - i * 250);
      j.quaternion.setFromAxisAngle(new T.Vector3(0, 1, 0), i % 2 ? 0.4 : 2.7);
      this.enemies.push(j);
      this.scene.add(j.model);
    }
    for (let i = 0; i < this.mission.bombers; i++) {
      const j = new Jet("enemy", true);
      j.position.set(2600 + i * 850, 1500, -4900 - i * 1e3);
      j.speed = 125;
      this.enemies.push(j);
      this.scene.add(j.model);
    }
    for (let i = 0; i < this.mission.allies; i++) {
      const j = new Jet("ally");
      j.position.copy(this.player.position).add(new T.Vector3(i ? 220 : -220, 60, -200));
      if (this.openSkies) configureSquadronJet(j, { role: 'wingman', slot: i, seed: this.openSkies.seed + i + 101 }, this.elapsed);
      this.allies.push(j);
      this.scene.add(j.model);
    }
    if (this.openSkies) {
      this.player.setGear(false);
      this.handleEncounterEvents(this.openSkies.start());
    }
    for (const jet of [this.player, ...this.enemies, ...this.allies]) jet.resetInterpolation?.();
    this.target = this.enemies.find((e) => Math.abs(e.position.x - this.player.position.x) < 400) || this.enemies[0] || null;
    this.cam.mode = "chase";
    this.state = "playing";
    this.intro = 0;
    this.camera.position.copy(this.player.position).add(new T.Vector3(0, 8.5, 32));
    this.camera.lookAt(this.player.position.clone().add(new T.Vector3(0, 0, -110)));
    this.camera.up.set(0, 1, 0);
    this.camera.view = null;
    this.camera.updateProjectionMatrix();
    this.cam?.reset?.(this.player);
    this.ui.resetBattleTutorial?.();
    this.ui.inGame();
    this.ui.message(this.mission.name + " · " + this.mission.objective, 4.5);
    this.notify(this.mission.freeFlight ? "FLIGHT GUIDE" : "COMMAND", this.mission.freeFlight ? `Free flight active. ${bindingLabel("tacticalMap",this.settings)} opens the map.` : `Keep the target in the reticle. ${bindingLabel("missile",this.settings)} launches when LOCKED.`, 7);
  }

  handleEncounterEvents(events) {
    for (const event of events) {
      if (event.type === 'wave') {
        const direction = this.player.forward;
        const heading = Math.atan2(direction.x, -direction.z);
        for (const unit of event.units) {
          const jet = new Jet('enemy', false, unit.role === 'ace' ? { modelId: 'su57', liveryId: 'desert' } : null);
          const bearing = heading + unit.bearing + (unit.slot - (event.units.length - 1) / 2) * .2;
          const distance = 4300 + unit.slot * 450;
          jet.position.set(this.player.position.x + Math.sin(bearing) * distance, this.player.position.y + 180 + unit.slot * 100, this.player.position.z - Math.cos(bearing) * distance);
          jet.position.y = Math.max(jet.position.y, terrainHeight(jet.position.x, jet.position.z) + 850, 1200);
          const toward = this.player.position.clone().sub(jet.position).normalize();
          jet.quaternion.setFromUnitVectors(new T.Vector3(0, 0, -1), toward);
          jet.velocity.copy(toward).multiplyScalar(jet.speed);
          configureSquadronJet(jet, unit, this.elapsed);
          this.enemies.push(jet); this.scene.add(jet.model); jet.resetInterpolation();
        }
        this.target = this.enemies.find(jet => jet.alive) || null;
        this.lock = 0; this.lockSound = false;
        this.notify('AEGIS CONTROL', event.radio, 6);
      } else if (event.type === 'radio') this.notify('AEGIS CONTROL', event.text, 5);
      else if (event.type === 'complete') this.finish(true);
      else if (event.type === 'failed') this.finish(false, 'Your aircraft was destroyed.');
    }
  }

  openSquadronPanel() {
    if (!this.openSkies || this.multiplayer?.active || !['playing', 'paused'].includes(this.state) || !this.player.alive) return;
    if (this.ui.modalType === 'squadron') { this.closeSquadronPanel(); return; }
    this.squadronReturnState = this.state;
    this.state = 'paused'; this.input.clear();
    this.input.menuMode = 'squadron';
    this.input.menuButtons = new Set(['teamComms', 'pause']);
    if (typeof document !== 'undefined') document.exitPointerLock?.();
    this.ui.showSquadron?.();
  }
  closeSquadronPanel() {
    const previous = this.squadronReturnState || 'playing';
    this.squadronReturnState = null; this.input.clear();
    this.input.menuMode = null;
    this.state = previous;
    if (previous === 'paused') this.ui.showPause(); else this.ui.inGame();
  }
  commandSquadron(order) {
    if (!this.openSkies || !['playing', 'paused'].includes(this.state)) return false;
    const accepted = issueSquadronOrder(this, order);
    if (accepted && this.ui.modalType === 'squadron') this.closeSquadronPanel();
    return accepted;
  }

  pause() {
    if (this.state === "playing" || this.state === "intro") {
      this.beforePause = this.state;
      this.state = "paused";
      document.exitPointerLock?.();
      this.input.clear();
      this.ui.showPause();
    }
  }

  resume() {
    this.audio.stopPreview?.();
    this.state = this.beforePause === "intro" ? "intro" : "playing";
    this.input.clear();
    this.audio.init();
    this.ui.inGame();
  }

  menu() {
    if (this.multiplayer?.active) {
      this.multiplayer.leaveMatch();
    }
    this.audio.stopPreview?.();
    this.openSkies?.abort(); this.openSkies = null;
    this.squadronReturnState = null; this.battleResult = null;
    this.target = null; this.lock = 0; this.incoming = []; this.notifications = [];
    this.input.menuMode = null;
    this.applyMissionEnvironment();
    this.state = "menu";
    this.input.clear();
    this.weapons.clear();
    this.effects.clear();
    for (const j of [...this.enemies, ...this.allies]) {
      j.dispose?.();
    }
    this.enemies = [];
    this.allies = [];
    this.player.alive = true;
    this.player.hp = 100;
    this.player.model.visible = true;
    this.player.quaternion.identity();
    this.player.position.set(0, 1550, 5200);
    if (!this.lastPlayerPos) this.lastPlayerPos = new T.Vector3();
    this.lastPlayerPos.copy(this.player.position);
    this.cam.mode = "chase";
    this.ui.showMenu();
  }

  cycleTarget(dir = 1) {
    if (this.multiplayer?.active) {
      const available = Array.from(this.multiplayer.remotePlayers.values()).filter((e) => e.alive && e.team !== this.multiplayer.localTeam);
      if (available.length > 0) {
        let idx = available.findIndex((e) => e.id === this.target?.id);
        if (idx === -1) idx = 0;
        else idx = (idx + dir + available.length) % available.length;
        this.target = available[idx] || null;
      } else {
        this.target = null;
      }
      this.lock = 0;
      this.lockSound = false;
      return;
    }
    const available = this.enemies.filter((e) => e.alive);
    if (available.length > 0) {
      let idx = available.indexOf(this.target);
      if (idx === -1) idx = 0;
      else idx = (idx + dir + available.length) % available.length;
      this.target = available[idx] || null;
    } else {
      this.target = null;
    }
    this.lock = 0;
    this.lockSound = false;
  }

  resetPracticePosition() {
    if (!this.mission?.freeFlight) return;
    this.player.position.set(0, 1550, 5200);
    if (!this.lastPlayerPos) this.lastPlayerPos = new T.Vector3();
    this.lastPlayerPos.copy(this.player.position);
    this.player.quaternion.identity();
    this.player.angular.set(0, 0, 0);
    this.player.isLanded = false;
    this.player.currentBase = null;
    this.player.landingMode = false;
    this.player.flaps = false;
    this.player.takeoffCooldown = 0;
    this.player.gearDown = true;
    this.player.velocity.set(0, 0, -220);
    this.player.speed = 220;
    this.player.throttle = 0.58;
    this.player.hp = 100;
    this.player.alive = true;
    this.player.boost = false;
    this.player.stall = false;
    this.outOfArea = false;
    this.input.clear();
    this.camera.position.copy(this.player.position).add(new T.Vector3(0, 8.5, 32));
    this.ui.message("Recovered to safe altitude. Level out and continue flight.", 3);
  }

  chooseEasyTarget() {
    if (this.multiplayer?.active) {
      if (this.settings.flightMode === "manual" || this.lock > 0) return;
      let best = this.target, bestDot = 0.94;
      const direction = this.player.forward;
      for (const jet of this.multiplayer.remotePlayers.values()) {
        if (!jet.alive || jet.team === this.multiplayer.localTeam) continue;
        const offset = jet.position.clone().sub(this.player.position);
        if (offset.length() > 8500) continue;
        const dot = direction.dot(offset.normalize());
        if (dot > bestDot) { bestDot = dot; best = jet; }
      }
      if (best !== this.target) { this.target = best; this.lock = 0; this.lockSound = false; }
      return;
    }
    if (this.settings.flightMode === "manual" || this.lock > 0 || this.mission.freeFlight) return;
    let best = this.target, bestDot = 0.94;
    const direction = this.player.forward;
    for (const jet of this.enemies) {
      if (!jet.alive) continue;
      const offset = jet.position.clone().sub(this.player.position);
      if (offset.length() > 8500) continue;
      const dot = direction.dot(offset.normalize());
      if (dot > bestDot) { bestDot = dot; best = jet; }
    }
    if (best !== this.target) { this.target = best; this.lock = 0; this.lockSound = false; }
  }

  launch() {
    if (this.multiplayer?.active) {
      if (!this.multiplayer.matchOptions?.weaponsEnabled) return;
      if (this.missilesLeft <= 0) {
        this.ui.message("No missiles remaining. Use the cannon.");
        return;
      }
      if (this.missileCooldown > 0) {
        this.ui.message("Missile rack reloading");
        return;
      }
      if (!this.target?.alive || this.lock < 1.4) {
        this.ui.message("Keep the selected target inside the ring until LOCKED");
        return;
      }
      const origin = this.player.position.clone().add(this.player.forward.clone().multiplyScalar(4));
      const dir = this.player.forward.clone();
      this.multiplayer.fireMissile(this.target.id, origin, dir);
      this.weapons.missile(this.player, this.target);
      this.missilesLeft--;
      this.stats.missiles++;
      this.missileCooldown = 1.7;
      this.weaponLaunchUntil = this.elapsed + .85;
      this.lock = 0;
      this.lockSound = false;
      this.cam.shake = 0.5;
      this.notify("KESTREL", "Missile away.", 2);
      return;
    }
    if (this.mission?.freeFlight) return;
    if (this.missilesLeft <= 0) {
      this.ui.message("No missiles remaining. Use the cannon.");
      return;
    }
    if (this.missileCooldown > 0) {
      this.ui.message("Missile rack reloading");
      return;
    }
    if (!this.target?.alive || this.lock < 1.4) {
      this.ui.message("Keep the selected target inside the ring until LOCKED");
      return;
    }
    if (this.weapons.missile(this.player, this.target)) {
      this.missilesLeft--;
      this.stats.missiles++;
      this.missileCooldown = 1.7;
      this.weaponLaunchUntil = this.elapsed + .85;
      this.lock = 0;
      this.lockSound = false;
      this.cam.shake = 0.5;
      this.notify("KESTREL", "Missile away.", 2);
    }
  }

  flare() {
    if (this.multiplayer?.active) {
      if (!this.multiplayer.matchOptions?.weaponsEnabled) return;
      if (this.flareCooldown > 0 || this.flaresLeft <= 0) return;
      this.flaresLeft--;
      this.flareCooldown = 0.75;
      this.multiplayer.deployFlares();
      this.weapons.deployFlares(this.player);
      this.ui.message("Flares deployed · missile diverted", 2);
      return;
    }
    if (this.mission?.freeFlight) return;
    if (this.flareCooldown > 0 || this.flaresLeft <= 0) return;
    this.flaresLeft--;
    this.flareCooldown = 0.75;
    const n = this.weapons.deployFlares(this.player);
    if (n) progression.recordFlareDeflection();
    this.ui.message(n ? "Flares deployed · missile diverted" : "Flares deployed", 2);
  }

  damage(jet, amount, owner, weapon) {
    if (!jet.alive) return;
    if (jet === this.player) this.stats.damageTaken = (this.stats.damageTaken || 0) + Math.min(jet.hp, Math.max(0, amount));
    jet.hp = Math.max(0, jet.hp - amount);
    if (owner === this.player) {
      if (weapon === "cannon" || weapon === "missile") {
        if (!(this.weaponHitUntil > this.elapsed)) this.audio.play("hit");
        this.weaponHitUntil = this.elapsed + .24;
        this.weaponHitKill = jet.hp === 0;
      }
      if (weapon === "cannon") {
        this.stats.hits++;
        this.score += 20;
      } else if (weapon === 'missile') {
        this.stats.missileHits++;
        this.score += 200;
      }
    }
    if (jet === this.player) {
      this.damageFlash = 0.5;
      this.cam.shake = 0.65;
      this.audio.play("hit");
    }
    if (jet.team === 'ally' && jet.hp > 0 && jet.hp < jet.maxHp * .45 && this.openSkies?.canRadio(`wing-help-${jet.id}`, 18)) {
      this.notify(jet.callsign, 'Taking damage. Need cover! Regroup us or engage the fighter on our tail.', 4);
    }
    if (jet.hp === 0) {
      jet.alive = false;
      jet.deadTime = 0;
      this.effects.burst(jet.position, 65, 30);
      this.effects.shockwave?.(jet.position, 220, 0xff9922);
      if (weapon !== "missile") this.audio.play("explosion", { distance: jet.position.distanceTo(this.camera.position) });
      if (jet === this.player) {
        this.state = "dying";
        this.cam.mode = "cinematic";
        this.input.clear();
        this.input.menuMode = null;
      } else if (jet.team === "enemy") {
        if (owner === this.player) {
          this.stats.kills++;
          this.combo = this.elapsed - this.lastKill < 12 ? this.combo + 1 : 1;
          this.lastKill = this.elapsed;
          const bonus = Math.max(0, this.combo - 1) * 250;
          this.score += 1e3 + bonus;
          this.ui.message("HOSTILE DOWN  +1,000" + (bonus ? "  · COMBO +" + bonus : ""), 2.3);
          progression.recordKill(weapon);
        }
        if (this.target === jet) this.cycleTarget();
      } else if (jet.team === 'ally' && this.openSkies) {
        this.notify('AEGIS CONTROL', `${jet.callsign} is down. Stay in the fight; the mission can still be completed.`, 4);
      }
    }
  }

  notify(who, text, ttl = 4) {
    if (this.notifications.some(n => n.who === who && n.text === text)) return;
    this.notifications.push({ who, text, ttl });
    if (this.notifications.length > 5) this.notifications.pop();
  }

  finish(success, reason = "") {
    if (this.state === "result" || this.resultCommitted) return;
    this.resultCommitted = true;
    this.state = "result";
    this.input.clear();
    this.input.menuMode = null;
    this.squadronReturnState = null;
    if (this.openSkies) {
      this.battleResult = scoreOpenSkies({ success, stats: this.stats, maxHp: this.openSkies.startMaxHp, allies: this.allies, elapsed: this.elapsed, seed: this.openSkies.seed });
      this.battleResult.difficulty = this.openSkies.difficulty;
      if (!success) this.openSkies.state = 'failed';
      Object.assign(this.battleResult, recordOpenSkiesResult(progression, this.sortieId, this.battleResult, this.openSkies.difficulty));
    }
    if (success) {
      this.score += 5e3;
      if (!this.openSkies) progression.recordMissionWin(this.mission?.name || "SORTIE");
    }
    this.ui.showResult(success, reason);
  }

  step(dt) {
    if (this.state === 'paused' || this.state === 'result' || this.state === 'menu') return;
    this.player.beginStep?.();
    for (const jet of this.enemies) jet.beginStep?.();
    for (const jet of this.allies) jet.beginStep?.();
    this.elapsed += dt;
    this.cameraRightForAudio ||= new T.Vector3();
    this.cameraRightForAudio.set(1,0,0).applyQuaternion(this.camera.quaternion);
    if (this.multiplayer?.active) {
      this.multiplayer.step(dt);
    }
    this.missileCooldown = Math.max(0, this.missileCooldown - dt);
    this.flareCooldown = Math.max(0, this.flareCooldown - dt);
    this.cannonCooldown -= dt;
    this.damageFlash = Math.max(0, this.damageFlash - dt);
    this.warningTimer -= dt;
    if (this.notifications[0]) { this.notifications[0].ttl -= dt; if(this.notifications[0].ttl <= 0) this.notifications.shift(); }

    if (this.player.alive) {
      this._previousFlightPosition ||= new T.Vector3();
      this._previousFlightPosition.copy(this.player.position);
      updateFlight(this.player, this.input, dt, this.settings);

      // Check boundary crossing
      if (!this.lastPlayerPos) this.lastPlayerPos = new T.Vector3().copy(this.player.position);
      const cross = checkBoundaryCrossing(this.lastPlayerPos, this.player.position);
      if (cross) {
        this.ui.triggerBorderAlert?.(cross);
        this.notify("ATC BORDER RADAR", `Entering ${cross.toCountry} Airspace (${cross.toState} Sector)`, 6);
        this.audio.play("warning");
      }
      this.lastPlayerPos.copy(this.player.position);
      this.currentAirspace = getAirspaceAt(this.player.position.x, this.player.position.z);
      this.nearestCityInfo = getNearestCity(this.player.position.x, this.player.position.z);

      // Signature Aerodynamic Wingtip Contrails during high-speed, high-G, or afterburner boost
      const alt = this.player.position.y;
      const isBoost = this.player.boost;
      const isHighG = Math.hypot(this.player.angular.x, this.player.angular.z) > 0.32;
      if (this.effects?.contrail && (isBoost || isHighG || this.player.speed > 210)) {
        const tips = this.player.getWingTips?.();
        if (tips) {
          this.effects.contrail(tips.left, 18, 1.2, isBoost, alt);
          this.effects.contrail(tips.right, 18, 1.2, isBoost, alt);
        }
      }

      // High-speed aerodynamic rush streaks & transonic sonic boom effects
      

      // Cosmetic nozzle exhaust glow (not screen-space refraction)
      if (isBoost && this.effects?.exhaustGlow) {
        const nozzlePos = this.player.getExhaustPosition();
        this.effects.exhaustGlow(nozzlePos, this.player.velocity);
      }

      // Low-altitude sea spray water wake rooster-tail (<38m over ocean)
      if (this.effects?.waterWake && this.player.position.y <= 38 && this.player.speed > 80) {
        const groundH = terrainHeight(this.player.position.x, this.player.position.z);
        if (groundH <= 6) {
          this.effects.waterWake(this.player.position, this.player.velocity, this.player.speed);
        }
      }

      // Airbase Terminal Inbound Proximity & ATC Clearance Callout
      const nearBaseInfo = getNearestIAFBase ? getNearestIAFBase(this.player.position.x, this.player.position.z) : null;
      if (nearBaseInfo && nearBaseInfo.distance < 8500 && !this.player.isLanded) {
        const nearBase = nearBaseInfo.base;
        if (this.lastAlertedBase !== nearBase.id && (this.elapsed - (this.lastBaseAlertTime || 0)) > 40) {
          this.lastAlertedBase = nearBase.id;
          this.lastBaseAlertTime = this.elapsed;
          const rwyNum = (nearBase.runwayHeading || 0) === 0 ? "36/18" : "09/27";
          this.notify("AIRBASE APPROACH", `${nearBase.callsign}: Inbound aircraft identified. Runway ${rwyNum} active, elevation ${nearBase.elevation}M. Cleared for visual landing approach.`);
          this.ui.message(`🛬 APPROACHING ${nearBase.shortName.toUpperCase()} · ALIGN RUNWAY · SINK RATE < 18 M/S`, 5.0);
          this.audio.playLock?.();
        }
      }

      // Takeoff climbout immunity countdown
      if (this.player.takeoffCooldown > 0) {
        this.player.takeoffCooldown -= dt;
      }

      // Runway touchdown detection for IAF strategic airbases & Home base
      const rw = this.world.getRunwayAt ? this.world.getRunwayAt(this.player.position.x, this.player.position.z) : null;
      const nearAirbase = this.world.getAirbaseNear ? this.world.getAirbaseNear(this.player.position.x, this.player.position.z, 3800) : null;
      const targetBase = rw?.base || nearAirbase?.base;
      const groundElev = rw?.elevation ?? terrainHeight(this.player.position.x,this.player.position.z);
      const groundContactY = groundElev + 3.2;
      const altAboveGround = this.player.position.y - groundContactY;
      const sinkRate = -this.player.velocity.y;

      const isDescending = this.player.velocity.y < -0.8 && sinkRate > 0.8;
      const onTakeoffClimb = (this.player.takeoffCooldown || 0) > 0 || this.player.velocity.y > 0.5;

      let runwayContact = null;
      if (!this.player.isLanded && !onTakeoffClimb) {
        for (const base of IAF_BASES) {
          const result = assessTouchdown(base, this._previousFlightPosition, this.player);
          if (!result) continue;
          runwayContact = result;
          if (result.safe) {
            this.player.position.copy(result.hit);
            this.touchdown(base);
            if (result.hard) this.player.hp = Math.max(1, this.player.hp - 20);
          } else {
            if (this.mission.freeFlight) this.resetPracticePosition();
            else this.damage(this.player, 1000, null, "terrain");
            this.ui.message(result.reason, 4);
          }
          break;
        }
      }

      // 1. Aerodynamic Ground Effect Lift Cushion: smoothly flares and cushions descent rate when landing
      if (this.settings.flightMode!=="manual" && !this.player.isLanded && !onTakeoffClimb && altAboveGround > 0 && altAboveGround < 30 && sinkRate > 0.6) {
        const cushionFactor = Math.min(1.0, 1.0 - altAboveGround / 30.0);
        this.player.velocity.y = damp(this.player.velocity.y, -1.5, 6.5 * cushionFactor, dt);
      }

      // 2. Safety Landing Gear Deployment: auto-extend gear on short final descent if pilot forgot
      if (this.settings.flightMode!=="manual" && !this.player.isLanded && !onTakeoffClimb && !this.player.gearDown && altAboveGround <= 28 && altAboveGround > -3.0 && isDescending) {
        this.player.setGear(true);
        this.ui.message("AVIONICS: LANDING GEAR AUTO-EXTENDED [DOWN] 🛬", 2.2);
        this.audio.playLock?.();
      }

      // 3. Smooth Wheel Touchdown:
      // ONLY triggers when NOT on takeoff climb, actively descending downwards, and wheels meet surface
      const overRunway = IAF_BASES.some(base => onRunway(base, this.player.position));
      if (!runwayContact && !overRunway && !this.player.isLanded && !onTakeoffClimb && isDescending && altAboveGround >= -2.5 && altAboveGround <= 3.8) {
        if (groundElev>3 && canTouchdown(this.player,sinkRate)) {
          const landBase = targetBase || {
            id: "field_landing",
            name: "Tactical Field Landing",
            shortName: "Field Landing",
            elevation: groundElev,
            squadron: "Expeditionary Force"
          };
          this.touchdown(landBase);
          // Tire smoke puff & suspension bump
          if (this.effects?.smoke) {
            const wheelPos = this.player.position.clone().add(new T.Vector3(0, -1.5, 0));
            this.effects.smoke(wheelPos, false, 8);
          }
          if (this.cam) this.cam.shake = 0.22;
        }
      }

      // Runway Liftoff Detection & Departure Chime
      if (this.player.justLiftedOff) {
        this.player.justLiftedOff = false;
        this.audio.playLock?.();
        this.ui.message("🛫 AIRBORNE! CLIMBING OUT · CLEARED FOR COMBAT FLIGHT", 4.5);
        const depBase = targetBase || (nearBaseInfo && nearBaseInfo.base);
        if (depBase) {
          this.notify("AIRBASE DEPARTURE", `${depBase.callsign || "AIRBASE TOWER"}: Airborne confirmed. Radar contact established. Good hunting.`);
        }
      }

      if (!this.player.isLanded && !onTakeoffClimb && this.world.collision(this.player.position, this.player.isLanded, this.player.gearDown)) {
        // Safety catch: if player is near surface level in landing zone, execute safe touchdown
        if (!runwayContact && !overRunway && groundElev > 3 && altAboveGround >= -2.5 && canTouchdown(this.player, sinkRate)) {
          const landBase = targetBase || {
            id: "field_landing",
            name: "Tactical Field Landing",
            shortName: "Field Landing",
            elevation: groundElev,
            squadron: "Expeditionary Force"
          };
          this.touchdown(landBase);
        } else {
          if (this.mission.freeFlight) this.resetPracticePosition();
          else this.damage(this.player, 1e3, null, "terrain");
        }
      }

      const radius = this.openSkies ? Math.hypot(this.player.position.x - OPEN_SKIES.center.x, this.player.position.z - OPEN_SKIES.center.z) : Math.hypot(this.player.position.x, this.player.position.z);
      const maxRadius = this.openSkies ? OPEN_SKIES.boundaryRadius : this.expandedMapMode ? 95e3 : 30500;
      this.outOfArea = radius > (this.openSkies ? OPEN_SKIES.warningRadius : this.expandedMapMode ? 85e3 : 26e3);
      if (radius > maxRadius) {
        if (this.mission.freeFlight) this.resetPracticePosition();
        else this.damage(this.player, 1e3, null, "boundary");
      }

      if (this.player.position.y > 15e3) {
        if (this.mission.freeFlight) this.resetPracticePosition();
        else { this.player.velocity.y -= 30; this.ui.message("Altitude ceiling · lower your nose", 1); }
      }

      const isFiringCannon = !this.ui.modalType && isHeld(this.input, "cannon", this.settings);
      if (this.multiplayer?.active) {
        if (this.multiplayer.matchOptions?.weaponsEnabled && isFiringCannon && this.cannonCooldown <= 0 && this.cannonLeft > 0) {
          const origin = this.player.position.clone().add(this.player.forward.clone().multiplyScalar(4));
          const dir = this.player.forward.clone();
          this.multiplayer.fireCannon(origin, dir);
          this.weapons.cannon(this.player, this.target);
          this.cannonLeft--;
          this.stats.shots++;
          this.cannonCooldown = 0.065;
          this.cam.shake = 0.15;
        }
      } else if (!this.mission.freeFlight && isFiringCannon && this.cannonCooldown <= 0 && this.cannonLeft > 0) {
        if (this.weapons.cannon(this.player, this.target)) {
          this.cannonLeft--;
          this.stats.shots++;
          this.cannonCooldown = 0.065;
          this.cam.shake = 0.15;
        }
      }

      this.chooseEasyTarget();
      this.lock = updateLock(this.player, this.target, this.lock, dt);
      if (this.lock >= 1.4 && !this.lockSound) {
        this.audio.play("lock");
        this.lockSound = true;
      }
      if (this.lock === 0) this.lockSound = false;
    }

    this.hostileLock = false;
    for (const j of [...this.enemies, ...this.allies]) {
      if (this.openSkies && j.combat) updateSquadronAI(j, this, dt);
      else updateAI(j, this, dt);
      if (j.alive && this.world.collision(j.position)) this.damage(j, 1e3, null, "terrain");
    }

    const jets = [this.player, ...this.enemies, ...this.allies];
    for (let i = 0; i < jets.length; i++) {
      for (let k = i + 1; k < jets.length; k++) {
        const a = jets[i], b = jets[k];
        if (a.alive && b.alive && a.position.distanceToSquared(b.position) < ((a.radius + b.radius) * 0.68) ** 2) {
          this.damage(a, 1e3, b, "collision");
          this.damage(b, 1e3, a, "collision");
        }
      }
    }

    this.weapons.update(dt, jets, (p) => this.world.collision(p));
    this.incoming = this.weapons.missiles.filter((m) => m.active && m.target === this.player);
    if (this.incoming.length && this.warningTimer <= 0) {
      this.audio.play("warning");
      this.warningTimer = 1.1;
    }

    for (const j of jets) {
      if (!j.alive) {
        j.deadTime += dt;
        j.velocity.y -= 20 * dt;
        j.position.addScaledVector(j.velocity, dt);
        j.model.rotateZ(dt * 0.8);
        if (j.deadTime < 4 && Math.random() < 0.7) this.effects.smoke(j.position, true, 25);
        if (j.deadTime > 4 || this.world.collision(j.position)) {
          j.model.visible = false;
          if (j === this.player) this.finish(false, "Your aircraft was destroyed.");
        }
      } else if (j.hp < 80) {
        // Progressive Aircraft Damage VFX Escalation (Vapor leak -> Engine smoke -> Fire & sparks)
        const hpRatio = j.hp / (j.maxHp || 100);
        if (hpRatio < 0.3) {
          // Critical damage: violent fire, black smoke and trailing sparks
          if (Math.random() < 0.65) {
            this.effects.smoke(j.position, true, 26);
            const firePos = j.position.clone().add(new T.Vector3((Math.random() - 0.5) * 1.5, 0.2, (Math.random() - 0.5) * 1.5));
            this.effects.emit(firePos, new T.Vector3((Math.random() - 0.5) * 4, 3, (Math.random() - 0.5) * 4), 0xff4511, 14, 0.35, 1.8);
            if (Math.random() < 0.4) {
              this.effects.emit(firePos, new T.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12), 0xffdd44, 5, 0.6, 1.2, -15);
            }
          }
        } else if (hpRatio < 0.55) {
          // Moderate damage: dark engine smoke
          if (Math.random() < 0.45) {
            this.effects.smoke(j.position, true, 18);
          }
        } else {
          // Light damage: hydraulic/fuel vapor leak
          if (Math.random() < 0.28) {
            this.effects.emit(j.position, new T.Vector3((Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2), 0xd5e2ea, 10, 0.8, 2.0);
          }
        }
      }
    }

    if (this.openSkies && !this.resultCommitted) {
      this.handleEncounterEvents(this.openSkies.tick(dt, this.enemies, this.player.alive, ['playing', 'dying'].includes(this.state)));
    } else if (this.state === "playing" && !this.mission.freeFlight && !this.multiplayer?.active) {
      const status = missionStatus(this.enemies, this.player, BASE);
      if (status === "complete") this.finish(true);
      if (status === "base-lost") this.finish(false, "A bomber reached the friendly airbase.");
    }
  }

  frame(now) {
    if(this.disposed)return;
    this.animationFrame=requestAnimationFrame(this.frame);
    const frameSeconds=Math.max(.001,(now-this.last)/1000);
    const dt=Math.min(.06,frameSeconds);
    this.last = now;
    this.input.poll?.(dt);
    this.fps += (1/frameSeconds-this.fps)*.03;
    this.frameTimes ||= [];this.frameTimes.push(frameSeconds*1000);if(this.frameTimes.length>240)this.frameTimes.shift();
    this.menuTime += dt;

    if (this.hangarLight) {
      this.hangarLight.intensity = this.state === "hangar" ? 3.8 : 0;
    }

    if (this.state === "menu" || this.state === "quit") {
      this.player.animate(this.menuTime);
      this.player.position.y = 1550 + Math.sin(this.menuTime * 0.7) * 0.35;
    } else if (this.player?.alive) {
      const isFiring = this.cannonCooldown > 0.02;
      this.player.animate(
        this.elapsed,
        this.player.boost,
        this.player.angular?.x || 0,
        this.player.angular?.z || 0,
        this.player.speed || 0,
        isFiring,
        this.player.angular?.y || 0,
        this.player.airBrake || false
      );
    }

    if (this.state === "intro") {
      this.intro -= dt;
      if (this.intro <= 0) this.state = "playing";
    }

    if (this.state === "playing" || this.state === "dying") {
      this.accumulator += dt;
      let n = 0;
      while (this.accumulator >= 1 / 60 && n++ < 5) {
        this.step(1 / 60);
        this.accumulator -= 1 / 60;
        if (this.state === "result") break;
      }
      this.effects.update(dt);
    }

    const renderAlpha = this.state === "playing" ? this.accumulator * 60 : 1;
    this.player.renderInterpolated?.(renderAlpha);
    for (const jet of this.enemies) jet.renderInterpolated?.(renderAlpha);
    for (const jet of this.allies) jet.renderInterpolated?.(renderAlpha);
    if (this.state !== "paused" && this.state !== "result") {
      this.cam.update(dt, this);
      this.world.update(dt, this.player.position, this.camera);
      this.atmosphere?.update(dt, this.camera, this.player.position, this.audio);
      this.speedEffects?.update(dt,this.player,this.camera,this.audio,this.world);
    }

    this.player.updateVisualLOD?.(this.player.position.distanceTo(this.camera.position));
    for(const jet of [...this.enemies,...this.allies])jet.updateVisualLOD?.(jet.position.distanceTo(this.camera.position));
    this.audio.update(this.player, ["playing", "intro", "dying"].includes(this.state), this.cam.mode);
    this.ui.update(this, dt);

    this.renderer.info.reset();
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  getPerformanceSnapshot(){
    const frames=[...(this.frameTimes || [])].sort((a,b)=>a-b),pick=q=>frames[Math.floor((frames.length-1)*q)] || 0;
    return {sampleFrames:frames.length,frameP50ms:pick(.5),frameP95ms:pick(.95),fps:this.fps,quality:this.settings.quality,dpr:this.renderer.getPixelRatio(),drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures,programs:this.renderer.info.programs?.length,terrainCache:this.world.terrainChunks.cache.size,activeAircraft:[this.player,...this.enemies,...this.allies].filter(j=>j.alive).length,activeBullets:this.weapons.bullets.filter(b=>b.active).length,activeMissiles:this.weapons.missiles.filter(m=>m.active).length,encounter:this.openSkies?.snapshot() || null};
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;cancelAnimationFrame(this.animationFrame);
    window.removeEventListener('resize',this.onResize);this.renderer.domElement.removeEventListener('webglcontextlost',this.onContextLost);
    this.openSkies?.abort();this.openSkies=null;
    this.input.dispose();this.multiplayer.weapons.dispose();this.multiplayer.clearRemotePlayers();this.multiplayer.network.disconnect();
    for(const jet of [this.player,...this.enemies,...this.allies])jet.dispose();
    this.weapons.dispose();this.effects.dispose();this.speedEffects.dispose();this.atmosphere.dispose();this.environment?.dispose();this.world.dispose();
    for(const pass of this.composer?.passes || [])pass.dispose?.();this.composer?.dispose();this.renderer.dispose();this.audio.dispose()?.catch?.(()=>{});
  }
  toggleGear() {
    const down = this.player.toggleGear();
    if (!down) { this.player.landingMode = false; this.player.flaps = false; }
    this.ui.message(down ? "LANDING GEAR: EXTENDED [DOWN] 🛬 · READY FOR TOUCHDOWN" : "LANDING GEAR: RETRACTED [UP] ✈️", 2.5);
    return down;
  }

  touchdown(base) {
    if (!base) return;
    this.player.isLanded = true;
    this.player.setGear(true);
    this.player.landingMode = true;
    this.player.landedElev = base.elevation;
    this.player.currentBase = base.id;
    this.player.position.y = base.elevation + 3.2;
    this.player.velocity.y = 0;
    this.player.takeoffCooldown = 0;
    this.player.speed = Math.min(this.player.speed, 110);
    this.player.throttle = Math.min(this.player.throttle || 0, 0.25);
    this.expandedMapMode = true;

    const online = this.multiplayer?.active;
    if (online && IAF_BASES.some((b) => b.id === base.id)) {
      this.multiplayer.sendLocalTelemetry();
      this.multiplayer.network.send("airbase_rearm", { baseId: base.id });
    } else if (!online) {
      this.player.hp = this.player.maxHp;
      this.cannonLeft = this.player.stats?.cannon || 1200;
      this.missilesLeft = this.player.stats?.missiles || 6;
      this.flaresLeft = this.player.stats?.flares || 20;
    }
    this.stats.rearms = (this.stats.rearms || 0) + 1;

    progression.recordLanding(base.shortName || base.name);

    this.audio.playLock?.();
    const displayName = (base.shortName || base.name || "AIRBASE").toUpperCase();
    this.ui.message(`🛬 TOUCHDOWN: ${displayName}${online ? " · REARM REQUESTED" : " · REARMED 100%"}`, 5.0);
    this.notify("AIRBASE TOUCHDOWN", `Landed safely at ${base.name || "Airbase"}${base.state ? ` [${base.state}]` : ""}. ${base.squadron ? `Squadron: ${base.squadron}. ` : ""}${bindingLabel("throttleUp",this.settings)} increases throttle for takeoff.`, 7.0);
  }

  landAtBase(baseId) {
    if (this.multiplayer?.active) { this.ui.message("Fast travel is unavailable during multiplayer.", 3); return; }
    const base = IAF_BASES.find((b) => b.id === baseId) || IAF_BASES[0];
    if (!base) return;

    this.expandedMapMode = true;
    this.player.isLanded = true;
    this.player.setGear(true);
    this.player.landingMode = true;
    this.player.flaps = true;
    this.player.landedElev = base.elevation;
    this.player.currentBase = base.id;

    const headingRad = ((base.runwayHeading || 0) * Math.PI) / 180;
    this.player.quaternion.setFromAxisAngle(new T.Vector3(0, 1, 0), -headingRad);
    this.player.position.copy(runwayPoint(base, 0, base.elevation + 3.2, base.runwayLength * .36));
    if (this.lastPlayerPos) this.lastPlayerPos.copy(this.player.position);
    this.player.speed = 0;
    this.player.throttle = 0;
    this.player.velocity.set(0, 0, 0);
    this.player.angular.set(0, 0, 0);

    // Rearm & Refuel 100%
    this.player.hp = this.player.maxHp;
    this.player.alive = true;
    this.cannonLeft = this.player.stats?.cannon || 1200;
    this.missilesLeft = this.player.stats?.missiles || 6;
    this.flaresLeft = this.player.stats?.flares || 20;

    progression.recordLanding(base.shortName || base.name);

    this.camera.position.copy(this.player.position).add(new T.Vector3(0, 7, 28));
    this.cam?.reset?.(this.player);
    this.ui.message(`🛬 PARKED AT ${base.shortName.toUpperCase()} · READY FOR SCRAMBLE`, 5.0);
    this.notify("AIRBASE DISPATCH", `Welcome to ${base.name}. Squadron: ${base.squadron}. Full throttle to roll for takeoff.`, 7.0);
  }

  approachBase(baseId) {
    if (this.multiplayer?.active) { this.ui.message("Fast travel is unavailable during multiplayer.", 3); return; }
    const base = IAF_BASES.find((b) => b.id === baseId) || IAF_BASES[0];
    if (!base) return;

    this.expandedMapMode = true;
    this.player.isLanded = false;
    this.player.setGear(true);
    this.player.landingMode = true;
    this.player.flaps = true;
    this.player.takeoffCooldown = 0;
    this.player.currentBase = null;

    // Align the aircraft and velocity with the rotated runway's three-degree glideslope.
    const headingRad = ((base.runwayHeading || 0) * Math.PI) / 180;
    this.player.quaternion.setFromEuler(new T.Euler(-GLIDE_ANGLE, -headingRad, 0, 'YXZ'));
    this.player.position.copy(runwayPoint(base, 0, base.elevation + 3.2 + 4750 * Math.tan(GLIDE_ANGLE), base.runwayLength / 2 + 4500));
    if (this.lastPlayerPos) this.lastPlayerPos.copy(this.player.position);
    this.player.speed = 112;
    this.player.throttle = .56;
    this.player.velocity.copy(this.player.forward).multiplyScalar(this.player.speed);
    this.player.angular.set(0, 0, 0);

    this.camera.position.copy(this.player.position).add(new T.Vector3(0, 8.5, 32));
    this.cam?.reset?.(this.player);
    this.ui.message(`✈️ ON FINAL APPROACH: ${base.shortName.toUpperCase()} · ALIGNED ON RUNWAY`, 5.0);
    this.notify("ILS APPROACH", `${base.callsign}: Cleared straight-in approach. Elevation: ${base.elevation}M. Target 400 KM/H. ${bindingLabel('throttleUp', this.settings)} / ${bindingLabel('throttleDown', this.settings)} throttle; ${bindingLabel('pitchUp', this.settings)} to flare. Retract gear to leave approach mode.`, 7.0);
  }
}

export {
  Game
};

