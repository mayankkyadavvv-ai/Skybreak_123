import { readStored } from "../game/Storage.js";
import { isHeld, bindingLabel } from "../game/InputActions.js";
// MultiplayerUI: Manages all multiplayer UI screens, modals, in-game overlays, and spectator HUD
import * as T from "three";
import { JET_MODELS } from "../game/JetConfigs.js";
import { Jet } from "../game/Jet.js";

const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

export class MultiplayerUI {
  constructor(ui, game) {
    this.ui = ui;
    this.game = game;
    this.mp = null; // will be set from game.multiplayer

    this.scoreboardVisible = false;
    this.tabKeyDown = false;
    this.killFeedEntries = [];
    this.lastLobbyState = null;

    this.setupScoreboardListener();
  }

  get mpManager() {
    if (!this.mp && this.game?.multiplayer) {
      this.mp = this.game.multiplayer;
    }
    return this.mp;
  }

  setupScoreboardListener() {
    // Input owns key lifecycle; scoreboard state is sampled in update.
  }

  showMultiplayerMenu() {
    const mp = this.mpManager;
    if (!mp) return;

    this.ui.modalType = "multiplayer";
    const currentPilotName = mp.localName || readStored("skybreak_pilot_name") || "Ace Pilot";

    this.ui.panel(
      "MULTIPLAYER AIR COMBAT",
      "Engage live pilots in real-time air battles.",
      `
      <div class="mp-menu-container">
        <!-- Call Sign Section -->
        <div class="mp-callsign-bar">
          <label>
            <span>PILOT CALLSIGN:</span>
            <input type="text" id="mp-pilot-input" maxlength="16" value="${escapeHTML(currentPilotName)}" placeholder="Enter Callsign" />
          </label>
          <div class="mp-connection-status" id="mp-conn-badge">
            <span class="status-dot"></span>
            <span id="mp-conn-text">CONNECTING...</span>
          </div>
        </div>

        <!-- Mode Selection Tabs / Cards -->
        <div class="mp-mode-grid">
          <!-- 1v1 Duel -->
          <div class="mp-card" data-mp-quick="1v1">
            <div class="mp-card-badge">HOT</div>
            <div class="mp-card-icon">⚔️</div>
            <h3>1 VS 1 DUEL</h3>
            <p>Direct dogfight test against a single enemy ace. First to 3 kills wins.</p>
            <button class="primary mp-play-btn" data-mp-quick="1v1">FIND 1V1 MATCH ↗</button>
          </div>

          <!-- Team Battle 2v2 / 4v4 -->
          <div class="mp-card highlight" data-mp-quick="team_deathmatch">
            <div class="mp-card-badge blue">SQUADRON</div>
            <div class="mp-card-icon">⚡</div>
            <h3>TEAM BATTLE</h3>
            <p>Blue vs Red team combat (2v2, 3v3, 4v4). Coordinate missile barrages &amp; air superiority.</p>
            <button class="primary mp-play-btn" data-mp-quick="team_deathmatch">FIND TEAM BATTLE ↗</button>
          </div>

          <!-- Free Flight With Friends -->
          <div class="mp-card" data-mp-quick="free_flight">
            <div class="mp-card-badge green">CO-OP</div>
            <div class="mp-card-icon">✈️</div>
            <h3>FREE FLIGHT</h3>
            <p>Cruise the subcontinent skies with friends. Formation flying, aerobatics &amp; airbase landings.</p>
            <button class="primary mp-play-btn" data-mp-quick="free_flight">JOIN FREE SKIES ↗</button>
          </div>
        </div>

        <!-- Custom Match & Join By Code -->
        <div class="mp-custom-section">
          <div class="mp-custom-block">
            <h4>CUSTOM ROOM</h4>
            <p>Create a private battle room with custom kills, time limits, maps and weather.</p>
            <button class="secondary-btn" id="mp-create-room-btn">⚙️ CREATE CUSTOM ROOM</button>
          </div>

          <div class="mp-custom-block">
            <h4>JOIN BY CODE</h4>
            <p>Enter an 8-character room code from your squad leader (e.g. SKY-7821).</p>
            <div class="mp-join-input-wrap">
              <input type="text" id="mp-room-code-input" placeholder="SKY-XXXX" maxlength="8" autocomplete="off" />
              <button class="primary" id="mp-join-code-btn">JOIN ROOM ↗</button>
            </div>
          </div>
        </div>

        <div class="mp-custom-section">
          <div class="mp-custom-block">
            <h4>OFFLINE PRACTICE</h4>
            <p>Fly solo even when the multiplayer server is unavailable.</p>
            <button class="secondary-btn" id="mp-offline-duel-btn">⚔️ ACE DUEL VS AI</button>
            <button class="secondary-btn" id="mp-offline-free-btn">✈️ SOLO FREE FLIGHT</button>
          </div>
        </div>

        <div class="mp-menu-footer">
          <button class="link-btn" data-action="close">← BACK TO MAIN MENU</button>
        </div>
      </div>
      `
    );

    // Bind event listeners
    const connectionText = document.getElementById("mp-conn-text");
    const setConnection = (online) => {
      if (connectionText?.isConnected) connectionText.textContent = online ? "SERVER ONLINE" : "SERVER OFFLINE";
    };
    this.connectionListeners?.forEach((off) => off());
    this.connectionListeners = [mp.network.on("connected", () => setConnection(true)), mp.network.on("disconnected", () => setConnection(false)), mp.network.on("error", () => setConnection(false))];
    setConnection(mp.network.connected);
    const pilotInput = document.getElementById("mp-pilot-input");
    if (pilotInput) {
      pilotInput.addEventListener("change", () => {
        mp.setPilotName(pilotInput.value);
        this.ui.message(`Callsign updated: ${mp.localName}`, 2.0);
      });
    }

    // Quick Match buttons
    document.querySelectorAll("[data-mp-quick]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.mpQuick;
        if (pilotInput?.value) mp.setPilotName(pilotInput.value);
        this.startMatchmaking(mode);
      });
    });

    // Create Room button
    const createBtn = document.getElementById("mp-create-room-btn");
    if (createBtn) {
      createBtn.addEventListener("click", () => {
        if (pilotInput?.value) mp.setPilotName(pilotInput.value);
        this.showCreateRoomModal();
      });
    }

    document.getElementById("mp-offline-duel-btn")?.addEventListener("click", () => this.launchInstantDuel("1v1"));
    document.getElementById("mp-offline-free-btn")?.addEventListener("click", () => this.launchInstantDuel("free_flight"));

    // Join Code button
    const joinBtn = document.getElementById("mp-join-code-btn");
    const codeInput = document.getElementById("mp-room-code-input");
    if (joinBtn && codeInput) {
      joinBtn.addEventListener("click", () => {
        const code = codeInput.value.trim().toUpperCase();
        if (!code || code.length < 5) {
          this.ui.message("Please enter a valid room code (e.g. SKY-1234)", 2.5);
          return;
        }
        if (pilotInput?.value) mp.setPilotName(pilotInput.value);
        this.joinRoomByCode(code);
      });
    }

    // Connect to network if not already connected
    mp.network.connect().then(setConnection);
  }

  async ensureConnected() {
    const network = this.mpManager?.network;
    if (network?.connected || await network?.connect()) return true;
    this.ui.message("Multiplayer server unavailable. Start the server or configure its WebSocket URL.", 4);
    return false;
  }

  showCreateRoomModal() {
    this.ui.modalType = "create_room";
    this.ui.panel(
      "CREATE PRIVATE SQUADRON ROOM",
      "Configure match rules and flight parameters.",
      `
      <div class="mp-create-form">
        <label class="setting">
          <span>Game Mode</span>
          <select id="mp-cfg-mode">
            <option value="1v1">1 vs 1 Duel</option>
            <option value="team_deathmatch" selected>Team Squadron Battle (Up to 8 Players)</option>
            <option value="free_flight">Free Flight with Friends (Peaceful)</option>
          </select>
        </label>

        <label class="setting">
          <span>Match Win Condition</span>
          <select id="mp-cfg-kills">
            <option value="1">First to 1 Kill (Sudden Death)</option>
            <option value="3">First to 3 Kills</option>
            <option value="5" selected>First to 5 Kills (Standard)</option>
            <option value="10">First to 10 Kills (Endurance)</option>
            <option value="0">Timed Battle Only</option>
          </select>
        </label>

        <label class="setting">
          <span>Time Limit</span>
          <select id="mp-cfg-time">
            <option value="180">3 Minutes (Fast Pace)</option>
            <option value="300" selected>5 Minutes (Standard)</option>
            <option value="600">10 Minutes (Extended)</option>
            <option value="0">Unlimited Time</option>
          </select>
        </label>

        <label class="setting">
          <span>Atmosphere &amp; Time of Day</span>
          <select id="mp-cfg-tod">
            <option value="day" selected>Day (Clear Daylight)</option>
            <option value="sunset">Sunset (Golden Hour Dusk)</option>
            <option value="night">Night (Dark Starry Skies + Afterburner Glow)</option>
          </select>
        </label>

        <label class="setting">
          <span>Weather Conditions</span>
          <select id="mp-cfg-weather">
            <option value="clear" selected>Clear Skies (Optimum Visibility)</option>
            <option value="storm">Thunderstorm (Dynamic Rain &amp; Lightning)</option>
          </select>
        </label>

        <label class="setting">
          <span>Friendly Fire</span>
          <select id="mp-cfg-ff">
            <option value="false" selected>Disabled (Protected)</option>
            <option value="true">Enabled (Realistic Combat)</option>
          </select>
        </label>

        <div class="mp-form-actions" style="margin-top:24px;display:flex;gap:12px;">
          <button class="primary" id="mp-confirm-create-btn" style="flex:2;">CREATE SQUADRON ROOM ↗</button>
          <button class="secondary-btn" id="mp-back-menu-btn" style="flex:1;">CANCEL</button>
        </div>
      </div>
      `
    );

    document.getElementById("mp-back-menu-btn")?.addEventListener("click", () => {
      this.showMultiplayerMenu();
    });

    document.getElementById("mp-confirm-create-btn")?.addEventListener("click", () => {
      const mode = document.getElementById("mp-cfg-mode").value;
      const maxKills = parseInt(document.getElementById("mp-cfg-kills").value, 10);
      const timeLimit = parseInt(document.getElementById("mp-cfg-time").value, 10);
      const timeOfDay = document.getElementById("mp-cfg-tod").value;
      const weather = document.getElementById("mp-cfg-weather").value;
      const friendlyFire = document.getElementById("mp-cfg-ff").value === "true";

      const options = {
        mode,
        killLimit: maxKills,
        matchDuration: timeLimit,
        timeOfDay,
        weather,
        friendlyFire,
        maxPlayers: mode === "1v1" ? 2 : 8
      };

      this.createRoom(options);
    });
  }

  async startMatchmaking(mode) {
    const mp = this.mpManager;
    if (!mp) return;
    if (!await this.ensureConnected()) return;
    const queueMode = mode === "team_deathmatch" ? "2v2" : mode;

    let seconds = 0;
    const isFree = mode === "free_flight";
    const modeName = mode === "1v1" ? "1 VS 1 DUEL" : isFree ? "FREE FLIGHT" : "TEAM SQUADRON BATTLE";

    this.ui.panel(
      "PUBLIC SQUADRON MATCHMAKING",
      `Searching for active pilots in ${modeName}...`,
      `
      <div class="mp-matchmaking-box">
        <div class="mp-spinner"></div>
        <div class="mp-queue-status" id="mp-queue-timer">SCANNING REGIONAL RADAR: 00:01</div>
        <p id="mp-match-desc">Searching for live pilots in queue. If no human pilot is online right now, you can engage an Ace Duel immediately or invite a friend!</p>
        
        <div class="mp-matchmake-actions" style="display:flex;flex-direction:column;gap:10px;width:100%;max-width:380px;margin:15px auto 0;">
          <button class="primary" id="mp-instant-duel-btn" style="background:#0284c7!important;border-color:#38bdf8!important;justify-content:center;gap:8px;">
            ${isFree ? "✈️ LAUNCH FREE FLIGHT NOW ▶" : "⚔️ ENGAGE ACE DUEL (INSTANT DOGFIGHT) ▶"}
          </button>
          <button class="secondary-btn" id="mp-create-squad-btn">
            CREATE PRIVATE ROOM TO INVITE FRIEND (SKY-XXXX)
          </button>
          <button class="secondary-btn" id="mp-cancel-matchmake">CANCEL SEARCH</button>
        </div>
      </div>
      `
    );

    const timerEl = document.getElementById("mp-queue-timer");
    const interval = setInterval(() => {
      seconds++;
      const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
      const ss = String(seconds % 60).padStart(2, "0");
      if (timerEl) timerEl.textContent = `SCANNING REGIONAL RADAR: ${mm}:${ss}`;
      if (seconds === 6) {
        const desc = document.getElementById("mp-match-desc");
        if (desc) desc.innerHTML = `<span style="color:#ffaa44;font-weight:bold;">No other pilot found in queue yet.</span><br>Click above to engage an Ace Combat Duel immediately or create a private room!`;
      }
    }, 1000);

    const cleanup = () => {
      clearInterval(interval);
      mp.network.send("cancel_quick_match");
      mp.network.off("room_joined", onJoined);
    };

    const onJoined = (msg) => {
      cleanup();
      this.showLobby(msg);
    };
    mp.network.on("room_joined", onJoined);

    document.getElementById("mp-cancel-matchmake")?.addEventListener("click", () => {
      cleanup();
      this.showMultiplayerMenu();
    });

    document.getElementById("mp-instant-duel-btn")?.addEventListener("click", () => {
      cleanup();
      this.launchInstantDuel(mode);
    });

    document.getElementById("mp-create-squad-btn")?.addEventListener("click", () => {
      cleanup();
      this.createRoom({ mode, killLimit: mode === "1v1" ? 3 : 5, matchDuration: mode === "free_flight" ? 0 : 300 });
    });

    mp.network.send("quick_match", { mode: queueMode });
  }

  async createRoom(options) {
    const mp = this.mpManager;
    if (!mp) return;
    if (!await this.ensureConnected()) return;

    this.ui.message("Establishing squadron room...", 2.0);

    const onJoined = (msg) => {
      mp.network.off("room_joined", onJoined);
      this.showLobby(msg);
    };
    mp.network.on("room_joined", onJoined);

    mp.network.send("create_room", {
      options,
      jetModel: this.game.player.modelId || "x17",
      livery: this.game.jetConfig?.camo || "grey"
    });
  }

  launchInstantDuel(mode = "1v1") {
    this.ui.closePanel();
    this.game.audio?.init?.();

    // Clear single player objects
    for (const j of [...this.game.enemies, ...this.game.allies]) {
      this.game.scene.remove(j.model);
    }
    this.game.enemies = [];
    this.game.allies = [];
    this.game.weapons.clear();
    this.game.effects.clear();
    this.game.resetSessionCounters();

    const isFree = mode === "free_flight";

    // Setup 1v1 Duel Mission
    this.game.mission = {
      id: "duel",
      name: isFree ? "FREE FLIGHT SQUADRON" : "1 VS 1 ACE COMBAT DUEL",
      objective: isFree ? "Cruise the skies freely. No enemies or boundaries." : "Destroy the hostile Ace Fighter.",
      freeFlight: isFree,
      fighters: isFree ? 0 : 1,
      bombers: 0,
      allies: 0
    };

    // Reset player position and loadout
    this.game.player.position.set(0, 1600, 3200);
    this.game.player.quaternion.identity();
    this.game.player.velocity.set(0, 0, -240);
    this.game.player.speed = 240;
    this.game.player.throttle = 0.6;
    this.game.player.hp = this.game.player.stats?.maxHp || 100;
    this.game.player.maxHp = this.game.player.hp;
    this.game.player.alive = true;
    this.game.player.isLanded = false;
    this.game.player.gearDown = false;
    this.game.player.model.visible = true;
    this.game.lastPlayerPos.copy(this.game.player.position);
    this.game.cannonLeft = this.game.player.stats?.cannon || 1200;
    this.game.missilesLeft = this.game.player.stats?.missiles || 6;
    this.game.flaresLeft = this.game.player.stats?.flares || 20;

    // Spawn Hostile Ace Fighter
    if (!isFree) {
      const enemy = new Jet("enemy", false, {
        modelId: "su57",
        liveryId: "desert"
      });
      // Spawn 3.5km in front, closing head-on
      enemy.position.set(0, 1650, -2500);
      enemy.quaternion.setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI);
      enemy.velocity.set(0, 0, 240);
      enemy.speed = 240;
      enemy.hp = 100;
      enemy.alive = true;
      enemy.name = "Ace Bandit Viper";
      this.game.enemies.push(enemy);
      this.game.scene.add(enemy.model);
      this.game.target = enemy;
    }

    this.game.state = "playing";
    this.game.ui.inGame();
    this.game.cam.mode = "chase";
    this.game.cam.reset(this.game.player);
    this.ui.message(isFree ? "FREE FLIGHT · SKIES ARE CLEAR ✈️" : "⚔️ 1V1 ACE DUEL · ENGAGE HOSTILE!", 4.0);
  }

  async joinRoomByCode(roomCode) {
    const mp = this.mpManager;
    if (!mp) return;
    if (!await this.ensureConnected()) return;

    this.ui.message(`Connecting to room ${roomCode}...`, 2.0);

    const onJoined = (msg) => {
      mp.network.off("room_joined", onJoined);
      mp.network.off("join_error", onError);
      this.showLobby(msg);
    };
    mp.network.on("room_joined", onJoined);

    const onError = (msg) => {
      mp.network.off("join_error", onError);
      mp.network.off("room_joined", onJoined);
      this.ui.message(`Room Join Error: ${msg.reason || "Failed to join room"}`, 3.5);
    };
    mp.network.on("join_error", onError);

    mp.network.send("join_room", {
      code: roomCode,
      jetModel: this.game.player.modelId || "x17",
      livery: this.game.jetConfig?.camo || "grey"
    });
  }

  showLobby(lobbyData) {
    this.ui.modalType = "lobby";
    this.lastLobbyState = lobbyData;
    const mp = this.mpManager;

    // Listen for lobby update events from server
    this.lobbyUnsubscribe?.();
    this.lobbyUnsubscribe = mp.network.on("lobby_update", (msg) => {
      if (msg.roomCode !== mp.roomCode) return;
      this.lastLobbyState = msg;
      if (mp.matchStatus === "ended" && msg.state === "lobby") {
        mp.matchStatus = "lobby";
        this.showLobby(msg);
        return;
      }
      this.renderLobbyRoster(msg);
    });

    const room = lobbyData.room || lobbyData;
    const code = room.roomCode || room.code || mp.roomCode;
    const isHost = room.hostId === mp.localId;
    mp.isHost = isHost;
    mp.roomCode = code;

    const opts = room.options || {};
    const modeName = opts.mode === "1v1" ? "1 VS 1 DUEL" : opts.mode === "free_flight" ? "FREE FLIGHT CO-OP" : "TEAM SQUADRON BATTLE";

    this.ui.panel(
      `SQUADRON LOBBY · ${modeName}`,
      `Room Code: <b class="room-code-highlight">${escapeHTML(code)}</b> <button class="copy-code-btn" id="mp-copy-code-btn">📋 COPY CODE</button>`,
      `
      <div class="mp-lobby-container">
        <!-- Match Settings Pill Banner -->
        <div class="mp-lobby-settings-bar">
          <span>🎯 KILLS: <b>${opts.killLimit ? opts.killLimit : "UNLIMITED"}</b></span>
          <span>⏱️ TIME: <b>${opts.matchDuration ? Math.round(opts.matchDuration / 60) + " MIN" : "UNLIMITED"}</b></span>
          <span>🌤️ SKY: <b>${escapeHTML((opts.timeOfDay || "DAY").toUpperCase())}</b></span>
          <span>⚡ WEATHER: <b>${escapeHTML((opts.weather || "CLEAR").toUpperCase())}</b></span>
          <span>🛡️ FF: <b>${opts.friendlyFire ? "ON" : "OFF"}</b></span>
        </div>

        <!-- Dual Team Roster Grid -->
        <div class="mp-roster-grid">
          <!-- Blue Team -->
          <div class="mp-team-column blue">
            <div class="mp-team-header">
              <span class="mp-team-dot blue"></span>
              <h4>BLUE SQUADRON</h4>
              <button class="mp-switch-btn blue" id="mp-join-blue-btn">JOIN BLUE</button>
            </div>
            <div class="mp-slots-list" id="mp-slots-blue"></div>
          </div>

          <!-- Red Team -->
          <div class="mp-team-column red">
            <div class="mp-team-header">
              <span class="mp-team-dot red"></span>
              <h4>RED SQUADRON</h4>
              <button class="mp-switch-btn red" id="mp-join-red-btn">JOIN RED</button>
            </div>
            <div class="mp-slots-list" id="mp-slots-red"></div>
          </div>
        </div>

        <!-- Jet Selection & Readiness Bar -->
        <div class="mp-lobby-footer-bar">
          <div class="mp-player-loadout">
            <span>SELECTED JET:</span>
            <b id="mp-my-jet-label">${(JET_MODELS[this.game.player.modelId]?.name || "Kestrel X-17").toUpperCase()}</b>
            <button class="link-btn" id="mp-change-jet-btn">✈️ HANGAR &amp; JETS</button>
          </div>

          <div class="mp-lobby-actions">
            <button class="ready-btn" id="mp-toggle-ready-btn">MARK READY ⚔️</button>
            ${isHost ? '<button class="primary launch-match-btn" id="mp-host-start-btn">LAUNCH BATTLE ▶</button>' : ""}
            <button class="secondary-btn" id="mp-leave-lobby-btn">LEAVE ROOM</button>
          </div>
        </div>
      </div>
      `
    );

    // Bind Copy Code
    document.getElementById("mp-copy-code-btn")?.addEventListener("click", () => {
      try {
        navigator.clipboard.writeText(code);
        this.ui.message(`Room code ${code} copied to clipboard! 📋`, 2.5);
      } catch {
        this.ui.message(`Room code: ${code}`, 3.0);
      }
    });

    // Team switch buttons
    document.getElementById("mp-join-blue-btn")?.addEventListener("click", () => {
      mp.network.send("set_team", { team: "blue" });
    });
    document.getElementById("mp-join-red-btn")?.addEventListener("click", () => {
      mp.network.send("set_team", { team: "red" });
    });

    // Jet change button (opens Hangar)
    document.getElementById("mp-change-jet-btn")?.addEventListener("click", () => {
      this.ui.showHangar();
    });

    // Ready toggle button
    let isReady = Boolean(room.players?.find((p) => p.id === mp.localId)?.ready);
    const readyBtn = document.getElementById("mp-toggle-ready-btn");
    if (readyBtn) {
      readyBtn.classList.toggle("is-ready", isReady);
      readyBtn.textContent = isReady ? "READY ✓" : "MARK READY ⚔️";
    }
    readyBtn?.addEventListener("click", () => {
      isReady = !isReady;
      readyBtn.classList.toggle("is-ready", isReady);
      readyBtn.textContent = isReady ? "READY ✓" : "MARK READY ⚔️";
      mp.network.send("set_ready", { ready: isReady });
    });

    // Host Start button
    const hostStartBtn = document.getElementById("mp-host-start-btn");
    hostStartBtn?.addEventListener("click", () => {
      mp.network.send("start_match");
    });

    // Leave room button
    document.getElementById("mp-leave-lobby-btn")?.addEventListener("click", () => {
      this.lobbyUnsubscribe?.();
      mp.network.send("leave_room");
      this.showMultiplayerMenu();
    });

    // Initial roster render
    this.renderLobbyRoster(room);
  }

  renderLobbyRoster(roomData) {
    const blueContainer = document.getElementById("mp-slots-blue");
    const redContainer = document.getElementById("mp-slots-red");
    if (!blueContainer || !redContainer) return;

    const players = roomData.players || [];
    const bluePlayers = players.filter((p) => p.team === "blue");
    const redPlayers = players.filter((p) => p.team === "red");
    const maxTeamSize = Math.max(1, Math.floor((roomData.options?.maxPlayers || 8) / 2));

    const renderSlot = (p, isMe) => {
      if (!p) {
        return `<div class="mp-slot empty"><span>[ OPEN SLOT ]</span></div>`;
      }
      const jetName = JET_MODELS[p.jetModel]?.name || p.jetModel || "X-17";
      return `
        <div class="mp-slot ${isMe ? "is-me" : ""} ${p.ready ? "ready" : ""}">
          <div class="slot-pilot">
            <span class="pilot-badge">${p.isHost ? "👑 HOST" : "PILOT"}</span>
            <strong>${escapeHTML(p.name)}${isMe ? " (YOU)" : ""}</strong>
          </div>
          <div class="slot-jet">${escapeHTML(jetName)}</div>
          <div class="slot-ping">${p.ping || 30}ms</div>
          <div class="slot-status ${p.ready ? "ready" : ""}">${p.ready ? "READY ✓" : "WAITING"}</div>
        </div>
      `;
    };

    let blueHtml = "";
    for (let i = 0; i < maxTeamSize; i++) {
      const p = bluePlayers[i];
      blueHtml += renderSlot(p, p?.id === this.mpManager?.localId);
    }
    blueContainer.innerHTML = blueHtml;

    let redHtml = "";
    for (let i = 0; i < maxTeamSize; i++) {
      const p = redPlayers[i];
      redHtml += renderSlot(p, p?.id === this.mpManager?.localId);
    }
    redContainer.innerHTML = redHtml;

    // Update host button enablement
    const hostStartBtn = document.getElementById("mp-host-start-btn");
    if (hostStartBtn) {
      const allReady = players.length >= 2 && players.every((p) => p.ready || p.isHost);
      hostStartBtn.disabled = !allReady;
    }
  }

  // Update in-game multiplayer HUD overlays
  update(dt) {
    const mp = this.mpManager;
    const visible = !!(mp?.active && this.game?.state === 'playing' && !this.ui.modalType && isHeld(this.game.input,'scoreboard',this.game.settings));
    if (visible !== this.scoreboardVisible) {
      this.scoreboardVisible = visible;
      if (visible) this.renderScoreboardOverlay();
      else { const element = document.getElementById('mp-scoreboard-overlay'); if (element) element.hidden = true; }
    }

    if (!mp?.active) {
      const hudHdr = document.getElementById("mp-header");
      if (hudHdr) hudHdr.remove();
      const respawnBanner = document.getElementById("mp-respawn-banner");
      if (respawnBanner) respawnBanner.remove();
      return;
    }

    this.ensureInGameHudElements();
    this.updateInGameHeader();
    this.updateRespawnAndSpectatorBanner();
    this.renderKillFeed();
  }

  ensureInGameHudElements() {
    const hud = this.ui.hudEl;
    if (!hud) return;

    if (!document.getElementById("mp-header")) {
      const header = document.createElement("div");
      header.id = "mp-header";
      header.className = "mp-header";
      header.innerHTML = `
        <div class="mp-team-score blue">
          <span class="mp-team-title">BLUE SQUADRON</span>
          <strong id="mp-score-val-blue">0</strong>
        </div>
        <div class="mp-match-center">
          <div class="mp-match-mode" id="mp-match-mode-text">1 VS 1 DUEL</div>
          <div class="mp-match-timer" id="mp-match-timer-text">05:00</div>
        </div>
        <div class="mp-team-score red">
          <strong id="mp-score-val-red">0</strong>
          <span class="mp-team-title">RED SQUADRON</span>
        </div>
      `;
      hud.appendChild(header);
    }

    if (!document.getElementById("mp-kill-feed")) {
      const kf = document.createElement("div");
      kf.id = "mp-kill-feed";
      kf.className = "mp-kill-feed";
      hud.appendChild(kf);
    }

    if (!document.getElementById("mp-respawn-banner")) {
      const banner = document.createElement("div");
      banner.id = "mp-respawn-banner";
      banner.className = "mp-respawn-banner";
      banner.hidden = true;
      hud.appendChild(banner);
    }
  }

  updateInGameHeader() {
    const mp = this.mpManager;
    if (!mp) return;

    const blueEl = document.getElementById("mp-score-val-blue");
    const redEl = document.getElementById("mp-score-val-red");
    if (blueEl) blueEl.textContent = mp.teamScores?.blue ?? 0;
    if (redEl) redEl.textContent = mp.teamScores?.red ?? 0;

    const modeEl = document.getElementById("mp-match-mode-text");
    if (modeEl && mp.matchOptions) {
      const mode = mp.matchOptions.mode;
      modeEl.textContent = mode === "1v1" ? "1 VS 1 DUEL" : mode === "free_flight" ? "FREE FLIGHT CO-OP" : "TEAM SQUADRON BATTLE";
    }
    const timerEl = document.getElementById("mp-match-timer-text");
    if (timerEl) {
      const rem = mp.timeRemaining;
      timerEl.textContent = Number.isFinite(rem) ? `${String(Math.floor(rem / 60)).padStart(2, "0")}:${String(rem % 60).padStart(2, "0")}` : "FREE FLIGHT";
    }
  }

  updateRespawnAndSpectatorBanner() {
    const mp = this.mpManager;
    const banner = document.getElementById("mp-respawn-banner");
    if (!banner || !mp) return;

    if (!this.game.player.alive && mp.active) {
      banner.hidden = false;
      const target = mp.spectator.getCurrentTarget();
      const targetName = target ? target.name : "Friendly Squadron";
      banner.innerHTML = `
        <div class="respawn-title">AIRCRAFT DESTROYED</div>
        <div class="respawn-killer">${mp.lastKillerName ? `Shot down by <b style="color:#ff7766;">${escapeHTML(mp.lastKillerName)}</b> [${escapeHTML(mp.lastWeapon?.toUpperCase() || "WEAPON")}]` : "Crash / Collision"}</div>
        <div class="respawn-countdown">RESPAWNING IN ${Math.max(1, Math.ceil(mp.respawnCountdown))}s</div>
        <div class="spectator-bar">SPECTATING: <b style="color:#65d8ff;">${escapeHTML(targetName)}</b> · Press <kbd>Q</kbd> / <kbd>E</kbd> to cycle aircraft</div>
      `;
    } else {
      banner.hidden = true;
    }
  }

  renderKillFeed() {
    const mp = this.mpManager;
    const feedContainer = document.getElementById("mp-kill-feed");
    if (!feedContainer || !mp) return;

    const now = Date.now();
    const recentKills = mp.killFeed.filter((k) => now - k.timestamp < 6000);

    feedContainer.innerHTML = recentKills
      .map((k) => `
        <div class="kill-entry">
          <span class="killer">${escapeHTML(k.killerName)}</span>
          <span class="weapon-icon">[${escapeHTML(k.weapon)}]</span>
          <span class="victim">${escapeHTML(k.victimName)}</span>
          ${k.assistName ? `<span class="assist">+ ${escapeHTML(k.assistName)}</span>` : ""}
        </div>
      `)
      .join("");
  }

  renderScoreboardOverlay() {
    let overlay = document.getElementById("mp-scoreboard-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "mp-scoreboard-overlay";
      overlay.className = "mp-scoreboard-overlay";
      document.body.appendChild(overlay);
    }

    const mp = this.mpManager;
    if (!mp) return;

    const allPlayers = [
      {
        id: mp.localId,
        name: mp.localName,
        team: mp.localTeam,
        jetModel: this.game.player.modelId || "x17",
        hp: this.game.player.hp,
        alive: this.game.player.alive,
        kills: this.game.stats?.kills || 0,
        deaths: 0,
        assists: 0,
        score: this.game.score || 0,
        ping: mp.network.ping || 30
      },
      ...Array.from(mp.remotePlayers.values())
    ];

    const blueTeam = allPlayers.filter((p) => p.team === "blue");
    const redTeam = allPlayers.filter((p) => p.team === "red");

    const renderTable = (teamList, colorHex) => `
      <table class="mp-score-table">
        <thead>
          <tr>
            <th>PILOT</th>
            <th>JET</th>
            <th>KILLS</th>
            <th>DEATHS</th>
            <th>ASSISTS</th>
            <th>SCORE</th>
            <th>PING</th>
          </tr>
        </thead>
        <tbody>
          ${teamList
            .map(
              (p) => `
            <tr class="${p.id === mp.localId ? "is-me" : ""} ${!p.alive ? "is-dead" : ""}">
              <td><span class="alive-dot ${p.alive ? "alive" : "dead"}"></span> ${escapeHTML(p.name)}${p.id === mp.localId ? " (YOU)" : ""}</td>
              <td>${escapeHTML((p.jetModel || "x17").toUpperCase())}</td>
              <td><b>${p.kills || 0}</b></td>
              <td>${p.deaths || 0}</td>
              <td>${p.assists || 0}</td>
              <td class="score-col">${p.score || 0}</td>
              <td>${p.ping || 30}ms</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `;

    overlay.innerHTML = `
      <div class="mp-scoreboard-modal">
        <div class="scoreboard-header">
          <h3>SQUADRON ENGAGEMENT SCOREBOARD</h3>
          <span>HOLD [TAB] TO VIEW · RELEASE TO CLOSE</span>
        </div>
        <div class="teams-container">
          <div class="team-block blue">
            <h4 style="color:#65d8ff;">BLUE SQUADRON (${mp.teamScores?.blue || 0})</h4>
            ${renderTable(blueTeam, "#65d8ff")}
          </div>
          <div class="team-block red">
            <h4 style="color:#ff796c;">RED SQUADRON (${mp.teamScores?.red || 0})</h4>
            ${renderTable(redTeam, "#ff796c")}
          </div>
        </div>
      </div>
    `;

    overlay.hidden = !this.scoreboardVisible;
  }

  showMultiplayerResult(resultData) {
    const mp = this.mpManager;
    this.ui.modalType = "mp_result";

    const winner = resultData.winner?.team || resultData.winner;
    const isWinner = winner === mp.localTeam;
    const isDraw = winner === "draw";

    const title = isDraw ? "TACTICAL DRAW" : isWinner ? "VICTORY · SQUADRON ACCOMPLISHED" : "DEFEAT · AIR DEFENSE BREACHED";
    const sub = isDraw ? "Time elapsed with equal score." : isWinner ? "Your squadron dominated the airspace!" : "Enemy aircraft secured air superiority.";

    this.ui.panel(
      title,
      sub,
      `
      <div class="mp-result-container">
        <div class="mp-result-banner ${isWinner ? "victory" : "defeat"}">
          <h2>${isWinner ? "🏆 VICTORY" : isDraw ? "DRAW" : "DEFEAT"}</h2>
          <div class="final-score-line">
            <span style="color:#65d8ff;">BLUE: ${resultData.finalScores?.blue ?? mp.teamScores.blue}</span>
            <span class="vs-divider">VS</span>
            <span style="color:#ff796c;">RED: ${resultData.finalScores?.red ?? mp.teamScores.red}</span>
          </div>
        </div>

        <div class="mp-post-actions" style="margin-top:28px;display:flex;gap:12px;">
          ${mp.isHost ? '<button class="primary" id="mp-rematch-btn" style="flex:2;">RETURN SQUADRON TO LOBBY 🔄</button>' : '<span>Waiting for host to restart the lobby.</span>'}
          <button class="secondary-btn" id="mp-post-lobby-btn" style="flex:1;">RETURN TO LOBBY</button>
        </div>
      </div>
      `
    );

    document.getElementById("mp-rematch-btn")?.addEventListener("click", () => {
      mp.network.send("rematch");
      this.ui.message("Returning squadron to the lobby...", 2.5);
    });

    document.getElementById("mp-post-lobby-btn")?.addEventListener("click", () => {
      mp.leaveMatch();
      this.showMultiplayerMenu();
    });
  }
}
