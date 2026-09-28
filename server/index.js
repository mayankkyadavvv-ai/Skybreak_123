// SkyBreak Multiplayer Game Server Entry Point
import http from "http";
import { WebSocketServer } from "ws";
import { GameServer } from "./GameServer.js";

const PORT = parseInt(process.env.PORT || "8080", 10);
const HOST = process.env.HOST || "0.0.0.0";

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/health" || req.url === "/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "healthy",
        game: "SkyBreak Air Combat",
        activeClients: gameServer?.clients.size || 0,
        activeRooms: gameServer?.roomManager.rooms.size || 0,
        uptime: Math.round(process.uptime()),
        timestamp: new Date().toISOString()
      })
    );
    return;
  }

  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(`
    <!doctype html>
    <html>
      <head><title>SkyBreak Multiplayer Server</title></head>
      <body style="font-family:sans-serif;background:#061118;color:#d5eaf2;padding:40px;text-align:center;">
        <h1 style="color:#5df2b6;letter-spacing:2px;">✈ SKYBREAK AUTHORITATIVE SERVER</h1>
        <p>Status: <b style="color:#38ef7d;">ONLINE</b> | Port: <b>${PORT}</b></p>
        <p>Active Pilots: <b>${gameServer?.clients.size || 0}</b> | Active Rooms: <b>${gameServer?.roomManager.rooms.size || 0}</b></p>
        <p style="font-size:12px;color:#799fae;">Connect via WebSocket: <code>ws://${req.headers.host || "localhost:" + PORT}</code></p>
      </body>
    </html>
  `);
});

const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 });
const gameServer = new GameServer(wss);

server.listen(PORT, HOST, () => {
  console.log("=================================================");
  console.log(`✈  SKYBREAK MULTIPLAYER SERVER LISTENING ON http://${HOST}:${PORT}`);
  console.log(`🔌 WebSocket Endpoint: ws://${HOST}:${PORT}`);
  console.log(`📊 Health Endpoint:    http://${HOST}:${PORT}/health`);
  console.log("=================================================");
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, closing server...");
  gameServer.cleanup();
  wss.close(() => server.close());
});

process.on("SIGINT", () => {
  console.log("SIGINT received, closing server...");
  gameServer.cleanup();
  wss.close(() => server.close());
});
