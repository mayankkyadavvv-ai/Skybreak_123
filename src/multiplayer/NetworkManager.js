import { validateEndpoint } from './Endpoint.js';
// NetworkManager: WebSocket client for SkyBreak multiplayer
export class NetworkManager {
  constructor() {
    this.ws = null;
    this.url = null;
    this.clientId = null;
    this.connected = false;
    this.reconnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectTimer = null;
    this.connectPromise = null;
    this.manualDisconnect = false;

    this.ping = 35;
    this.pingHistory = [];
    this.quality = "GOOD"; // "EXCELLENT" | "GOOD" | "FAIR" | "POOR"
    this.pingInterval = null;

    this.listeners = new Map();
  }

  on(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
    return () => this.off(type, handler);
  }

  off(type, handler) {
    if (this.listeners.has(type)) {
      this.listeners.get(type).delete(handler);
    }
  }

  emit(type, data) {
    if (this.listeners.has(type)) {
      for (const handler of this.listeners.get(type)) {
        try {
          handler(data);
        } catch (err) {
          console.error(`[NetworkManager] Listener error on ${type}:`, err);
        }
      }
    }
  }

  getDefaultUrl() {
    try {
      const saved = localStorage.getItem("skybreak_server_url");
      if (saved) return saved;
      const configured = import.meta.env?.VITE_SKYBREAK_WS_URL;
      if (configured) return configured;

      if (typeof window !== "undefined" && window.location) {
        const isSecure = window.location.protocol === "https:";
        const host = window.location.hostname || "localhost";
        if (host === "localhost" || host === "127.0.0.1") return `ws://${host}:8080`;
        return `${isSecure ? "wss" : "ws"}://${window.location.host}`;
      }
    } catch {}
    return "ws://localhost:8080";
  }

  connect(url = null) {
    try {
      this.url = validateEndpoint(url || this.getDefaultUrl(), globalThis.window?.location, import.meta.env?.VITE_SKYBREAK_WS_URL);
    } catch (error) {
      this.emit('error', error);
      this.emit('endpoint_error', { message: error.message });
      return Promise.resolve(false);
    }
    if (this.ws?.readyState === WebSocket.OPEN) return Promise.resolve(true);
    if (this.ws?.readyState === WebSocket.CONNECTING && this.connectPromise) return this.connectPromise;
    this.manualDisconnect = false;

    this.connectPromise = new Promise((resolve) => {
      try {
        this.ws = new WebSocket(this.url);
        let settled = false;
        const settle = (success) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          this.connectPromise = null;
          resolve(success);
        };
        const timeout = setTimeout(() => {
          settle(false);
          this.ws?.close();
        }, 6000);

        const onOpen = () => {
          this.connected = true;
          this.reconnecting = false;
          this.reconnectAttempts = 0;
          this.startPingLoop();
          this.emit("connected", { url: this.url });
          settle(true);
        };

        const onError = (err) => {
          this.emit("error", err);
          settle(false);
        };

        const onClose = (e) => {
          this.connected = false;
          settle(false);
          this.stopPingLoop();
          this.emit("disconnected", { code: e.code, reason: e.reason });
          if (!this.manualDisconnect) this.handleAutoReconnect();
        };

        const onMessage = (event) => {
          this.handleIncomingMessage(event.data);
        };

        this.ws.onopen = onOpen;
        this.ws.onerror = onError;
        this.ws.onclose = onClose;
        this.ws.onmessage = onMessage;
      } catch (err) {
        this.emit("error", err);
        resolve(false);
      }
    });
    return this.connectPromise;
  }

  handleAutoReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.reconnecting = false;
      this.emit("reconnect_failed");
      return;
    }

    this.reconnecting = true;
    this.reconnectAttempts++;
    const delay = Math.min(8000, 1000 * 2 ** (this.reconnectAttempts - 1));
    this.emit("reconnecting", { attempt: this.reconnectAttempts, max: this.maxReconnectAttempts, delay });

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect(this.url).catch(() => {});
    }, delay);
  }

  handleIncomingMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    const { type } = msg;

    if (type === "server_ping") {
      this.send("server_pong", { t: msg.t });
      return;
    }

    if (type === "welcome") {
      this.clientId = msg.id;
      this.emit("welcome", msg);
      return;
    }

    if (type === "pong") {
      if (msg.t) {
        const rtt = Math.max(1, Math.round(performance.now() - msg.t));
        this.pingHistory.push(rtt);
        if (this.pingHistory.length > 5) this.pingHistory.shift();

        const avg = Math.round(this.pingHistory.reduce((a, b) => a + b, 0) / this.pingHistory.length);
        this.ping = avg;

        if (avg < 60) this.quality = "EXCELLENT";
        else if (avg < 120) this.quality = "GOOD";
        else if (avg < 200) this.quality = "FAIR";
        else this.quality = "POOR";

        this.emit("ping_update", { ping: this.ping, quality: this.quality });
      }
      return;
    }

    this.emit(type, msg);
    this.emit("message", msg);
  }

  send(type, payload = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify({ type, ...payload }));
      return true;
    } catch (err) {
      console.error("[NetworkManager] Send error:", err);
      return false;
    }
  }

  startPingLoop() {
    this.stopPingLoop();
    this.pingInterval = setInterval(() => {
      this.send("ping", { t: performance.now() });
    }, 2500);
  }

  stopPingLoop() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  disconnect() {
    this.manualDisconnect = true;
    this.stopPingLoop();
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.reconnecting = false;
  }
}
