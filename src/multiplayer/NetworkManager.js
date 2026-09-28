import { validateEndpoint } from './Endpoint.js';

export const CLIENT_PROTOCOL = 2;
const SESSION_KEY = 'skybreak_resume_v2';
const now = () => globalThis.performance?.now?.() ?? Date.now();

export class NetworkManager {
  constructor({ socketFactory, clock = now, sessionStore } = {}) {
    this.socketFactory = socketFactory || (url => new WebSocket(url));
    this.clock = clock;
    try { this.sessionStore = sessionStore ?? globalThis.sessionStorage; } catch {}
    this.ws = null; this.url = null; this.clientId = null;
    this.connected = false; this.reconnecting = false; this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 7; this.manualDisconnect = false;
    this.reconnectTimer = null; this.pingInterval = null; this.connectPromise = null;
    this.listeners = new Map(); this.ping = 0; this.pingHistory = [];
    this.quality = 'CONNECTING'; this.serverOffset = null; this.jitter = 0;
    this.maxBufferedBytes = 128 * 1024; this.droppedSends = 0; this.generation = 0;
    this.session = null; this.pendingResume = false;
    try { const session = JSON.parse(this.sessionStore?.getItem(SESSION_KEY) || 'null'); if (session?.token && session.roomCode) this.session = session; } catch {}
  }
  on(type, handler) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(handler); return () => this.off(type, handler); }
  off(type, handler) { this.listeners.get(type)?.delete(handler); }
  emit(type, data) { for (const handler of this.listeners.get(type) || []) { try { handler(data); } catch (error) { console.error(`[NetworkManager] ${type}`, error); } } }
  getDefaultUrl() {
    const runtime = globalThis.window?.SKYBREAK_LAN;
    if (runtime?.websocketPath && globalThis.window?.location) {
      const address = new URL(globalThis.window.location.href); address.protocol = address.protocol === 'https:' ? 'wss:' : 'ws:'; address.pathname = runtime.websocketPath === '/ws' ? '/ws' : '/ws'; address.search = ''; address.hash = ''; return address.href;
    }
    const configured = import.meta.env?.VITE_SKYBREAK_WS_URL;
    try { const saved = localStorage.getItem('skybreak_server_url'); if (saved) return saved; } catch {}
    if (configured) return configured;
    const location = globalThis.window?.location;
    if (!location) return 'ws://localhost:8080';
    if (['localhost', '127.0.0.1'].includes(location.hostname)) return `ws://${location.hostname}:8080`;
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
  }
  connect(url = null) {
    try { this.url = validateEndpoint(url || this.getDefaultUrl(), globalThis.window?.location, import.meta.env?.VITE_SKYBREAK_WS_URL); }
    catch (error) { this.emit('endpoint_error', { message: error.message }); return Promise.resolve(false); }
    if (this.ws?.readyState === 1) return Promise.resolve(true);
    if (this.ws?.readyState === 0 && this.connectPromise) return this.connectPromise;
    this.manualDisconnect = false;
    const generation = ++this.generation;
    this.connectPromise = new Promise(resolve => {
      let settled = false, timeout;
      const settle = success => { if (settled) return; settled = true; clearTimeout(timeout); this.connectPromise = null; resolve(success); };
      try {
        const ws = this.socketFactory(this.url); this.ws = ws;
        timeout = setTimeout(() => { settle(false); ws.close(); }, 8000);
        ws.onopen = () => {
          if (generation !== this.generation) { ws.close(); return; }
          this.connected = true; this.reconnecting = false; this.reconnectAttempts = 0;
          this.send('hello', { protocol: CLIENT_PROTOCOL }); this.startPingLoop();
          this.emit('connected', { url: this.url }); settle(true);
        };
        ws.onmessage = event => { if (generation === this.generation) this.handleIncomingMessage(event.data); };
        ws.onerror = error => { if (generation === this.generation) this.emit('error', error); settle(false); };
        ws.onclose = event => {
          if (generation !== this.generation) return;
          this.connected = false; this.pendingResume = false; settle(false); this.stopPingLoop();
          this.emit('disconnected', { code: event.code, reason: event.reason });
          if (!this.manualDisconnect && event.code !== 1008 && event.code !== 4002) this.handleAutoReconnect();
        };
      } catch (error) { this.emit('error', error); settle(false); }
    });
    return this.connectPromise;
  }
  handleAutoReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) { this.reconnecting = false; this.emit('reconnect_failed'); return; }
    this.reconnecting = true; this.reconnectAttempts++;
    const delay = Math.min(6000, 600 * 2 ** (this.reconnectAttempts - 1));
    this.emit('reconnecting', { attempt: this.reconnectAttempts, max: this.maxReconnectAttempts, delay });
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => { this.connect(this.url); }, delay);
  }
  observeServerTime(serverTime, received = this.clock(), rtt = this.ping) {
    if (!Number.isFinite(serverTime)) return;
    const estimate = serverTime + Math.max(0, rtt || 0) / 2 - received;
    this.serverOffset = this.serverOffset == null ? estimate : this.serverOffset + Math.max(-15, Math.min(15, estimate - this.serverOffset)) * .2;
  }
  serverNow() { return this.clock() + (this.serverOffset ?? 0); }
  saveSession(token, expiresAt, roomCode = this.session?.roomCode) {
    if (!token) return;
    this.session = { token, expiresAt: Number(expiresAt) || null, roomCode, endpoint: this.url };
    try { this.sessionStore?.setItem(SESSION_KEY, JSON.stringify(this.session)); } catch {}
  }
  forgetSession() { this.session = null; this.pendingResume = false; try { this.sessionStore?.removeItem(SESSION_KEY); } catch {} }
  handleIncomingMessage(raw) {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'server_ping') { this.send('server_pong', { t: msg.t }); return; }
    if (msg.type === 'welcome') {
      if (msg.protocol !== undefined && msg.protocol !== CLIENT_PROTOCOL) {
        this.emit('protocol_error', { message: 'Game and server versions differ. Refresh after the server release.' });
        this.disconnect(); return;
      }
      this.clientId = msg.id; this.observeServerTime(msg.serverTime);
      const previous = this.session;
      this.freshSession = { token: msg.resumeToken, expiresAt: msg.resumeExpiresAt };
      if (previous?.roomCode && (!previous.endpoint || previous.endpoint === this.url)) {
        this.pendingResume = true; this.send('resume_session', { token: previous.token });
      } else this.saveSession(msg.resumeToken, msg.resumeExpiresAt);
      this.emit('welcome', { ...msg, pendingResume: this.pendingResume }); return;
    }
    if (msg.type === 'session_resumed') {
      this.pendingResume = false; this.clientId = msg.id;
      this.saveSession(msg.resumeToken, msg.resumeExpiresAt, msg.room?.roomCode || msg.room?.code || this.session?.roomCode);
    }
    if (msg.type === 'resume_error') {
      this.pendingResume = false; this.forgetSession();
      this.saveSession(this.freshSession?.token, this.freshSession?.expiresAt);
    }
    if (msg.type === 'room_joined') {
      this.saveSession(msg.resumeToken || this.session?.token || this.freshSession?.token, msg.resumeExpiresAt || this.session?.expiresAt || this.freshSession?.expiresAt, msg.room?.roomCode || msg.room?.code);
    }
    if (msg.type === 'pong') {
      if (Number.isFinite(msg.t)) {
        const rtt = Math.max(1, this.clock() - msg.t);
        this.pingHistory.push(rtt); if (this.pingHistory.length > 12) this.pingHistory.shift();
        const old = this.ping || rtt;
        this.ping = Math.round(this.pingHistory.reduce((a, b) => a + b, 0) / this.pingHistory.length);
        this.jitter += (Math.abs(rtt - old) - this.jitter) * .2;
        this.observeServerTime(msg.serverTime ?? msg.serverT, this.clock(), rtt);
        this.quality = this.ping < 60 ? 'EXCELLENT' : this.ping < 120 ? 'GOOD' : this.ping < 200 ? 'FAIR' : 'POOR';
        this.emit('ping_update', { ping: this.ping, jitter: this.jitter, quality: this.quality });
      }
      return;
    }
    this.emit(msg.type, msg); this.emit('message', msg);
  }
  send(type, payload = {}) {
    if (this.ws?.readyState !== 1) return false;
    if ((this.ws.bufferedAmount || 0) > this.maxBufferedBytes) {
      this.droppedSends++; this.emit('backpressure', { bytes: this.ws.bufferedAmount, dropped: this.droppedSends });
      // A TCP stall cannot be repaired by retaining seconds of stale controls.
      if ((this.ws.bufferedAmount || 0) > this.maxBufferedBytes * 4) this.ws.close(4000, 'Network stalled; resume required');
      return false;
    }
    try { this.ws.send(JSON.stringify({ ...payload, type })); return true; } catch { return false; }
  }
  startPingLoop() { this.stopPingLoop(); this.send('ping', { t: this.clock() }); this.pingInterval = setInterval(() => this.send('ping', { t: this.clock() }), 2500); }
  stopPingLoop() { clearInterval(this.pingInterval); this.pingInterval = null; }
  disconnect({ forget = false } = {}) {
    this.manualDisconnect = true; this.stopPingLoop(); clearTimeout(this.reconnectTimer); ++this.generation;
    this.ws?.close(); this.ws = null; this.connected = false; this.reconnecting = false; this.connectPromise = null;
    if (forget) this.forgetSession();
  }
  dispose() { this.disconnect(); this.listeners.clear(); }
}
