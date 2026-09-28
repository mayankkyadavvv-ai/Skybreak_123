import { trapFocus, escapeHTML } from "./Accessibility.js";
import { icon } from "./Icons.js";
import * as T from "three";
import { MISSIONS, FREE_FLIGHT, FLIGHT_MODES, getMission } from "../game/Missions.js";
import { heading, clamp } from "../game/math.js";
import { BASE, terrainHeight } from "../game/World.js";
import { ACTIONS, bindingLabel, bindingError, formatKey, chordFromEvent, actionForCode } from "../game/InputActions.js";
import { normalizeSettings } from "../game/Settings.js";
import { hudContext, primaryWarning } from "./HUDState.js";
import { settingsMarkup } from "./SettingsUI.js";
import { beginnerGuide, flightHints } from "./BeginnerGuide.js";
import { PREVIEW_LABELS, normalizeAudioSettings } from "../game/SoundDesign.js";
import { soundSettingsMarkup, previewMuteReason } from "./SoundSettings.js";
import { CITIES, INTERNATIONAL_BORDERS, IAF_BASES, getNearestIAFBase, getGPSCoordinates, getApproachingLocation, getBiomeAt } from "../game/GeoWorld.js";
import { HangarUI } from "./HangarUI.js";
import { JET_MODELS } from "../game/JetConfigs.js";
import { MultiplayerUI } from "./MultiplayerUI.js";
import { progression, RANKS } from "../game/Progression.js";
import { experienceMethods } from './ExperienceUI.js';
import { canDisplayContact } from './ThreatDisplay.js';
import { battleHUD, squadronPanel, battleGuide, tutorialHint, battleDebrief } from './OpenSkiesUI.js';

const time = (s) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${Math.floor(s % 60).toString().padStart(2, "0")}`;


class UI {
  constructor(root, settings) {
    this.root = root;
    this.settings = Object.assign(settings, normalizeSettings(settings).settings);
    this.previewRequest = 0;
    this.game = null;
    this.timer = 0;
    this.toastTime = 0;
    this.selected = FREE_FLIGHT.id;
    this.modalType = null;
    this.borderAlertTimer = 0;
    this.borderAlertData = null;
    this.flightBreadcrumbs = [];
    this.breadcrumbTimer = 0;
    this.cockpitRain = Array.from({ length: 35 }, () => ({
      x: Math.random(),
      y: Math.random(),
      vy: 0.8 + Math.random() * 1.5,
      len: 12 + Math.random() * 20
    }));

    root.innerHTML = `
      <div id="menu" class="menu">
        <header class="masthead">
          <a class="wordmark" href="/" aria-label="Skybreak main menu">
            <span class="brand-mark">S/</span> SKYBREAK
            <span class="wordmark-sub">FLIGHT COMBAT</span>
          </a>
          <div class="header-right">
            <span class="edition">KESTREL PROGRAM / 01</span>
            <button class="icon-btn" data-action="sound" aria-label="Toggle sound">${icon("sound")}</button>
            <button class="icon-btn" data-action="fullscreen" aria-label="Enter fullscreen">${icon("fullscreen")}</button>
          </div>
        </header>
        <div class="menu-main">
          <div class="eyebrow"><span></span> ALL SYSTEMS READY</div>
          <h1>OWN THE<br><em>OPEN SKY.</em></h1>
          <p class="intro-copy">Your squadron. Your open sky.<br>Fly solo, learn the aircraft or bring your friends.</p>
          <button class="launch" data-action="play">
            <span class="play-triangle">▶</span> PLAY <span class="launch-meta">FREE FLIGHT</span><span>↗</span>
          </button>
          <div class="play-routes"><button data-action="continue" disabled>Continue · fly a sortie first</button><button data-action="solo">Solo operations</button><button data-action="multiplayer">Play with Friends</button><button data-action="training">Training</button></div>
          <nav class="menu-nav">
            <button class="primary-nav-btn multiplayer-nav-btn" data-action="multiplayer">${icon("network")} Friends lobby</button>
            <button class="primary-nav-btn" data-action="hangar">${icon("plane")} Hangar &amp; Jets</button>
            <button data-action="local-coop">Local split-screen</button><button data-action="missions">Missions</button>
            <button data-action="atlas">World Atlas</button>
            <button data-action="controls">How to Play</button>
            <button data-action="sounds">Sounds</button>
            <button data-action="settings">Settings</button>
            <button data-action="quit">Quit</button>
          </nav>
        </div>
        <div class="aircraft-caption">
          <span class="eyebrow">YOUR AIRCRAFT · <button class="link-btn" data-action="hangar">CUSTOMIZE ✈️</button></span>
          <strong id="caption-name">KESTREL <span>X–17</span></strong>
          <p id="caption-role">MULTIROLE FIGHTER / TWIN ENGINE</p>
          <div class="aircraft-spec">
            <span>MAX SPEED <b id="caption-speed">2,120 KM/H</b></span>
            <span>LOADOUT <b id="caption-loadout">6 × IR MISSILES</b></span>
          </div>
        </div>
        <div class="menu-bottom">
          <div class="section-line">
            <span>CHOOSE YOUR FLIGHT</span>
            <div class="input-picker">
              <span>FLIGHT CONTROL</span>
              <button data-mode="keyboard">↑↓←→ Keys</button>
              <button data-mode="mouse">Mouse</button><button data-mode="gamepad">Gamepad</button>
            </div>
          </div>
          <div class="missions">
            ${FLIGHT_MODES.filter(m=>m.id<=3).map((m, i) => `
              <button class="mission-card ${i === 0 ? "selected" : ""}" data-mission="${m.id}">
                <span class="mission-num">${m.freeFlight ? "∞" : "0" + (m.id + 1)}</span>
                <div>
                  <span class="mission-region">${m.region}</span>
                  <h2>${m.name}</h2>
                  <span class="mission-detail">${m.tag} <i>·</i> ${m.estimate}</span>
                </div>
                <span class="mission-check">${i === 0 ? "✓" : "↗"}</span>
              </button>
            `).join("")}
          </div>
          <footer>
            <span>ORIGINAL AIRCRAFT. UNRESTRICTED SKIES.</span>
            <span class="menu-tip">HEADPHONES RECOMMENDED <span> / </span> DESKTOP EXPERIENCE</span>
          </footer>
        </div>
      </div>

      <div id="hud" class="hud" hidden>
        <canvas id="hud-canvas" aria-label="Flight instruments, targets and radar"></canvas>
        
        <div class="hud-mission">
          <div class="eyebrow" id="mission-code"></div>
          <h2 id="mission-name"></h2>
          <p id="mission-objective"></p>
          <div class="objective-progress">
            <span id="objective-count"></span>
            <div><i id="objective-fill"></i></div>
          </div>
        </div>

        <section id="battle-wing" class="battle-wing" aria-label="Squadron status" hidden><div id="battle-wing-status"></div><div class="battle-actions"><button data-action="squadron">WING <kbd data-bind="teamComms">Y</kbd></button><button data-action="battle-target">NEXT TARGET</button></div></section>
        <aside id="battle-coach" class="battle-coach" hidden aria-label="Flight coach"></aside>
        <details class="hud-navigation"><summary>Navigation</summary><div id="hud-airspace" class="hud-airspace"></div><div id="hud-journey" class="hud-journey"></div></details>
        <div id="approach-instruments" class="approach-instruments" hidden></div>

        <div class="hud-top-right">
          <div id="hud-score"></div>
          <button class="icon-btn" data-action="toggle-map" aria-label="Tactical World Map">${icon("map")} <small data-bind="tacticalMap">N</small></button>
          <button class="icon-btn help-btn" data-action="flight-help" aria-label="Controls and help">${icon("help")} <small data-bind="help">H</small></button>
          <button class="icon-btn" data-action="hud-detail" aria-label="Switch Compact or Full HUD">HUD</button><button class="icon-btn" data-action="pause" aria-label="Pause game">Ⅱ</button>
        </div>

        <div id="border-alert" class="border-alert" hidden></div><aside id="threat-awareness" class="threat-awareness" aria-label="Directional sensor contacts" hidden></aside><aside id="flight-school" class="flight-school" aria-label="Active flight lesson" hidden></aside><div id="audio-subtitle" class="audio-subtitle" role="status" aria-live="polite" hidden></div>
        <div id="threat" class="threat" hidden>⚠ MISSILE WARNING <small>DEPLOY FLARES</small></div>
        
        <div class="compact-telemetry">
          <span id="compact-speed"></span>
          <span id="compact-altitude"></span>
        </div>

        <div id="lock-status" class="lock-status"></div>
        <div id="flight-warning" class="flight-warning" role="status" aria-live="polite" aria-atomic="true"></div>

        <div class="hud-bottom-left">
          <div class="pilot-label"><span id="aircraft-pilot-code">KESTREL 01</span> <span id="camera-label">CHASE</span></div>
          <div class="health-row"><span>AIRFRAME</span><b id="health-value">100%</b></div>
          <div class="health-bar"><i id="health-fill"></i></div>
          <div class="flight-telemetry">
            <span>THR <b id="throttle"></b></span>
            <span id="burner"></span>
          </div>
        </div>

        <div class="hud-weapons">
          <div class="weapon">
            <span>IR MISSILE <kbd data-bind="missile">M / RMB</kbd></span>
            <strong id="missile-value">06 <small>/ 06</small></strong>
            <div id="missile-bars"></div>
          </div>
          <div class="weapon secondary">
            <span>CANNON <kbd data-bind="cannon">Space / LMB</kbd></span>
            <strong id="cannon-value">1200</strong>
          </div>
          <div class="flare-line">COUNTERMEASURES <b id="flare-value">20</b> <kbd data-bind="flare">X</kbd></div>
        </div>

        <details id="practice-help" class="practice-help" hidden><summary>Flight quick reference</summary>
          <span class="eyebrow">FREE FLIGHT · NO ENEMIES</span>
          <div id="practice-instructions"></div>
          <div class="practice-actions">
            <button data-action="land-bases" style="background:#1a4d3a;border-color:#5df2b6;color:#e8fff6;">Airbases <kbd data-bind="landingAssist">L</kbd></button>
            <button data-action="toggle-gear">Gear <kbd data-bind="landingGear">G</kbd></button>
            <button data-action="practice-reset">Reset position</button>
            <button data-action="flight-help">Help <kbd data-bind="help">H</kbd></button>
          </div>
        </details>

        <div id="radio" class="radio" aria-live="off"></div>

        <div class="flight-hints">${flightHints(this.settings, true)}</div>

        <div class="hud-session">
          <div id="hud-net-badge" class="hud-net-badge" hidden>
            <span class="dot online"></span>
            <span id="hud-net-text">ONLINE · 30Hz</span>
          </div>
          <span id="mission-time">00:00</span>
          <span id="fps"></span>
        </div>

        <div id="damage-overlay"></div>

        <div id="touch-controls">
          <div id="touch-stick" role="group" aria-label="Touch flight joystick"><i></i><span>STEER</span></div>
          <label class="touch-throttle">THROTTLE <output id="touch-throttle-value">58%</output><input id="touch-throttle" type="range" min="0" max="100" step="1" value="58" aria-label="Throttle percentage"></label>
          <div class="touch-actions">
            <button data-touch="fire">FIRE</button>
            <button data-touch="missile">MSL</button>
            <button data-touch="flare">FLARE</button>
            <button data-touch="boost">BOOST</button>
            <button data-touch="brake">BRAKE</button>
            <button data-touch="gear">GEAR</button>
            <button data-touch="camera">VIEW</button>
            <button data-touch="pause">PAUSE</button>
          </div>
        </div>
      </div>

      <div id="modal-root"></div>
      <div id="toast" role="status" hidden></div>
    `;

    this.menuEl = root.querySelector("#menu");
    this.menuEl.insertAdjacentHTML('beforeend','<nav class="public-links" aria-label="Information"><a href="/about">About</a><a href="/help">Help</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/storage">Storage settings</a></nav>');
    this.hudEl = root.querySelector("#hud");
    this.modal = root.querySelector("#modal-root");
    this.canvas = root.querySelector("#hud-canvas");
    this.ctx = this.canvas.getContext("2d");
    this.dom = {};
    root.querySelectorAll("[id]").forEach((x) => (this.dom[x.id] = x));

    root.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b || b.disabled) return;
      this.game?.audio.play("click");
      if (b.dataset.preview) this.previewSound(b.dataset.preview);
      if (b.dataset.action) this.action(b.dataset.action);
      if (b.dataset.order) this.game.commandSquadron(b.dataset.order);
      if (b.dataset.baseLand) {
        this.game.landAtBase(b.dataset.baseLand);
        this.closePanel();
      }
      if (b.dataset.baseApproach) {
        this.game.approachBase(b.dataset.baseApproach);
        this.closePanel();
      }
      if (b.dataset.mission !== void 0) {
        this.selected = Number(b.dataset.mission);
        this.game.selectedMission = this.selected;
        this.updateMissionCards();
      }
      if (b.dataset.settingsTab) this.showSettings(b.dataset.settingsTab);
      if (b.dataset.flightMode) {
        this.settings.flightMode = b.dataset.flightMode; this.saveSettings();
        if (this.modalType === "controls") this.showControls(); else if (this.modalType === "preflight") this.showPreflight();
      }
      if (b.dataset.mode) {
        this.settings.input = this.settings.device = b.dataset.mode;
        this.game?.input?.clear?.();
        this.saveSettings();
        this.updateModes();
        if (this.modalType === "controls") this.showControls();
        else if (this.modalType === "preflight") this.showPreflight();
      }
    });

    root.querySelector(".wordmark").addEventListener("click", (e) => {
      e.preventDefault();
      this.game.menu();
    });

    this.updateModes();
    this.multiplayerUI = new MultiplayerUI(this, this.game);

    progression.onXPAward((e) => {
      this.showXPAwardToast(e);
    });
    progression.onLevelUp((e) => {
      this.showLevelUpModal(e);
    });

    this.resize();
    this.initExperience();
  }

  attach(game) {
    this.game = game;
    if (this.multiplayerUI) this.multiplayerUI.game = game;
    this.updateAircraftCaption();
    if(this.settings.lastSoloPlayed){this.selected=getMission(this.settings.lastMissionId).id;game.selectedMission=this.selected;this.updateMissionCards();}
    this.modalKey=event=>{
      if(!this.modalType || this.cancelRebind)return;
      const action=actionForCode(chordFromEvent(event),this.settings);
      if (this.modalType === 'squadron' && ['teamComms','command1','command2','command3'].includes(action)) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!event.repeat) this.game.action(action);
        return;
      }
      if(event.code==='Escape' || this.modalType==='map' && action==='tacticalMap'){
        event.preventDefault();event.stopImmediatePropagation();this.closePanel();return;
      }
      trapFocus(event,this.modal);
    };
    window.addEventListener('keydown',this.modalKey,true);
    let stickPointer=null;
    const stick = this.dom["touch-stick"],
      knob = stick.querySelector("i");
    const move = (e) => {
      const r = stick.getBoundingClientRect();
      const x = clamp((e.clientX - r.left - r.width / 2) / (r.width * 0.4), -1, 1),
        y = clamp((e.clientY - r.top - r.height / 2) / (r.height * 0.4), -1, 1);
      game.input.mouse = { x, y };
      knob.style.transform = `translate(${x * 30}px,${y * 30}px)`;
    };
    stick.addEventListener("pointerdown", (e) => {
      if(game.state!=="playing" || this.modalType || stickPointer!==null)return;
      stickPointer=e.pointerId;
      e.preventDefault();
      stick.setPointerCapture(e.pointerId);
      game.input.touchActive = true;
      move(e);
    });
    stick.addEventListener("pointermove", (e) => {
      if (game.state === 'playing' && !this.modalType && e.pointerId === stickPointer && stick.hasPointerCapture(e.pointerId)) move(e);
    });
    const release = (event) => {
      if(event && event.pointerId!==stickPointer)return;
      const previous = stickPointer; stickPointer=null;
      if (previous !== null && stick.hasPointerCapture?.(previous)) stick.releasePointerCapture?.(previous);
      if(!game.input)return;
      game.input.touchActive = false;
      game.input.mouse = { x: 0, y: 0 };
      knob.style.transform = "";
    };
    stick.addEventListener("pointerup", release);
    stick.addEventListener("pointercancel", release);
    stick.addEventListener("lostpointercapture", release);
    this.touchResets=[release];

    const throttle=this.dom['touch-throttle'];
    throttle.addEventListener('input',()=>{if(game.state!=='playing' || this.modalType)return;game.input.touchThrottle=Number(throttle.value)/100;this.text('touch-throttle-value',`${throttle.value}%`);});
    for(const event of ['change','pointerup','pointercancel','lostpointercapture'])throttle.addEventListener(event,()=>{if(game.player && Number.isFinite(game.input.touchThrottle))game.player.throttle=game.input.touchThrottle;game.input.touchThrottle=null;});
    window.addEventListener('blur',()=>{release();});
    this.root.querySelectorAll("[data-touch]").forEach((b) => {
      let heldPointer=null;
      b.addEventListener("pointerdown", (e) => {
        if(game.state!=="playing" || this.modalType || heldPointer!==null)return;heldPointer=e.pointerId;
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        if (b.dataset.touch === "fire") game.input.fire = true;
        if (b.dataset.touch === "boost") game.input.boost = true;
        if (b.dataset.touch === "missile") game.launch();
        if (b.dataset.touch === "flare") game.flare();
        if (b.dataset.touch === "brake") game.input.touchBrake=true;
        if (b.dataset.touch === "gear") game.toggleGear();
        if (b.dataset.touch === "camera") game.cam.cycle();
        if (b.dataset.touch === "pause") game.pause();
      });
      const up = (event) => {
        if(event && event.pointerId!==heldPointer)return;heldPointer=null;
        if(!game.input)return;
        if (b.dataset.touch === "brake") game.input.touchBrake=false;
        if (b.dataset.touch === "fire") game.input.fire = false;
        if (b.dataset.touch === "boost") game.input.boost = false;
      };
      this.touchResets.push(up);
      b.addEventListener("pointerup", up);
      b.addEventListener("pointercancel", up);
      b.addEventListener("lostpointercapture", up);
    });
  }

  saveSettings(audioOnly = false) {
    try {
      localStorage.setItem("skybreak-settings", JSON.stringify(this.settings));
    } catch {}
    this.hudEl.style.setProperty('--hud-scale',String(this.settings.hudScale || 1));
    this.hudEl.style.setProperty('--hud-opacity',String(this.settings.highContrast ? Math.max(.97,this.settings.hudOpacity || .76) : this.settings.hudOpacity || .76));
    this.hudEl.classList.toggle('high-contrast',!!this.settings.highContrast);
    this.hudEl.classList.toggle('reduced-motion',!!this.settings.reducedMotion);
    this.hudEl.dataset.detail=this.settings.hudDetail || 'full';
    if (!audioOnly) this.game?.applySettings();
    this.game?.audio.syncMix?.();
  }

  updateModes() {
    this.root.querySelectorAll("[data-mode]").forEach(b => { const active = b.dataset.mode === this.settings.device; b.classList.toggle("active",active); b.setAttribute("aria-pressed",String(active)); });
    if (this.game?.mission && !this.hudEl.hidden) this.updateFlightHelp();
  }

  updateMissionCards() {
    this.root.querySelector(".launch-meta").textContent = getMission(this.selected).name.toUpperCase();
    this.root.querySelectorAll("[data-mission]").forEach((b) => {
      b.classList.toggle("selected", Number(b.dataset.mission) === this.selected);
      const check = b.querySelector(".mission-check");
      if (check) check.textContent = Number(b.dataset.mission) === this.selected ? "✓" : "↗";
    });
  }

  updateFlightHelp() {
    const key = action => bindingLabel(action, this.settings);
    const free = !!this.game.mission.freeFlight;
    this.root.querySelector('.flight-hints').innerHTML = flightHints(this.settings, free);
    this.dom['practice-instructions'].innerHTML = `<p><kbd>${key('pitchUp')}</kbd> Nose up · <kbd>${key('pitchDown')}</kbd> Nose down</p><p><kbd>${key('throttleUp')} / ${key('throttleDown')}</kbd> Throttle · <kbd>${key('airBrake')}</kbd> Brake</p><small>${this.settings.flightMode === 'manual' ? 'Manual flight · manage pitch, roll and yaw.' : 'Assisted flight · release to level.'}</small>`;
    for (const [selector,action] of [['.weapon kbd','missile'],['.weapon.secondary kbd','cannon'],['.flare-line kbd','flare'],['[data-action="toggle-map"] small','tacticalMap'],['.help-btn small','help']]) {
      const element = this.root.querySelector(selector); if (element) element.textContent = key(action);
    }
    this.dom.threat.innerHTML = `MISSILE WARNING <small>${key('flare')} · FLARES</small>`;
    this.root.querySelectorAll('[data-bind]').forEach(el => el.textContent = key(el.dataset.bind));
  }

  async showAtlas() {
    if (this.game.state === 'playing') this.game.pause?.();
    this.modalType = 'atlas';
    this.panel('FLIGHT PLANNING', 'World atlas', '<p role="status">Loading map…</p>');
    try {
      const {atlasMarkup, attachAtlas} = await import('./Atlas.js');
      if (this.modalType !== 'atlas') return;
      this.panel('FLIGHT PLANNING', 'World atlas', atlasMarkup());
      this.modal.querySelector('.panel').classList.add('atlas-panel');
      attachAtlas(this.modal);
    } catch {
      if (this.modalType === 'atlas') this.panel('FLIGHT PLANNING', 'World atlas', '<p role="status">The map could not load. Close this panel and try again.</p>');
    }
  }

  action(a) {
    if(this.experienceAction(a))return;
    if (a === 'squadron') { this.game.openSquadronPanel(); return; }
    if (a === 'battle-target') { this.game.action('targetNext'); document.getElementById('world')?.focus?.(); return; }
    if (a === 'battle-replay-seed') { this.game.start(2, { seed: this.game.battleResult?.seed }); return; }
    if (a === 'battle-tutorial') {
      this.battleCoachStep = 0; this.settings.openSkiesGuideSeen = false; this.saveSettings();
      if (this.game.state === 'paused') this.game.resume();
      return;
    }
    if (a === 'battle-hint-next' || a === 'battle-hint-skip') {
      this.battleCoachStep = a === 'battle-hint-skip' ? 4 : (this.battleCoachStep || 0) + 1;
      if (this.battleCoachStep >= 4) { this.settings.openSkiesGuideSeen = true; this.saveSettings(); }
      document.getElementById('world')?.focus?.(); return;
    }
    if (a === "play") {
      if (!this.settings.guideSeen) this.showPreflight();
      else this.game.start(this.selected);
    }
    if (a === "launch-flight") {
      this.settings.guideSeen = true;
      this.saveSettings();
      this.game.start(this.selected);
    }
    if (a === "flight-help") {
      this.game.pause();
      this.showControls();
    }
    if (a === "toggle-map" || a === "map") this.toggleMap();
    if (a === "practice-reset") this.game.resetPracticePosition();
    if (a === "missions") this.showMissions();
    if (a === "atlas") { void this.showAtlas(); return; }
    if (a === "land-bases") this.showAirbaseLandingModal();
    if (a === "toggle-gear") {
      this.game.toggleGear();
      if (this.modalType === "pause") this.showPause();
    }
    if (a === "multiplayer") { this.multiplayerUI.showMultiplayerMenu(); return; }
    if (a === "hangar" || a === "jets") this.showHangar();
    if (a === "controls") this.showControls();
    if (a === "settings") this.showSettings();
    if (a === "keybindings") this.showKeyBindings();
    if (a === "privacy") this.showPrivacy();
    if (a === "sounds") this.showSoundSettings();
    if (a === "sound-stop") this.stopSoundPreview();
    if (a === "close") this.closePanel();
    if (a === "pause") this.game.pause();
    if (a === "resume") this.game.resume();
    if (a === "restart") this.game.start();
    if (a === "menu") this.game.menu();
    if (a === "next") {
      this.selected = (this.selected + 1) % FLIGHT_MODES.length;
      this.game.start(this.selected);
    }
    if (a === "sound") {
      this.settings.volume = this.settings.volume > 0 ? 0 : 0.65;
      this.saveSettings(true);
      this.message(this.settings.volume ? "Sound ON" : "Sound MUTED");
    }
    if (a === "fullscreen") {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
      else document.exitFullscreen().catch(() => {});
    }
    if (a === "quit") {
      this.game.state = "quit";
      this.panel(
        "QUIT SESSION",
        "Exit flight combat?",
        '<p>Your flight session has ended. You can close this tab or return to the main menu.</p><button class="primary" data-action="menu">Return to main menu</button>'
      );
    }
  }

  message(text, dur = 2.4) {
    const t = this.dom.toast;
    t.textContent = text;
    t.hidden = false;
    this.toastTime = dur;
  }

  showXPAwardToast(e) {
    let container = this.root.querySelector("#xp-award-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "xp-award-container";
      container.className = "xp-award-container";
      this.root.appendChild(container);
    }
    const item = document.createElement("div");
    item.className = "xp-award-item";
    item.innerHTML = `<span class="xp-icon">⚡</span> <span class="xp-reason">${e.reason}</span>`;
    container.appendChild(item);
    setTimeout(() => item.classList.add("fade-out"), 2200);
    setTimeout(() => item.remove(), 2800);
  }

  showLevelUpModal(e) {
    if (this.game?.openSkies) {
      this.game.notify('PROMOTION', `${e.newRank.name} · ${e.newRank.unlockName} unlocked. Inspect it in the Hangar after the sortie.`, 5);
      return;
    }
    this.game?.audio.play?.("warning");
    this.panel(
      "🎖️ PROMOTION NOTICE · INDIAN AIR FORCE COMMAND",
      `COMMISSIONED: ${e.newRank.name.toUpperCase()}`,
      `
      <div class="levelup-modal-content" style="text-align:center;padding:12px 0;">
        <div style="font-size:48px;color:#ffd700;margin-bottom:8px;">${e.newRank.insignia}</div>
        <h3 style="color:#00e5ff;margin:0 0 8px;">CONGRATULATIONS, PILOT!</h3>
        <p style="color:#e0f2fe;font-size:14px;line-height:1.5;">Your aerial combat excellence has earned you the prestigious rank of <strong>${e.newRank.name} (${e.newRank.code})</strong>!</p>
        <div style="background:rgba(0,229,255,0.08);border:1px solid #00e5ff;border-radius:6px;padding:12px;margin:16px 0;text-align:left;">
          <span style="font-size:10px;font-weight:bold;color:#ffd700;letter-spacing:1px;">NEW ASSET UNLOCKED</span>
          <h4 style="margin:4px 0;color:#fff;font-size:14px;">${e.newRank.unlockName}</h4>
          <p style="margin:0;color:#85c4b8;font-size:12px;">${e.newRank.unlockDesc}</p>
        </div>
        <p style="font-size:12px;color:#a0cdd5;">Visit the <strong>Hangar</strong> from the Main Menu to inspect and equip your newly unlocked fighter jet &amp; modifications.</p>
        <button class="primary" data-action="close" style="margin-top:14px;">DISMISS &amp; RETURN TO FLIGHT ↗</button>
      </div>
      `
    );
  }

  triggerBorderAlert(cross) {
    this.borderAlertData = cross;
    this.borderAlertTimer = 6.0;
    const el = this.dom["border-alert"];
    if (el) {
      el.innerHTML = `
        <div class="border-alert-inner">
          <div class="border-alert-tag">⚠ INTERNATIONAL AIRSPACE TRANSITION</div>
          <div class="border-alert-title">LEAVING ${cross.fromCountry.toUpperCase()} ➔ ENTERING ${cross.toCountry.toUpperCase()}</div>
          <div class="border-alert-sub">SECTOR: ${cross.toState.toUpperCase()} · FLIGHT LEVEL: FL${Math.round(this.game.player.position.y / 30)} · RADAR ADVISORY ACTIVE</div>
        </div>
      `;
      el.hidden = false;
    }
  }

  toggleMap() {
    if (this.modalType === "map") {
      this.closePanel();
    } else {
      this.showTacticalMap();
    }
  }

  showTacticalMap() {
    this.modalType = "map";
    this.modal.innerHTML = `
      <div class="tactical-map-modal">
        <div class="tactical-map-container">
          <div class="tactical-map-header">
            <div class="tactical-map-title">
              <span>🌐</span> TACTICAL THEATER AIRSPACE &amp; BOUNDARY MAP
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
              <button data-action="land-bases" class="primary" style="padding:4px 10px;font-size:11px;">Airbases · ${bindingLabel("landingAssist",this.settings)}</button>
              <button class="close-btn" data-action="close" aria-label="Close map">×</button>
            </div>
          </div>
          <canvas id="tactical-canvas" class="tactical-map-canvas" width="900" height="600"></canvas>
          <div class="tactical-map-footer">
            <span>AIRSPACE: <b id="map-airspace-name">SEARCHING...</b></span>
            <span>PRESS <b>${bindingLabel("tacticalMap",this.settings)}</b> OR <b>${bindingLabel("pause",this.settings)}</b> TO RETURN TO FLIGHT</span>
          </div>
        </div>
      </div>
    `;
    this.tacticalCanvas = this.modal.querySelector("#tactical-canvas");
    this.drawTacticalMap(this.game);
  }

  drawTacticalMap(g) {
    if (!this.tacticalCanvas) return;
    const c = this.tacticalCanvas.getContext("2d");
    const cw = this.tacticalCanvas.width;
    const ch = this.tacticalCanvas.height;

    c.clearRect(0, 0, cw, ch);

    // Coordinate mapping: minX = -85000, maxX = 45000, minZ = -75000, maxZ = 55000
    const minX = -85000, maxX = 45000, minZ = -75000, maxZ = 55000;
    const pad = 45;
    const toSx = (wx) => pad + ((wx - minX) / (maxX - minX)) * (cw - pad * 2);
    const toSy = (wz) => pad + ((wz - minZ) / (maxZ - minZ)) * (ch - pad * 2);

    // Background
    c.fillStyle = "#030c14";
    c.fillRect(0, 0, cw, ch);

    // Ocean zone (Arabian Sea / Gulf of Oman in south-west)
    c.fillStyle = "#061822";
    const oceanX1 = toSx(-85000), oceanX2 = toSx(0), oceanY1 = toSy(38000), oceanY2 = toSy(55000);
    c.fillRect(oceanX1, oceanY1, oceanX2 - oceanX1, oceanY2 - oceanY1);

    // Grid lines (every 25 km)
    c.strokeStyle = "rgba(45, 95, 115, 0.22)";
    c.lineWidth = 1;
    c.setLineDash([4, 6]);
    for (let x = -75000; x <= 40000; x += 25000) {
      const sx = toSx(x);
      c.beginPath();
      c.moveTo(sx, pad);
      c.lineTo(sx, ch - pad);
      c.stroke();
      c.fillStyle = "rgba(100, 160, 180, 0.4)";
      c.font = "10px ui-monospace, monospace";
      c.fillText(`${x / 1000} KM`, sx + 4, ch - pad + 15);
    }
    for (let z = -65000; z <= 45000; z += 25000) {
      const sy = toSy(z);
      c.beginPath();
      c.moveTo(pad, sy);
      c.lineTo(cw - pad, sy);
      c.stroke();
      c.fillStyle = "rgba(100, 160, 180, 0.4)";
      c.font = "10px ui-monospace, monospace";
      c.fillText(`${z / 1000} KM`, pad - 38, sy + 3);
    }
    c.setLineDash([]);

    // Watermark Country Names
    c.font = "bold 26px Arial, sans-serif";
    c.textAlign = "center";
    c.fillStyle = "rgba(120, 190, 180, 0.08)";
    c.fillText("INDIA", toSx(18000), toSy(12000));
    c.fillText("PAKISTAN", toSx(-15000), toSy(-15000));
    c.fillText("UNITED ARAB EMIRATES", toSx(-65000), toSy(20000));
    c.fillText("OMAN", toSx(-55000), toSy(38000));
    c.fillText("CHINA (HIMALAYAN SECTOR)", toSx(15000), toSy(-66000));
    c.fillText("ARABIAN SEA", toSx(-30000), toSy(46000));

    // State / Province labels
    c.font = "11px ui-monospace, monospace";
    c.fillStyle = "rgba(180, 225, 215, 0.35)";
    c.fillText("RAJASTHAN", toSx(8000), toSy(4000));
    c.fillText("PUNJAB (IND)", toSx(10000), toSy(-22000));
    c.fillText("JAMMU & KASHMIR", toSx(12000), toSy(-42000));
    c.fillText("GUJARAT", toSx(10000), toSy(26000));
    c.fillText("MAHARASHTRA", toSx(14000), toSy(48000));
    c.fillText("DELHI NCR", toSx(28000), toSy(-10000));

    c.fillText("SINDH", toSx(-14000), toSy(6000));
    c.fillText("PUNJAB (PAK)", toSx(-12000), toSy(-26000));
    c.fillText("BALOCHISTAN", toSx(-28000), toSy(4000));
    c.fillText("KHYBER PK", toSx(-18000), toSy(-48000));

    // International Boundaries
    for (const border of INTERNATIONAL_BORDERS) {
      c.strokeStyle = border.color;
      c.lineWidth = 2.5;
      c.setLineDash([8, 5]);
      c.beginPath();
      for (let i = 0; i < border.points.length; i++) {
        const [bx, bz] = border.points[i];
        const sx = toSx(bx);
        const sy = toSy(bz);
        if (i === 0) c.moveTo(sx, sy);
        else c.lineTo(sx, sy);
      }
      c.stroke();

      // Border label
      const mid = border.points[Math.floor(border.points.length / 2)];
      c.fillStyle = border.color;
      c.font = "bold 10px ui-monospace, monospace";
      c.fillText(`--- ${border.name.toUpperCase()} ---`, toSx(mid[0]), toSy(mid[1]) - 8);
    }
    c.setLineDash([]);

    // Major River Systems on Tactical Map
    c.strokeStyle = "rgba(65, 160, 200, 0.45)";
    c.lineWidth = 2.5;

    // 1. Indus River
    c.beginPath();
    c.moveTo(toSx(-6000), toSy(-55000));
    c.bezierCurveTo(toSx(-12000), toSy(-38000), toSx(-14000), toSy(-22000), toSx(-15500), toSy(-8000));
    c.bezierCurveTo(toSx(-15000), toSy(6000), toSx(-17000), toSy(18000), toSx(-19500), toSy(32000));
    c.stroke();
    c.font = "italic 9px ui-monospace, monospace";
    c.fillStyle = "rgba(75, 180, 220, 0.6)";
    c.fillText("INDUS RIVER", toSx(-15000), toSy(-2000));

    // 2. Jhelum & Chenab Rivers
    c.strokeStyle = "rgba(65, 160, 200, 0.35)";
    c.lineWidth = 1.8;
    c.beginPath();
    c.moveTo(toSx(6000), toSy(-44000));
    c.bezierCurveTo(toSx(0), toSy(-36000), toSx(-6000), toSy(-28000), toSx(-14000), toSy(-22000));
    c.stroke();
    c.fillText("CHENAB RIVER", toSx(-5000), toSy(-30000));

    // 3. Sutlej & Ravi Rivers
    c.beginPath();
    c.moveTo(toSx(18000), toSy(-32000));
    c.bezierCurveTo(toSx(10000), toSy(-26000), toSx(2000), toSy(-22000), toSx(-12000), toSy(-16000));
    c.stroke();
    c.fillText("SUTLEJ RIVER", toSx(8000), toSy(-25000));

    // 4. Ganga & Yamuna River Basin
    c.strokeStyle = "rgba(65, 160, 200, 0.4)";
    c.lineWidth = 2.2;
    c.beginPath();
    c.moveTo(toSx(26000), toSy(-32000));
    c.bezierCurveTo(toSx(28000), toSy(-20000), toSx(32000), toSy(-12000), toSx(42000), toSy(-3000));
    c.stroke();
    c.fillText("GANGA RIVER", toSx(36000), toSy(-8000));

    c.beginPath();
    c.moveTo(toSx(24000), toSy(-28000));
    c.bezierCurveTo(toSx(27000), toSy(-16000), toSx(29000), toSy(-12000), toSx(35000), toSy(-6000));
    c.stroke();
    c.fillText("YAMUNA RIVER", toSx(27000), toSy(-17000));

    // 5. Narmada River (Gujarat / MP)
    c.beginPath();
    c.moveTo(toSx(32000), toSy(18000));
    c.bezierCurveTo(toSx(22000), toSy(22000), toSx(14000), toSy(26000), toSx(6000), toSy(30000));
    c.stroke();
    c.fillText("NARMADA RIVER", toSx(18000), toSy(23000));

    // Mountain Range Watermarks
    c.fillStyle = "rgba(220, 240, 255, 0.22)";
    c.font = "bold 12px ui-monospace, monospace";
    c.fillText("▲ HIMALAYAS & KARAKORAM RANGE (GLACIAL SNOW)", toSx(6000), toSy(-58000));
    c.fillText("▲ PIR PANJAL & LADAKH RANGE", toSx(14000), toSy(-48000));
    c.fillText("▲ ARAVALLI MOUNTAIN RANGE", toSx(16000), toSy(4000));
    c.fillText("▲ WESTERN GHATS (SAHYADRI)", toSx(14000), toSy(46000));
    c.fillText("▲ SULAIMAN & BALOCHISTAN RANGE", toSx(-28000), toSy(-18000));

    // 62 Surveyed Cities & Forward Operating Airbases
    c.textAlign = "left";
    for (const city of CITIES) {
      const sx = toSx(city.x);
      const sy = toSy(city.z);
      const isMega = city.population.includes("M") && parseInt(city.population) > 5;

      c.fillStyle = city.militaryBase ? "#ffa751" : isMega ? "#5df2b6" : "#72e8be";
      c.beginPath();
      c.arc(sx, sy, city.militaryBase ? 5 : isMega ? 4.5 : 3.2, 0, Math.PI * 2);
      c.fill();

      c.strokeStyle = city.militaryBase ? "rgba(255, 167, 81, 0.5)" : "rgba(114, 232, 190, 0.4)";
      c.beginPath();
      c.arc(sx, sy, city.militaryBase ? 9 : 7, 0, Math.PI * 2);
      c.stroke();

      c.fillStyle = city.militaryBase ? "#ffe4b5" : "#e8f5f1";
      c.font = city.militaryBase || isMega ? "bold 11px Arial, sans-serif" : "10px Arial, sans-serif";
      c.fillText(`${city.icon || "📍"} ${city.name}${city.militaryBase ? " [AB]" : ""}`, sx + 10, sy + 3);

      c.fillStyle = "rgba(160, 195, 205, 0.65)";
      c.font = "9px ui-monospace, monospace";
      c.fillText(`${city.lat.toFixed(1)}°N, ${city.lon.toFixed(1)}°E · ${city.state}`, sx + 10, sy + 13);
    }

    // Friendly Airbase
    const bx = toSx(BASE.x);
    const by = toSy(BASE.z);
    c.fillStyle = "#ffe48a";
    c.fillRect(bx - 6, by - 6, 12, 12);
    c.strokeStyle = "#ffffff";
    c.strokeRect(bx - 8, by - 8, 16, 16);
    c.fillStyle = "#fff";
    c.font = "bold 11px Arial, sans-serif";
    c.fillText("RUNWAY 09 (HOME BASE)", bx + 12, by + 4);

    // Hostiles and Allies
    for (const enemy of g.enemies) {
      if(!canDisplayContact(g,enemy))continue;
      if (!enemy.alive) continue;
      const ex = toSx(enemy.position.x);
      const ey = toSy(enemy.position.z);
      c.fillStyle = "#ff6255";
      c.beginPath();
      c.moveTo(ex, ey - 6);
      c.lineTo(ex + 6, ey);
      c.lineTo(ex, ey + 6);
      c.lineTo(ex - 6, ey);
      c.closePath();
      c.fill();
    }
    for (const ally of g.allies) {
      if (!ally.alive) continue;
      const ax = toSx(ally.position.x);
      const ay = toSy(ally.position.z);
      c.fillStyle = "#55b2ff";
      c.beginPath();
      c.arc(ax, ay, 4, 0, Math.PI * 2);
      c.fill();
    }

    // Player Jet Icon & Vector
    const px = toSx(g.player.position.x);
    const py = toSy(g.player.position.z);
    const hd = heading(g.player.quaternion);
    const rad = (hd * Math.PI) / 180;

    // Flight path heading line
    c.strokeStyle = "#5df2b6";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(px, py);
    c.lineTo(px + Math.sin(rad) * 35, py - Math.cos(rad) * 35);
    c.stroke();

    // Jet Icon
    c.save();
    c.translate(px, py);
    c.rotate(rad);
    c.fillStyle = "#ffffff";
    c.beginPath();
    c.moveTo(0, -11);
    c.lineTo(8, 7);
    c.lineTo(0, 4);
    c.lineTo(-8, 7);
    c.closePath();
    c.fill();
    c.restore();

    // Pulse Ring around player
    c.strokeStyle = "#5df2b6";
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(px, py, 15 + Math.sin(g.elapsed * 4) * 3, 0, Math.PI * 2);
    c.stroke();

    // Player Flight Telemetry label
    c.fillStyle = "#5df2b6";
    c.font = "bold 11px ui-monospace, monospace";
    const jetName = (g.playerJetConfig?.name || "KESTREL").toUpperCase();
    const liveryName = (g.playerJetConfig?.livery?.name || "01").toUpperCase();
    c.fillText(`${jetName} [${liveryName}]`, px + 18, py - 6);
    c.fillStyle = "#d0ede3";
    c.font = "10px ui-monospace, monospace";
    c.fillText(`ALT: ${Math.round(g.player.position.y)}M (FL${Math.round(g.player.position.y / 30)})`, px + 18, py + 7);
    c.fillText(`SPD: ${Math.round(g.player.speed * 3.6)} KM/H`, px + 18, py + 19);

    // Update modal footer
    const airNameEl = this.modal.querySelector("#map-airspace-name");
    if (airNameEl && g.currentAirspace) {
      const gps = getGPSCoordinates(g.player.position.x, g.player.position.z);
      const biome = getBiomeAt(g.player.position.x, g.player.position.z);
      const biomeStr = biome ? ` | ${biome.icon} ${biome.name.toUpperCase()} [${biome.elevationBand}]` : "";
      airNameEl.innerHTML = `📡 ${gps.formatted} | ${g.currentAirspace.flag || "📍"} ${g.currentAirspace.country} [${g.currentAirspace.state}]${biomeStr}`;
    }
  }

  panel(eyebrow, title, content, closeable = true) {
    this.cancelRebind?.();
    this.game?.input?.clear?.();
    this.touchResets?.forEach(reset=>reset());
    if(!this.modal.querySelector(".panel"))this.returnFocus=document.activeElement;
    this.menuEl.inert=true;this.hudEl.inert=true;
    this.modal.innerHTML = `
      <div class="modal-backdrop">
        <div class="panel" role="dialog" aria-modal="true" aria-labelledby="panel-title" tabindex="-1">
          <div class="panel-top">
            <span class="eyebrow">${eyebrow}</span>
            ${closeable ? `<button class="close-btn" data-action="close" aria-label="Close panel">${icon("close")}</button>` : ""}
          </div>
          <h2 id="panel-title">${title}</h2>
          ${content}
        </div>
      </div>
    `;
    const f = this.modal.querySelector("button, input, select");
    f?.focus();
  }

  releaseModalFocus() {this.menuEl.inert=false;this.hudEl.inert=false;this.returnFocus?.focus?.();}

  showMenu() {
    this.flightSchool?.stop();this.game?.audio?.stopFlight?.();
    if(this.recorder?.active && this.recorder.frames.length)this.lastReplay=this.recorder.finish({success:false,reason:'Returned to menu',stats:this.game?.stats});
    this.replayPlayer=null;this.refreshContinue();
    this.releaseModalFocus();
    this.stopSoundPreview();
    this.modal.innerHTML = "";
    this.modalType = null;
    this.menuEl.hidden = false;
    this.hudEl.hidden = true;
    this.selected = this.game.selectedMission;
    this.updateMissionCards();
    this.updateModes();
  }

  inGame() {
    this.beginExperienceFlight();
    this.releaseModalFocus();
    this.stopSoundPreview();
    this.menuEl.hidden = true;
    this.hudEl.hidden = false;
    this.modal.innerHTML = "";
    this.modalType = null;
    this.game.input.menuMode = null;
    const m = this.game.mission;
    this.text("mission-code", m.code + " / " + m.region);
    this.text("mission-name", m.name);
    this.text("mission-objective", m.objective);
    const free = !!m.freeFlight && !this.game.trainingCombat;
    this.hudEl.classList.toggle("free-flight", free);
    this.hudEl.classList.toggle('open-skies', !!this.game.openSkies);
    this.dom['battle-wing'].hidden = !this.game.openSkies;
    this.dom['battle-coach'].hidden = !this.game.openSkies || this.settings.openSkiesGuideSeen;
    this.html('battle-wing-status', this.game.openSkies ? battleHUD(this.game) : '');
    this.html('battle-coach', this.game.openSkies && !this.settings.openSkiesGuideSeen ? tutorialHint(this.battleCoachStep || 0, this.settings) : '');
    this.hudStarted = false;
    this.root.querySelector(".hud-weapons").hidden = free;
    this.dom["practice-help"].hidden = !free;
    this.dom["hud-score"].hidden = free;
    this.dom["objective-fill"].parentElement.hidden = free;
    this.root.querySelectorAll('[data-touch="fire"], [data-touch="missile"], [data-touch="flare"]').forEach((b) => (b.hidden = free));
    this.updateFlightHelp();
    document.getElementById("world")?.focus?.();
  }

  showPause() {
    this.modalType = "pause";
    this.panel(
      this.game.multiplayer?.active ? 'PILOT MENU · MATCH CONTINUES' : "SORTIE ON HOLD",
      this.game.multiplayer?.active ? 'Your squadron is still flying.' : "Flight paused.",
      `
      <p>${this.game.multiplayer?.active?'The match continues while this menu is open. Your aircraft remains in the world.':'Flight paused.'} Click Resume to fly, or check Help for controls.</p>
      <div class="stack-buttons">
        <button class="primary" data-action="resume">Resume flight <span>↗</span></button>
        <button data-action="land-bases" style="border-color:#ffa751;color:#ffdfa9;">Airbases · ${bindingLabel("landingAssist",this.settings)}</button>
        <button data-action="toggle-gear">Landing gear · ${bindingLabel("landingGear",this.settings)}</button>
        <button data-action="hangar">✈️ Jet Modifications</button>
        <button data-action="toggle-map">Tactical World Map 🗺️</button>
        <button data-action="restart">Restart flight</button>
        <button data-action="sounds">Sounds</button>
        <button data-action="settings">Settings</button>
        <button data-action="controls">How to Play</button>
        ${this.game.openSkies || this.game.operation ? '<button data-action="squadron">Squadron orders</button>' : ''}
        ${this.game.mission?.freeFlight ? '<button data-action="activities">Flight activities & results</button>' : ''}
        <button data-action="menu">Main menu</button>
      </div>
      `,
      false
    );
  }

  closePanel() {
    if (this.modalType === 'replay') {this.experienceAction('replay-close');return;}
    if (this.modalType === 'touch-layout') {this.touchDraft=null;this.showSettings('controls');return;}
    if (this.modalType === 'squadron') { this.game.closeSquadronPanel(); return; }
    this.releaseModalFocus();
    this.cancelRebind?.();
    this.game?.input?.clear?.();
    if (this.modalType === "sounds") {
      this.stopSoundPreview();
      if (this.soundBack === "settings") {
        this.showSettings();
        return;
      }
    }
    if (this.modalType === "privacy") {
      this.showSettings();
      return;
    }
    if (this.modalType === "map") {
      this.modal.innerHTML = "";
      this.modalType = null;
      this.tacticalCanvas = null;
      if(this.game.state==="paused")this.showPause();
      return;
    }
    if (this.game.state === "paused") {
      if (this.modalType === "pause") this.game.resume();
      else this.showPause();
    } else if (this.game.state === "quit") {
      this.game.menu();
    } else {
      this.modal.innerHTML = "";
      this.modalType = null;
    }
  }

  showMissions() {
    this.modalType = "missions";
    this.panel(
      "OPERATIONS BOARD · SORTIE DISPATCH",
      "Tactical Combat Operations",
      `
      <div class="briefings">
        ${FLIGHT_MODES.map(
          (m) => {
            const isSelected = this.selected === m.id;
            const threatTag = m.freeFlight
              ? '<span class="threat-badge threat-none">TRAINING · NO THREAT</span>'
              : m.bombers > 0
              ? '<span class="threat-badge threat-critical">THREAT: CRITICAL</span>'
              : m.fighters >= 8
              ? '<span class="threat-badge threat-high">THREAT: HIGH</span>'
              : '<span class="threat-badge threat-moderate">THREAT: MODERATE</span>';
            const forcesInfo = m.freeFlight
              ? "Unrestricted airspace · Free navigation & flight practice"
              : `${m.fighters} Hostile Fighters${m.bombers ? ` · ${m.bombers} Supersonic Bombers` : ""}${m.allies ? ` · ${m.allies} Allied Escorts` : " · Solo Flight"}`;
            return `
              <button class="briefing ${isSelected ? "selected" : ""}" data-mission="${m.id}">
                <div class="briefing-header">
                  <span class="eyebrow">${m.code} / ${m.region}</span>
                  ${threatTag}
                </div>
                <h3>${m.name}</h3>
                <p>${m.brief}</p>
                <div class="brief-intel">
                  <span class="brief-forces">🎯 ${forcesInfo}</span>
                  <span class="brief-time">⏱️ ${m.estimate}</span>
                </div>
                <div class="brief-objective-row">
                  <span class="brief-obj-label">OBJECTIVE:</span>
                  <strong class="brief-objective">${m.objective}</strong>
                </div>
              </button>
            `;
          }
        ).join("")}
      </div>
      <button class="primary" data-action="play">Launch Selected Operation <span>↗</span></button>
      `
    );
  }

  showPreflight() {
    this.modalType = "preflight";
    this.panel(
      "QUICK START · " + getMission(this.selected).name.toUpperCase(),
      "First flight? Here is how to fly.",
      beginnerGuide(this.settings) +
        '<button class="primary" data-action="launch-flight">Got it · Take Off ↗</button><p class="panel-footnote">Press H to reopen this guide anytime. Free Flight has no enemies or time limits.</p>'
    );
  }

  showControls() {
    this.modalType = "controls";
    this.panel("BEGINNER FLIGHT GUIDE", "How to Play", beginnerGuide(this.settings, true) + (this.game.openSkies || this.selected === 2 ? battleGuide(this.settings) : ''));
  }

  showSquadron() {
    this.modalType = 'squadron';
    this.panel('SQUADRON RADIO · FLIGHT PAUSED', 'Your wing. Your call.', squadronPanel(this.game));
    this.game.input.menuMode = 'squadron';
    this.modal.querySelector('[data-order]:not([disabled])')?.focus();
  }

  navigateSquadron(action) {
    const buttons = [...this.modal.querySelectorAll('[data-order]:not([disabled])')];
    if (!buttons.length) return;
    const index = Math.max(0, buttons.indexOf(document.activeElement));
    if (action === 'uiConfirm') buttons[index].click();
    else buttons[(index + (action === 'uiNext' ? 1 : buttons.length - 1)) % buttons.length].focus();
  }

  resetBattleTutorial() { this.battleCoachStep = this.settings.openSkiesGuideSeen ? 4 : 0; }

  showSettings(section = this.settingsSection || 'graphics') {
    this.settingsSection = section;
    this.modalType = 'settings';
    this.panel('PILOT PREFERENCES', 'Make it your flight.', settingsMarkup(this.settings,section));
    this.modal.querySelector('.panel').classList.add('settings-panel');
    if(section==='controls')this.attachControlStudio();
    this.modal.querySelectorAll('[data-setting]').forEach(el => el.addEventListener('input', () => {
      const key = el.dataset.setting;
      this.settings[key] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
      if(key==='adaptiveTargetFps')this.settings[key]=Number(el.value);
      if (key === 'device') { this.settings.input = this.settings.device; this.game?.input?.clear?.(); }
      if (key === 'shakeIntensity') this.settings.shake = this.settings.shakeIntensity > 0;
      const out = el.parentElement.querySelector('output');
      if (out) { out.textContent = el.value; el.setAttribute('aria-valuetext',el.value); }
      this.saveSettings(); this.updateModes();
    }));
  }

  showKeyBindings() {
    this.modalType = 'keybindings';
    this.settings.keyBindings ||= {};
    this.panel('FLIGHT CONTROLS','Keyboard bindings',`<p>Choose a control, then press a key. Escape cancels. Conflicting keys are rejected.</p><p id="binding-status" role="status"></p><div class="settings-list keybind-list">${Object.entries(ACTIONS).filter(([,definition]) => definition.key && !definition.fixed).map(([action,definition]) => `<div class="setting"><span>${definition.label}</span><button data-rebind="${action}">${formatKey(this.settings.keyBindings[action] || definition.key)}</button></div>`).join('')}</div><div class="settings-footer"><button class="primary" data-action="settings">Back to settings</button><button id="reset-keybinds-btn">Reset bindings</button></div>`);
    this.modal.querySelectorAll('[data-rebind]').forEach(button => button.addEventListener('click', () => {
      this.cancelRebind?.();
      const action = button.dataset.rebind;
      button.textContent = 'Press key…';
      const cancel = () => { window.removeEventListener('keydown',handler,true); button.textContent = formatKey(this.settings.keyBindings[action] || ACTIONS[action].key); this.cancelRebind = null; };
      const handler = event => {
        event.preventDefault(); event.stopImmediatePropagation();
        if (event.code === 'Escape') { cancel(); return; }
        const code = chordFromEvent(event), error = bindingError(action,code,this.settings);
        this.modal.querySelector('#binding-status').textContent = error || `${ACTIONS[action].label}: ${formatKey(code)}`;
        if (error) return;
        this.settings.keyBindings[action] = code; cancel(); this.saveSettings();
        if (this.game?.mission) this.updateFlightHelp();
      };
      this.cancelRebind = cancel; window.addEventListener('keydown',handler,true);
    }));
    this.modal.querySelector('#reset-keybinds-btn').addEventListener('click', () => { this.settings.keyBindings = {}; this.saveSettings(); this.showKeyBindings(); if(this.game?.mission) this.updateFlightHelp(); });
  }

  showPrivacy() {
    this.modalType='privacy';
    this.panel('YOUR DATA','Privacy & storage',`<p>Preferences, pilot progression, aircraft choices, callsign and multiplayer server choice are saved in this browser.</p><p>Multiplayer sends your chosen callsign and game state to the connected server and other players. Hosting and multiplayer providers also receive connection information.</p><p>No analytics or advertising integrations were found in this build. Live provider logging and operator details still need owner review.</p><p><a href="/privacy">Read the draft privacy notice</a> · <a href="/terms">Draft terms</a> · <a href="/storage">Review or reset saved data</a></p><button data-action="settings">Back to settings</button>`);
  }

  showHangar() {
    if (this.hangarUI) return;
    if(this.game.multiplayer?.active || this.game.localCoop?.active){this.message('Aircraft loadout can be changed between sorties.',3);return;}
    const prevState = this.game.state;
    this.game.beginHangarPreview?.();
    this.game.state = "hangar";
    this.closePanel();
    const menuEl = this.root.querySelector("#menu");
    if (menuEl) menuEl.hidden = true;
    const hudEl = this.root.querySelector("#hud");
    if (hudEl) hudEl.hidden = true;

    this.hangarUI = new HangarUI(this.root, this.game, (launch) => {
      this.hangarUI = null;
      this.game.endHangarPreview?.();
      if (launch) {
        this.game.start(this.selected);
      } else if (prevState === "playing" || prevState === "paused") {
        this.game.state='playing';
        this.game.pause();
      } else {
        this.game.state = "menu";
        if (menuEl) menuEl.hidden = false;
        this.updateAircraftCaption();
      }
    });
  }

  updateAircraftCaption() {
    if (!this.game?.player) return;
    const model = JET_MODELS[this.game.player.modelId] || JET_MODELS.x17;
    const stats = this.game.player.stats || model.baseStats;
    const nameEl = this.root.querySelector("#caption-name");
    const roleEl = this.root.querySelector("#caption-role");
    const speedEl = this.root.querySelector("#caption-speed");
    const loadoutEl = this.root.querySelector("#caption-loadout");
    if (nameEl) nameEl.innerHTML = `${model.name.toUpperCase()}`;
    if (roleEl) roleEl.textContent = `${model.role.toUpperCase()}`;
    if (speedEl) speedEl.textContent = `${stats.maxSpeedKmh ? stats.maxSpeedKmh.toLocaleString() : stats.speedKmh} KM/H`;
    if (loadoutEl) loadoutEl.textContent = `${stats.missiles} × IR MISSILES · ${stats.flares} FLARES`;
  }

  onJetChanged() {
    this.updateAircraftCaption();
  }

  showSoundSettings() {
    this.soundBack = this.modalType === "settings" ? "settings" : null;
    if (["playing", "intro"].includes(this.game.state)) this.game.pause();
    this.modalType = "sounds";
    this.panel("AUDIO PREFERENCES", "Choose your sound.", soundSettingsMarkup(this.settings));
    this.modal.querySelector(".panel").classList.add("sound-panel");
    this.modal.querySelectorAll("[data-audio-setting]").forEach((el) =>
      el.addEventListener("input", () => {
        const key = el.dataset.audioSetting;
        if (el.tagName === "SELECT") this.stopSoundPreview();
        this.settings[key] = el.type==='checkbox'?el.checked:el.tagName === "INPUT" ? Number(el.value) : el.value;
        normalizeAudioSettings(this.settings);
        const output = el.parentElement.querySelector("output");
        if (output) {
          const percent = Math.round(this.settings[key] * 100);
          output.textContent = `${percent}%`;
          el.setAttribute("aria-valuetext", `${percent} percent`);
        }
        this.saveSettings(true);
        this.updateSoundStatus();
      })
    );
    this.updateSoundStatus();
  }

  stopSoundPreview() {
    this.previewRequest++;
    this.previewLoading = false;
    this.soundError = "";
    this.game?.audio.stopPreview?.();
    this.updateSoundStatus();
  }

  async previewSound(type) {
    if (this.modalType !== "sounds" || !Object.hasOwn(PREVIEW_LABELS, type)) return;
    const request = ++this.previewRequest;
    this.previewLoading = true;
    this.soundError = "";
    this.updateSoundStatus();
    let ok = false;
    try {
      ok = await this.game.audio.preview(type);
    } catch {}
    if (request !== this.previewRequest || this.modalType !== "sounds") return;
    this.previewLoading = false;
    if (!ok) this.soundError = "Audio playback failed. Click inside the game window or check system volume.";
    this.updateSoundStatus();
  }

  updateSoundStatus() {
    const el = this.modal?.querySelector("#sound-preview-status");
    const stopBtn = this.modal?.querySelector('[data-action="sound-stop"]');
    if (!el || this.modalType !== "sounds") return;
    const t = this.game?.audio.previewType;
    const i = t && previewMuteReason(this.settings, t);
    const s =
      this.soundError ||
      (this.previewLoading
        ? "Loading sound preview…"
        : t
        ? i
          ? `${i} — increase volume to hear.`
          : `${PREVIEW_LABELS[t]} playing…`
        : "Press any ▶ Play button to preview.");
    if (el.textContent !== s) el.textContent = s;

    this.modal.querySelectorAll("[data-preview]").forEach((b) => {
      const active = t === b.dataset.preview;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
      const label = b.querySelector("small");
      if (label) label.textContent = active ? "■ Playing" : "▶ Play";
    });
    if (stopBtn) stopBtn.disabled = !t;
  }

  showResult(success, reason = "") {
    this.finalizeReplay(success,reason);
    this.modalType = "result";
    const s = this.game.stats;
    const timeBonus = Math.max(0, Math.round((360 - this.game.elapsed) * 10));
    const finalScore = this.game.score + (success ? timeBonus : 0);
    this.panel(
      success ? "MISSION ACCOMPLISHED" : "MISSION FAILED",
      success ? "Area clear." : "Sortie compromised.",
      `
      <p>${success ? "Excellent flying. The operation is complete." : reason}</p>
      ${this.game.battleResult ? battleDebrief(this.game) : ''}
      ${this.replayDebriefMarkup()}
      <div class="result-score">
        <span>FINAL SCORE</span>
        <strong>${finalScore.toLocaleString()}</strong>
      </div>
      <div class="result-stats">
        <div><span>HOSTILES DOWN</span><b>${s.kills}</b></div>
        <div><span>CANNON ACCURACY</span><b>${s.shots ? Math.round((s.hits / s.shots) * 100) : 0}%</b></div>
        <div><span>MISSILE HITS</span><b>${s.missiles ? Math.round((s.missileHits / s.missiles) * 100) : 0}%</b></div>
        <div><span>TIME</span><b>${time(this.game.elapsed)}</b></div>
      </div>
      <div class="stack-buttons">
        ${success && this.selected < MISSIONS.length - 1 ? '<button class="primary" data-action="next">Next operation <span>↗</span></button>' : ""}
        <button class="${success ? "" : "primary"}" data-action="restart">Fly again <span>↗</span></button>
        <button data-action="menu">Operations board</button>
      </div>
      `,
      false
    );
  }

  resize() {
    const dpr=Math.min(globalThis.devicePixelRatio || 1,2);
    this.canvas.width=Math.round(innerWidth*dpr);this.canvas.height=Math.round(innerHeight*dpr);
    this.canvas.style.width=innerWidth+"px";this.canvas.style.height=innerHeight+"px";
    if (this.tacticalCanvas) {
      this.tacticalCanvas.width = 900;
      this.tacticalCanvas.height = 600;
    }
  }

  text(id,value) { const node=this.dom[id]; if(node && node.textContent!==String(value)) node.textContent=String(value); }
  html(id,value) { this.htmlCache ||= {}; if(this.htmlCache[id]!==value && this.dom[id]) {this.dom[id].innerHTML=value;this.htmlCache[id]=value;} }

  update(g, dt) {
    this.updateExperience(g,dt);
    if (this.hangarUI) {
      this.hangarUI.update(dt);
    }
    if (this.multiplayerUI) {
      this.multiplayerUI.update(dt);
    }

    if (this.toastTime > 0) {
      this.toastTime -= dt;
      if (this.toastTime <= 0) this.dom.toast.hidden = true;
    }

    // Border alert timer
    if (this.borderAlertTimer > 0) {
      this.borderAlertTimer -= dt;
      if (this.borderAlertTimer <= 0 && this.dom["border-alert"]) {
        this.dom["border-alert"].hidden = true;
      }
    }

    // If tactical map is open, render live update
    if (this.modalType === "map") {
      this.drawTacticalMap(g);
    }

    if (this.modalType === "sounds") {
      this.updateSoundStatus();
    }

    if (this.modalType === 'settings' && this.settingsSection === 'controls') {
      const preview=g.input.padPreview, status=this.modal.querySelector('#gamepad-status');
      if(status && status.textContent!==g.input.padStatus) status.textContent=g.input.padStatus;
      const stick=this.modal.querySelector('#gamepad-stick-preview');
      if(stick) stick.style.transform=`translate(${(preview?.axes.roll || 0)*32}px,${(preview?.axes.pitch || 0)*32}px)`;
      const values=this.modal.querySelector('#gamepad-values');
      if(values) values.textContent=`Pitch ${(preview?.axes.pitch || 0).toFixed(2)} · Roll ${(preview?.axes.roll || 0).toFixed(2)}`;
    }
    if (this.hudEl.hidden) return;
    this.drawHUD(g);
    this.timer += dt;
    if (this.timer < .125 && this.hudStarted) return;
    this.timer %= .125; this.hudStarted = true;
    const p = g.player;
    this.text("compact-speed", Math.round(p.speed * 3.6) + " KM/H");
    this.text("compact-altitude", Math.round(p.position.y) + " M");
    const remaining = g.enemies.filter((e) => e.alive).length,
      total = g.enemies.length;
    const battle = g.openSkies?.snapshot();
    this.text("objective-count", battle ? `${battle.defeated} / ${battle.total} TOTAL · ${battle.remaining} IN WAVE` : g.mission.freeFlight ? "NO ENEMIES · NO TIME LIMIT" : `${total - remaining} / ${total} HOSTILES DOWN`);
    this.dom["objective-fill"].style.width = `${battle ? battle.defeated / battle.total * 100 : total ? ((total - remaining) / total) * 100 : 0}%`;
    if (battle) {
      this.text('mission-objective', battle.state === 'recovery' ? `Next phase in ${battle.recovery}s · regroup` : battle.objective);
      this.html('battle-wing-status', battleHUD(g));
      this.dom['battle-coach'].hidden = this.settings.openSkiesGuideSeen || (this.battleCoachStep || 0) >= 4 || g.state !== 'playing';
      if (!this.dom['battle-coach'].hidden) this.html('battle-coach', tutorialHint(this.battleCoachStep || 0, this.settings));
    }
    this.text("hud-score", String(g.score).padStart(6, "0"));
    const maxHp = p.maxHp || 100;
    const hpPct = Math.round((p.hp / maxHp) * 100);
    this.text("health-value", `${Math.ceil(p.hp)} HP (${hpPct}%)`);
    this.dom["health-fill"].style.width = Math.min(100, Math.max(0, hpPct)) + "%";
    this.dom["health-fill"].style.background = hpPct < 35 ? "#ff6b58" : "";
    this.text("throttle",Math.round(p.throttle*100)+"%");
    if(!Number.isFinite(g.input?.touchThrottle) && this.dom["touch-throttle"]){this.dom["touch-throttle"].value=Math.round(p.throttle*100);this.text("touch-throttle-value",Math.round(p.throttle*100)+"%");}
    this.dom.burner.textContent = p.boost ? "AFTERBURNER" : "";
    this.text("camera-label", g.cam.mode.toUpperCase());
    if (this.dom["aircraft-pilot-code"]) {
      this.text("aircraft-pilot-code", (JET_MODELS[p.modelId]?.code || "X-17") + " · ACTIVE");
    }
    const maxMissiles = p.stats?.missiles || 6;
    this.html("missile-value", `${String(g.missilesLeft).padStart(2, "0")} <small>/ ${String(maxMissiles).padStart(2, "0")}</small>`);
    if (this.lastAmmo !== `${g.missilesLeft}/${maxMissiles}`) {
      this.html("missile-bars", Array.from({ length: maxMissiles }, (_, i) => `<i class="${i < g.missilesLeft ? "loaded" : ""}"></i>`).join(""));
      this.lastAmmo = `${g.missilesLeft}/${maxMissiles}`;
    }
    this.text("cannon-value", g.cannonLeft);
    this.text("flare-value", g.flaresLeft);
    this.text("mission-time", time(g.elapsed));
    this.text("fps",Math.round(g.fps)+" FPS");
    this.dom.threat.hidden = true;

    // Update flight breadcrumbs
    this.breadcrumbTimer += dt;
    if (this.breadcrumbTimer > 0.4) {
      this.breadcrumbTimer = 0;
      this.flightBreadcrumbs.push({ x: p.position.x, z: p.position.z });
      if (this.flightBreadcrumbs.length > 25) this.flightBreadcrumbs.shift();
    }

    // Airspace & GPS Navigation readout
    const air = g.currentAirspace;
    const city = g.nearestCityInfo;
    const gps = getGPSCoordinates(p.position.x, p.position.z);
    const biome = getBiomeAt(p.position.x, p.position.z);
    if (air && this.dom["hud-airspace"]) {
      const cityText = city?.city ? ` · ${city.city.name.toUpperCase()} (${(city.distance / 1000).toFixed(0)}KM)` : "";
      this.html("hud-airspace", `<span>📡 ${gps.formatted}</span> <b>${air.flag || "📍"} ${air.country.toUpperCase()}</b> [${air.state.toUpperCase()}]${cityText}`);
    }

    // Approaching destination & live ETA readout
    const journey = getApproachingLocation(p.position, p.forward, p.speed);
    this.currentJourney = journey;
    if (this.dom["hud-journey"] && journey?.destination) {
      const originStr = journey.origin?.name ? journey.origin.name.toUpperCase() : "BASE";
      const destStr = journey.destination.name.toUpperCase();
      this.html("hud-journey", `<span class="journey-origin">🛫 ${originStr}</span><span class="journey-arrow">➔</span><span class="journey-dest">🎯 APPROACHING: <b>${destStr}</b></span><span class="journey-meta">${journey.distanceKm} KM · ETA ${journey.formattedETA}</span>`);
    }

    // Multiplayer status badge
    if (this.dom["hud-net-badge"]) {
      if (g.multiplayer?.active) {
        this.dom["hud-net-badge"].hidden = false;
        const ping = g.multiplayer.network?.ping;
        this.text("hud-net-text", `ONLINE · ${Number.isFinite(ping)?Math.round(ping)+"ms":"measuring ping"} · 30Hz TICK`);
      } else {
        this.dom["hud-net-badge"].hidden = true;
      }
    }

    // ILS Glideslope Approach Detection
    const nearestBaseInfo = getNearestIAFBase(p.position.x, p.position.z);
    const isNearRunway = nearestBaseInfo?.base && nearestBaseInfo.distance < 12000;

    this.dom["lock-status"].textContent = g.mission.freeFlight
      ? `${bindingLabel("help",this.settings)} · HELP     ${bindingLabel("tacticalMap",this.settings)} · MAP`
      : g.target?.alive
      ? g.lock >= 1.4
        ? `LOCKED · ${bindingLabel("missile",this.settings)}`
        : g.lock > 0
        ? "ACQUIRING LOCK " + Math.round((g.lock / 1.4) * 100) + "%"
        : "KEEP TARGET IN RETICLE"
      : "NO HOSTILES";
    this.dom["lock-status"].classList.toggle("locked", g.lock >= 1.4);
    const ground = Math.max(0, terrainHeight(p.position.x,p.position.z));
    const context = hudContext(g,ground,nearestBaseInfo);
    this.hudEl.dataset.context=context;
    const warning=primaryWarning(g,ground,context);
    this.text('flight-warning',warning.text);this.dom['flight-warning'].dataset.tone=warning.tone;
    this.dom['flight-warning'].hidden=!warning.text;
    const approach=this.dom['approach-instruments'];approach.hidden=!['ground','approach'].includes(context);
    if(!approach.hidden) this.html('approach-instruments',`<span class="eyebrow">${context==='ground'?'GROUND ROLL':'APPROACH'}</span><b>${p.gearDown?'GEAR DOWN':'GEAR UP'} · ${p.airBrake?'BRAKE ON':'BRAKE OFF'}</b><span>V/S ${Math.round(p.velocity?.y || 0)} M/S · AGL ${Math.max(0,Math.round(p.position.y-ground))} M</span><small>${bindingLabel('airBrake',this.settings)} brake · ${bindingLabel('yawLeft',this.settings)} / ${bindingLabel('yawRight',this.settings)} steer</small>`);
    this.dom["damage-overlay"].style.opacity = g.damageFlash;
    const n = g.notifications[0];
    this.html("radio",n ? `<span>${escapeHTML(n.who)}</span> ${escapeHTML(n.text)}` : "");
    if (this.borderAlertTimer > 0) {
      this.borderAlertTimer -= dt;
      if (this.borderAlertTimer <= 0) {
        if (this.dom["border-alert"]) this.dom["border-alert"].hidden = true;
      }
    }
  }

  drawHUD(g) {
    const scale = this.settings.hudScale || 1;
    const dpr = Math.min(globalThis.devicePixelRatio || 1,2);
    this.ctx.setTransform(dpr*scale,0,0,dpr*scale,0,0);
    const c = this.ctx,
      w = innerWidth / scale,
      h = innerHeight / scale,
      p = g.player,
      x = w / 2,
      y = h * 0.43;
    c.clearRect(0, 0, w, h);
    const ink = "#00f0ff",
      red = "#ff3333",
      blue = "#38bdf8";
    c.shadowColor = "rgba(0, 0, 0, 0.75)";
    c.shadowBlur = 3;
    c.strokeStyle = ink;
    c.fillStyle = ink;
    c.lineWidth = 1.2;
    c.font = "12px ui-monospace, monospace";
    c.textAlign = "center";
    const hd = heading(p.quaternion);
    if (w > 600) {
      for (let i = -5; i <= 5; i++) {
        const v = (Math.round(hd / 10) * 10 + i * 10 + 360) % 360;
        const px = x + i * 36 - (hd % 10 - (hd % 10 > 5 ? 10 : 0)) * 3.6;
        c.beginPath();
        c.moveTo(px, 61);
        c.lineTo(px, 69);
        c.stroke();
        c.fillText(String(v).padStart(3, "0"), px, 51);
      }
      c.fillText("▼", x, 82);
    }
    // True Military Pitch Ladder with Degree Numbers & Horizon Line
    const e = new T.Euler().setFromQuaternion(p.quaternion, "YXZ");
    c.save();
    c.translate(x, y);
    c.rotate(-e.z);
    const py = e.x * 160;
    c.font = "10px ui-monospace, monospace";
    for (let deg = -50; deg <= 50; deg += 10) {
      if (deg === 0) {
        // Continuous Horizon Line with Center Gap
        const yy = py;
        if (Math.abs(yy) > 180) continue;
        c.strokeStyle = "#00f0ff";
        c.lineWidth = 1.6;
        c.beginPath();
        c.moveTo(-110, yy);
        c.lineTo(-35, yy);
        c.moveTo(35, yy);
        c.lineTo(110, yy);
        c.stroke();
      } else {
        const rad = (deg * Math.PI) / 180;
        const yy = py - rad * 160;
        if (Math.abs(yy) > 170) continue;
        const isPos = deg > 0;
        c.strokeStyle = isPos ? "rgba(0, 240, 255, 0.70)" : "rgba(0, 240, 255, 0.42)";
        c.lineWidth = 1.2;
        if (!isPos) c.setLineDash([4, 4]); // Dashed line for negative pitch dive
        else c.setLineDash([]);
        const armW = 42;
        const tickH = isPos ? 5 : -5;
        c.beginPath();
        c.moveTo(-armW - 25, yy);
        c.lineTo(-25, yy);
        c.lineTo(-25, yy + tickH);
        c.moveTo(25 + armW, yy);
        c.lineTo(25, yy);
        c.lineTo(25, yy + tickH);
        c.stroke();
        c.setLineDash([]);
        c.fillStyle = isPos ? "rgba(0, 240, 255, 0.85)" : "rgba(0, 240, 255, 0.50)";
        c.fillText(String(Math.abs(deg)), -armW - 36, yy + 3);
        c.fillText(String(Math.abs(deg)), armW + 36, yy + 3);
      }
    }
    c.restore();

    // Flight Path Marker (Velocity Vector Indicator)
    if (p.velocity && p.velocity.lengthSq() > 100) {
      const fpmWorld = p.position.clone().addScaledVector(p.velocity.clone().normalize(), 120);
      const fpmCamDir = g.camera.getWorldDirection(new T.Vector3());
      if (fpmWorld.clone().sub(g.camera.position).dot(fpmCamDir) > 0) {
        const fpmProj = fpmWorld.project(g.camera);
        if (Math.abs(fpmProj.x) < 0.94 && Math.abs(fpmProj.y) < 0.94) {
          const fpx = (fpmProj.x * 0.5 + 0.5) * w;
          const fpy = (-fpmProj.y * 0.5 + 0.5) * h;
          c.save();
          c.strokeStyle = "#38f8d4";
          c.lineWidth = 1.6;
          c.beginPath();
          c.arc(fpx, fpy, 6, 0, Math.PI * 2);
          c.moveTo(fpx - 6, fpy);
          c.lineTo(fpx - 16, fpy);
          c.moveTo(fpx + 6, fpy);
          c.lineTo(fpx + 16, fpy);
          c.moveTo(fpx, fpy - 6);
          c.lineTo(fpx, fpy - 13);
          c.stroke();
          c.restore();
        }
      }
    }

    // Annunciator Status Flags (BRAKE, GEAR)
    c.save();
    c.font = "bold 11px ui-monospace, monospace";
    c.textAlign = "left";
    const statusX = x - 170;
    const statusY = y + 42;
    if (p.airBrake) {
      c.fillStyle = "#ffaa33";
      c.fillRect(statusX - 42, statusY - 11, 52, 16);
      c.fillStyle = "#000000";
      c.fillText("BRAKE", statusX - 36, statusY + 1);
    }
    if (p.gearDown) {
      c.fillStyle = "#00ffcc";
      c.fillRect(statusX + 16, statusY - 11, 44, 16);
      c.fillStyle = "#000000";
      c.fillText("GEAR", statusX + 21, statusY + 1);
    }
    c.restore();

    c.globalAlpha = 1;
    c.strokeStyle = "rgba(0, 240, 255, 0.25)";
    c.setLineDash([5, 12]);
    c.beginPath();
    c.arc(x, y, h * 0.185, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    c.strokeStyle = ink;
    c.beginPath();
    c.arc(x, y, 30, 0, Math.PI * 2);
    c.moveTo(x - 45, y);
    c.lineTo(x - 18, y);
    c.moveTo(x + 18, y);
    c.lineTo(x + 45, y);
    c.moveTo(x, y - 45);
    c.lineTo(x - 30, y);
    c.moveTo(x, y + 30);
    c.lineTo(x, y + 45);
    c.stroke();
    c.fillRect(x - 2, y - 2, 4, 4);

    if (g.lock > 0) {
      c.strokeStyle = g.lock >= 1.4 ? "#00ff88" : "#ffaa00";
      c.lineWidth = 3;
      c.beginPath();
      c.arc(x, y, 37, -Math.PI / 2, -Math.PI / 2 + (g.lock / 1.4) * Math.PI * 2);
      c.stroke();
      c.lineWidth = 1.2;
    }

    if (g.settings.device === "mouse" && !g.input.freeLook) {
      c.strokeStyle="rgba(150,230,220,.5)";c.beginPath();c.ellipse(x,y,(g.settings.mouseDeadzone || .08)*w*.18,(g.settings.mouseDeadzone || .08)*h*.2,0,0,Math.PI*2);c.stroke();
      let mx = x + g.input.mouse.x * w * 0.18,
        my = y + g.input.mouse.y * h * 0.2;
      if(g.settings.mouseMode==='point-to-fly' && g.input.pointAim){const aim=new T.Vector3().copy(g.input.pointAim).multiplyScalar(10000).add(g.camera.position).project(g.camera);mx=(aim.x+1)*w/2;my=(1-aim.y)*h/2;c.fillText('FLY TO',mx+10,my-9);}
      c.strokeStyle = "rgba(0, 240, 255, 0.45)";
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(mx, my);
      c.arc(mx, my, 6, 0, Math.PI * 2);
      c.stroke();
    }

    if (w > 650) {
      for (const [sx, val, label] of [
        [x - 170, Math.round(p.speed * 3.6), "KM/H"],
        [x + 170, Math.round(p.position.y), "ALT M"]
      ]) {
        c.fillStyle = ink;
        c.strokeStyle = ink;
        c.font = "12px ui-monospace,monospace";
        c.fillText(label, sx, y - 42);
        c.font = "bold 22px ui-monospace,monospace";
        c.fillText(val, sx, y);
        c.strokeRect(sx - 43, y - 24, 86, 34);
        for (let i = -3; i <= 3; i++) {
          c.beginPath();
          c.moveTo(sx + (sx < x ? 48 : -48), y + i * 19);
          c.lineTo(sx + (sx < x ? 58 : -58), y + i * 19);
          c.stroke();
        }
      }

      // Tactical G-Force Meter
      const currentG = p.currentG || 1.0;
      c.fillStyle = currentG > 6.0 ? "#ff3333" : "#00f0ff";
      c.font = "bold 13px ui-monospace,monospace";
      c.fillText(`${currentG.toFixed(1)} G`, x - 170, y + 28);
    }

    for (const j of [...g.enemies, ...g.allies]) {
      if(!canDisplayContact(g,j))continue;
      if (!j.alive) continue;
      const dist = j.position.distanceTo(p.position);
      if (dist > 16e3) continue;
      const proj = j.position.clone().project(g.camera);
      const selected = j === g.target;
      const color = j.team === "ally" ? blue : selected && g.lock >= 1.4 ? "#00ff88" : red;
      c.strokeStyle = color;
      c.fillStyle = color;
      c.font = "bold 12px ui-monospace,monospace";
      const front = j.position.clone().sub(g.camera.position).dot(g.camera.getWorldDirection(new T.Vector3())) > 0;
      if (front && Math.abs(proj.x) < 0.92 && Math.abs(proj.y) < 0.8) {
        const sx = (proj.x * 0.5 + 0.5) * w,
          sy = (-proj.y * 0.5 + 0.5) * h,
          r = selected ? 22 : 12;
        c.lineWidth = selected ? 2.2 : 1.4;
        if (j.team === "ally") {
          // Calm Tactical Circle with Top Chevron for Allies
          c.beginPath();
          c.arc(sx, sy, r, 0, Math.PI * 2);
          c.stroke();
          c.beginPath();
          c.moveTo(sx - 5, sy - r - 3);
          c.lineTo(sx, sy - r - 9);
          c.lineTo(sx + 5, sy - r - 3);
          c.stroke();
        } else {
          // Tactical Military Diamond Reticle for Hostiles
          c.beginPath();
          c.moveTo(sx, sy - r * 1.15);
          c.lineTo(sx + r * 1.15, sy);
          c.lineTo(sx, sy + r * 1.15);
          c.lineTo(sx - r * 1.15, sy);
          c.closePath();
          c.stroke();
          // Corner Tactical Brackets for Selected Target
          if (selected) {
            const b = r + 6;
            const bl = 6;
            c.beginPath();
            c.moveTo(sx - b, sy - b + bl); c.lineTo(sx - b, sy - b); c.lineTo(sx - b + bl, sy - b);
            c.moveTo(sx + b - bl, sy - b); c.lineTo(sx + b, sy - b); c.lineTo(sx + b, sy - b + bl);
            c.moveTo(sx + b, sy + b - bl); c.lineTo(sx + b, sy + b); c.lineTo(sx + b - bl, sy + b);
            c.moveTo(sx - b + bl, sy + b); c.lineTo(sx - b, sy + b); c.lineTo(sx - b, sy + b - bl);
            c.stroke();
          }
        }
        if (selected) {
          c.fillText(j.callsign || (j.bomber ? "HOSTILE BOMBER" : "HOSTILE BANDIT") + " " + String(j.id).padStart(2, "0"), sx, sy - r - 12);
          c.fillText((dist / 1e3).toFixed(1) + " KM", sx, sy + r + 18);
          c.fillStyle = "rgba(0, 0, 0, 0.75)";
          c.fillRect(sx - r, sy + r + 24, r * 2, 4);
          c.fillStyle = color;
          c.fillRect(sx - r, sy + r + 24, r * 2 * Math.min(1, Math.max(0, j.hp) / (j.maxHp || 100)), 4);
        }
      } else if (selected) {
        const local = j.position.clone().sub(p.position).applyQuaternion(p.quaternion.clone().invert());
        const angle = Math.atan2(local.x, local.y || -1);
        const radius = Math.min(w * 0.32, h * 0.33);
        const sx = x + Math.sin(angle) * radius,
          sy = y - Math.cos(angle) * radius;
        c.save();
        c.translate(sx, sy);
        c.rotate(angle);
        c.beginPath();
        c.moveTo(0, -12);
        c.lineTo(8, 6);
        c.lineTo(-8, 6);
        c.closePath();
        c.fill();
        c.restore();
        c.fillText((dist / 1e3).toFixed(1) + " KM", sx, sy + 25);
      }
    }

    // 3D In-World Incoming Missile Warning Reticles
    if (g.incoming && g.incoming.length > 0) {
      const camDir = g.camera.getWorldDirection(new T.Vector3());
      for (const m of g.incoming) {
        if (!m.active) continue;
        const mDist = m.p.distanceTo(p.position);
        const mProj = m.p.clone().project(g.camera);
        const mFront = m.p.clone().sub(g.camera.position).dot(camDir) > 0;
        if (mFront && Math.abs(mProj.x) < 0.94 && Math.abs(mProj.y) < 0.88) {
          const mx = (mProj.x * 0.5 + 0.5) * w;
          const my = (-mProj.y * 0.5 + 0.5) * h;
          const flash = Math.sin(performance.now() * 0.024) > 0;
          c.save();
          c.strokeStyle = flash ? "#ff1111" : "#ffaa00";
          c.fillStyle = flash ? "#ff1111" : "#ffaa00";
          c.lineWidth = 2.2;
          c.beginPath();
          c.arc(mx, my, 13, 0, Math.PI * 2);
          c.stroke();
          c.beginPath();
          c.moveTo(mx - 18, my); c.lineTo(mx + 18, my);
          c.moveTo(mx, my - 18); c.lineTo(mx, my + 18);
          c.stroke();
          c.font = "bold 11px ui-monospace, monospace";
          c.fillText("⚠ MISSILE " + (mDist / 1e3).toFixed(1) + " KM", mx, my - 18);
          c.restore();
        }
      }
    }

    // Multiplayer Remote Aircraft HUD Markers & Floating Name Tags
    if (g.multiplayer?.active) {
      const camDir = g.camera.getWorldDirection(new T.Vector3());
      for (const remote of g.multiplayer.remotePlayers.values()) {
        if (!remote.alive || !remote.model) continue;
        const dist = remote.model.position.distanceTo(p.position);
        if (dist > 18e3) continue;

        const isEnemy = remote.team !== g.multiplayer.localTeam;
        const selected = g.target?.id === remote.id;
        const color = isEnemy ? (selected && g.lock >= 1.4 ? "#afffd0" : red) : blue;

        const tagPos = remote.model.position.clone().add(new T.Vector3(0, 3.2, 0));
        const front = tagPos.clone().sub(g.camera.position).dot(camDir) > 0;
        const proj = tagPos.project(g.camera);

        if (front && Math.abs(proj.x) < 0.94 && Math.abs(proj.y) < 0.85) {
          const sx = (proj.x * 0.5 + 0.5) * w;
          const sy = (-proj.y * 0.5 + 0.5) * h;
          const r = selected ? 22 : 12;

          c.save();
          c.strokeStyle = color;
          c.fillStyle = color;
          c.lineWidth = selected ? 2 : 1;

          // Target reticle box
          c.strokeRect(sx - r, sy - r, r * 2, r * 2);

          // Name Tag
          c.font = "bold 11px ui-monospace, monospace";
          c.textAlign = "center";
          c.fillText(`[${remote.team.toUpperCase()}] ${remote.name}`, sx, sy - r - 8);

          // Distance Tag
          c.font = "10px ui-monospace, monospace";
          c.fillText(`${(dist / 1000).toFixed(1)} KM`, sx, sy + r + 15);

          // Remote Player Health Bar
          c.fillStyle = "rgba(0, 0, 0, 0.6)";
          c.fillRect(sx - r, sy + r + 20, r * 2, 4);
          c.fillStyle = isEnemy ? "#ff6b58" : "#5df2b6";
          const maxRemoteHp = 100;
          c.fillRect(sx - r, sy + r + 20, Math.max(0, (r * 2 * (remote.hp || 100)) / maxRemoteHp), 4);

          c.restore();
        } else if (selected && isEnemy) {
          // Off-screen pointer for target
          const local = remote.model.position.clone().sub(p.position).applyQuaternion(p.quaternion.clone().invert());
          const angle = Math.atan2(local.x, local.y || -1);
          const radius = Math.min(w * 0.32, h * 0.33);
          const sx = x + Math.sin(angle) * radius,
            sy = y - Math.cos(angle) * radius;
          c.save();
          c.fillStyle = color;
          c.translate(sx, sy);
          c.rotate(angle);
          c.beginPath();
          c.moveTo(0, -10);
          c.lineTo(7, 5);
          c.lineTo(-7, 5);
          c.closePath();
          c.fill();
          c.restore();
          c.font = "10px ui-monospace, monospace";
          c.fillText((dist / 1e3).toFixed(1) + " KM", sx, sy + 25);
        }
      }
    }

    // 3D In-World Targeted Destination Waypoint (Single Clean Marker)
    const camDir = g.camera.getWorldDirection(new T.Vector3());
    const dest = this.currentJourney?.destination;
    if (dest) {
      const dist = Math.hypot(dest.x - p.position.x, dest.z - p.position.z);
      if (dist < 38000) {
        const wpWorldPos = new T.Vector3(dest.x, terrainHeight(dest.x, dest.z) + 120, dest.z);
        const front = wpWorldPos.clone().sub(g.camera.position).dot(camDir) > 0;
        if (front) {
          const proj = wpWorldPos.project(g.camera);
          if (Math.abs(proj.x) < 0.94 && Math.abs(proj.y) < 0.85) {
            const sx = (proj.x * 0.5 + 0.5) * w;
            const sy = (-proj.y * 0.5 + 0.5) * h;
            const alpha = Math.max(0.35, 1 - dist / 38000);

            c.save();
            c.globalAlpha = alpha;
            const wpColor = dest.militaryBase ? "#ffa751" : "#5df2b6";
            c.strokeStyle = wpColor;
            c.fillStyle = wpColor;
            c.lineWidth = 1.5;

            c.beginPath();
            c.moveTo(sx, sy - 8);
            c.lineTo(sx + 8, sy);
            c.lineTo(sx, sy + 8);
            c.lineTo(sx - 8, sy);
            c.closePath();
            c.stroke();
            c.fillRect(sx - 2, sy - 2, 4, 4);

            c.font = "bold 10px ui-monospace, monospace";
            c.textAlign = "center";
            c.fillText(`TARGET: ${dest.name.toUpperCase()}${dest.militaryBase ? " [AB]" : ""}`, sx, sy - 12);
            c.font = "9px ui-monospace, monospace";
            c.fillText(`${(dist / 1000).toFixed(1)} KM · ${dest.state}`, sx, sy + 18);
            c.restore();
          }
        }
      }
    }

    c.lineWidth = 1;
    this.drawILSGuidance(c, g, w, h);
    this.drawLensFlare(c, g, w, h);
    this.drawHighGVignette(c, g, w, h);
    if(!g.mission.freeFlight || this.root.querySelector(".hud-navigation")?.open)this.drawRadar(g,c,w,h);

    if (g.cam.mode === "cockpit") {
      // Canopy Structural Arch
      c.strokeStyle = "rgba(17,35,43,.85)";
      c.lineWidth = 13;
      c.beginPath();
      c.moveTo(0, h);
      c.lineTo(w * 0.18, h * 0.65);
      c.lineTo(w * 0.26, 0);
      c.moveTo(w, h);
      c.lineTo(w * 0.82, h * 0.65);
      c.lineTo(w * 0.74, 0);
      c.stroke();

      // Canopy Glass Curved Reflection Sheen
      c.save();
      const glassGrad = c.createLinearGradient(0, 0, w, h * 0.4);
      glassGrad.addColorStop(0, "rgba(255,255,255,0.05)");
      glassGrad.addColorStop(0.3, "rgba(180,240,230,0.03)");
      glassGrad.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = glassGrad;
      c.beginPath();
      c.ellipse(w * 0.5, h * 0.22, w * 0.42, h * 0.22, 0, 0, Math.PI * 2);
      c.fill();

      // Night Illuminated Cockpit Dials Glow
      if (g.world?.isNight || g.atmosphere?.timeOfDay === "night") {
        const glow = c.createRadialGradient(w * 0.5, h * 0.88, 10, w * 0.5, h * 0.88, w * 0.35);
        glow.addColorStop(0, "rgba(93, 242, 182, 0.14)");
        glow.addColorStop(1, "rgba(0, 0, 0, 0)");
        c.fillStyle = glow;
        c.fillRect(0, h * 0.65, w, h * 0.35);
      }

      // Sliding Aerodynamic Rain Streaks
      const isRaining = g.atmosphere?.weather === "storm" || p.position.y > 5500;
      if (isRaining || p.speed > 240) {
        c.strokeStyle = "rgba(210, 245, 255, 0.32)";
        c.lineWidth = 1.2;
        const spdMul = 1 + (p.speed / 110);
        for (const drop of this.cockpitRain) {
          drop.y += drop.vy * 0.016 * spdMul * 0.65;
          const side = drop.x > 0.5 ? 1 : -1;
          drop.x += side * 0.016 * 0.08 * spdMul;
          if (drop.y > 1 || drop.x < 0.05 || drop.x > 0.95) {
            drop.y = 0;
            drop.x = 0.2 + Math.random() * 0.6;
          }
          const dx = drop.x * w;
          const dy = drop.y * h * 0.82;
          const streakLen = drop.len * (0.8 + spdMul * 0.35);
          c.beginPath();
          c.moveTo(dx, dy);
          c.lineTo(dx + side * streakLen * 0.35, dy + streakLen);
          c.stroke();
        }
      }
      c.restore();
    }

    if (g.incoming?.length) {
      const m = g.incoming.reduce((a2, b) => (a2.p.distanceToSquared(p.position) < b.p.distanceToSquared(p.position) ? a2 : b));
      const v = m.p.clone().sub(p.position).applyQuaternion(p.quaternion.clone().invert());
      const a = Math.atan2(v.x, -v.z);
      c.strokeStyle = red;
      c.lineWidth = 4;
      c.beginPath();
      c.arc(x, y, 67, a - Math.PI / 2 - 0.22, a - Math.PI / 2 + 0.22);
      c.stroke();
    }
  }

  showAirbaseLandingModal() {
    this.modalType = "landing";
    const p = this.game.player.position;

    const baseCards = IAF_BASES.map((b) => {
      const distKm = (Math.hypot(p.x - b.x, p.z - b.z) / 1000).toFixed(1);
      const isCurrent = this.game.player.currentBase === b.id;
      return `
        <div class="airbase-card" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;margin-bottom:10px;background:rgba(10,22,30,0.85);border:1px solid ${isCurrent ? "#5df2b6" : "rgba(75,160,180,0.3)"};border-radius:6px;">
          <div style="text-align:left;flex:1;">
            <div style="font-size:14px;font-weight:bold;color:#fff;display:flex;align-items:center;gap:8px;">
              <span>${b.icon || "🎖️"}</span> ${b.name.toUpperCase()}
              ${isCurrent ? '<span style="color:#5df2b6;font-size:10px;border:1px solid #5df2b6;padding:1px 6px;border-radius:3px;">PARKED HERE</span>' : ""}
            </div>
            <div style="font-size:11px;color:#85c4b8;margin-top:3px;">
              ${b.state} · Elevation: ${b.elevation}M · Runway ${(b.runwayHeading || 0) === 0 ? "36/18" : "09/27"} (${b.runwayLength}m)
            </div>
            <div style="font-size:11px;color:#ffaa44;margin-top:2px;">
              Squadron: ${b.squadron}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;margin-left:14px;">
            <div style="font-size:12px;font-family:ui-monospace,monospace;color:#ffd074;font-weight:bold;">${distKm} KM</div>
            <div style="display:flex;gap:6px;">
              <button class="primary" style="padding:6px 12px;font-size:11px;" data-base-land="${b.id}">Touchdown 🛬</button>
              <button style="padding:6px 12px;font-size:11px;border-color:#5df2b6;color:#e8fff6;" data-base-approach="${b.id}">ILS Approach ✈️</button>
            </div>
          </div>
        </div>
      `;
    }).join("");

    this.panel(
      "IAF STRATEGIC AIRBASES DISPATCH",
      "Land at Indian Air Force Base",
      `
      <div style="margin-bottom:12px;padding:9px 12px;background:rgba(93,242,182,0.12);border:1px solid rgba(93,242,182,0.4);border-radius:6px;font-size:11px;color:#5df2b6;line-height:1.4;">
        ✈️ <b>Manual In-Flight Landing:</b> You can fly manually to any airbase! Lower gear with <b>${bindingLabel("landingGear",this.settings)}</b>, line up with the runway, and touch down smoothly on the tarmac. No reset, no warp.
      </div>
      <p style="margin-bottom:12px;font-size:11px;color:#94bac5;">
        Select an airbase below for immediate touchdown or to enter on a 3-mile visual ILS glideslope approach:
      </p>
      <div style="max-height:52vh;overflow-y:auto;padding-right:6px;">
        ${baseCards}
      </div>
      <button class="primary" data-action="close" style="margin-top:12px;">Resume Flight</button>
      `
    );
  }

  drawILSGuidance(c, g, w, h) {
    const p = g.player;
    if(p.isLanded)return;
    const near = getNearestIAFBase(p.position.x, p.position.z);
    if (!near || near.distance > 15000) return;
    const base = near.base;

    c.save();
    // 3D ILS Touchdown Zone Runway Marker
    if (g.camera && near.distance < 12000) {
      const rwPos = new T.Vector3(base.x, base.elevation + 2, base.z);
      const camDir = g.camera.getWorldDirection(new T.Vector3());
      const inFront = rwPos.clone().sub(g.camera.position).dot(camDir) > 0;
      if (inFront) {
        const proj = rwPos.project(g.camera);
        if (Math.abs(proj.x) < 0.95 && Math.abs(proj.y) < 0.9) {
          const sx = (proj.x * 0.5 + 0.5) * w;
          const sy = (-proj.y * 0.5 + 0.5) * h;
          const size = Math.max(16, Math.min(60, (4000 / Math.max(500, near.distance)) * 24));

          c.strokeStyle = p.gearDown ? "#5df2b6" : "#ffa751";
          c.lineWidth = 2;
          c.strokeRect(sx - size, sy - size * 0.4, size * 2, size * 0.8);

          c.fillStyle = p.gearDown ? "#5df2b6" : "#ffa751";
          c.font = "bold 10px ui-monospace, monospace";
          c.fillText(`[ ${base.code || "RWY 09"} ]`, sx, sy - size * 0.4 - 5);
        }
      }
    }
    c.restore();
  }

  drawLensFlare(c, g, w, h) {
    if (!g.camera) return;
    const visibility=(g.world?.sunVisibilityValue || 0)*(g.settings.effectIntensity ?? .8);
    if(visibility<.01)return;
    const camDir=g.camera.getWorldDirection(this._flareDirection ??=new T.Vector3());
    const toSun=g.world.sunDirection;
    const sunPos=(this._flarePosition ??=new T.Vector3()).copy(g.camera.position).addScaledVector(toSun,30000);
    const dot = camDir.dot(toSun);
    if (dot <= 0.4) return;

    const sunProj = sunPos.project(g.camera);
    if (sunProj.z >= 1.0) return;

    const sx = (sunProj.x * 0.5 + 0.5) * w;
    const sy = (-sunProj.y * 0.5 + 0.5) * h;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const intensity = Math.pow((dot - 0.4) / 0.6, 2.0)*visibility*.45;

    c.save();
    // 1. Sun Radial Glow
    const sunGrad = c.createRadialGradient(sx, sy, 0, sx, sy, 220 * intensity);
    sunGrad.addColorStop(0, `rgba(255, 255, 230, ${0.85 * intensity})`);
    sunGrad.addColorStop(0.25, `rgba(255, 215, 130, ${0.45 * intensity})`);
    sunGrad.addColorStop(0.65, `rgba(255, 150, 50, ${0.15 * intensity})`);
    sunGrad.addColorStop(1, "rgba(255, 100, 20, 0)");
    c.fillStyle = sunGrad;
    c.beginPath();
    c.arc(sx, sy, 220 * intensity, 0, Math.PI * 2);
    c.fill();

    // 2. Anamorphic Horizontal Streak
    c.fillStyle = `rgba(255, 240, 190, ${0.22 * intensity})`;
    c.fillRect(0, sy - 1.5, w, 3);
    c.fillStyle = `rgba(255, 190, 90, ${0.1 * intensity})`;
    c.fillRect(0, sy - 4, w, 8);

    // 3. Cinematic Flare Discs along optical axis
    const dx = cx - sx;
    const dy = cy - sy;
    const flareDiscs = [
      { t: 0.28, r: 18, color: "rgba(255, 195, 90," },
      { t: 0.52, r: 36, color: "rgba(110, 220, 255," },
      { t: 0.76, r: 14, color: "rgba(255, 140, 210," },
      { t: 1.18, r: 64, color: "rgba(90, 235, 180," },
      { t: 1.48, r: 24, color: "rgba(255, 205, 110," },
      { t: 1.72, r: 100, color: "rgba(255, 160, 70," }
    ];

    for (const f of flareDiscs) {
      const fx = sx + dx * f.t;
      const fy = sy + dy * f.t;
      const fr = f.r * (0.85 + intensity * 0.4);
      const grad = c.createRadialGradient(fx, fy, 0, fx, fy, fr);
      grad.addColorStop(0, f.color + (0.26 * intensity) + ")");
      grad.addColorStop(0.75, f.color + (0.07 * intensity) + ")");
      grad.addColorStop(1, f.color + "0)");
      c.fillStyle = grad;
      c.beginPath();
      c.arc(fx, fy, fr, 0, Math.PI * 2);
      c.fill();
    }

    // 4. Sun God Rays
    const rayCount = 8;
    for (let i = 0; i < rayCount; i++) {
      const angle = (i * Math.PI * 2) / rayCount + (g.elapsed || 0) * 0.05;
      const rayLen = Math.max(w, h) * (0.55 + 0.15 * Math.sin(i * 1.9));
      const rx = sx + Math.cos(angle) * rayLen;
      const ry = sy + Math.sin(angle) * rayLen;
      const rayGrad = c.createLinearGradient(sx, sy, rx, ry);
      rayGrad.addColorStop(0, `rgba(255, 240, 180, ${0.16 * intensity})`);
      rayGrad.addColorStop(1, "rgba(255, 190, 90, 0)");
      c.strokeStyle = rayGrad;
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(sx, sy);
      c.lineTo(rx, ry);
      c.stroke();
    }
    c.restore();
  }

  drawHighGVignette(c, g, w, h) {
    const p = g.player;
    if (!p) return;
    const turnRate = Math.hypot(p.angular?.x || 0, p.angular?.z || 0);
    const speedRatio = Math.min(1.0, (p.speed || 0) / 320);
    const gForce = 1.0 + turnRate * 7.2 * speedRatio;
    if (gForce > 3.0) {
      const intensity = Math.min(0.68, (gForce - 3.0) / 5.2);
      c.save();
      const grad = c.createRadialGradient(w * 0.5, h * 0.5, h * 0.26, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(0.55, `rgba(18,5,5,${intensity * 0.4})`);
      grad.addColorStop(1, `rgba(0,0,0,${intensity})`);
      c.fillStyle = grad;
      c.fillRect(0, 0, w, h);
      c.restore();
    }
  }

  drawRadar(g, c, w, h) {
    const r = w < 650 ? 56 : 78,
      x = w / 2,
      y = h - 128;
    const p = g.player;
    c.fillStyle = "rgba(4,18,24,.55)";
    c.strokeStyle = "rgba(179,222,213,.35)";
    c.lineWidth = 1;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    c.stroke();

    // Inner ring & crosshairs
    c.beginPath();
    c.arc(x, y, r * 0.5, 0, Math.PI * 2);
    c.moveTo(x - r, y);
    c.lineTo(x + r, y);
    c.moveTo(x, y - r);
    c.lineTo(x, y + r);
    c.stroke();

    // Compass Ticks on Radar Bezel
    const angle = (-heading(p.quaternion) * Math.PI) / 180;
    c.save();
    c.font = "bold 9px ui-monospace, monospace";
    c.textAlign = "center";
    c.textBaseline = "middle";
    const cardinals = [
      { text: "N", rad: 0 },
      { text: "E", rad: Math.PI * 0.5 },
      { text: "S", rad: Math.PI },
      { text: "W", rad: Math.PI * 1.5 }
    ];
    for (const card of cardinals) {
      const ca = card.rad + angle;
      const tx = x + Math.sin(ca) * (r - 9);
      const ty = y - Math.cos(ca) * (r - 9);
      c.fillStyle = card.text === "N" ? "#ff7766" : "rgba(160,225,210,.65)";
      c.fillText(card.text, tx, ty);
    }
    c.restore();

    // Rotating radar sweep line
    c.strokeStyle = "rgba(133,234,205,.35)";
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.sin(g.elapsed) * r, y - Math.cos(g.elapsed) * r);
    c.stroke();

    // Moving Map: Flight Breadcrumbs Trail (where player journeyed from)
    if (this.flightBreadcrumbs && this.flightBreadcrumbs.length > 1) {
      c.lineWidth = 1.5;
      for (let i = 1; i < this.flightBreadcrumbs.length; i++) {
        const ptA = this.flightBreadcrumbs[i - 1];
        const ptB = this.flightBreadcrumbs[i];
        const dxA = ((ptA.x - p.position.x) / 30e3) * r;
        const dzA = ((ptA.z - p.position.z) / 30e3) * r;
        const dxB = ((ptB.x - p.position.x) / 30e3) * r;
        const dzB = ((ptB.z - p.position.z) / 30e3) * r;
        if (Math.hypot(dxA, dzA) <= r && Math.hypot(dxB, dzB) <= r) {
          const pxA = x + dxA * Math.cos(angle) - dzA * Math.sin(angle);
          const pyA = y + dxA * Math.sin(angle) + dzA * Math.cos(angle);
          const pxB = x + dxB * Math.cos(angle) - dzB * Math.sin(angle);
          const pyB = y + dxB * Math.sin(angle) + dzB * Math.cos(angle);
          const alpha = (i / this.flightBreadcrumbs.length) * 0.45;
          c.strokeStyle = `rgba(93, 242, 182, ${alpha})`;
          c.beginPath();
          c.moveTo(pxA, pyA);
          c.lineTo(pxB, pyB);
          c.stroke();
        }
      }
    }

    // Moving Map: Destination Flight Path Corridor Line
    const journey = getApproachingLocation(p.position, p.forward, p.speed);
    if (journey?.destination) {
      const dest = journey.destination;
      const dxd = ((dest.x - p.position.x) / 30e3) * r;
      const dzd = ((dest.z - p.position.z) / 30e3) * r;
      const dist = Math.hypot(dxd, dzd);
      const clampR = Math.min(r * 0.95, dist);
      const dirX = dxd / Math.max(1e-3, dist);
      const dirZ = dzd / Math.max(1e-3, dist);
      const pxd = x + (dirX * clampR) * Math.cos(angle) - (dirZ * clampR) * Math.sin(angle);
      const pyd = y + (dirX * clampR) * Math.sin(angle) + (dirZ * clampR) * Math.cos(angle);

      c.strokeStyle = "rgba(255, 200, 100, 0.45)";
      c.setLineDash([3, 3]);
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(pxd, pyd);
      c.stroke();
      c.setLineDash([]);
    }

    // Moving Map: Nearby Cities on Radar
    for (const city of CITIES) {
      const dxc = ((city.x - p.position.x) / 30e3) * r;
      const dzc = ((city.z - p.position.z) / 30e3) * r;
      if (Math.hypot(dxc, dzc) > r * 0.92) continue;
      const pxc = x + dxc * Math.cos(angle) - dzc * Math.sin(angle);
      const pyc = y + dxc * Math.sin(angle) + dzc * Math.cos(angle);
      c.fillStyle = city.militaryBase ? "#ffa751" : "#5df2b6";
      c.fillRect(pxc - 1.5, pyc - 1.5, 3, 3);
      c.font = "8px ui-monospace, monospace";
      c.fillText(city.name.substring(0, 4).toUpperCase(), pxc, pyc - 3);
    }

    // Moving Map: Strategic Airbases & Runways on Radar
    for (const base of IAF_BASES) {
      const dxb = ((base.x - p.position.x) / 30e3) * r;
      const dzb = ((base.z - p.position.z) / 30e3) * r;
      if (Math.hypot(dxb, dzb) > r * 0.94) continue;
      const pxb = x + dxb * Math.cos(angle) - dzb * Math.sin(angle);
      const pyb = y + dxb * Math.sin(angle) + dzb * Math.cos(angle);
      c.fillStyle = "#38f8d4";
      c.fillRect(pxb - 3, pyb - 1.5, 6, 3);
      c.strokeStyle = "#ffffff";
      c.lineWidth = 1;
      c.strokeRect(pxb - 3, pyb - 1.5, 6, 3);
      c.font = "bold 8px ui-monospace, monospace";
      c.fillStyle = "#38f8d4";
      c.fillText((base.code || "AFB").substring(0, 4), pxb, pyb - 4);
    }

    // Combat contacts plotting (enemies, allies, missiles, base)
    const plot = (pos, color, selected = false) => {
      const dx = ((pos.x - p.position.x) / 15e3) * r,
        dz = ((pos.z - p.position.z) / 15e3) * r;
      if (Math.hypot(dx, dz) > r) return;
      const px = x + dx * Math.cos(angle) - dz * Math.sin(angle),
        py = y + dx * Math.sin(angle) + dz * Math.cos(angle);
      c.fillStyle = color;
      c.fillRect(px - 2.5, py - 2.5, 5, 5);
      if (selected) {
        c.strokeStyle = color;
        c.strokeRect(px - 5, py - 5, 10, 10);
      }
    };

    for (const j of [...g.enemies, ...g.allies]) if (j.alive && canDisplayContact(g,j)) plot(j.position, j.team === "ally" ? "#65d8ff" : "#ff796c", j === g.target);
    if (g.mission.id === 1) plot(BASE, "#ffdf84");
    for (const m of g.weapons.missiles) if (m.active && m.owner.team === "enemy") plot(m.p, "#ffcd5a");

    // Multiplayer Radar Contacts
    if (g.multiplayer?.active) {
      for (const remote of g.multiplayer.remotePlayers.values()) {
        if (!remote.alive || !remote.model) continue;
        const color = remote.team === g.multiplayer.localTeam ? "#65d8ff" : "#ff796c";
        plot(remote.model.position, color, g.target?.id === remote.id);
      }
    }

    // Player Jet Icon at center
    c.fillStyle = "#c4f7eb";
    c.beginPath();
    c.moveTo(x, y - 6);
    c.lineTo(x + 5, y + 5);
    c.lineTo(x - 5, y + 5);
    c.closePath();
    c.fill();

    c.font = "11px ui-monospace,monospace";
    c.textAlign = "center";
    c.fillText("NAV MAP / 30 KM", x, y + r + 18);
  }

  showMultiplayerResult(msg) {
    this.multiplayerUI?.showMultiplayerResult(msg);
  }
}

Object.assign(UI.prototype,experienceMethods);

export {
  UI
};
