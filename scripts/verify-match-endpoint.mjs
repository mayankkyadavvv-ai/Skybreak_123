import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import WebSocket from 'ws';
import { PROTOCOL_VERSION, RELEASE_VERSION } from '../src/shared/Protocol.js';

export function endpointOptions(endpoint, origin) {
  const url = new URL(endpoint), site = new URL(origin);
  const loopback = host => ['127.0.0.1', 'localhost', '[::1]'].includes(host);
  if (url.username || url.password || url.search || url.hash || !['ws:', 'wss:'].includes(url.protocol) || url.protocol === 'ws:' && !loopback(url.hostname)) throw Error('Use WSS; insecure WS is allowed only on loopback for local verification. No credentials/query/fragment in the URL.');
  if (site.username || site.password || site.search || site.hash || site.pathname !== '/' || !['https:', 'http:'].includes(site.protocol) || site.protocol === 'http:' && !loopback(site.hostname)) throw Error('Provide the exact authorized HTTPS frontend origin. HTTP is local-only.');
  const health = new URL('/ready', url); health.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  return { url: url.href, origin: site.origin, health: health.href, secureTransport: url.protocol === 'wss:' };
}

class Pilot {
  constructor(url, origin, timeout) {
    this.timeout = timeout; this.messages = []; this.waiters = []; this.failure = null;
    this.ws = new WebSocket(url, { origin, handshakeTimeout: timeout, maxPayload: 1024 * 1024 });
    this.ws.on('error', () => this.fail(Error('WebSocket connection failed; inspect the endpoint, TLS and allowed origin.')));
    this.ws.on('close', () => this.fail(Error('WebSocket closed before the expected protocol response.')));
    this.ws.on('message', raw => {
      let message; try { message = JSON.parse(raw.toString()); } catch { this.fail(Error('Server returned invalid JSON')); return; }
      if (message.type === 'server_ping') { this.send({ type: 'server_pong', t: message.t }); return; }
      if (message.type === 'error' || /_error$|_rejected$/.test(message.type)) { this.fail(Error(`Server rejected the smoke check: ${String(message.code || message.type).slice(0,80)}`)); return; }
      const index = this.waiters.findIndex(w => w.accept(message));
      if (index >= 0) { const w = this.waiters.splice(index,1)[0]; clearTimeout(w.timer); w.resolve(message); }
      else { this.messages.push(message); if (this.messages.length > 160) this.messages.shift(); }
    });
  }
  fail(error) { this.failure ||= error; for (const w of this.waiters.splice(0)) { clearTimeout(w.timer); w.reject(error); } }
  send(message) { if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message)); }
  receive(type, predicate = () => true) {
    const accept = message => message.type === type && predicate(message), index = this.messages.findIndex(accept);
    if (index >= 0) return Promise.resolve(this.messages.splice(index,1)[0]);
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve,reject) => {
      const w = { accept, resolve, reject, timer: null };
      w.timer = setTimeout(() => { this.waiters.splice(this.waiters.indexOf(w),1); reject(Error(`Timed out waiting for ${type}`)); },this.timeout);
      this.waiters.push(w);
    });
  }
  async disconnect() {
    if (this.ws.readyState === WebSocket.CLOSED) return;
    await new Promise(resolve => { const timer=setTimeout(()=>{this.ws.terminate();resolve();},1000);this.ws.once('close',()=>{clearTimeout(timer);resolve();});this.ws.close(); });
  }
  async leave() { if(this.ws.readyState === WebSocket.OPEN){this.send({type:'leave_room'});await this.receive('left_room');} }
}

// Only exercise an endpoint the operator owns/has permission to test. Creates one private QA room.
export async function verifyMatchEndpoint({ endpoint, origin, expectedRevision = '', requireRelay = false, timeout = 10000, reconnectMs = 10000 } = {}) {
  const report = { startedAt: new Date().toISOString(), status: 'running', checks: [], errors: [], voiceRelayMediaVerified: false, humanPlayers: 0 };
  const pilots = []; let host, guest, guestToken, roomCreated = false, guestDisconnected = false;
  const check = (condition, label) => { if (!condition) throw Error(label); report.checks.push(label); };
  try {
    const options = endpointOptions(endpoint, origin); report.endpoint = options.url; report.frontendOrigin = options.origin; report.secureTransport = options.secureTransport;
    if (expectedRevision && !/^[a-f0-9]{40}$/.test(expectedRevision)) throw Error('Expected revision must be a full Git SHA');
    const response = await fetch(options.health, { redirect:'error', signal:AbortSignal.timeout(timeout) });
    check(response.ok, 'Readiness returns HTTP 200'); const health = await response.json();
    check(health.status === 'healthy' && health.protocol === PROTOCOL_VERSION && health.version === RELEASE_VERSION, 'Worker version and protocol match this client');
    if (expectedRevision) check(health.deployment?.revision === expectedRevision, 'Deployed worker reports the expected source revision');
    report.deployment = health.deployment; report.reconnectMs = reconnectMs;
    // Avoid consuming the only room or changing an existing player's match.
    check(health.rooms === 0 && health.clients === 0 && health.reservations === 0, 'Worker is idle before the private QA session');
    const connect = async () => { const p = new Pilot(options.url, options.origin, timeout); pilots.push(p); const welcome = await p.receive('welcome'); check(welcome.protocol === PROTOCOL_VERSION, 'Socket welcome confirms protocol'); return { p, welcome }; };
    const a = await connect(), b = await connect(); host = a.p; guest = b.p; guestToken = b.welcome.resumeToken;
    for (const [i,p] of [host,guest].entries()) { p.send({type:'hello',protocol:PROTOCOL_VERSION});await p.receive('hello');p.send({type:'set_name',name:`QA deploy ${i+1}`}); }
    host.send({type:'create_room',options:{mode:'free_flight',matchDuration:300}});
    const created = await host.receive('room_joined'); roomCreated = true;
    guest.send({type:'join_room',code:created.room.roomCode}); const joined = await guest.receive('room_joined');
    check(joined.room.players.length === 2 && joined.room.players.some(p=>p.id===a.welcome.id) && joined.room.players.some(p=>p.id===b.welcome.id), 'Create/join returns the same two pilots');
    host.send({type:'voice_join'}); const voice = await host.receive('voice_config');
    report.relayConfigured = voice.relayAvailable === true;
    if (voice.relayAvailable) {
      const relay = voice.iceServers?.find(s=>s.credential);
      check(!!relay && typeof relay.username === 'string' && typeof relay.credential === 'string' && relay.credential.length > 20 && voice.expiresAt > Date.now() && voice.expiresAt <= Date.now()+610000, 'Party member receives short-lived TURN credentials');
      // Credentials are used only in memory, never saved in the report.
    } else check(voice.relayAvailable === false && !requireRelay, requireRelay ? 'TURN is required but the worker has no relay configuration' : 'Worker explicitly reports relay unavailable; media remains unverified');
    host.send({type:'voice_leave'});
    host.send({type:'loaded'});guest.send({type:'loaded'});guest.send({type:'set_ready',ready:true});
    await host.receive('lobby_update',m=>m.players.length===2&&m.players.every(p=>p.loaded&&p.ready));host.send({type:'start_match'});
    const [startA,startB] = await Promise.all([host.receive('game_started'),guest.receive('game_started')]);
    check(startA.snapshot.epoch === startB.snapshot.epoch, 'Ready/start shares one authoritative epoch');
    const self = startB.snapshot.players.find(p=>p.id===b.welcome.id);
    guest.send({type:'input',epoch:startB.snapshot.epoch,inputEpoch:self.inputEpoch,inputs:[{seq:1,pitch:.25,throttleSet:.6,gearDown:false,assisted:true}]});
    await guest.receive('snapshot',m=>m.s.players.some(p=>p.id===b.welcome.id&&p.ack>=1));check(true,'Authoritative snapshots acknowledge a real flight input');
    await guest.disconnect();guestDisconnected=true;await host.receive('player_disconnected',m=>m.playerId===b.welcome.id);
    await new Promise(resolve=>setTimeout(resolve,reconnectMs));
    const resumed = await connect();guest=resumed.p;guest.send({type:'resume_session',token:guestToken});
    const session=await guest.receive('session_resumed');guestToken=session.resumeToken;guestDisconnected=false;
    const flight=await guest.receive('game_started');
    check(session.id===b.welcome.id&&session.resumeToken!==b.welcome.resumeToken&&flight.snapshot.epoch===startB.snapshot.epoch,'Disconnect/resume preserves identity and epoch and rotates the private token');
    check(flight.snapshot.roster.filter(p=>p.id===b.welcome.id).length===1,'Resume does not duplicate a pilot');
    report.status='passed-automated';
  } catch(error) { report.status='failed';report.errors.push(error.message); }
  finally {
    // Retry a reserved guest only for cleanup, using its own private credential.
    if(guestDisconnected&&guestToken&&report.endpoint){try{const p=new Pilot(report.endpoint,report.frontendOrigin,Math.min(timeout,3000));pilots.push(p);await p.receive('welcome');p.send({type:'resume_session',token:guestToken});await p.receive('session_resumed');guest=p;}catch{}}
    for(const p of [guest,host].filter(Boolean)){try{await p.leave();}catch{}}
    await Promise.all(pilots.map(p=>p.disconnect()));
    if(roomCreated){try{const {health}=endpointOptions(endpoint,origin);const r=await fetch(health,{redirect:'error',signal:AbortSignal.timeout(timeout)});const h=await r.json();check(r.ok&&h.rooms===0&&h.clients===0&&h.reservations===0,'QA room, clients and reservations are cleaned up');}catch(error){report.status='failed';report.errors.push(error.message);}}
    report.finishedAt=new Date().toISOString();
  }
  return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const endpoint=process.env.SKYBREAK_VERIFY_ENDPOINT,origin=process.env.SKYBREAK_VERIFY_ORIGIN;
  if(!endpoint||!origin){console.error('Set SKYBREAK_VERIFY_ENDPOINT and SKYBREAK_VERIFY_ORIGIN for your authorized worker. No endpoint was contacted.');process.exitCode=2;}
  else{const report=await verifyMatchEndpoint({endpoint,origin,expectedRevision:process.env.SKYBREAK_VERIFY_REVISION||'',requireRelay:process.env.SKYBREAK_VERIFY_REQUIRE_RELAY==='1'});const path=process.env.SKYBREAK_VERIFY_OUTPUT||'qa-artifacts/endpoint-smoke.json';await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks.length,relayConfigured:report.relayConfigured,voiceRelayMediaVerified:false,report:path,errors:report.errors}));process.exitCode=report.status==='passed-automated'?0:1;}
}
