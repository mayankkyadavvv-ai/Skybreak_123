// GameServer: WebSocket protocol handler & client message router
import crypto from "crypto";
import { RoomManager } from "./RoomManager.js";
import { Matchmaker } from "./Matchmaker.js";

export class GameServer {
  constructor(wss) {
    this.wss = wss;
    this.clients = new Map(); // id -> client
    this.roomManager = new RoomManager();
    this.matchmaker = new Matchmaker(this.roomManager);

    this.wss.on("connection", (ws, req) => this.handleConnection(ws, req));

    // 5-second Heartbeat to clean up dead connections & update latency
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      for (const [id, client] of this.clients.entries()) {
        if (now - client.lastSeen > 20000) {
          console.log(`[GameServer] Terminating timed-out client: ${id}`);
          client.ws.terminate();
          this.handleDisconnect(client);
        } else if (client.ws.readyState === 1) {
          client.ws.send(JSON.stringify({ type: "server_ping", t: now }));
        }
      }
    }, 5000);
  }

  handleConnection(ws, req) {
    const id = crypto.randomUUID().slice(0, 8);
    const client = {
      id,
      ws,
      lastSeen: Date.now(),
      ping: 30,
      name: `Pilot_${id.slice(0, 4)}`,
      roomCode: null
    };

    this.clients.set(id, client);
    console.log(`[GameServer] Client connected: ${id}`);

    // Send welcome packet with client ID
    ws.send(JSON.stringify({ type: "welcome", id, serverTime: Date.now() }));

    ws.on("message", (data) => this.handleMessage(client, data));
    ws.on("close", () => this.handleDisconnect(client));
    ws.on("error", (err) => console.error(`[GameServer] Client ${id} error:`, err.message));
  }

  handleDisconnect(client) {
    console.log(`[GameServer] Client disconnected: ${client.id}`);
    this.matchmaker.dequeue(client.id);
    this.roomManager.leaveRoom(client);
    this.clients.delete(client.id);
  }

  handleMessage(client, raw) {
    client.lastSeen = Date.now();
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object" || Array.isArray(msg)) return;

    const { type } = msg;

    // Heartbeat Ping/Pong
    if (type === "ping") {
      client.ws.send(JSON.stringify({ type: "pong", t: msg.t, serverTime: Date.now() }));
      return;
    }
    if (type === "server_pong") {
      if (Number.isFinite(msg.t) && msg.t <= Date.now() && Date.now() - msg.t < 20000) {
        client.ping = Math.max(1, Date.now() - msg.t);
        const room = this.roomManager.getRoomByClient(client.id);
        const player = room?.players.get(client.id);
        if (player) player.ping = client.ping;
        const matchPlayer = room?.match?.players.get(client.id);
        if (matchPlayer) matchPlayer.ping = client.ping;
      }
      return;
    }

    // Set Pilot Name
    if (type === "set_name") {
      if (typeof msg.name === "string") {
        client.name = msg.name.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 16) || client.name;
      }
      return;
    }

    // Quick Matchmaking
    if (type === "quick_match") {
      this.matchmaker.enqueue(client, msg.mode || "1v1", client.name);
      return;
    }

    if (type === "cancel_quick_match") {
      this.matchmaker.dequeue(client.id);
      client.ws.send(JSON.stringify({ type: "matchmaking_cancelled" }));
      return;
    }

    // Custom Room Management
    if (type === "create_room") {
      const room = this.roomManager.createRoom(client, msg.options || {});
      const player = room.players.get(client.id);
      if (player) player.name = client.name;
      room.sendTo(client.id, { type: "room_joined", room: room.getLobbyState() });
      room.broadcastLobbyState();
      return;
    }

    if (type === "join_room") {
      const res = this.roomManager.joinRoom(msg.code, client, client.name);
      if (!res.success) {
        client.ws.send(JSON.stringify({ type: "join_error", reason: res.reason }));
      } else {
        res.room.sendTo(client.id, { type: "room_joined", room: res.room.getLobbyState() });
        if (res.room.state === "in_game" && res.room.match) {
          res.room.sendTo(client.id, {
            type: "game_started",
            options: res.room.options,
            myTeam: res.player.team,
            myId: client.id,
            snapshot: res.room.match.getSnapshot()
          });
        }
      }
      return;
    }

    if (type === "leave_room") {
      this.roomManager.leaveRoom(client);
      client.ws.send(JSON.stringify({ type: "left_room" }));
      return;
    }

    // Operations on Active Room
    const room = this.roomManager.getRoomByClient(client.id);
    if (!room) return;

    if (type === "set_ready") {
      room.setPlayerReady(client.id, msg.ready);
      return;
    }

    if (type === "set_team") {
      room.setPlayerTeam(client.id, msg.team);
      return;
    }

    if (type === "set_aircraft") {
      room.setPlayerAircraft(client.id, msg.jetModel, msg.liveryId);
      return;
    }

    if (type === "update_room_settings") {
      const res = room.updateSettings(client.id, msg.settings || {});
      if (!res.success) {
        client.ws.send(JSON.stringify({ type: "settings_error", reason: res.reason }));
      }
      return;
    }

    if (type === "start_match") {
      if (client.id !== room.hostId) {
        client.ws.send(JSON.stringify({ type: "start_error", reason: "Only the host can start the match" }));
        return;
      }
      const ok = room.startCountdown();
      if (!ok) {
        client.ws.send(JSON.stringify({ type: "start_error", reason: "Cannot start match: players not ready" }));
      }
      return;
    }

    if (type === "rematch") {
      if (client.id === room.hostId && room.state === "post_match") {
        room.rematch();
      }
      return;
    }

    // In-game Telemetry & Combat Events
    if (room.state === "in_game" && room.match) {
      if (type === "telemetry" && msg.t) {
        room.match.updateTelemetry(client.id, msg.t);
        return;
      }

      if (type === "fire_cannon") {
        const bullet = room.match.handleFireCannon(client.id, msg);
        if (bullet) {
          room.broadcast({
            type: "cannon_fired",
            bId: bullet.id,
            ownerId: client.id,
            pos: bullet.position,
            vel: bullet.velocity
          });
        }
        return;
      }

      if (type === "fire_missile") {
        const missile = room.match.handleFireMissile(client.id, msg);
        if (missile) {
          room.broadcast({
            type: "missile_launched",
            mId: missile.id,
            ownerId: client.id,
            targetId: missile.targetId,
            pos: missile.position,
            dir: missile.direction,
            speed: missile.speed
          });
          // Send direct warning to targeted player
          room.sendTo(missile.targetId, {
            type: "missile_warning",
            mId: missile.id,
            shooterId: client.id
          });
        }
        return;
      }

      if (type === "deploy_flares") {
        const diverted = room.match.handleDeployFlares(client.id);
        room.broadcast({
          type: "flares_deployed",
          playerId: client.id,
          diverted
        });
        return;
      }

      if (type === "airbase_rearm") {
        const p = room.match.players.get(client.id);
        if (p && room.match.canRearmAtBase(client.id, msg.baseId)) {
          room.match.rearmPlayer(client.id);
          client.ws.send(JSON.stringify({ type: "rearmed", baseId: msg.baseId }));
        }
        return;
      }
    }

    // Quick Comms (Team / All radio chat)
    if (type === "quick_comm") {
      const p = room.players.get(client.id);
      if (!p) return;

      const commMsg = {
        type: "quick_comm",
        senderId: client.id,
        senderName: p.name,
        team: p.team,
        commKey: msg.commKey,
        commText: msg.commText || "Radio Check",
        targetTeamOnly: msg.teamOnly !== false
      };

      if (commMsg.targetTeamOnly) {
        // Send only to teammates
        for (const target of room.players.values()) {
          if (target.team === p.team) {
            room.sendTo(target.id, commMsg);
          }
        }
      } else {
        room.broadcast(commMsg);
      }
    }
  }

  cleanup() {
    clearInterval(this.heartbeatInterval);
    for (const room of this.roomManager.rooms.values()) room.cleanup();
    this.roomManager.rooms.clear();
    this.roomManager.clientRooms.clear();
    for (const queue of Object.values(this.matchmaker.queues)) queue.length = 0;
    for (const client of this.clients.values()) {
      client.ws.close(1001, "Server shutdown");
      const timeout = setTimeout(() => client.ws.terminate(), 1000);
      timeout.unref?.();
      client.ws.once("close", () => clearTimeout(timeout));
    }
    this.clients.clear();
  }
}
