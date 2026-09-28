// Server Room Lifecycle & Roster Manager for SkyBreak
import { MatchState } from "./MatchState.js";
import { JET_MODELS, LIVERIES } from "../src/game/JetConfigs.js";

function safeOptions(input = {}, previous = {}) {
  const raw = { ...previous, ...input };
  const modes = ["1v1", "2v2", "3v3", "4v4", "team_deathmatch", "free_flight"];
  const mode = modes.includes(raw.mode) ? raw.mode : "1v1";
  const capacity = mode === "1v1" ? 2 : mode === "2v2" ? 4 : mode === "3v3" ? 6 : 8;
  const bounded = (value, fallback, min, max) => Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback;
  return {
    mode,
    maxPlayers: mode === "free_flight" ? bounded(raw.maxPlayers, 8, 2, 8) : capacity,
    killLimit: bounded(raw.killLimit, 3, 0, 50),
    matchDuration: mode === "free_flight" ? 0 : bounded(raw.matchDuration, 600, 0, 3600),
    friendlyFire: Boolean(raw.friendlyFire),
    weaponsEnabled: mode === "free_flight" ? false : raw.weaponsEnabled !== false,
    enemyRadar: raw.enemyRadar !== false,
    timeOfDay: ["morning", "midday", "day", "sunset", "night"].includes(raw.timeOfDay) ? raw.timeOfDay : "day",
    weather: ["clear", "cloudy", "storm"].includes(raw.weather) ? raw.weather : "clear"
  };
}

export class Room {
  constructor(code, hostClient, options = {}) {
    this.code = code;
    this.hostId = hostClient.id;
    this.state = "lobby"; // "lobby" | "countdown" | "in_game" | "post_match"
    this.createdAt = Date.now();

    this.options = safeOptions(options);

    this.players = new Map(); // id -> player object
    this.match = null;
    this.tickInterval = null;
    this.countdownTimer = null;

    // Add host
    this.addPlayer(hostClient, hostClient.name || "Host Pilot");
  }

  addPlayer(client, name) {
    if (this.players.size >= this.options.maxPlayers) {
      return { success: false, reason: "Room is full" };
    }
    if (this.state !== "lobby" && this.state !== "in_game") return { success: false, reason: "Match is starting or finished" };

    // Auto-balance team: pick team with fewer players
    const blueCount = Array.from(this.players.values()).filter((p) => p.team === "blue").length;
    const redCount = Array.from(this.players.values()).filter((p) => p.team === "red").length;
    const assignedTeam = blueCount <= redCount ? "blue" : "red";

    const isHost = this.players.size === 0 || client.id === this.hostId;
    if (isHost) this.hostId = client.id;

    const player = {
      id: client.id,
      ws: client.ws,
      name: name || `Pilot_${client.id.slice(0, 4)}`,
      team: assignedTeam,
      jetModel: "x17",
      liveryId: "grey",
      ready: isHost, // Host is ready by default
      isHost,
      ping: client.ping || 30
    };

    this.players.set(client.id, player);
    client.roomCode = this.code;

    // If game is already running, the server sends the start packet after room_joined.
    if (this.state === "in_game" && this.match) {
      this.match.initPlayer(player);
    } else {
      this.broadcastLobbyState();
    }

    return { success: true, player };
  }

  removePlayer(clientId) {
    const p = this.players.get(clientId);
    if (!p) return;

    this.players.delete(clientId);

    if (this.match) {
      this.match.removePlayer(clientId);
    }

    // If host left, elect new host
    if (clientId === this.hostId && this.players.size > 0) {
      const nextPlayer = this.players.values().next().value;
      this.hostId = nextPlayer.id;
      nextPlayer.isHost = true;
      nextPlayer.ready = true;
    }

    if (this.players.size === 0) {
      this.cleanup();
    } else {
      this.broadcastLobbyState();
      this.broadcast({
        type: "player_left",
        playerId: clientId,
        playerName: p.name
      });
    }
  }

  setPlayerReady(clientId, ready) {
    if (this.state !== "lobby") return;
    const p = this.players.get(clientId);
    if (p) {
      p.ready = Boolean(ready);
      this.broadcastLobbyState();
    }
  }

  setPlayerTeam(clientId, team) {
    if (this.state !== "lobby") return;
    const p = this.players.get(clientId);
    if (p && (team === "blue" || team === "red")) {
      p.team = team;
      this.broadcastLobbyState();
    }
  }

  setPlayerAircraft(clientId, jetModel, liveryId) {
    if (this.state !== "lobby") return;
    const p = this.players.get(clientId);
    if (p) {
      if (Object.hasOwn(JET_MODELS, jetModel)) p.jetModel = jetModel;
      if (Object.hasOwn(LIVERIES, liveryId)) p.liveryId = liveryId;
      this.broadcastLobbyState();
    }
  }

  updateSettings(hostId, newSettings) {
    if (hostId !== this.hostId) return { success: false, reason: "Only the host can modify settings" };
    if (this.state !== "lobby") return { success: false, reason: "Cannot change settings during match" };

    const next = safeOptions(newSettings, this.options);
    if (this.players.size > next.maxPlayers) return { success: false, reason: "Too many players for that mode" };
    this.options = next;
    this.broadcastLobbyState();
    return { success: true };
  }

  canStart() {
    if (this.state !== "lobby") return false;
    if (this.players.size < 2) return false;
    const allReady = Array.from(this.players.values()).every((p) => p.ready || p.id === this.hostId);
    return allReady;
  }

  startCountdown(onStart) {
    if (!this.canStart()) return false;
    this.state = "countdown";

    let count = 3;
    this.broadcast({ type: "countdown", count });

    this.countdownTimer = setInterval(() => {
      count--;
      if (count > 0) {
        this.broadcast({ type: "countdown", count });
      } else {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        this.startMatch();
        if (onStart) onStart();
      }
    }, 1000);
    if (this.countdownTimer?.unref) this.countdownTimer.unref();

    return true;
  }

  startMatch() {
    this.state = "in_game";
    this.match = new MatchState(this, this.options);

    // Initialize all players in match simulation
    for (const player of this.players.values()) {
      this.match.initPlayer(player);
    }

    // Broadcast match start to all players
    for (const player of this.players.values()) {
      this.sendTo(player.id, {
        type: "game_started",
        options: this.options,
        myTeam: player.team,
        myId: player.id,
        snapshot: this.match.getSnapshot()
      });
    }

    // Start 30Hz Authoritative Simulation Tick
    const dt = 1 / 30;
    this.tickInterval = setInterval(() => {
      if (this.state !== "in_game" || !this.match) return;

      this.match.tick(dt);
      const snapshot = this.match.getSnapshot();
      this.broadcast({ type: "snapshot", s: snapshot });

      if (this.match.status === "ended") {
        this.endMatch(this.match.winner);
      }
    }, 1000 / 30);
    if (this.tickInterval?.unref) this.tickInterval.unref();
  }

  endMatch(winner) {
    this.state = "post_match";
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    const scoreboard = Array.from(this.players.values()).map((p) => {
      const matchP = this.match?.players.get(p.id);
      return {
        id: p.id,
        name: p.name,
        team: p.team,
        model: p.jetModel,
        kills: matchP?.kills || 0,
        deaths: matchP?.deaths || 0,
        assists: matchP?.assists || 0,
        damage: matchP?.damageDealt || 0,
        score: matchP?.score || 0,
        ping: p.ping
      };
    });

    this.broadcast({
      type: "match_ended",
      winner,
      scoreboard,
      teamScores: this.match?.teamScores || { blue: 0, red: 0 }
    });
  }

  rematch() {
    this.state = "lobby";
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.match = null;
    for (const p of this.players.values()) {
      p.ready = p.id === this.hostId;
    }
    this.broadcastLobbyState();
  }

  broadcastLobbyState() {
    this.broadcast(this.getLobbyState());
  }

  getLobbyState() {
    const playerList = Array.from(this.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      team: p.team,
      jetModel: p.jetModel,
      liveryId: p.liveryId,
      ready: p.ready,
      isHost: p.id === this.hostId,
      ping: p.ping
    }));

    return {
      type: "lobby_update",
      roomCode: this.code,
      hostId: this.hostId,
      state: this.state,
      options: this.options,
      players: playerList
    };
  }

  broadcast(message, excludeId = null) {
    const raw = typeof message === "string" ? message : JSON.stringify(message);
    for (const player of this.players.values()) {
      if (excludeId && player.id === excludeId) continue;
      if (player.ws && player.ws.readyState === 1) { // 1 === WebSocket.OPEN
        try {
          player.ws.send(raw);
        } catch {}
      }
    }
  }

  sendTo(playerId, message) {
    const player = this.players.get(playerId);
    if (player?.ws && player.ws.readyState === 1) {
      try {
        player.ws.send(typeof message === "string" ? message : JSON.stringify(message));
      } catch {}
    }
  }

  cleanup() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.players.clear();
    this.match = null;
  }
}
