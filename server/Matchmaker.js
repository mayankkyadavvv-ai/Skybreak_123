// Matchmaker: Automated public matchmaking queue for 1v1, 2v2, 3v3, 4v4
export class Matchmaker {
  constructor(roomManager) {
    this.roomManager = roomManager;
    this.queues = {
      "1v1": [],
      "2v2": [],
      "3v3": [],
      "4v4": [],
      "free_flight": [],
      "open_skies_coop": [],
      "air_superiority": []
    };
  }

  getCapacity(mode) {
    return mode === "1v1" || mode === "free_flight" || mode === "open_skies_coop" ? 2 : mode === "2v2" ? 4 : mode === "3v3" ? 6 : 8;
  }

  enqueue(client, mode = "1v1", name = "Pilot") {
    this.dequeue(client.id);

    const validMode = this.queues[mode] ? mode : "1v1";
    const queue = this.queues[validMode];
    const capacity = this.getCapacity(validMode);

    queue.push({ client, name, joinedAt: Date.now() });
    console.log(`[Matchmaker] Enqueued ${client.id} in ${validMode} (${queue.length}/${capacity})`);

    // Broadcast queue update to all waiting players in this queue
    this.broadcastQueueStatus(validMode);

    // Check if match can be formed
    if (queue.length >= capacity) {
      const matchPilots = queue.splice(0, capacity);
      this.createMatch(validMode, matchPilots);
    }
  }

  dequeue(clientId) {
    for (const [mode, queue] of Object.entries(this.queues)) {
      const idx = queue.findIndex((item) => item.client.id === clientId);
      if (idx !== -1) {
        queue.splice(idx, 1);
        this.broadcastQueueStatus(mode);
        console.log(`[Matchmaker] Dequeued ${clientId} from ${mode}`);
      }
    }
  }

  broadcastQueueStatus(mode) {
    const queue = this.queues[mode];
    const capacity = this.getCapacity(mode);

    for (const item of queue) {
      if (item.client.ws?.readyState === 1) {
        try {
          item.client.ws.send(
            JSON.stringify({
              type: "matchmaking_status",
              mode,
              playersFound: queue.length,
              requiredPlayers: capacity,
              estimatedPing: item.client.ping || 38
            })
          );
        } catch {}
      }
    }
  }

  createMatch(mode, pilots) {
    const host = pilots[0];
    const room = this.roomManager.createRoom(host.client, {
      mode,
      maxPlayers: this.getCapacity(mode),
      killLimit: mode === "1v1" ? 3 : 10,
      matchDuration: mode === "free_flight" ? 0 : 600,
      weaponsEnabled: mode !== "free_flight"
    });

    // Update host name
    const hostPlayer = room.players.get(host.client.id);
    if (hostPlayer) hostPlayer.name = host.name;

    // Add other players
    for (let i = 1; i < pilots.length; i++) {
      const p = pilots[i];
      this.roomManager.leaveRoom(p.client);
      room.addPlayer(p.client, p.name);
      this.roomManager.clientRooms.set(p.client.id, room.code);
    }

    // Balance teams: split evenly
    let blueIdx = 0;
    for (const player of room.players.values()) {
      player.team = ['open_skies_coop','free_flight'].includes(mode) ? "blue" : blueIdx % 2 === 0 ? "blue" : "red";
      player.ready = true; // Auto-ready in quick match
      blueIdx++;
    }

    room.broadcastLobbyState();
    for (const player of room.players.values()) {
      room.sendTo(player.id, { type: "room_joined", room: room.getLobbyState() });
    }

    // Auto-start match countdown after 2 seconds
    const timer = setTimeout(() => {
      if (room.state === "lobby") {
        room.startCountdown();
      }
    }, 1500);
    if (timer?.unref) timer.unref();

    console.log(`[Matchmaker] Quick match created in room ${room.code} with ${pilots.length} players!`);
  }
}
