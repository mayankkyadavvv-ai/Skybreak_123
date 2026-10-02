import crypto from 'node:crypto';
import { validateMissionPreset } from '../src/shared/MissionGenerator.js';
import { RoomManager } from './RoomManager.js';
import { Matchmaker } from './Matchmaker.js';
import { PROTOCOL_VERSION, RELEASE_VERSION, RESUME_GRACE_MS, MAX_MESSAGE_BYTES, MAX_BUFFERED_BYTES, PING_KINDS, finiteVector } from '../src/shared/Protocol.js';

const clean=(s,n)=>typeof s==='string'?s.replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,n):'';
const hash=token=>crypto.createHash('sha256').update(token).digest('hex');
export class GameServer {
  constructor(wss,{env=process.env,now=Date.now,maxClients=256,maxRooms=100,resumeGraceMs=RESUME_GRACE_MS}={}){
    this.wss=wss;this.env=env;this.now=now;this.maxClients=maxClients;this.resumeGraceMs=resumeGraceMs;this.clients=new Map();this.sessions=new Map();this.roomManager=new RoomManager({maxRooms});this.matchmaker=new Matchmaker(this.roomManager);this.closing=false;this.startedAt=now();this.metrics={connections:0,messages:0,bytesIn:0,rejected:0,resumes:0,expired:0,rateLimited:0};this.origins=new Set((env.SKYBREAK_ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean));
    wss.on('connection',(ws,req)=>this.handleConnection(ws,req));this.heartbeatInterval=setInterval(()=>this.heartbeat(),1000);this.heartbeatInterval.unref?.();
  }
  send(client,message){if(client.ws?.readyState!==1)return false;if(client.ws.bufferedAmount>MAX_BUFFERED_BYTES){client.ws.close(1013,'Slow connection; resume available');return false;}try{client.ws.send(JSON.stringify(message));return true;}catch{return false;}}
  error(client,code,reason,type='error'){this.metrics.rejected++;this.send(client,{type,code,reason,message:reason,protocol:PROTOCOL_VERSION});}
  issueToken(client){if(client.tokenHash)this.sessions.delete(client.tokenHash);const token=crypto.randomBytes(32).toString('base64url');client.tokenHash=hash(token);this.sessions.set(client.tokenHash,client);return token;}
  handleConnection(ws,req){
    const origin=req?.headers?.origin;if(this.closing||this.clients.size>=this.maxClients){ws.close(1013,'Server capacity reached');return;}
    if(this.origins.size&&origin&&!this.origins.has(origin)){ws.close(1008,'Origin not allowed');return;}
    const id=crypto.randomUUID();const client={id,ws,lastSeen:this.now(),connectedAt:this.now(),lastPingAt:0,ping:30,name:`Pilot_${id.slice(0,4)}`,roomCode:null,protocol:null,disconnected:false,reservedUntil:null,buckets:new Map()};this.clients.set(id,client);this.metrics.connections++;
    this.send(client,{type:'welcome',id,protocol:PROTOCOL_VERSION,serverTime:this.now(),resumeToken:this.issueToken(client),resumeExpiresAt:null,resumeGraceMs:this.resumeGraceMs});
    ws.on('message',data=>this.handleMessage(client,data));ws.on('close',()=>this.handleDisconnect(client));ws.on('error',()=>{});
  }
  rate(client,key,rate,burst=rate){const now=this.now()/1000,b=client.buckets.get(key)||{tokens:burst,t:now};b.tokens=Math.min(burst,b.tokens+(now-b.t)*rate);b.t=now;const allowed=b.tokens>=1;if(allowed)b.tokens--;client.buckets.set(key,b);if(!allowed)this.metrics.rateLimited++;return allowed;}
  handleDisconnect(client){if(client.disconnected)return;client.disconnected=true;this.matchmaker.dequeue(client.id);if(this.clients.get(client.id)===client)this.clients.delete(client.id);if(this.closing||!client.roomCode){this.sessions.delete(client.tokenHash);this.roomManager.leaveRoom(client);return;}client.reservedUntil=this.now()+this.resumeGraceMs;this.roomManager.disconnect(client,client.reservedUntil);}
  heartbeat(){const now=this.now();for(const c of this.clients.values()){if(now-c.lastSeen>20000||!c.protocol&&now-c.connectedAt>10000){c.ws.terminate();this.handleDisconnect(c);}else if(now-c.lastPingAt>=5000){this.send(c,{type:'server_ping',t:now});c.lastPingAt=now;}}for(const [key,c] of this.sessions)if(c.disconnected&&c.reservedUntil&&now>=c.reservedUntil){this.roomManager.leaveRoom(c);this.sessions.delete(key);this.metrics.expired++;}for(const [code,room] of this.roomManager.rooms)if(room.state!=='in_game'&&now-room.lastActivityAt>60*60*1000){for(const p of room.players.values()){const c=this.clients.get(p.id)||[...this.sessions.values()].find(s=>s.id===p.id);if(c){this.send(c,{type:'room_expired',reason:'Inactive party expired'});this.roomManager.leaveRoom(c);}}room.cleanup();this.roomManager.rooms.delete(code);}}
  resume(client,msg){
    if(typeof msg.token!=='string'||msg.token.length<40||msg.token.length>100)return this.error(client,'INVALID_TOKEN','Resume credential is invalid','resume_error');
    const previous=this.sessions.get(hash(msg.token));if(previous&&!previous.disconnected&&this.now()-previous.lastSeen>6000){previous.ws.terminate();this.handleDisconnect(previous);}
    if(!previous||!previous.disconnected||!previous.reservedUntil||this.now()>previous.reservedUntil||!this.roomManager.getRoomByClient(previous.id)){return this.error(client,'RESUME_EXPIRED','Session is active, expired or unavailable. Join the party again.','resume_error');}
    const temporaryId=client.id;this.clients.delete(temporaryId);this.sessions.delete(client.tokenHash);this.sessions.delete(previous.tokenHash);
    Object.assign(client,{id:previous.id,name:previous.name,roomCode:previous.roomCode,protocol:PROTOCOL_VERSION,ping:previous.ping,reservedUntil:null,disconnected:false,lastSeen:this.now(),tokenHash:null});this.clients.set(client.id,client);this.roomManager.resume(client);this.metrics.resumes++;
    const room=this.roomManager.getRoomByClient(client.id);const token=this.issueToken(client),p=room.players.get(client.id);
    this.send(client,{type:'session_resumed',id:client.id,myId:client.id,protocol:PROTOCOL_VERSION,resumeToken:token,resumeExpiresAt:null,resumeGraceMs:this.resumeGraceMs,room:room.getLobbyState(),snapshot:room.match?.snapshotFor(client.id)||null,options:room.options,myTeam:p.team,inputEpoch:room.match?.players.get(client.id)?.inputEpoch});if(room.state==='in_game'&&room.match)room.sendStart(client.id,{resumed:true});else if(room.state==='post_match')this.send(client,room.getResult());
  }
  handleMessage(client,raw){
    if(client.disconnected||this.closing)return;if(raw.length>MAX_MESSAGE_BYTES){client.ws.close(1009,'Message too large');return;}this.metrics.bytesIn+=raw.length;this.metrics.messages++;if(!this.rate(client,'all',160,260)){if(!this.rate(client,'overload',2,8))client.ws.close(1008,'Message rate exceeded');return;}
    let msg;try{msg=JSON.parse(raw.toString());}catch{return this.error(client,'INVALID_JSON','Expected a JSON message');}if(!msg||typeof msg!=='object'||Array.isArray(msg)||typeof msg.type!=='string')return this.error(client,'INVALID_MESSAGE','Invalid message');client.lastSeen=this.now();
    const type=msg.type;if(type==='hello'){if(msg.protocol!==PROTOCOL_VERSION)return this.error(client,'PROTOCOL_MISMATCH','Game and match server versions differ. Reload the game.','protocol_error');client.protocol=PROTOCOL_VERSION;this.send(client,{type:'hello',protocol:PROTOCOL_VERSION,serverTime:this.now()});return;}
    if(type==='ping'){this.send(client,{type:'pong',t:msg.t,serverTime:this.now()});return;}
    if(type==='server_pong'){if(Number.isFinite(msg.t)&&msg.t===client.lastPingAt){client.ping=Math.max(1,this.now()-msg.t);const room=this.roomManager.getRoomByClient(client.id);if(room?.players.has(client.id))room.players.get(client.id).ping=client.ping;if(room?.match?.players.has(client.id))room.match.players.get(client.id).ping=client.ping;}return;}
    if(type==='resume_session'){if(this.rate(client,'resume',.5,3))this.resume(client,msg);return;}
    if(client.protocol!==PROTOCOL_VERSION)return this.error(client,'HELLO_REQUIRED','Send hello with protocol 2 before joining.','protocol_error');
    if(type==='set_name'){client.name=clean(msg.name,16)||client.name;const r=this.roomManager.getRoomByClient(client.id),p=r?.players.get(client.id);if(p){p.name=client.name;r.broadcastLobbyState();}return;}
    if(type==='quick_match'){if(this.rate(client,'rooms',.3,3))this.matchmaker.enqueue(client,msg.mode||'1v1',client.name);return;}
    if(type==='cancel_quick_match'){this.matchmaker.dequeue(client.id);this.send(client,{type:'matchmaking_cancelled'});return;}
    if(type==='create_room'){if(msg.options?.missionPreset){const preset=validateMissionPreset(msg.options.missionPreset);if(!preset.ok)return this.error(client,'PRESET',preset.errors.join(' '),'join_error');}if(!this.rate(client,'rooms',.3,3))return this.error(client,'ROOM_RATE','Wait a moment before creating another room');try{const room=this.roomManager.createRoom(client,msg.options||{});this.send(client,{type:'room_joined',room:room.getLobbyState()});room.broadcastLobbyState();}catch(err){this.error(client,'CAPACITY',err.message,'join_error');}return;}
    if(type==='join_room'){if(!this.rate(client,'rooms',.3,3))return this.error(client,'ROOM_RATE','Wait a moment before joining again');const r=this.roomManager.joinRoom(msg.code,client,client.name);if(!r.success)this.error(client,'JOIN_FAILED',r.reason,'join_error');else{this.send(client,{type:'room_joined',room:r.room.getLobbyState()});if(r.room.state==='in_game')r.room.sendStart(client.id);r.room.broadcastLobbyState();}return;}
    if(type==='leave_room'){this.voiceLeave(client);this.roomManager.leaveRoom(client);this.send(client,{type:'left_room'});return;}
    const room=this.roomManager.getRoomByClient(client.id);if(!room)return;const player=room.players.get(client.id);
    if(['set_ready','set_team','set_aircraft','update_room_settings','start_match','rematch','return_lobby','vote','loaded'].includes(type)){
      if(!this.rate(client,'settings',8,16))return;
      if(type==='set_ready')room.setPlayerReady(client.id,msg.ready);
      if(type==='set_team')room.setPlayerTeam(client.id,msg.team);
      if(type==='set_aircraft')room.setPlayerAircraft(client.id,msg.jetModel,msg.liveryId);
      if(type==='loaded'){player.loaded=true;room.broadcastLobbyState();}
      if(type==='update_room_settings'){const r=room.updateSettings(client.id,msg.settings||{});if(!r.success)this.error(client,'SETTINGS',r.reason,'settings_error');}
      if(type==='vote'&&!room.vote(client.id,msg))this.error(client,'VOTE','That vote is not valid for this party');
      if(type==='start_match'&&(client.id!==room.hostId||!room.startCountdown()))this.error(client,'START','Host, two connected pilots, valid teams, completed loading and readiness are required','start_error');
      if(['rematch','return_lobby'].includes(type)&&client.id===room.hostId)room.rematch();return;
    }
    if(type==='voice_join'){if(this.rate(client,'voice_join',.5,2))this.voiceJoin(client,room);return;}
    if(type==='voice_leave'){this.voiceLeave(client);return;}
    if(type==='voice_signal'){this.voiceSignal(client,room,msg);return;}
    if(type==='quick_comm'){if(!this.rate(client,'chat',1,4))return;const message={type:'quick_comm',senderId:client.id,senderName:player.name,team:player.team,commKey:clean(msg.commKey,24),commText:clean(msg.commText,160)||'Radio check',targetTeamOnly:msg.teamOnly!==false};for(const p of room.players.values())if(!message.targetTeamOnly||p.team===player.team)room.sendTo(p.id,message);return;}
    if(room.state!=='in_game'||!room.match)return;
    if(type==='input'){const r=room.match.acceptInputs(client.id,msg);if(!r.ok)this.error(client,r.reason,r.reason,'input_rejected');return;}
    if(type==='telemetry'){this.error(client,'INPUT_REQUIRED','Position telemetry is not accepted. Send sequenced input.','input_rejected');return;}
    if(type==='team_ping'){this.teamPing(client,room,msg);return;}
    if(type==='ping_ack'){const ping=room.match.pings.find(p=>p.id===msg.pingId&&p.team===player.team&&p.expiresAt>room.match.now());if(ping&&this.rate(client,'ping_ack',1,3)){for(const p of room.players.values())if(p.team===player.team)room.sendTo(p.id,{type:'ping_ack',pingId:ping.id,playerId:client.id});}return;}
    if(type==='activity_start'){if(client.id===room.hostId&&this.rate(client,'activity',.1,2)&&room.match.startActivity(msg.activity,msg.options||{}))room.broadcast({type:'activity_snapshot',activity:room.match.activity.snapshot()});return;}
    if(type==='activity_cancel'){if(client.id===room.hostId)room.match.activity=null;return;}
    if(type==='squadron_order'){if(this.rate(client,'orders',1,3)&&room.match.setOrder(client.id,msg.order,msg.targetId))room.broadcast({type:'squadron_order',senderId:client.id,order:msg.order,targetId:msg.targetId||null});return;}
    if(type==='fire_cannon'){if(!this.rate(client,'cannon',20,4))return;const b=room.match.handleFireCannon(client.id,msg);if(b)room.broadcast({type:'cannon_fired',bId:b.id,ownerId:client.id,pos:b.position,vel:b.velocity});return;}
    if(type==='fire_missile'){if(!this.rate(client,'missile',2,3))return;const m=room.match.handleFireMissile(client.id,msg);if(m){room.broadcast({type:'missile_launched',mId:m.id,ownerId:client.id,targetId:m.targetId,pos:m.position,dir:m.direction,speed:m.speed});room.sendTo(m.targetId,{type:'missile_warning',mId:m.id,shooterId:client.id});}else this.error(client,'MISSILE_NOT_READY','Acquire a valid server lock and wait for the weapon cooldown','action_rejected');return;}
    if(type==='deploy_flares'){const n=room.match.handleDeployFlares(client.id);if(n!==null)room.broadcast({type:'flares_deployed',playerId:client.id,diverted:n});return;}
    if(type==='airbase_rearm'){if(room.match.rearmPlayer(client.id,msg.baseId))this.send(client,{type:'rearmed',baseId:msg.baseId});else this.error(client,'REARM_UNAVAILABLE','Stop on an authorized runway with gear down; repair cooldown applies','action_rejected');return;}
  }
  teamPing(client,room,msg){
    if(!this.rate(client,'ping',.5,3)||!PING_KINDS.includes(msg.kind))return;const p=room.match.players.get(client.id);if(!p?.alive)return;let position,targetId=null;
    if(typeof msg.targetId==='string'){const target=room.match.players.get(msg.targetId);if(!target?.alive||dist(target.position,p.position)>20000||target.team!==p.team&&!room.match.hasLineOfSight(p.position,target.position))return;position={...target.position};targetId=target.id;}
    else if(finiteVector(msg.position)&&Math.abs(msg.position.x)<=95000&&Math.abs(msg.position.z)<=95000&&msg.position.y>=0&&msg.position.y<=16000&&dist(msg.position,p.position)<=20000)position={...msg.position};else return;
    const id=`${room.match.epoch}:${++room.match.pingSeq}`,ping={id,pingId:id,kind:msg.kind,targetId,position,senderId:client.id,senderName:p.name,team:p.team,expiresAt:room.match.now()+10000};room.match.pings.push(ping);if(room.match.pings.length>24)room.match.pings.shift();for(const t of room.players.values())if(t.team===p.team)room.sendTo(t.id,{type:'team_ping',...ping});
  }
  voiceConfig(client){const iceServers=[],stun=(this.env.SKYBREAK_STUN_URLS||'').split(',').filter(u=>/^stuns?:[^\s]+$/.test(u)),turn=(this.env.SKYBREAK_TURN_URLS||'').split(',').filter(u=>/^turns?:[^\s]+$/.test(u));if(stun.length)iceServers.push({urls:stun.slice(0,4)});const relayAvailable=turn.length>0&&!!this.env.SKYBREAK_TURN_SECRET;let expiresAt=null;if(relayAvailable){expiresAt=this.now()+10*60*1000;const username=`${Math.floor(expiresAt/1000)}:${client.id}`,credential=crypto.createHmac('sha1',this.env.SKYBREAK_TURN_SECRET).update(username).digest('base64');iceServers.push({urls:turn.slice(0,4),username,credential});}return{iceServers,relayAvailable,expiresAt,reason:relayAvailable?null:'TURN relay has not been configured; cross-network voice is not verified.'};}
  voiceJoin(client,room){const p=room.players.get(client.id);if(!p?.connected)return;p.voice=true;const peers=[...room.players.values()].filter(t=>t.id!==p.id&&t.connected&&t.voice&&t.team===p.team);this.send(client,{type:'voice_config',...this.voiceConfig(client),peers:peers.map(t=>t.id)});for(const t of peers)room.sendTo(t.id,{type:'voice_peer_joined',id:p.id});}
  voiceLeave(client){const room=this.roomManager.getRoomByClient(client.id),p=room?.players.get(client.id);if(!p)return;p.voice=false;for(const t of room.players.values())if(t.team===p.team)room.sendTo(t.id,{type:'voice_peer_left',id:p.id});}
  voiceSignal(client,room,msg){const p=room.players.get(client.id),target=room.players.get(msg.targetId);if(!p?.voice||!target?.voice||!target.connected||p.team!==target.team||p.id===target.id||!this.rate(client,'signal',12,30))return;const relay={type:'voice_signal',fromId:client.id};if(msg.description&&['offer','answer'].includes(msg.description.type)&&typeof msg.description.sdp==='string'&&msg.description.sdp.length<=12000)relay.description={type:msg.description.type,sdp:msg.description.sdp};else if(msg.candidate===null)relay.candidate=null;else if(msg.candidate&&typeof msg.candidate.candidate==='string'&&msg.candidate.candidate.length<1800)relay.candidate={candidate:msg.candidate.candidate,sdpMid:typeof msg.candidate.sdpMid==='string'?msg.candidate.sdpMid.slice(0,100):null,sdpMLineIndex:Number.isInteger(msg.candidate.sdpMLineIndex)?msg.candidate.sdpMLineIndex:null};else return;room.sendTo(target.id,relay);}
  health(){return{status:this.closing?'draining':'healthy',protocol:PROTOCOL_VERSION,game:'Skybreak',version:RELEASE_VERSION,capacity:{clients:this.maxClients,rooms:this.roomManager.maxRooms},uptime:Math.round((this.now()-this.startedAt)/1000),clients:this.clients.size,rooms:this.roomManager.rooms.size,reservations:[...this.sessions.values()].filter(c=>c.disconnected).length,metrics:{...this.metrics},roomMetrics:[...this.roomManager.rooms.values()].map(r=>({state:r.state,players:r.players.size,...r.metrics}))};}
  cleanup(){if(this.closing)return;this.closing=true;clearInterval(this.heartbeatInterval);for(const r of this.roomManager.rooms.values())r.cleanup();this.roomManager.rooms.clear();this.roomManager.clientRooms.clear();for(const q of Object.values(this.matchmaker.queues))q.length=0;for(const c of this.clients.values()){c.disconnected=true;c.ws.close(1001,'Server shutdown');const timer=setTimeout(()=>c.ws.terminate(),1000);timer.unref?.();c.ws.once('close',()=>clearTimeout(timer));}this.clients.clear();this.sessions.clear();}
}
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
