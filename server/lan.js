import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { networkInterfaces, hostname } from 'node:os';
import { resolve, extname, sep } from 'node:path';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import { GameServer } from './GameServer.js';
import { PROTOCOL_VERSION, MAX_MESSAGE_BYTES } from '../src/shared/Protocol.js';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function lanAddresses(interfaces) {
  // Sandboxed/managed hosts may deny adapter enumeration. Keep local play and
  // diagnostics available without inventing a reachable address.
  if(!interfaces){try{interfaces=networkInterfaces();}catch{interfaces={};}}
  return [...new Set(Object.values(interfaces).flat().filter(address => address && !address.internal && (address.family === 'IPv4' || address.family === 4)).map(address => address.address))].sort();
}

function headers(host, contentType) {
  return {
    'Content-Type': contentType,
    'Cache-Control': 'no-cache',
    'Content-Security-Policy': `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' ws://${host}; media-src 'self' blob: data:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'`,
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'SAMEORIGIN',
    'Permissions-Policy': 'camera=(), microphone=(self), geolocation=(), payment=(), usb=(), gamepad=(self), fullscreen=(self)',
    'X-Robots-Tag': 'noindex, nofollow',
  };
}

function entryPage({ addresses, port, host }) {
  const urls = addresses.map(address => `http://${address}:${port}/?lan=1`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Skybreak — LAN Party</title><style>
  :root{color-scheme:dark}*{box-sizing:border-box}body{font:16px/1.6 system-ui,sans-serif;background:#07131d;color:#e3f1f7;margin:0;padding:24px}main{max-width:900px;margin:auto}h1{letter-spacing:.1em;color:#7ee6eb;margin-bottom:0}a{color:#8bf0f5}a.play,button{display:inline-block;background:#80e7eb;color:#06202a;border:0;border-radius:8px;padding:13px 22px;font:700 16px system-ui;text-decoration:none;cursor:pointer}section{border:1px solid #385667;border-radius:14px;padding:20px;margin:20px 0;background:#102432}.links{display:flex;flex-wrap:wrap;gap:20px}.address{flex:1;min-width:min(100%,240px)}.address img{width:180px;height:180px;background:white;padding:8px;border-radius:8px}code{overflow-wrap:anywhere}input{display:block;width:100%;padding:12px;background:#07131d;color:#e3f1f7;border:1px solid #73909c;border-radius:6px;margin:8px 0;font:inherit}.muted{color:#afc2ce}.status{white-space:pre-wrap}li{margin:8px 0}button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid #ffc06d;outline-offset:4px}</style></head><body><main><h1>SKYBREAK</h1><p>Same-Wi-Fi squadron · Local game + match server</p><a class="play" href="/?lan=1">Play on this device</a>
  <section><h2>Invite a friend nearby</h2><p>Dono devices same trusted Wi-Fi par connect karo. Friend ko neeche wala address bhejo ya QR scan karwao. <strong>localhost sirf host device par chalega.</strong></p><div class="links">${urls.length ? urls.map((url, index) => `<div class="address"><img src="/lan/qr.svg?address=${index}" alt="QR opens Skybreak on ${escapeHtml(addresses[index])}"><label for="address-${index}">LAN address ${index + 1}</label><input id="address-${index}" value="${escapeHtml(url)}" readonly><button type="button" data-copy="address-${index}">Copy address</button></div>`).join('') : '<p>No LAN IPv4 address detected. Connect the host to Wi-Fi/Ethernet and restart this launcher. You can still play locally.</p>'}</div><p id="copy-status" role="status"></p></section>
  <section><h2>Start a shared match</h2><ol><li>Host aur friend <b>Play with Friends</b> kholo.</li><li>Host private room banao; room code/invite friend ko share karo.</li><li>Friend join kare, aircraft choose kare aur Ready press kare.</li><li>Host mission start kare. Launcher window open rehni chahiye.</li></ol><p>Flight: <b>↑ nose up</b> · <b>↓ nose down</b>. Baaki controls in-game Help mein hain.</p></section>
  <section><h2>Connection check</h2><p id="diagnostics" class="status" role="status">Checking local assets and match service…</p><button id="check" type="button">Check again</button><p class="muted">Current address: ${escapeHtml(host)} · Protocol ${PROTOCOL_VERSION}</p><ul><li>Windows Firewall prompt aaye to Node.js ko sirf trusted <b>Private networks</b> par allow karo. Firewall disable ya router port-forward mat karo.</li><li>Guest/public Wi-Fi ka client isolation devices ko block kar sakta hai. Apna trusted home network use karo.</li><li>VPN/virtual adapters ke multiple addresses hon to Wi-Fi adapter wala try karo.</li><li>Internet initial setup ke baad zaroori nahi. Internet disconnect karne ke baad isi page aur match ko dono devices par test karo.</li><li>HTTP LAN pages par browser microphone, some controller/fullscreen APIs restricted ho sakti hain. Voice availability actual browser secure-context support par depend karti hai; game and text/pings work independently.</li><li>Stop karne ke liye launcher mein <b>Ctrl+C</b> dabao. Match state restart ke baad preserve nahi hoti.</li></ul></section>
  <script src="/lan/entry.js" defer></script></main></body></html>`;
}

const ENTRY_SCRIPT = `async function check(){const out=document.getElementById('diagnostics');try{const r=await fetch('/lan/status',{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const s=await r.json();out.textContent=(s.status==='healthy'?'READY':'NOT READY')+' · '+s.clients+' connected pilots · '+s.rooms+' rooms\\nBuild: '+(s.buildReady?'present':'missing')+' · WebSocket: '+s.websocket+'\\nSecure browser context: '+(window.isSecureContext?'yes':'no — microphone can be unavailable');}catch(e){out.textContent='Local server unreachable: '+e.message+'\\nKeep the launcher open and check the selected LAN address.';}}document.getElementById('check').addEventListener('click',check);document.querySelectorAll('[data-copy]').forEach(b=>b.addEventListener('click',async()=>{const input=document.getElementById(b.dataset.copy),out=document.getElementById('copy-status');try{if(!navigator.clipboard||!window.isSecureContext)throw Error();await navigator.clipboard.writeText(input.value);out.textContent='Address copied.';}catch{input.focus();input.select();out.textContent='Address selected. Press Ctrl+C or use Copy on your device.';}}));check();`;

export function createLanServer({ directory = 'dist', interfaces, gameOptions = {}, hostnames = [] } = {}) {
  const root = resolve(directory), addresses = lanAddresses(interfaces);
  const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]', hostname().toLowerCase(), `${hostname().toLowerCase()}.local`, ...addresses, ...hostnames.map(name => name.toLowerCase())]);
  let gameServer, closing, started = false;
  const validHost = request => {
    try { const url = new URL(`http://${request.headers.host}`); return !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash && allowedHosts.has(url.hostname.toLowerCase()) && (!started || Number(url.port || 80) === server.address()?.port); } catch { return false; }
  };
  const server = createServer(async (req, res) => {
    if (!validHost(req)) { res.writeHead(403, { 'Content-Type': 'text/plain' }); res.end('Unrecognized LAN host. Open an address printed by the launcher.'); return; }
    const host = req.headers.host;
    const send = (status, body, type, extra = {}) => { const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body); res.writeHead(status, { ...headers(host, type), ...extra, 'Content-Length': bytes.length }); res.end(req.method === 'HEAD' ? undefined : bytes); };
    if (!['GET', 'HEAD'].includes(req.method)) { send(405, 'Method not allowed', 'text/plain', { Allow: 'GET, HEAD' }); return; }
    let url, path;
    try { url = new URL(req.url, `http://${host}`); path = decodeURIComponent(url.pathname); } catch { send(400, 'Invalid URL', 'text/plain'); return; }
    try {
      if (path === '/health' || path === '/lan/status') {
        const health = gameServer.health?.() || { status: 'healthy', clients: gameServer.clients.size, rooms: gameServer.roomManager.rooms.size };
        send(200, JSON.stringify({ ...health, protocol: PROTOCOL_VERSION, websocket: `ws://${host}/ws`, addresses, buildReady: !!await stat(resolve(root, 'index.html')).catch(() => null), mode: 'lan', secureContextRequiredForVoice: true }), MIME['.json']); return;
      }
      if (path === '/lan' || path === '/lan/') { send(200, entryPage({ addresses, port: server.address().port, host }), MIME['.html']); return; }
      if (path === '/lan/entry.js') { send(200, ENTRY_SCRIPT, MIME['.js']); return; }
      if (path === '/lan/runtime.js') { send(200, `window.SKYBREAK_LAN=Object.freeze(${JSON.stringify({ websocketPath: '/ws', protocolVersion: PROTOCOL_VERSION, offline: true })});`, MIME['.js']); return; }
      if (path === '/lan/qr.svg') {
        const index = Number(url.searchParams.get('address'));
        if (!Number.isInteger(index) || !addresses[index]) { send(404, 'LAN address not found', 'text/plain'); return; }
        const svg = await QRCode.toString(`http://${addresses[index]}:${server.address().port}/?lan=1`, { type: 'svg', errorCorrectionLevel: 'M', margin: 4, width: 220 });
        send(200, svg, MIME['.svg']); return;
      }
      if (path.includes('\0') || path.includes('\\') || path.split('/').some(segment => segment.startsWith('.'))) { send(404, 'Not found', 'text/plain'); return; }
      const name = path === '/' ? 'index.html' : path.slice(1) + (extname(path) ? '' : '.html');
      const file = resolve(root, name), real = await realpath(file).catch(() => '');
      if (!real.startsWith(root + sep)) { send(404, 'Not found', 'text/plain'); return; }
      let body = await readFile(real);
      if (name === 'index.html') body = Buffer.from(body.toString('utf8').replace(/<head([^>]*)>/i, '<head$1><script src="/lan/runtime.js"></script>'));
      send(200, body, MIME[extname(file)] || 'application/octet-stream', path.startsWith('/assets/') ? { 'Cache-Control': 'public, max-age=31536000, immutable' } : {});
    } catch (error) {
      send(error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : 500, error.code === 'ENOENT' ? 'Asset not found' : 'Local server could not serve this request', 'text/plain');
    }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES || 16 * 1024, perMessageDeflate: false });
  // LAN has its own exact Host/Origin validation at the upgrade boundary. A saved
  // public deployment allowlist must not redirect or reject this local session.
  gameServer = new GameServer(wss, { ...gameOptions, env: { ...(gameOptions.env || process.env), SKYBREAK_ALLOWED_ORIGINS: '' } });
  server.on('upgrade', (req, socket, head) => {
    let validOrigin = true, path;
    try { path = new URL(req.url, `http://${req.headers.host}`).pathname; if (req.headers.origin) validOrigin = new URL(req.headers.origin).origin === `http://${req.headers.host}`; } catch { validOrigin = false; }
    if (!validHost(req) || !validOrigin || path !== '/ws') { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  });
  return {
    server, wss, gameServer, addresses,
    async listen(port = 4173, bind = '0.0.0.0') {
      if (started) return server.address();
      if (!await stat(resolve(root, 'index.html')).catch(() => null)) throw Error('Built game missing. Run npm run build once before starting LAN play.');
      await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(port, bind, () => { server.off('error', reject); started = true; resolveListen(); }); });
      return server.address();
    },
    close() {
      if (closing) return closing;
      closing = new Promise(resolveClose => {
        gameServer.cleanup();
        const timer = setTimeout(() => { for (const ws of wss.clients) ws.terminate(); server.closeAllConnections?.(); }, 1200);
        timer.unref?.();
        wss.close(() => { server.close(() => { clearTimeout(timer); resolveClose(); }); server.closeIdleConnections?.(); });
      });
      return closing;
    },
  };
}
