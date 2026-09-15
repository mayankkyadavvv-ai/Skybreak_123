import * as T from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { AirfieldDetail } from "./AirfieldDetail.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { assessTouchdown, runwayPoint, onRunway, GLIDE_ANGLE } from "./Landing.js";
import { Jet } from "./Jet.js";
import { World, BASE, terrainHeight } from "./World.js";
import { Effects } from "./Effects.js";
import { Input } from "./Input.js";
import { updateFlight } from "./FlightPhysics.js";
import { Weapons, updateLock } from "./Weapons.js";
import { updateAI } from "./AI.js";
import { FREE_FLIGHT, getMission, missionStatus } from "./Missions.js";
import { CameraController } from "./Camera.js";
import { AudioManager } from "./Audio.js";
import { Atmosphere } from "./Atmosphere.js";
import { getAirspaceAt, getNearestCity, checkBoundaryCrossing, CITIES, INTERNATIONAL_BORDERS, IAF_BASES } from "./GeoWorld.js";
import { loadPlayerJetConfig, savePlayerJetConfig, JET_MODELS } from "./JetConfigs.js";

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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.4));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(68, innerWidth / innerHeight, 1.2, 95e3);
    this.world = new World(this.scene);
    this.atmosphere = new Atmosphere(this.world, this.scene);
    this.airfieldDetail = new AirfieldDetail(this.scene);
    const pmrem=new T.PMREMGenerator(this.renderer);
    const environment=new RoomEnvironment();
    this.environmentTarget=pmrem.fromScene(environment,.04);
    this.scene.environment=this.environmentTarget.texture;
    this.scene.environmentIntensity=.55;
    environment.dispose();pmrem.dispose();
    this.effects = new Effects(this.scene);
    this.weapons = new Weapons(this.scene, this.effects, this.damage.bind(this), (type, position) => this.audio.play(type, { distance: position ? position.distanceTo(this.camera.position) : 0 }));
    this.jetConfig = loadPlayerJetConfig();
    this.player = new Jet("player", false, this.jetConfig);
    this.scene.add(this.player.model);
    this.player.position.set(0, 1550, 5200);
    this.lastPlayerPos = new T.Vector3().copy(this.player.position);
    this.currentAirspace = getAirspaceAt(this.player.position.x, this.player.position.z);
    this.nearestCityInfo = getNearestCity(this.player.position.x, this.player.position.z);
    this.camera.position.copy(this.player.position).add(new T.Vector3(-22, 10, 30));
    this.cam = new CameraController(this.camera);
    this.input = new Input(canvas, this.action.bind(this), () => this.state === "playing");
    this.selectedMission = FREE_FLIGHT.id;
    this.target = null;
    this.lock = 0;
    this.notifications = [];

    // Post-Processing Pipeline (HDR Bloom & Tone Mapping)
    this.composer = null;
    this.bloomPass = null;
    try {
      if (typeof window !== "undefined" && this.renderer && this.renderer.capabilities?.isWebGL2) {
        this.composer = new EffectComposer(this.renderer);
        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        this.bloomPass = new UnrealBloomPass(
          new T.Vector2(innerWidth, innerHeight),
          0.55,  // Intensity
          0.38,  // Radius
          0.72   // Threshold: selective bright glow (afterburners, tracer rounds, ALS lights)
        );
        this.composer.addPass(this.bloomPass);

        const outputPass = new OutputPass();
        this.composer.addPass(outputPass);
      }
    } catch {
      this.composer = null;
    }

    this.applySettings();
    window.addEventListener("resize", () => this.resize());
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.pause();
      ui.message("Graphics connection interrupted. Reload the page to reconnect.");
    });
    this.last = performance.now();
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
  }

  applySettings() {
    this.world?.setQuality?.(this.settings.quality, this.renderer);
    if (this.camera) {
      this.camera.far = 220e3;
      this.camera.updateProjectionMatrix();
    }
    if (this.effects) {
      this.effects.quality = this.settings.quality === "low" ? 0.45 : this.settings.quality === "high" ? 1 : 0.7;
    }
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    if (this.bloomPass) {
      if (this.settings.quality === "low") {
        this.bloomPass.enabled = false;
      } else if (this.settings.quality === "high") {
        this.bloomPass.enabled = true;
        this.bloomPass.strength = 0.38;
        this.bloomPass.threshold = 1.05;
        this.bloomPass.radius = 0.45;
      } else {
        this.bloomPass.enabled = true;
        this.bloomPass.strength = 0.25;
        this.bloomPass.threshold = 1.1;
        this.bloomPass.radius = 0.38;
      }
    }
    if (this.settings.timeOfDay) this.atmosphere?.setTimeOfDay(this.settings.timeOfDay);
    if (this.settings.weather) this.atmosphere?.setWeather(this.settings.weather);
  }

  equipJet(config) {
    if (!config) return;
    this.jetConfig = { ...this.jetConfig, ...config };
    savePlayerJetConfig(this.jetConfig);
    this.player.applyCustomization(this.jetConfig);
    this.recalculateLoadout();
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
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer?.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.ui.resize();
  }

  action(code) {
    if (code === "Escape") {
      if (this.state === "playing" || this.state === "intro") this.pause();
      else if (this.state === "paused") this.ui.closePanel();
      else this.ui.closePanel();
      return;
    }
    if (code === "Blur") {
      this.pause();
      return;
    }
    if (this.state === "menu") {
      if (code === "Enter" || code === "Space") {
        this.start();
        return;
      }
    }
    if (this.state !== "playing") return;
    if (code === "KeyH") { this.pause(); this.ui.showControls(); return; }
    if (code === "KeyM") { this.ui.toggleMap(); return; }
    if (code === "KeyK") { this.player.flaps = !this.player.flaps; this.player.landingMode = true; this.ui.message(this.player.flaps ? "FLAPS DOWN · LANDING MODE" : "FLAPS UP"); return; }
    if (code === "KeyJ") { this.player.landingMode = !this.player.landingMode; this.ui.message(this.player.landingMode ? "LANDING MODE · PgUp/PgDn throttle · K flaps" : "CRUISE ASSIST"); return; }
    if (code === "KeyG") { this.toggleGear(); return; }
    if (code === "KeyL") { this.ui.showAirbaseLandingModal(); return; }
    if (code === "KeyT" && this.atmosphere) {
      const cycle = { day: "sunset", sunset: "night", night: "day" };
      const next = cycle[this.atmosphere.timeOfDay] || "day";
      this.atmosphere.setTimeOfDay(next);
      this.settings.timeOfDay = next;
      this.ui.message(`TIME OF DAY: ${next.toUpperCase()}`, 2);
      return;
    }
    if (code === "KeyX") { this.input.clear(); this.input.levelTimer = 3; this.ui.message("Auto-leveling active. Keep mouse centered."); return; }
    if (code === "Missile" || (code === "KeyE" && this.settings.input !== "advanced")) this.launch();
    if (code === "KeyR") this.cycleTarget();
    if (code === "KeyF") this.flare();
    if (code === "KeyC") this.cam.cycle();
    if (code === "KeyV") this.cam.mode = this.cam.mode === "cockpit" ? "chase" : "cockpit";
  }

  start(id = this.selectedMission) {
    this.audio.stopPreview?.();
    this.audio.init();
    this.mission = getMission(id);
    this.selectedMission = this.mission.id;
    for (const j of [...this.enemies, ...this.allies]) {
      this.scene.remove(j.model);
      j.model.traverse((o) => {
        if (o.isMesh) o.geometry.dispose();
      });
    }
    this.enemies = [];
    this.allies = [];
    this.weapons.clear();
    this.effects.clear();
    this.input.clear();
    this.player.hp = this.player.stats?.maxHp || 100;
    this.player.maxHp = this.player.hp;
    this.player.alive = true;
    this.player.deadTime = 0;
    this.player.isLanded = false;
    this.player.currentBase = null;
    this.player.landingMode = false;
    this.player.flaps = false;
    this.serviceTime = 0;
    this.player.setGear(false);
    this.player.speed = 245;
    this.player.throttle = 0.6;
    this.player.angular.set(0, 0, 0);
    this.player.quaternion.identity();
    this.player.position.set(0, id === 1 ? 1800 : 1550, id === 1 ? -500 : 5200);
    if (!this.lastPlayerPos) this.lastPlayerPos = new T.Vector3();
    this.lastPlayerPos.copy(this.player.position);
    this.currentAirspace = getAirspaceAt(this.player.position.x, this.player.position.z);
    this.nearestCityInfo = getNearestCity(this.player.position.x, this.player.position.z);
    this.player.velocity.set(0, 0, -245);
    this.player.boost = false;
    this.player.model.visible = true;
    this.missilesLeft = this.player.stats?.missiles ?? 6;
    this.cannonLeft = this.player.stats?.cannon ?? 1200;
    this.flaresLeft = this.player.stats?.flares ?? 20;
    this.missileCooldown = 0;
    this.flareCooldown = 0;
    this.cannonCooldown = 0;
    this.warningTimer = 0;
    this.incoming = [];
    this.player.stall = false;
    this.outOfArea = false;
    this.elapsed = 0;
    this.score = 0;
    this.lock = 0;
    this.lockSound = false;
    this.lastKill = -20;
    this.combo = 0;
    this.damageFlash = 0;
    this.notifications = [];
    this.stats = { kills: 0, hits: 0, shots: 0, missiles: 0, missileHits: 0 };
    for (let i = 0; i < this.mission.fighters; i++) {
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
      this.allies.push(j);
      this.scene.add(j.model);
    }
    this.target = this.enemies.find((e) => Math.abs(e.position.x - this.player.position.x) < 400) || this.enemies[0] || null;
    this.cam.mode = "chase";
    this.state = "playing";
    this.intro = 0;
    this.accumulator = 0;
    this.camera.position.copy(this.player.position).add(new T.Vector3(0, 8.5, 32));
    this.camera.lookAt(this.player.position.clone().add(new T.Vector3(0, 0, -110)));
    this.camera.up.set(0, 1, 0);
    this.camera.view = null;
    this.camera.updateProjectionMatrix();
    this.cam?.reset?.(this.player);
    this.ui.inGame();
    this.ui.message(this.mission.name + " · " + this.mission.objective, 4.5);
    this.notify(this.mission.freeFlight ? "FLIGHT GUIDE" : "COMMAND", this.mission.freeFlight ? "Free flight active. Press M for Tactical World Map, T for Time & Sky." : "Keep enemy inside reticle. Press E or Right-Click when LOCKED.", 7);
  }

  pause() {
    if (this.state === "playing" || this.state === "intro") {
      this.beforePause = this.state;
      this.state = "paused";
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
    this.audio.stopPreview?.();
    this.state = "menu";
    this.input.clear();
    this.weapons.clear();
    this.effects.clear();
    for (const j of [...this.enemies, ...this.allies]) {
      this.scene.remove(j.model);
      j.model.traverse((o) => {
        if (o.isMesh) o.geometry.dispose();
      });
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

  cycleTarget() {
    const available = this.enemies.filter((e) => e.alive);
    this.target = available[(available.indexOf(this.target) + 1) % available.length] || null;
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
    this.player.landingMode = false;this.player.flaps = false;
    this.player.setGear(true);
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
    if (this.settings.input === "advanced" || this.lock > 0 || this.mission.freeFlight) return;
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
      this.lock = 0;
      this.lockSound = false;
      this.cam.shake = 0.5;
      this.notify("KESTREL", "Missile away.", 2);
    }
  }

  flare() {
    if (this.mission?.freeFlight) return;
    if (this.flareCooldown > 0 || this.flaresLeft <= 0) return;
    this.flaresLeft--;
    this.flareCooldown = 0.75;
    const n = this.weapons.deployFlares(this.player);
    this.ui.message(n ? "Flares deployed · missile diverted" : "Flares deployed", 2);
  }

  damage(jet, amount, owner, weapon) {
    if (!jet.alive) return;
    jet.hp = Math.max(0, jet.hp - amount);
    if (owner === this.player) {
      if (weapon === "cannon") {
        this.stats.hits++;
        this.score += 20;
      } else {
        this.stats.missileHits++;
        this.score += 200;
      }
    }
    if (jet === this.player) {
      this.damageFlash = 0.5;
      this.cam.shake = 0.65;
      this.audio.play("hit");
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
      } else if (jet.team === "enemy") {
        if (owner === this.player) {
          this.stats.kills++;
          this.combo = this.elapsed - this.lastKill < 12 ? this.combo + 1 : 1;
          this.lastKill = this.elapsed;
          const bonus = Math.max(0, this.combo - 1) * 250;
          this.score += 1e3 + bonus;
          this.ui.message("HOSTILE DOWN  +1,000" + (bonus ? "  · COMBO +" + bonus : ""), 2.3);
        }
        if (this.target === jet) this.cycleTarget();
      }
    }
  }

  notify(who, text, ttl = 4) {
    this.notifications.push({ who, text, ttl });
    if (this.notifications.length > 3) this.notifications.shift();
  }

  finish(success, reason = "") {
    if (this.state === "result") return;
    this.state = "result";
    this.input.clear();
    if (success) this.score += 5e3;
    this.ui.showResult(success, reason);
  }

  step(dt) {
    this.elapsed += dt;
    this.missileCooldown = Math.max(0, this.missileCooldown - dt);
    this.flareCooldown = Math.max(0, this.flareCooldown - dt);
    this.cannonCooldown -= dt;
    this.damageFlash = Math.max(0, this.damageFlash - dt);
    this.warningTimer -= dt;
    this.notifications.forEach((n) => (n.ttl -= dt));
    this.notifications = this.notifications.filter((n) => n.ttl > 0);

    if (this.player.alive) {
      this.input.freeLook = this.cam.mode === "free";
      const previousPosition = this.player.position.clone();
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

      // Wingtip contrails during high-speed or high-G maneuvers
      if (this.effects?.contrail && (this.player.boost || Math.hypot(this.player.angular.x, this.player.angular.z) > 0.85)) {
        const tips = this.player.getWingTips?.();
        if (tips) {
          this.effects.contrail(tips.left);
          this.effects.contrail(tips.right);
        }
      }

      for (const base of IAF_BASES) {
        const result = assessTouchdown(base, previousPosition, this.player);
        if (!result) continue;
        if (result.safe) {
          this.touchdown(base);
          if (result.hard) this.player.hp=Math.max(1,this.player.hp-20);
          this.effects.tireSmoke?.(this.player.position,this.player.velocity);
          this.ui.message(`${result.hard ? 'HARD' : 'SMOOTH'} TOUCHDOWN · ${result.sink.toFixed(1)} m/s · Hold B to brake`,5);
        } else {
          this.ui.message(result.reason,4);
          if(this.mission.freeFlight)this.resetPracticePosition();
          else this.damage(this.player,1000,null,'terrain');
        }
        break;
      }
      if (this.player.isLanded) {
        const base=IAF_BASES.find(b=>b.id===this.player.currentBase);
        if(base && !onRunway(base,this.player.position,20)) {
          this.ui.message('RUNWAY EXCURSION · Resetting to safe parking',4);
          this.landAtBase(base.id);
        }
        if(this.player.speed<2 && this.player.throttle<.15 && !this.serviced) {
          this.serviceTime=(this.serviceTime||0)+dt;
          if(this.serviceTime>=5) {this.recalculateLoadout();this.serviced=true;this.stats.rearms=(this.stats.rearms||0)+1;this.ui.message('GROUND SERVICE COMPLETE · Repaired & rearmed',4);}
        } else if(this.player.speed>=2) this.serviceTime=0;
      }

      if (this.world.collision(this.player.position, this.player.isLanded, this.player.gearDown)) {
        if (this.mission.freeFlight) this.resetPracticePosition();
        else this.damage(this.player, 1e3, null, "terrain");
      }

      const radius = Math.hypot(this.player.position.x, this.player.position.z);
      const maxRadius = this.expandedMapMode ? 95e3 : 30500;
      this.outOfArea = radius > (this.expandedMapMode ? 85e3 : 26e3);
      if (radius > maxRadius) {
        if (this.mission.freeFlight) this.resetPracticePosition();
        else this.damage(this.player, 1e3, null, "boundary");
      }

      if (this.player.position.y > 15e3) {
        if (this.mission.freeFlight) this.resetPracticePosition();
        else { this.player.velocity.y -= 30; this.ui.message("Altitude ceiling · lower your nose", 1); }
      }

      if (!this.mission.freeFlight && (this.input.fire || this.input.keys.has("Space")) && this.cannonCooldown <= 0 && this.cannonLeft > 0) {
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

    for (const j of [...this.enemies, ...this.allies]) {
      updateAI(j, this, dt);
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
      } else if (j.hp < 65 && Math.random() < 0.25) {
        this.effects.smoke(j.position, true, j.hp < 30 ? 20 : 10);
        if (j.hp < 30) this.effects.emit(j.position, new T.Vector3(0, 3, 0), 16744245, 8, 0.5);
      }
    }

    if (this.state === "playing" && !this.mission.freeFlight) {
      const status = missionStatus(this.enemies, this.player, BASE);
      if (status === "complete") this.finish(true);
      if (status === "base-lost") this.finish(false, "A bomber reached the friendly airbase.");
    }
  }

  frame(now) {
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.06, (now - this.last) / 1e3);
    this.last = now;
    this.fps += (1 / Math.max(1e-3, dt) - this.fps) * 0.03;
    this.menuTime += dt;

    if (this.state === "menu" || this.state === "quit") {
      this.player.animate(this.menuTime);
      this.player.model.position.y = 1550 + Math.sin(this.menuTime * 0.7) * 0.35;
    } else if (this.player?.alive) {
      const isFiring = this.cannonCooldown > 0.02;
      this.player.animate(
        this.elapsed,
        this.player.boost,
        this.player.angular?.x || 0,
        this.player.angular?.z || 0,
        this.player.speed || 0,
        isFiring
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
      this.airfieldDetail?.update(this.player);
    }

    if (this.state !== "paused" && this.state !== "result") {
      this.cam.update(dt, this);
      this.world.update(dt, this.player.position, this.camera);
      this.atmosphere?.update(dt, this.camera, this.player.position, this.audio);
    }

    this.audio.update(this.player, ["playing", "intro", "dying"].includes(this.state), this.cam.mode);
    this.ui.update(this, dt);

    if (this.composer && this.settings.quality !== "low") {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  toggleGear() {
    const down = this.player.toggleGear();
    this.ui.message(down ? "LANDING GEAR: EXTENDED [DOWN] 🛬" : "LANDING GEAR: RETRACTED [UP] ✈️", 2.0);
    return down;
  }

  touchdown(base) {
    if (!base) return;
    this.player.isLanded = true;
    this.player.landedElev = base.elevation;
    this.player.currentBase = base.id;
    this.player.position.y = base.elevation + 3.2;
    this.player.velocity.y = 0;
    this.expandedMapMode = true;

    this.player.landingMode = true;
    this.player.throttle = 0;
    this.serviceTime = 0; this.serviced = false;
    this.ui.message(`TOUCHDOWN · ${base.shortName} · B brakes, stop for 5s to service`,5);
  }

  landAtBase(baseId) {
    const base = IAF_BASES.find((b) => b.id === baseId) || IAF_BASES[0];
    if (!base) return;

    this.expandedMapMode = true;
    this.player.isLanded = true;
    this.player.setGear(true);
    this.player.landedElev = base.elevation;
    this.player.currentBase = base.id;

    const headingRad = ((base.runwayHeading || 0) * Math.PI) / 180;
    this.player.quaternion.setFromAxisAngle(new T.Vector3(0, 1, 0), -headingRad);
    this.player.position.copy(runwayPoint(base,0,base.elevation+3.2,base.runwayLength*.36));
    this.player.landingMode=true; this.player.flaps=true; this.serviced=true; this.serviceTime=0;
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

    this.camera.position.copy(this.player.position).add(new T.Vector3(0, 7, 28));
    this.ui.message(`🛬 PARKED AT ${base.shortName.toUpperCase()} · READY FOR SCRAMBLE`, 5.0);
    this.notify("AIRBASE DISPATCH", `Welcome to ${base.name}. Squadron: ${base.squadron}. Full throttle to roll for takeoff.`, 7.0);
  }

  approachBase(baseId) {
    const base = IAF_BASES.find((b) => b.id === baseId) || IAF_BASES[0];
    if (!base) return;

    this.expandedMapMode = true;
    this.player.isLanded = false;
    this.player.setGear(true);
    this.player.currentBase = null;

    // Position 4.5 km south of runway threshold on glideslope
    const headingRad = ((base.runwayHeading || 0) * Math.PI) / 180;
    this.player.quaternion.setFromAxisAngle(new T.Vector3(0, 1, 0), -headingRad);
    const approachZ=base.runwayLength/2+4500;
    this.player.position.copy(runwayPoint(base,0,base.elevation+3.2+4750*Math.tan(GLIDE_ANGLE),approachZ));
    this.player.landingMode=true;this.player.flaps=true;
    const euler=new T.Euler(-GLIDE_ANGLE,-headingRad,0,"YXZ");this.player.quaternion.setFromEuler(euler);
    if (this.lastPlayerPos) this.lastPlayerPos.copy(this.player.position);
    this.player.speed = 112;
    this.player.throttle = .56;
    this.player.velocity.copy(this.player.forward).multiplyScalar(112);
    this.player.angular.set(0, 0, 0);

    this.camera.position.copy(this.player.position).add(new T.Vector3(0, 8.5, 32));
    this.ui.message(`✈️ ON FINAL APPROACH: ${base.shortName.toUpperCase()} · 3-MILE ILS GLIDESLOPE`, 5.0);
    this.notify("ILS APPROACH", `${base.callsign}: Cleared for straight-in approach. Runway elevation: ${base.elevation}M. Target 400 KM/H. PgUp/PgDn throttle; flare gently with Up at 10M.`, 7.0);
  }
}

export {
  Game
};
