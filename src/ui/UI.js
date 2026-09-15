import { atlasMarkup, attachAtlas } from "./Atlas.js";
import { approachInfo } from "../game/Landing.js";
import * as T from "three";
import { MISSIONS, FREE_FLIGHT, FLIGHT_MODES, getMission } from "../game/Missions.js";
import { heading, clamp } from "../game/math.js";
import { BASE, terrainHeight } from "../game/World.js";
import { beginnerGuide, flightHints } from "./BeginnerGuide.js";
import { PREVIEW_LABELS, normalizeAudioSettings } from "../game/SoundDesign.js";
import { soundSettingsMarkup, previewMuteReason } from "./SoundSettings.js";
import { CITIES, INTERNATIONAL_BORDERS, IAF_BASES, getNearestIAFBase, getGPSCoordinates, getApproachingLocation, getBiomeAt } from "../game/GeoWorld.js";
import { HangarUI } from "./HangarUI.js";
import { JET_MODELS } from "../game/JetConfigs.js";

const time = (s) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
const icon = (name) => ({ pause: "Ⅱ", sound: "◖))", fullscreen: "⛶", close: "×", map: "🗺️" })[name] || name;

class UI {
  constructor(root, settings) {
    this.root = root;
    this.settings = normalizeAudioSettings(settings);
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
          <a class="wordmark" href="#" aria-label="Skybreak main menu">
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
          <p class="intro-copy">First flight? Start with Free Flight.<br>Arrow keys to steer, auto-assist handles the rest.</p>
          <button class="launch" data-action="play">
            <span class="play-triangle">▶</span> PLAY <span class="launch-meta">FREE FLIGHT</span><span>↗</span>
          </button>
          <nav class="menu-nav">
            <button class="primary-nav-btn" data-action="hangar">✈️ Hangar &amp; Jets</button>
            <button data-action="atlas">Earth atlas</button><button data-action="missions">Missions</button>
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
              <button data-mode="mouse">Mouse</button>
            </div>
          </div>
          <div class="missions">
            ${FLIGHT_MODES.map((m, i) => `
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

        <div id="hud-airspace" class="hud-airspace"></div>
        <div id="hud-journey" class="hud-journey"></div>

        <div class="hud-top-right">
          <div id="hud-score"></div>
          <button class="icon-btn" data-action="toggle-map" aria-label="Tactical World Map">🗺️ <small>M</small></button>
          <button class="icon-btn help-btn" data-action="flight-help" aria-label="Controls and help">? <small>H</small></button>
          <button class="icon-btn" data-action="pause" aria-label="Pause game">Ⅱ</button>
        </div>

        <div id="border-alert" class="border-alert" hidden></div>
        <div id="threat" class="threat" hidden>⚠ MISSILE WARNING <small>PRESS F · DEPLOY FLARES</small></div>
        
        <div class="compact-telemetry">
          <span id="compact-speed"></span>
          <span id="compact-altitude"></span>
        </div>

        <div id="lock-status" class="lock-status"></div>
        <div id="flight-warning" class="flight-warning"></div>

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
            <span>IR MISSILE <kbd>RMB</kbd></span>
            <strong id="missile-value">06 <small>/ 06</small></strong>
            <div id="missile-bars"></div>
          </div>
          <div class="weapon secondary">
            <span>CANNON <kbd>SPACE</kbd></span>
            <strong id="cannon-value">1200</strong>
          </div>
          <div class="flare-line">COUNTERMEASURES <b id="flare-value">20</b> <kbd>F</kbd></div>
        </div>

        <div id="practice-help" class="practice-help" hidden>
          <span class="eyebrow">FREE FLIGHT · NO ENEMIES</span>
          <div id="practice-instructions"></div>
          <div class="practice-actions">
            <button data-action="land-bases" style="background:#1a4d3a;border-color:#5df2b6;color:#e8fff6;">Land at IAF Base 🛬 [L]</button>
            <button data-action="atlas">Earth atlas</button><button data-action="toggle-gear">Gear [G]</button>
            <button data-action="practice-reset">Reset position</button>
            <button data-action="flight-help">Help · H</button>
          </div>
        </div>

        <div id="radio" class="radio"></div>

        <div class="flight-hints">
          <span><kbd>W S</kbd> PITCH</span>
          <span><kbd>A D</kbd> ROLL</span>
          <span><kbd>SHIFT / TAB</kbd> BOOST</span>
          <span><kbd>M</kbd> MAP</span>
          <span><kbd>T</kbd> TIME</span>
          <span><kbd>R</kbd> TARGET</span>
          <span><kbd>C</kbd> CAMERA</span>
          <span><kbd>G</kbd> GEAR</span>
          <span><kbd>L</kbd> LAND</span>
          <span><kbd>ESC</kbd> PAUSE</span>
        </div>

        <div class="hud-session">
          <span id="mission-time">00:00</span>
          <span id="fps"></span>
        </div>

        <div id="damage-overlay"></div>

        <div id="touch-controls">
          <div id="touch-stick" aria-label="Touch flight joystick"><i></i></div>
          <div class="touch-actions">
            <button data-touch="fire">FIRE</button>
            <button data-touch="missile">MSL</button>
            <button data-touch="flare">FLARE</button>
            <button data-touch="boost">BOOST</button>
          </div>
        </div>
      </div>

      <div id="modal-root"></div>
      <div id="toast" role="status" hidden></div>
    `;

    this.menuEl = root.querySelector("#menu");
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
      if (b.dataset.mode) {
        this.settings.input = b.dataset.mode;
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
    this.resize();
  }

  attach(game) {
    this.game = game;
    this.updateAircraftCaption();
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
      e.preventDefault();
      stick.setPointerCapture(e.pointerId);
      game.input.touchActive = true;
      move(e);
    });
    stick.addEventListener("pointermove", (e) => {
      if (stick.hasPointerCapture(e.pointerId)) move(e);
    });
    const release = () => {
      game.input.touchActive = false;
      game.input.mouse = { x: 0, y: 0 };
      knob.style.transform = "";
    };
    stick.addEventListener("pointerup", release);
    stick.addEventListener("pointercancel", release);

    this.root.querySelectorAll("[data-touch]").forEach((b) => {
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        if (b.dataset.touch === "fire") game.input.fire = true;
        if (b.dataset.touch === "boost") game.input.boost = true;
        if (b.dataset.touch === "missile") game.launch();
        if (b.dataset.touch === "flare") game.flare();
      });
      const up = () => {
        if (b.dataset.touch === "fire") game.input.fire = false;
        if (b.dataset.touch === "boost") game.input.boost = false;
      };
      b.addEventListener("pointerup", up);
      b.addEventListener("pointercancel", up);
    });
  }

  saveSettings(audioOnly = false) {
    try {
      localStorage.setItem("skybreak-settings", JSON.stringify(this.settings));
    } catch {}
    if (!audioOnly) this.game?.applySettings();
    this.game?.audio.syncMix?.();
  }

  updateModes() {
    this.root.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("active", b.dataset.mode === this.settings.input));
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
    const free = !!this.game.mission.freeFlight;
    this.root.querySelector(".flight-hints").innerHTML = flightHints(this.settings.input, free);
    this.dom["practice-instructions"].innerHTML =
      this.settings.input === "mouse"
        ? "<p><kbd>MOUSE</kbd> Aim toward destination.</p><p>Center cursor = level wings.</p>"
        : this.settings.input === "advanced"
        ? "<p><kbd>S / W</kbd> Pitch up / down.</p><p><kbd>A / D</kbd> Roll. <kbd>Q / E</kbd> Yaw.</p>"
        : "<p><kbd>↑</kbd> Climb &nbsp; <kbd>↓</kbd> Dive</p><p><kbd>←</kbd> Turn Left &nbsp; <kbd>→</kbd> Turn Right</p><p>Release keys = auto-level.</p>";
    this.dom["practice-instructions"].innerHTML +=
      "<p><kbd>SHIFT / TAB</kbd> Fast &nbsp; <kbd>B</kbd> Slow</p><p><kbd>M</kbd> Tactical Map &nbsp; <kbd>T</kbd> Time/Sky</p><small>Ground impact? Auto-recovery to safe altitude.</small>";
    const missileKey = this.root.querySelector(".weapon kbd");
    if (missileKey) missileKey.textContent = this.settings.input === "advanced" ? "RMB" : "E / RMB";
  }

  action(a) {
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
    if (a === "atlas") { this.game.pause?.();this.modalType="atlas";this.panel("FLIGHT PLANNING", "Real-world atlas", atlasMarkup());this.modal.querySelector(".panel").classList.add("atlas-panel");attachAtlas(this.modal);return; }
    if (a === "toggle-map" || a === "map") this.toggleMap();
    if (a === "practice-reset") this.game.resetPracticePosition();
    if (a === "missions") this.showMissions();
    if (a === "land-bases") this.showAirbaseLandingModal();
    if (a === "toggle-gear") {
      this.game.toggleGear();
      if (this.modalType === "pause") this.showPause();
    }
    if (a === "hangar" || a === "jets") this.showHangar();
    if (a === "controls") this.showControls();
    if (a === "settings") this.showSettings();
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
              <button data-action="land-bases" class="primary" style="padding:4px 10px;font-size:11px;">🛬 IAF Airbases [L]</button>
              <button class="close-btn" data-action="close" aria-label="Close map">×</button>
            </div>
          </div>
          <canvas id="tactical-canvas" class="tactical-map-canvas" width="900" height="600"></canvas>
          <div class="tactical-map-footer">
            <span>AIRSPACE: <b id="map-airspace-name">SEARCHING...</b></span>
            <span>PRESS <b>M</b> OR <b>ESC</b> TO RETURN TO FLIGHT</span>
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
      airNameEl.innerHTML = `SIM COORD ${gps.formatted} | ${g.currentAirspace.flag || "📍"} ${g.currentAirspace.country} [${g.currentAirspace.state}]${biomeStr}`;
    }
  }

  panel(eyebrow, title, content, closeable = true) {
    this.modal.innerHTML = `
      <div class="modal-backdrop">
        <div class="panel">
          <div class="panel-top">
            <span class="eyebrow">${eyebrow}</span>
            ${closeable ? `<button class="close-btn" data-action="close" aria-label="Close panel">${icon("close")}</button>` : ""}
          </div>
          <h2>${title}</h2>
          ${content}
        </div>
      </div>
    `;
    const f = this.modal.querySelector("button, input, select");
    f?.focus();
  }

  showMenu() {
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
    this.stopSoundPreview();
    this.menuEl.hidden = true;
    this.hudEl.hidden = false;
    this.modal.innerHTML = "";
    this.modalType = null;
    const m = this.game.mission;
    this.dom["mission-code"].textContent = m.code + " / " + m.region;
    this.dom["mission-name"].textContent = m.name;
    this.dom["mission-objective"].textContent = m.objective;
    const free = !!m.freeFlight;
    this.hudEl.classList.toggle("free-flight", free);
    this.root.querySelector(".hud-weapons").hidden = free;
    this.dom["practice-help"].hidden = !free;
    this.dom["hud-score"].hidden = free;
    this.dom["objective-fill"].parentElement.hidden = free;
    this.root.querySelectorAll('[data-touch="fire"], [data-touch="missile"], [data-touch="flare"]').forEach((b) => (b.hidden = free));
    this.updateFlightHelp();
  }

  showPause() {
    this.modalType = "pause";
    this.panel(
      "SORTIE ON HOLD",
      "Flight paused.",
      `
      <p>Flight paused. Click Resume to fly, or check Help for controls.</p>
      <div class="stack-buttons">
        <button class="primary" data-action="resume">Resume flight <span>↗</span></button>
        <button data-action="land-bases" style="border-color:#ffa751;color:#ffdfa9;">🛬 Land at IAF Air Base [L]</button>
        <button data-action="atlas">Earth atlas</button><button data-action="toggle-gear">Toggle Landing Gear ⚙️ [G]</button>
        <button data-action="hangar">✈️ Jet Modifications</button>
        <button data-action="toggle-map">Tactical World Map 🗺️</button>
        <button data-action="restart">Restart flight</button>
        <button data-action="sounds">Sounds</button>
        <button data-action="settings">Settings</button>
        <button data-action="controls">How to Play</button>
        <button data-action="menu">Main menu</button>
      </div>
      `,
      false
    );
  }

  closePanel() {
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
      "OPERATIONS BOARD",
      "Choose your sortie.",
      `
      <div class="briefings">
        ${FLIGHT_MODES.map(
          (m) => `
          <button class="briefing ${this.selected === m.id ? "selected" : ""}" data-mission="${m.id}">
            <span class="eyebrow">${m.code} / ${m.region}</span>
            <h3>${m.name}</h3>
            <p>${m.brief}</p>
            <span class="brief-objective">${m.objective}</span>
          </button>
        `
        ).join("")}
      </div>
      <button class="primary" data-action="play">Launch selected mission <span>↗</span></button>
      `
    );
  }

  showPreflight() {
    this.modalType = "preflight";
    this.panel(
      "QUICK START · " + getMission(this.selected).name.toUpperCase(),
      "First flight? Here is how to fly.",
      beginnerGuide(this.settings.input) +
        '<button class="primary" data-action="launch-flight">Got it · Take Off ↗</button><p class="panel-footnote">Press H to reopen this guide anytime. Free Flight has no enemies or time limits.</p>'
    );
  }

  showControls() {
    this.modalType = "controls";
    this.panel("BEGINNER FLIGHT GUIDE", "How to Play", beginnerGuide(this.settings.input, true));
  }

  showSettings() {
    this.modalType = "settings";
    const select = (key, label, choices) =>
      `<label class="setting"><span>${label}</span><select data-setting="${key}">${choices
        .map(([val, text]) => `<option value="${val}" ${this.settings[key] === val ? "selected" : ""}>${text}</option>`)
        .join("")}</select></label>`;
    const range = (key, label, min, max, step) =>
      `<label class="setting"><span>${label}</span><div><input type="range" data-setting="${key}" min="${min}" max="${max}" step="${step}" value="${this.settings[key]}"><output>${this.settings[key]}</output></div></label>`;
    const toggle = (key, label) =>
      `<label class="setting"><span>${label}</span><input type="checkbox" data-setting="${key}" ${this.settings[key] ? "checked" : ""}></label>`;

    this.panel(
      "PILOT PREFERENCES",
      "Make it your flight.",
      `
      <div class="settings-list">
        ${select("quality", "Graphics quality", [
          ["low", "Low · performance"],
          ["medium", "Medium · balanced"],
          ["high", "High · bloom + detail"]
        ])}
        ${select("timeOfDay", "Time of Day / Atmosphere", [
          ["day", "Day · clear daylight"],
          ["sunset", "Sunset · golden hour dusk"],
          ["night", "Night · dark starry night + runway lights"]
        ])}
        ${select("weather", "Weather Conditions", [
          ["clear", "Clear skies"],
          ["storm", "Thunderstorm · rain + dynamic lightning"]
        ])}
        ${select("difficulty", "Enemy difficulty", [
          ["easy", "Easy"],
          ["medium", "Medium"],
          ["hard", "Hard"]
        ])}
        ${select("input", "Flight controls", [
          ["keyboard", "Arrow keys · Easy"],
          ["mouse", "Mouse · Easy"],
          ["advanced", "Advanced · manual"]
        ])}
        ${range("sensitivity", "Mouse sensitivity", 0.3, 2, 0.1)}
        <div class="setting"><span>Engine, weapons &amp; volumes</span><button data-action="sounds">Sounds &amp; previews ↗</button></div>
        ${toggle("invert", "Invert mouse Y axis")}
        ${toggle("shake", "Camera shake")}
        <div class="setting"><span>Display</span><button data-action="fullscreen">Toggle fullscreen ⛶</button></div>
        <div class="setting"><span>Privacy &amp; Safety</span><button data-action="privacy">Privacy Policy 🛡️</button></div>
      </div>
      <p class="panel-footnote">Settings save automatically on this device.</p>
      `
    );

    this.modal.querySelectorAll("[data-setting]").forEach((el) =>
      el.addEventListener("input", () => {
        const key = el.dataset.setting;
        this.settings[key] = el.type === "checkbox" ? el.checked : el.type === "range" ? Number(el.value) : el.value;
        const out = el.parentElement.querySelector("output");
        if (out) out.value = el.value;
        this.saveSettings();
        this.updateModes();
        if (key === "timeOfDay") this.game?.atmosphere.setTimeOfDay(this.settings.timeOfDay);
        if (key === "weather") this.game?.atmosphere.setWeather(this.settings.weather);
      })
    );
  }

  showPrivacy() {
    this.modalType = "privacy";
    this.panel(
      "SECURITY & PRIVACY",
      "Privacy & Safety Assurance",
      `
      <div class="settings-list" style="max-width:540px;line-height:1.6;font-size:12px;color:#d5ede3;">
        <p><b style="color:#5df2b6">🔒 100% Client-Side &amp; Private</b><br>Skybreak executes entirely inside your local browser WebGL sandbox. No trackers, no telemetry scripts, and no personal data is collected or sent to remote servers.</p>
        <p><b style="color:#5df2b6">💾 Local Device Storage Only</b><br>Pilot preferences (controls, graphics quality, audio volumes) are stored solely in your browser's private <kbd>localStorage</kbd> on this device.</p>
        <p><b style="color:#5df2b6">🛡️ Safe Permissions Policy (CSP)</b><br>Our strict Content Security Policy blocks browser access to camera, microphone, geolocation, and payment APIs.</p>
        <p><b style="color:#5df2b6">🌍 GDPR &amp; COPPA Compliant</b><br>Zero personal tracking cookies, completely safe for pilots and students of all ages.</p>
      </div>
      <button class="primary" data-action="settings">Back to Settings ↗</button>
      `
    );
  }

  showHangar() {
    if (this.hangarUI) return;
    const prevState = this.game.state;
    this.game.state = "hangar";
    this.closePanel();
    const menuEl = this.root.querySelector("#menu");
    if (menuEl) menuEl.hidden = true;
    const hudEl = this.root.querySelector("#hud");
    if (hudEl) hudEl.hidden = true;

    this.hangarUI = new HangarUI(this.root, this.game, (launch) => {
      this.hangarUI = null;
      if (launch) {
        this.game.start(this.selected);
      } else if (prevState === "playing" || prevState === "paused") {
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
        this.settings[key] = el.tagName === "INPUT" ? Number(el.value) : el.value;
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
    this.modalType = "result";
    const s = this.game.stats;
    const timeBonus = Math.max(0, Math.round((360 - this.game.elapsed) * 10));
    const finalScore = this.game.score + (success ? timeBonus : 0);
    this.panel(
      success ? "MISSION ACCOMPLISHED" : "MISSION FAILED",
      success ? "Area clear." : "Sortie compromised.",
      `
      <p>${success ? "Excellent flying. The operation is complete." : reason}</p>
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
    this.canvas.width = innerWidth;
    this.canvas.height = innerHeight;
    if (this.tacticalCanvas) {
      this.tacticalCanvas.width = 900;
      this.tacticalCanvas.height = 600;
    }
  }

  update(g, dt) {
    if (this.hangarUI) {
      this.hangarUI.update(dt);
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

    if (this.hudEl.hidden) return;
    const p = g.player;
    this.dom["compact-speed"].textContent = Math.round(p.speed * 3.6) + " KM/H";
    this.dom["compact-altitude"].textContent = Math.round(p.position.y) + " M";
    const remaining = g.enemies.filter((e) => e.alive).length,
      total = g.enemies.length;
    this.dom["objective-count"].textContent = g.mission.freeFlight ? "NO ENEMIES · NO TIME LIMIT" : `${total - remaining} / ${total} HOSTILES DOWN`;
    this.dom["objective-fill"].style.width = `${total ? ((total - remaining) / total) * 100 : 0}%`;
    this.dom["hud-score"].textContent = String(g.score).padStart(6, "0");
    const maxHp = p.maxHp || 100;
    const hpPct = Math.round((p.hp / maxHp) * 100);
    this.dom["health-value"].textContent = `${Math.ceil(p.hp)} HP (${hpPct}%)`;
    this.dom["health-fill"].style.width = Math.min(100, Math.max(0, hpPct)) + "%";
    this.dom["health-fill"].style.background = hpPct < 35 ? "#ff6b58" : "";
    this.dom.throttle.textContent = Math.round(p.throttle * 100) + "%";
    this.dom.burner.textContent = p.boost ? "AFTERBURNER" : "";
    this.dom["camera-label"].textContent = g.cam.mode.toUpperCase();
    if (this.dom["aircraft-pilot-code"]) {
      this.dom["aircraft-pilot-code"].textContent = (JET_MODELS[p.modelId]?.code || "X-17") + " · ACTIVE";
    }
    const maxMissiles = p.stats?.missiles || 6;
    this.dom["missile-value"].innerHTML = `${String(g.missilesLeft).padStart(2, "0")} <small>/ ${String(maxMissiles).padStart(2, "0")}</small>`;
    this.dom["missile-bars"].innerHTML = Array.from({ length: maxMissiles }, (_, i) => `<i class="${i < g.missilesLeft ? "loaded" : ""}"></i>`).join("");
    this.dom["cannon-value"].textContent = g.cannonLeft;
    this.dom["flare-value"].textContent = g.flaresLeft;
    this.dom["mission-time"].textContent = time(g.elapsed);
    this.dom.fps.textContent = Math.round(Math.min(g.fps, 240)) + " FPS";
    this.dom.threat.hidden = !g.incoming?.length;

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
      this.dom["hud-airspace"].innerHTML = `<span>SIM COORD ${gps.formatted}</span> <b>${air.flag || "📍"} ${air.country.toUpperCase()}</b> [${air.state.toUpperCase()}]${cityText}`;
    }

    // Approaching destination & live ETA readout
    const journey = getApproachingLocation(p.position, p.forward, p.speed);
    this.currentJourney = journey;
    if (this.dom["hud-journey"] && journey?.destination) {
      const originStr = journey.origin?.name ? journey.origin.name.toUpperCase() : "BASE";
      const destStr = journey.destination.name.toUpperCase();
      this.dom["hud-journey"].innerHTML = `<span class="journey-origin">🛫 ${originStr}</span><span class="journey-arrow">➔</span><span class="journey-dest">🎯 APPROACHING: <b>${destStr}</b></span><span class="journey-meta">${journey.distanceKm} KM · ETA ${journey.formattedETA}</span>`;
    }

    this.dom["lock-status"].textContent = g.mission.freeFlight
      ? "H · HELP     M · MAP     T · TIME/SKY"
      : g.target?.alive
      ? g.lock >= 1.4
        ? g.settings.input === "advanced"
          ? "LOCKED · RIGHT CLICK"
          : "LOCKED · E / RIGHT CLICK"
        : g.lock > 0
        ? "ACQUIRING LOCK " + Math.round((g.lock / 1.4) * 100) + "%"
        : "KEEP TARGET IN RETICLE"
      : "NO HOSTILES";
    this.dom["lock-status"].classList.toggle("locked", g.lock >= 1.4);
    this.dom["flight-warning"].textContent = p.isLanded ? "" : p.stall
      ? "STALL · LOWER NOSE + INCREASE THROTTLE"
      : g.outOfArea
      ? "RETURN TO COMBAT AREA"
      : p.position.y - Math.max(0, terrainHeight(p.position.x, p.position.z)) < 220
      ? g.settings.input === "advanced"
        ? "LOW ALTITUDE · PULL UP"
        : "LOW ALTITUDE · PULL UP (↑ / MOUSE UP)"
      : "";
    this.dom["damage-overlay"].style.opacity = g.damageFlash;
    const n = g.notifications.at(-1);
    this.dom.radio.innerHTML = n ? `<span>${n.who}</span> ${n.text}` : "";
    if (this.borderAlertTimer > 0) {
      this.borderAlertTimer -= dt;
      if (this.borderAlertTimer <= 0) {
        if (this.dom["border-alert"]) this.dom["border-alert"].hidden = true;
      }
    }
    this.drawHUD(g);
  }

  drawHUD(g) {
    const c = this.ctx,
      w = innerWidth,
      h = innerHeight,
      p = g.player,
      x = w / 2,
      y = h * 0.43;
    c.clearRect(0, 0, w, h);
    const ink = "rgba(199,240,229,.82)",
      red = "#ff796c",
      blue = "#65d8ff";
    c.strokeStyle = ink;
    c.fillStyle = ink;
    c.lineWidth = 1;
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
    const e = new T.Euler().setFromQuaternion(p.quaternion, "YXZ");
    c.save();
    c.translate(x, y);
    c.rotate(-e.z);
    const py = e.x * 150;
    for (let i = -2; i <= 2; i++) {
      const yy = py + i * 50;
      if (Math.abs(yy) > 135) continue;
      c.globalAlpha = i === 0 ? 0.65 : 0.28;
      c.beginPath();
      c.moveTo(-80, yy);
      c.lineTo(-25, yy);
      c.moveTo(25, yy);
      c.lineTo(80, yy);
      c.stroke();
    }
    c.restore();
    c.globalAlpha = 1;
    c.strokeStyle = "rgba(190,229,214,.13)";
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
      c.strokeStyle = g.lock >= 1.4 ? "#9affc6" : "#ffbf70";
      c.lineWidth = 3;
      c.beginPath();
      c.arc(x, y, 37, -Math.PI / 2, -Math.PI / 2 + (g.lock / 1.4) * Math.PI * 2);
      c.stroke();
      c.lineWidth = 1;
    }

    if (g.settings.input === "mouse" && g.cam.mode !== "free") {
      const mx = x + g.input.mouse.x * w * 0.18,
        my = y + g.input.mouse.y * h * 0.2;
      c.strokeStyle = "rgba(220,246,233,.32)";
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
        c.font = "22px ui-monospace,monospace";
        c.fillText(val, sx, y);
        c.strokeRect(sx - 43, y - 24, 86, 34);
        for (let i = -3; i <= 3; i++) {
          c.beginPath();
          c.moveTo(sx + (sx < x ? 48 : -48), y + i * 19);
          c.lineTo(sx + (sx < x ? 58 : -58), y + i * 19);
          c.stroke();
        }
      }
    }

    for (const j of [...g.enemies, ...g.allies]) {
      if (!j.alive) continue;
      const dist = j.position.distanceTo(p.position);
      if (dist > 16e3) continue;
      const proj = j.position.clone().project(g.camera);
      const selected = j === g.target;
      const color = j.team === "ally" ? blue : selected && g.lock >= 1.4 ? "#afffd0" : red;
      c.strokeStyle = color;
      c.fillStyle = color;
      c.font = "12px ui-monospace,monospace";
      const front = j.position.clone().sub(g.camera.position).dot(g.camera.getWorldDirection(new T.Vector3())) > 0;
      if (front && Math.abs(proj.x) < 0.92 && Math.abs(proj.y) < 0.8) {
        const sx = (proj.x * 0.5 + 0.5) * w,
          sy = (-proj.y * 0.5 + 0.5) * h,
          r = selected ? 20 : 11;
        c.lineWidth = selected ? 1.8 : 1;
        c.strokeRect(sx - r, sy - r, r * 2, r * 2);
        if (selected) {
          c.fillText((j.bomber ? "BOMBER" : "BANDIT") + " " + String(j.id).padStart(2, "0"), sx, sy - r - 9);
          c.fillText((dist / 1e3).toFixed(1) + " KM", sx, sy + r + 17);
          c.globalAlpha = 0.5;
          c.fillRect(sx - r, sy + r + 23, (r * 2 * j.hp) / (j.bomber ? 160 : 100), 3);
          c.globalAlpha = 1;
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
        c.moveTo(0, -10);
        c.lineTo(7, 5);
        c.lineTo(-7, 5);
        c.closePath();
        c.fill();
        c.restore();
        c.fillText((dist / 1e3).toFixed(1) + " KM", sx, sy + 25);
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
    this.drawRadar(g, c, w, h);

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
    this.game.pause?.();
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
              <button class="primary" style="padding:6px 12px;font-size:11px;" data-base-land="${b.id}">Start parked</button>
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
      <p style="margin-bottom:14px;font-size:12px;color:#94bac5;">
        Practice: start parked or fly a manual 3° approach. PgUp/PgDn adjusts throttle; K flaps, G gear, B brakes. Touch down aligned, then stop for 5 seconds for ground service. Airfield layouts are fictionalized.
      </p>
      <div style="max-height:55vh;overflow-y:auto;padding-right:6px;">
        ${baseCards}
      </div>
      <button class="primary" data-action="close" style="margin-top:12px;">Resume Flight</button>
      `
    );
  }

  drawILSGuidance(c, g, w, h) {
    const p = g.player;
    const near = getNearestIAFBase(p.position.x, p.position.z);
    if (!near || near.distance > 15000) return;
    const base = near.base;
    const guidance=approachInfo(base,p);

    c.save();
    // ILS status box on HUD
    const by = 80;
    c.fillStyle = "rgba(7, 24, 34, 0.75)";
    c.strokeStyle = p.gearDown ? "rgba(93, 242, 182, 0.6)" : "rgba(255, 121, 108, 0.6)";
    c.lineWidth = 1.5;
    c.fillRect(w * 0.5 - 170, by, 340, 86);
    c.strokeRect(w * 0.5 - 170, by, 340, 86);

    c.textAlign = "center";
    c.fillStyle = "#fff";
    c.font = "bold 11px ui-monospace, monospace";
    c.fillText(`ILS: ${base.shortName.toUpperCase()} · ${(near.distance / 1000).toFixed(1)} KM`, w * 0.5, by + 18);

    c.font = "10px ui-monospace, monospace";
    if (p.gearDown) {
      c.fillStyle = "#5df2b6";
      const altOver = Math.round(p.position.y - base.elevation);
      c.fillText(`GEAR DOWN [G] · AGL: ${altOver}M · ${p.isLanded ? "GROUND" : "APPROACH"}`, w * 0.5, by + 36);
    } else {
      c.fillStyle = "#ff796c";
      c.fillText("⚠ GEAR UP · PRESS [G] TO LOWER LANDING GEAR", w * 0.5, by + 36);
    }

    c.font="10px ui-monospace, monospace";c.fillStyle="#d7e9ed";
    c.fillText(`GS ${guidance.glideError>0?"HIGH":"LOW"} ${Math.abs(guidance.glideError).toFixed(0)}M · LOC ${guidance.crossTrack>0?"RIGHT":"LEFT"} ${Math.abs(guidance.crossTrack).toFixed(0)}M`,w*.5,by+53);
    c.fillText(`${p.landingMode?"MANUAL THROTTLE":"CRUISE"} · FLAPS ${p.flaps?"DOWN":"UP"} · SINK ${guidance.sink.toFixed(1)} M/S`,w*.5,by+68);
    c.fillText(p.isLanded?"PgUp POWER · ↑ ROTATE · B BRAKES":"J LANDING MODE · PgUp/PgDn POWER · K FLAPS",w*.5,by+81);

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
    const camDir = g.camera.getWorldDirection(new T.Vector3());
    const sunPos = g.world?.sun ? g.world.sun.position.clone() : new T.Vector3(-45000, 32000, -55000);
    const toSun = sunPos.clone().sub(g.camera.position).normalize();
    const dot = camDir.dot(toSun);
    if (dot <= 0.4) return;

    const sunProj = sunPos.project(g.camera);
    if (sunProj.z >= 1.0) return;

    const sx = (sunProj.x * 0.5 + 0.5) * w;
    const sy = (-sunProj.y * 0.5 + 0.5) * h;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const intensity = Math.pow((dot - 0.4) / 0.6, 2.0);

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

    for (const j of [...g.enemies, ...g.allies]) if (j.alive) plot(j.position, j.team === "ally" ? "#65d8ff" : "#ff796c", j === g.target);
    if (g.mission.id === 1) plot(BASE, "#ffdf84");
    for (const m of g.weapons.missiles) if (m.active && m.owner.team === "enemy") plot(m.p, "#ffcd5a");

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
}

export {
  UI
};
