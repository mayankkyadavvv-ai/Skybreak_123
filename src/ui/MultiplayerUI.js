import { readStored } from "../game/Storage.js";
import { isHeld, bindingLabel } from "../game/InputActions.js";
// MultiplayerUI: Manages all multiplayer UI screens, modals, in-game overlays, and spectator HUD
import * as T from "three";
import { JET_MODELS } from "../game/JetConfigs.js";
import { Jet } from "../game/Jet.js";
import { parseInvite, inviteURL, inviteQR, PARTY_MODES, ROOM_CODE } from '../multiplayer/Invites.js';
import { activitySummary } from './ActivityDisplay.js';

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
    this.pendingInvite = parseInvite(); this.requestGeneration = 0; this.pendingRoomCleanup = null;
    this.voiceHeld = false; this.hudSignature = '';

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

    this.pendingRoomCleanup?.();
    this.queueCleanup?.();
    this.ui.modalType = "multiplayer";
    const currentPilotName = mp.localName || readStored("skybreak_pilot_name") || "Ace Pilot";

    this.ui.panel(
      "PLAY WITH FRIENDS",
      "Private squadron, shared missions and objective battles.",
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

        ${this.pendingInvite ? `<div class="mp-invite-notice" role="status">Squadron invitation: <strong>${escapeHTML(this.pendingInvite)}</strong>. Choose a callsign, then join below.</div>` : ''}
        <!-- Mode Selection Tabs / Cards -->
        <div class="mp-mode-grid">
          <div class="mp-card highlight"><div class="mp-card-badge blue">2–4 PILOTS</div><div class="mp-card-icon">✈</div><h3>OPEN SKIES CO-OP</h3><p>Fight a synchronized Aegis Strait sortie with your friends and AI squadmates.</p><button class="primary" id="mp-create-coop">CREATE CO-OP PARTY</button></div>
          <div class="mp-card"><div class="mp-card-badge">OBJECTIVE</div><div class="mp-card-icon">◎</div><h3>AIR SUPERIORITY</h3><p>Capture and defend the airspace. Team objectives decide the match.</p><button class="primary" id="mp-create-zone">CREATE ZONE BATTLE</button></div>
          <!-- 1v1 Duel -->
          <div class="mp-card">
            <div class="mp-card-badge">HOT</div>
            <div class="mp-card-icon">⚔️</div>
            <h3>1 VS 1 DUEL</h3>
            <p>Direct dogfight test against a single enemy ace. First to 3 kills wins.</p>
            <button class="primary mp-play-btn" data-mp-quick="1v1">FIND 1V1 MATCH ↗</button>
          </div>

          <!-- Team Battle 2v2 / 4v4 -->
          <div class="mp-card highlight">
            <div class="mp-card-badge blue">SQUADRON</div>
            <div class="mp-card-icon">⚡</div>
            <h3>TEAM BATTLE</h3>
            <p>Blue vs Red team combat (2v2, 3v3, 4v4). Coordinate missile barrages &amp; air superiority.</p>
            <button class="primary mp-play-btn" data-mp-quick="team_deathmatch">FIND TEAM BATTLE ↗</button>
          </div>

          <!-- Free Flight With Friends -->
          <div class="mp-card">
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
              <input type="text" id="mp-room-code-input" placeholder="SKY-XXXX" maxlength="8" autocomplete="off" value="${escapeHTML(this.pendingInvite || '')}" />
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

    document.getElementById('mp-create-coop')?.addEventListener('click', () => { mp.setPilotName(pilotInput.value); this.createRoom({ mode: 'open_skies_coop', maxPlayers: 4, map: 'aegis', matchDuration: 900 }); });
    document.getElementById('mp-create-zone')?.addEventListener('click', () => { mp.setPilotName(pilotInput.value); this.createRoom({ mode: 'air_superiority', maxPlayers: 8, map: 'aegis', matchDuration: 600 }); });
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
        if (!ROOM_CODE.test(code)) {
          this.ui.message("Please enter a valid room code (e.g. SKY-1234)", 2.5);
          return;
        }
        if (pilotInput?.value) mp.setPilotName(pilotInput.value);
        this.joinRoomByCode(code);
      });
    }

    // Connect to network if not already connected
    mp.network.connect().then(setConnection);
    if (this.pendingInvite) codeInput?.focus();
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
            <option value="open_skies_coop">Open Skies Co-op (2–4 Pilots)</option>
            <option value="air_superiority">Air Superiority (Objective / Up to 8)</option>
            <option value="1v1">1 vs 1 Duel</option>
            <option value="team_deathmatch" selected>Team Squadron Battle (Up to 8 Players)</option>
            <option value="free_flight">Free Flight with Friends (Peaceful)</option>
          </select>
        </label>

        <label class="setting"><span>Battlefield</span><select id="mp-cfg-map"><option value="aegis">Aegis Strait</option><option value="frontier">Frontier</option></select></label>
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
        maxPlayers: mode === "1v1" ? 2 : mode === 'open_skies_coop' ? 4 : 8,
        map: document.getElementById('mp-cfg-map').value
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

    this.queueCleanup?.();
    const cleanup = () => {
      clearInterval(interval); this.queueCleanup = null;
      mp.network.send("cancel_quick_match");
      mp.network.off("room_joined", onJoined);
    };

    this.queueCleanup = cleanup;
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

  async requestRoom(type, payload) {
    const mp = this.mpManager; if (!mp || !await this.ensureConnected()) return;
    this.pendingRoomCleanup?.();
    const generation = ++this.requestGeneration;
    let timer; const unsubscribe = [];
    const cleanup = () => { clearTimeout(timer); unsubscribe.forEach(off => off()); if (generation === this.requestGeneration) this.pendingRoomCleanup = null; };
    this.pendingRoomCleanup = cleanup;
    unsubscribe.push(mp.network.on('room_joined', msg => { cleanup(); this.pendingInvite = null; if (msg.room?.state === 'lobby') mp.network.send('set_aircraft', { jetModel: this.game.player.modelId || 'x17', liveryId: this.game.jetConfig?.liveryId || 'grey' }); this.showLobby(msg); }));
    for (const event of ['join_error', 'room_error', 'action_error']) unsubscribe.push(mp.network.on(event, msg => { cleanup(); this.ui.message(msg.reason || msg.message || 'Room action rejected. Retry from the friends menu.', 5); }));
    timer = setTimeout(() => { cleanup(); this.ui.message('Room request timed out. Check the connection and retry.', 5); }, 8000);
    this.ui.message(type === 'create_room' ? 'Creating your squadron…' : 'Joining squadron…', 2);
    if (!mp.network.send(type, { ...payload, jetModel: this.game.player.modelId || 'x17', livery: this.game.jetConfig?.camo || 'grey' })) { cleanup(); this.ui.message('Connection unavailable. Retry when server is online.', 4); }
  }

  async createRoom(options) { return this.requestRoom('create_room', { options }); }

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
    const code = String(roomCode || '').trim().toUpperCase();
    if (!ROOM_CODE.test(code)) { this.ui.message('Enter a valid SKY-XXXX room code.', 3); return; }
    return this.requestRoom('join_room', { code });
  }

  showLobby(lobbyData) {
    this.pendingRoomCleanup?.(); this.queueCleanup?.();
    this.ui.modalType = "lobby";
    this.lastLobbyState = lobbyData;
    const mp = this.mpManager;

    // Listen for lobby update events from server
    this.lobbyUnsubscribe?.();
    this.lobbyUnsubscribe = mp.network.on("lobby_update", (msg) => {
      if (msg.roomCode !== mp.roomCode) return;
      this.lastLobbyState = msg;
      if ((mp.matchStatus === "ended" || this.ui.modalType === 'mp_result') && msg.state === "lobby") {
        mp.matchStatus = "lobby";
        this.showLobby(msg);
        return;
      }
      if (this.ui.modalType === 'lobby' && this.renderedLobbyMode !== `${msg.options?.mode}:${msg.options?.map}:${msg.hostId}:${msg.state}`) { this.showLobby(msg); return; }
      this.renderLobbyRoster(msg);
    });

    const room = lobbyData.room || lobbyData;
    const code = room.roomCode || room.code || mp.roomCode;
    const isHost = room.hostId === mp.localId;
    mp.isHost = isHost;
    mp.roomCode = code;

    const opts = room.options || {};
    const modeName = (PARTY_MODES[opts.mode] || opts.mode || 'SQUADRON').toUpperCase();
    const cooperative = ['open_skies_coop', 'free_flight'].includes(opts.mode);
    this.renderedLobbyMode = `${opts.mode}:${opts.map}:${room.hostId}:${room.state}`;
    mp.rememberRoom?.(room);

    this.ui.panel(
      `SQUADRON LOBBY · ${modeName}`,
      `Room Code: <b class="room-code-highlight">${escapeHTML(code)}</b> <button class="copy-code-btn" id="mp-copy-code-btn">📋 COPY CODE</button>`,
      `
      <div class="mp-lobby-container">
        <div class="mp-party-share"><button class="secondary-btn" id="mp-copy-invite">COPY INVITE LINK</button><button class="secondary-btn" id="mp-show-qr">SHOW INVITE QR</button><button class="secondary-btn" id="mp-voice-settings">SQUAD VOICE</button><span id="mp-party-status" role="status">Party stays together between sorties.</span></div>
        <div id="mp-invite-share" hidden><label>Invite link<input id="mp-invite-url" readonly value="${escapeHTML(inviteURL(code))}" /></label><img id="mp-invite-qr" alt="QR invitation to this Skybreak party" hidden /></div>
        <div class="mp-vote-row"><label>Vote next mode<select id="mp-vote-mode">${Object.entries(PARTY_MODES).map(([value, label]) => `<option value="${value}" ${value === opts.mode ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Vote battlefield<select id="mp-vote-map"><option value="aegis" ${opts.map !== 'frontier' ? 'selected' : ''}>Aegis Strait</option><option value="frontier" ${opts.map === 'frontier' ? 'selected' : ''}>Frontier</option></select></label><button id="mp-vote-submit" class="secondary-btn">VOTE</button><span id="mp-vote-status" aria-live="polite"></span></div>
        ${opts.mode === 'open_skies_coop' ? `<section class="mp-custom-operation"><label>Shared operation preset<textarea id="mp-mission-preset" rows="2" maxlength="4096" placeholder="Paste a validated mission preset" ${isHost?'':'disabled'}>${escapeHTML(opts.missionPreset?JSON.stringify(opts.missionPreset):'')}</textarea></label>${isHost?'<button id="mp-apply-preset">Validate & use preset</button><button id="mp-clear-preset">Use standard Open Skies</button>':''}<p id="mp-preset-status">${opts.missionPreset?'Custom operation: '+escapeHTML(opts.missionPreset.template):'Standard Open Skies: three shared phases'}</p></section>` : ''}
        <!-- Match Settings Pill Banner -->
        <div class="mp-lobby-settings-bar">
          <span>🎯 KILLS: <b>${opts.killLimit ? opts.killLimit : "UNLIMITED"}</b></span>
          <span>⏱️ TIME: <b>${opts.matchDuration ? Math.round(opts.matchDuration / 60) + " MIN" : "UNLIMITED"}</b></span>
          <span>🌤️ SKY: <b>${escapeHTML((opts.timeOfDay || "DAY").toUpperCase())}</b></span>
          <span>⚡ WEATHER: <b>${escapeHTML((opts.weather || "CLEAR").toUpperCase())}</b></span>
          <span>🛡️ FF: <b>${opts.friendlyFire ? "ON" : "OFF"}</b></span><span>FAIR PLAY: stock flight / HP / ammunition budgets for every airframe</span>
        </div>

        <!-- Dual Team Roster Grid -->
        <div class="mp-roster-grid">
          <!-- Blue Team -->
          <div class="mp-team-column blue">
            <div class="mp-team-header">
              <span class="mp-team-dot blue"></span>
              <h4>${cooperative ? 'YOUR SQUADRON' : 'BLUE SQUADRON'}</h4>
              <button class="mp-switch-btn blue" id="mp-join-blue-btn" ${cooperative ? 'hidden' : ''}>JOIN BLUE</button>
            </div>
            <div class="mp-slots-list" id="mp-slots-blue"></div>
          </div>

          <!-- Red Team -->
          <div class="mp-team-column red" ${cooperative ? 'hidden' : ''}>
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
            ${isHost && room.state !== 'post_match' ? '<button class="primary launch-match-btn" id="mp-host-start-btn">LAUNCH BATTLE ▶</button>' : isHost ? '<button class="primary" id="mp-return-party-btn">READY NEXT SORTIE</button>' : ''}
            <button class="secondary-btn" id="mp-leave-lobby-btn">LEAVE ROOM</button>
          </div>
        </div>
      </div>
      `
    );

    document.getElementById('mp-copy-invite')?.addEventListener('click', async () => {
      const field = document.getElementById('mp-invite-url');
      try { await navigator.clipboard.writeText(field.value); this.ui.message('Invite copied. Send it to your friends.', 3); }
      catch { document.getElementById('mp-invite-share').hidden = false; field.select(); this.ui.message('Copy the selected invite link.', 3); }
    });
    document.getElementById('mp-show-qr')?.addEventListener('click', async () => {
      const panel = document.getElementById('mp-invite-share'), image = document.getElementById('mp-invite-qr'); panel.hidden = false;
      try { const url = await inviteQR(inviteURL(code)); if (image.isConnected) { image.src = url; image.hidden = false; } }
      catch { this.ui.message('QR could not load. Share the invite link instead.', 3); }
    });
    document.getElementById('mp-vote-submit')?.addEventListener('click', () => mp.network.send('vote', { mode: document.getElementById('mp-vote-mode').value, map: document.getElementById('mp-vote-map').value }));
    document.getElementById('mp-return-party-btn')?.addEventListener('click', () => mp.network.send('return_lobby'));
    document.getElementById('mp-voice-settings')?.addEventListener('click', () => this.showVoicePanel());
    document.getElementById('mp-apply-preset')?.addEventListener('click',()=>{const result=this.game.importMissionPreset(document.getElementById('mp-mission-preset').value);if(!result.ok){document.getElementById('mp-preset-status').textContent=result.error;return;}mp.network.send('update_room_settings',{settings:{missionPreset:result.preset}});});
    document.getElementById('mp-clear-preset')?.addEventListener('click',()=>mp.network.send('update_room_settings',{settings:{missionPreset:null}}));
    // Bind Copy Code
    document.getElementById("mp-copy-code-btn")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(code);
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
      this.showRoomAircraft();
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
      mp.leaveMatch();
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
    const cooperative = ['open_skies_coop', 'free_flight'].includes(roomData.options?.mode);
    const maxTeamSize = Math.max(1, cooperative ? roomData.options?.maxPlayers || 4 : Math.floor((roomData.options?.maxPlayers || 8) / 2));

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
          <div class="slot-status ${p.ready ? "ready" : ""}">${p.connected === false ? 'RECONNECTING' : p.loaded === false ? 'LOADING' : p.ready ? "READY ✓" : "WAITING"}</div>
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

    const votes = document.getElementById('mp-vote-status');
    if (votes) { const values = Object.values(roomData.votes || {}); votes.textContent = `${values.length} / ${players.filter(p => p.connected !== false).length} voted · majority selects next sortie`; }
    const status = document.getElementById('mp-party-status'); if (status) status.textContent = roomData.state === 'countdown' ? 'LAUNCHING · synchronizing squadron…' : `PARTY · ${players.filter(p => p.connected !== false).length} connected`;
    const me = players.find(p => p.id === this.mpManager.localId), ready = document.getElementById('mp-toggle-ready-btn');
    if (ready && me) { ready.classList.toggle('is-ready', me.ready); ready.textContent = me.ready ? 'READY ✓' : 'MARK READY'; ready.disabled = roomData.state !== 'lobby'; }
    // Update host button enablement
    const hostStartBtn = document.getElementById("mp-host-start-btn");
    if (hostStartBtn) {
      const allReady = players.filter(p => p.connected !== false).length >= 2 && players.every((p) => p.connected !== false && p.loaded && (p.ready || p.isHost)) && roomData.state === 'lobby';
      hostStartBtn.disabled = !allReady;
    }
  }

  showRoomAircraft() {
    const mp = this.mpManager;
    this.ui.modalType = 'party_aircraft';
    this.ui.panel('PARTY AIRCRAFT', 'Competitive rooms use the same stock flight and weapon budget for every aircraft.', `<label class="setting"><span>Aircraft</span><select id="mp-party-aircraft">${Object.entries(JET_MODELS).map(([id, model]) => `<option value="${id}" ${id === this.game.player.modelId ? 'selected' : ''}>${escapeHTML(model.name)}</option>`).join('')}</select></label><button id="mp-party-aircraft-apply" class="primary">EQUIP & RETURN TO PARTY</button>`);
    document.getElementById('mp-party-aircraft-apply').addEventListener('click', () => {
      const modelId = document.getElementById('mp-party-aircraft').value;
      this.game.equipJet?.({ modelId });
      mp.network.send('set_aircraft', { jetModel: modelId, liveryId: this.game.jetConfig?.liveryId || 'grey' });
      this.showLobby(mp.room || this.lastLobbyState);
    });
  }

  showVoicePanel() {
    document.getElementById('mp-voice-panel')?.remove();
    const voice = this.mpManager.voice, panel = document.createElement('section');
    panel.id = 'mp-voice-panel'; panel.className = 'mp-voice-panel'; panel.setAttribute('aria-label', 'Squad voice settings');
    panel.innerHTML = `<div class="mp-voice-title"><strong>SQUAD VOICE</strong><button id="mp-voice-close" aria-label="Close voice settings">×</button></div><p id="mp-voice-status" role="status"></p><p id="mp-voice-error" class="mp-voice-warning"></p><div class="mp-voice-actions"><button id="mp-voice-enable" class="primary">ENABLE MICROPHONE</button><button id="mp-voice-mute">MUTE MIC</button><button id="mp-voice-deafen">DEAFEN</button><button id="mp-voice-audio">ENABLE AUDIO</button></div><label>Microphone<select id="mp-voice-device"><option value="">System default</option></select></label><button id="mp-voice-talk" class="mp-talk-button">HOLD TO TALK · ${escapeHTML(bindingLabel('pushToTalk', this.game.settings) || 'P')}</button><p>Voice is opt-in. Your mic transmits only while holding talk. Leaving the party stops microphone access.</p><div id="mp-voice-peers"></div>`;
    document.body.appendChild(panel);
    const draw = () => {
      if (!panel.isConnected) return;
      const state = voice.getState();
      panel.querySelector('#mp-voice-status').textContent = state.talking ? 'TRANSMITTING' : state.status;
      panel.querySelector('#mp-voice-error').textContent = state.error;
      panel.querySelector('#mp-voice-enable').textContent = state.enabled ? 'DISABLE MICROPHONE' : 'ENABLE MICROPHONE';
      panel.querySelector('#mp-voice-mute').textContent = state.muted ? 'UNMUTE MIC' : 'MUTE MIC';
      panel.querySelector('#mp-voice-deafen').textContent = state.deafened ? 'UNDEAFEN' : 'DEAFEN';
      const peers = panel.querySelector('#mp-voice-peers');
      const signature = state.peers.map(peer => `${peer.id}:${peer.connected}`).join('|');
      if (peers.dataset.signature !== signature) {
        peers.dataset.signature = signature;
        peers.innerHTML = state.peers.map(peer => `<label>${escapeHTML(this.mpManager.room?.players?.find(p => p.id === peer.id)?.name || 'Squadmate')} · ${peer.connected ? 'CONNECTED' : 'CONNECTING'}<input type="range" min="0" max="100" value="${Math.round(peer.volume * 100)}" data-voice-volume="${escapeHTML(peer.id)}" aria-label="Squadmate voice volume" /></label>`).join('') || '<p>Other opted-in teammates will appear here.</p>';
        peers.querySelectorAll('[data-voice-volume]').forEach(slider => slider.addEventListener('input', () => voice.setVolume(slider.dataset.voiceVolume, Number(slider.value) / 100)));
      }
    };
    voice.onChange = draw; draw();
    const devices = async () => { const list = await voice.devices(), select = panel.querySelector('#mp-voice-device'); if (!select.isConnected) return; select.innerHTML = '<option value="">System default</option>' + list.map((d, i) => `<option value="${escapeHTML(d.deviceId)}">${escapeHTML(d.label || `Microphone ${i + 1}`)}</option>`).join(''); };
    devices();
    panel.querySelector('#mp-voice-close').addEventListener('click', () => { this.voiceHeld = false; voice.setTalking(false); voice.onChange = null; panel.remove(); });
    panel.querySelector('#mp-voice-enable').addEventListener('click', async () => { if (voice.enabled) voice.disable(); else await voice.enable(panel.querySelector('#mp-voice-device').value); await devices(); draw(); });
    panel.querySelector('#mp-voice-device').addEventListener('change', event => voice.changeDevice(event.target.value));
    panel.querySelector('#mp-voice-mute').addEventListener('click', () => voice.setMuted(!voice.muted));
    panel.querySelector('#mp-voice-deafen').addEventListener('click', () => voice.setDeafened(!voice.deafened));
    panel.querySelector('#mp-voice-audio').addEventListener('click', () => voice.resumeAudio());
    const talk = panel.querySelector('#mp-voice-talk');
    talk.addEventListener('pointerdown', event => { event.preventDefault(); talk.setPointerCapture?.(event.pointerId); this.voiceHeld = true; voice.setTalking(true); });
    const release = () => { this.voiceHeld = false; voice.setTalking(false); };
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) talk.addEventListener(event, release);
  }

  updateObjectiveAndPings() {
    const mp = this.mpManager, hud = this.ui.hudEl; if (!hud) return;
    let objective = document.getElementById('mp-objective');
    if (!objective) { objective = document.createElement('div'); objective.id = 'mp-objective'; objective.className = 'mp-objective'; objective.setAttribute('role', 'status'); hud.appendChild(objective); }
    const mission = mp.missionState, zone = mp.zoneState;
    if (mission) {
      objective.hidden = false;
      const text = `${mission.phase === 'briefing' ? 'SQUADRON BRIEFING' : `PHASE ${mission.phaseIndex}/${mission.totalPhases}`} · ${mission.objective || ''} · HOSTILES ${mission.enemiesRemaining ?? 0}`;
      if (objective.textContent !== text) objective.textContent = text;
    } else if (zone) {
      objective.hidden = false;
      const distance = Math.hypot(this.game.player.position.x - zone.position.x, this.game.player.position.z - zone.position.z);
      objective.textContent = `◎ ${zone.contested ? 'CONTESTED' : zone.owner ? `${zone.owner.toUpperCase()} CONTROL` : 'NEUTRAL ZONE'} · CAPTURE ${Math.round(Math.abs(zone.progress || 0) * 100)}% · ${(distance / 1000).toFixed(1)} KM · ALT ${zone.minAltitude}–${zone.maxAltitude} M`;
    } else if (this.game.activitySnapshot) { objective.hidden=false;objective.textContent=activitySummary(this.game.activitySnapshot,mp.localId); }
    else objective.hidden = true;
    let tools = document.getElementById('mp-comms-tools');
    if (!tools) {
      tools = document.createElement('div'); tools.id = 'mp-comms-tools'; tools.className = 'mp-comms-tools';
      tools.innerHTML = '<button data-squad-ping="attack">PING TARGET</button><button data-squad-ping="help">NEED HELP</button><button id="mp-live-voice">VOICE</button><span id="mp-net-health"></span>';
      tools.querySelectorAll('[data-squad-ping]').forEach(button => button.addEventListener('click', () => mp.sendPing(button.dataset.squadPing, button.dataset.squadPing === 'attack' ? this.game.target : null)));
      tools.querySelector('#mp-live-voice').addEventListener('click', () => this.showVoicePanel());
      const activities=document.createElement('button');activities.textContent='ACTIVITIES';activities.id='mp-live-activities';activities.addEventListener('click',()=>this.ui.showActivities());tools.appendChild(activities);hud.appendChild(tools);
    }
    tools.querySelector('#mp-live-activities').hidden=mp.matchOptions?.mode!=='free_flight';
    tools.querySelector('#mp-net-health').textContent = mp.lostConnectionDuringMatch ? 'RECONNECTING · AIRCRAFT REMAINS LIVE' : `${mp.network.ping} ms · buffer ${Math.round(mp.sync.interpDelay)} ms`;
    let layer = document.getElementById('mp-ping-layer');
    if (!layer) { layer = document.createElement('div'); layer.id = 'mp-ping-layer'; layer.className = 'mp-ping-layer'; hud.appendChild(layer); }
    const rect = this.game.renderer?.domElement?.getBoundingClientRect?.() || { width: window.innerWidth, height: window.innerHeight };
    const pings = mp.getScreenPings(this.game.camera, rect.width, rect.height).filter(p => p.visible);
    const ids = new Set(pings.map(p => p.id));
    for (const child of [...layer.children]) if (!ids.has(child.dataset.pingId)) child.remove();
    for (const ping of pings) {
      let element = [...layer.children].find(child => child.dataset.pingId === ping.id);
      if (!element) { element = document.createElement('button'); element.className = 'mp-world-ping'; element.dataset.pingId = ping.id; element.addEventListener('click', () => mp.acknowledgePing(ping.id)); layer.appendChild(element); }
      element.style.left = `${ping.x}px`; element.style.top = `${ping.y}px`; element.textContent = `${ping.acknowledged ? '✓' : '◇'} ${ping.kind.toUpperCase()} · ${(ping.distance / 1000).toFixed(1)} km`;
      element.title = `${ping.senderName || 'Squadmate'} · click to acknowledge`;
    }
  }

  // Update in-game multiplayer HUD overlays
  update(dt) {
    const mp = this.mpManager;
    mp?.voice?.setTalking(this.voiceHeld || (mp.active && !this.ui.modalType && !this.game.input.menuMode && !mp.comms.isOpen && isHeld(this.game.input, 'pushToTalk', this.game.settings)));
    if (this.pendingInvite && !this.inviteOpened && this.game.state === 'menu' && !this.ui.modalType) { this.inviteOpened = true; this.showMultiplayerMenu(); }
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
      document.getElementById('mp-objective')?.remove(); document.getElementById('mp-ping-layer')?.remove(); document.getElementById('mp-comms-tools')?.remove();
      return;
    }

    this.ensureInGameHudElements();
    this.updateInGameHeader();
    this.updateRespawnAndSpectatorBanner();
    this.renderKillFeed();
    this.updateObjectiveAndPings();
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
      modeEl.textContent = (PARTY_MODES[mode] || mode).toUpperCase();
    }
    const timerEl = document.getElementById("mp-match-timer-text");
    if (timerEl) {
      const rem = mp.timeRemaining;
      timerEl.textContent = Number.isFinite(rem) ? `${String(Math.floor(rem / 60)).padStart(2, "0")}:${String(Math.floor(rem % 60)).padStart(2, "0")}` : "FREE FLIGHT";
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
        <div class="respawn-countdown">${mp.matchOptions?.mode === 'open_skies_coop' ? 'SPECTATING · SQUADRON CONTINUES THIS SORTIE' : `RESPAWNING IN ${Math.max(1, Math.ceil(mp.respawnCountdown))}s`}</div>
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

    const allPlayers = mp.publicRoster?.length ? mp.publicRoster.map(p=>({...p,jetModel:p.model,alive:mp.remotePlayers.get(p.id)?.alive ?? (p.id===mp.localId?this.game.player.alive:undefined)})) : [
      {
        id: mp.localId,
        name: mp.localName,
        team: mp.localTeam,
        jetModel: this.game.player.modelId || "x17",
        hp: this.game.player.hp,
        alive: this.game.player.alive,
        kills: this.game.stats?.kills || 0,
        deaths: mp.localStats?.deaths || 0,
        assists: mp.localStats?.assists || 0,
        score: this.game.score || 0,
        ping: mp.network.ping || 30
      },
      ...Array.from(mp.remotePlayers.values()).filter(p => !p.bot)
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
            <tr class="${p.id === mp.localId ? "is-me" : ""} ${p.alive===false ? "is-dead" : ""}">
              <td>${p.alive===undefined?'':'<span class="alive-dot '+(p.alive?'alive':'dead')+'"></span>'} ${escapeHTML(p.name)}${p.id === mp.localId ? " (YOU)" : ""}</td>
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
          <span>HOLD ${escapeHTML(bindingLabel('scoreboard',this.game.settings))} TO VIEW · RELEASE TO CLOSE</span>
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

    const coop=mp.matchOptions?.mode==='open_skies_coop';
    const title = isDraw ? "TACTICAL DRAW" : isWinner ? "VICTORY · SQUADRON ACCOMPLISHED" : coop?'MISSION FAILED':"DEFEAT · AIR DEFENSE BREACHED";
    const sub = resultData.mission?.reason || (isDraw ? "Time elapsed with equal score." : isWinner ? "Your squadron completed the objective." : "Regroup, review the sortie and try again.");

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

        <table class="mp-score-table"><thead><tr><th>Pilot</th><th>Kills</th><th>Deaths</th><th>Assists</th><th>Score</th></tr></thead><tbody>${(resultData.scoreboard || []).map(p=>`<tr><td>${escapeHTML(p.name)}</td><td>${p.kills || 0}</td><td>${p.deaths || 0}</td><td>${p.assists || 0}</td><td>${p.score || 0}</td></tr>`).join('')}</tbody></table>
        ${this.ui.replayDebriefMarkup?.() || ''}
        <div class="mp-post-actions" style="margin-top:28px;display:flex;gap:12px;">
          ${mp.isHost ? '<button class="primary" id="mp-rematch-btn" style="flex:2;">RETURN SQUADRON TO LOBBY 🔄</button>' : '<span>Waiting for host to restart the lobby.</span>'}
          <button class="secondary-btn" id="mp-post-lobby-btn" style="flex:1;">PARTY &amp; VOTE</button><button class="secondary-btn" id="mp-post-leave-btn">LEAVE PARTY</button>
        </div>
      </div>
      `
    );

    document.getElementById("mp-rematch-btn")?.addEventListener("click", () => {
      mp.network.send("rematch");
      this.ui.message("Returning squadron to the lobby...", 2.5);
    });

    document.getElementById("mp-post-lobby-btn")?.addEventListener("click", () => {
      this.showLobby(mp.room || this.lastLobbyState || {});
    });
    document.getElementById('mp-post-leave-btn')?.addEventListener('click', () => { mp.leaveMatch(); this.showMultiplayerMenu(); });
  }
}
