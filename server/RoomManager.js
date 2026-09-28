// RoomManager: Generates unique room codes (SKY-XXXX) and maps active rooms
import { Room } from "./Room.js";

export class RoomManager {
  constructor() {
    this.rooms = new Map(); // code -> Room
    this.clientRooms = new Map(); // clientId -> code
  }

  generateRoomCode() {
    const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    let code = "";
    do {
      let rand = "";
      for (let i = 0; i < 4; i++) {
        rand += chars[Math.floor(Math.random() * chars.length)];
      }
      code = `SKY-${rand}`;
    } while (this.rooms.has(code));
    return code;
  }

  createRoom(hostClient, options = {}) {
    this.leaveRoom(hostClient);

    const code = this.generateRoomCode();
    const room = new Room(code, hostClient, options);
    this.rooms.set(code, room);
    this.clientRooms.set(hostClient.id, code);

    console.log(`[RoomManager] Room created: ${code} by ${hostClient.id} (${options.mode || "1v1"})`);
    return room;
  }

  joinRoom(code, client, name) {
    if (typeof code !== "string") return { success: false, reason: "Invalid room code" };
    const upperCode = code.trim().toUpperCase();
    const room = this.rooms.get(upperCode);
    if (!room) {
      return { success: false, reason: "Room not found. Check code and try again." };
    }
    if (room.players.has(client.id)) return { success: true, room, player: room.players.get(client.id) };
    if (room.players.size >= room.options.maxPlayers) return { success: false, reason: "Room is full" };
    if (room.state !== "lobby" && room.state !== "in_game") return { success: false, reason: "Match is starting or finished" };
    this.leaveRoom(client);

    const res = room.addPlayer(client, name);
    if (res.success) {
      this.clientRooms.set(client.id, upperCode);
      console.log(`[RoomManager] Client ${client.id} joined room ${upperCode}`);
      return { success: true, room, player: res.player };
    }
    return res;
  }

  leaveRoom(client) {
    const code = this.clientRooms.get(client.id);
    if (!code) return;

    const room = this.rooms.get(code);
    if (room) {
      room.removePlayer(client.id);
      if (room.players.size === 0) {
        room.cleanup();
        this.rooms.delete(code);
        console.log(`[RoomManager] Room ${code} closed (empty)`);
      }
    }
    this.clientRooms.delete(client.id);
  }

  getRoom(code) {
    return this.rooms.get((code || "").trim().toUpperCase());
  }

  getRoomByClient(clientId) {
    const code = this.clientRooms.get(clientId);
    return code ? this.rooms.get(code) : null;
  }
}
