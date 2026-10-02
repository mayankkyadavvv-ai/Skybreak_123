import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { MatchState } from '../server/MatchState.js';
import { Room, safeOptions } from '../server/Room.js';
import { GameServer } from '../server/GameServer.js';
import { validateInputBatch } from '../src/shared/Protocol.js';
import { createMissionPreset } from '../src/shared/MissionGenerator.js';
import { RUNWAYS } from '../src/shared/WorldGeometry.js';
import { AEGIS_LANDMARKS, segmentOccludedByAegis } from '../src/shared/AegisLandmarks.js';

function fixture(options={}){const events=[],state=new MatchState({broadcast:event=>events.push(event)},options);const a=state.initPlayer({id:'a',name:'A',team:'blue'}),b=state.initPlayer({id:'b',name:'B',team:options.mode==='open_skies_coop'?'blue':'red'});return {state,a,b,events};}
test('F32 sequenced input advances shared flight and invalid/duplicate/future intents cannot accelerate time',()=>{
  const {state,a}=fixture();const before=a.position.clone();
  assert.equal(state.acceptInputs('a',{epoch:'bad',inputEpoch:a.inputEpoch,inputs:[{seq:1,pitch:1}]}).ok,false);
  assert.equal(state.acceptInputs('a',{epoch:state.epoch,inputEpoch:a.inputEpoch,inputs:[{seq:1,pitch:NaN}]}).ok,false);
  assert.equal(state.acceptInputs('a',{epoch:state.epoch,inputEpoch:a.inputEpoch,inputs:[{seq:9999,pitch:1}]}).ok,false);
  const packet={epoch:state.epoch,inputEpoch:a.inputEpoch,inputs:[{seq:1,pitch:1,roll:99,assisted:true}]};assert.equal(state.acceptInputs('a',packet).ok,true);state.acceptInputs('a',packet);assert.equal(a.inputQueue.length,1);
  state.tick(1/60);assert.equal(a.ack,1);assert.equal(state.tickNumber,1);assert.ok(a.position.distanceTo(before)>0);assert.ok(a.position.distanceTo(before)<20);assert.ok(a.angular.z<0);
  const saved=a.position.clone();state.updateTelemetry('a',{position:{x:90000,y:9999,z:90000},hp:9999});assert.ok(a.position.equals(saved));assert.equal(a.hp,100);
});
test('F32 missiles require server lock, consume once and reject friendly/forged targets',()=>{
  const {state,a,b}=fixture({weaponsEnabled:true});a.position.set(0,1500,0);b.position.set(0,1500,-2000);a.targetId='b';
  assert.equal(state.handleFireMissile('a',{targetId:'b'}),null);state.updateLock(a,1.5);assert.equal(a.lock.locked,true);
  assert.ok(state.handleFireMissile('a',{targetId:'b'}));assert.equal(a.missiles,5);assert.equal(state.handleFireMissile('a',{targetId:'b'}),null);assert.equal(state.handleFireMissile('a',{targetId:'a'}),null);assert.equal(a.missiles,5);
});
test('F28/F32 only a stopped server aircraft on a runway can repair and cooldown is enforced',()=>{
  const {state,a}=fixture(),base=RUNWAYS[0];a.hp=25;a.systems.engine=.3;assert.equal(state.rearmPlayer('a',base.id),false);
  a.position.set(base.x,base.elevation+3.2,base.z);a.currentBase=base.id;a.isLanded=true;a.gearDown=true;a.speed=0;
  assert.equal(state.rearmPlayer('a',base.id),true);assert.equal(a.hp,100);assert.equal(a.systems.engine,1);assert.equal(state.rearmPlayer('a',base.id),false);
});
test('F27 snapshots hide out-of-sensor enemies from live replay/spectator data while retaining public roster',()=>{
  const {state,a,b}=fixture();a.position.set(0,1500,0);b.position.set(50000,2000,50000);const hidden=state.snapshotFor('a');assert.deepEqual(hidden.players.map(p=>p.id),['a']);assert.equal(hidden.roster.length,2);assert.equal('pos' in hidden.roster[1],false);
  b.position.set(0,1500,-2000);assert.ok(state.snapshotFor('a').players.some(p=>p.id==='b'));
  const bridge=AEGIS_LANDMARKS.find(p=>p.kind==='bridge'),deck=bridge.parts[0];assert.equal(segmentOccludedByAegis({x:deck.x-100,y:deck.y,z:deck.z},{x:deck.x+100,y:deck.y,z:deck.z}),true);
});
test('F37 capture excludes shielded/disconnected pilots, contest stops points and ties are shared',()=>{
  const {state,a,b}=fixture({mode:'air_superiority',scoreLimit:50});const z=state.zone;a.position.set(z.position.x,1600,z.position.z);b.position.copy(a.position);b.connected=false;
  state.stepZone(1);assert.equal(z.blue,0);a.spawnProtectedUntil=0;for(let i=0;i<9;i++)state.stepZone(1);assert.equal(z.owner,'blue');assert.ok(state.teamScores.blue>0);assert.equal(b.score,0);
  b.spawnProtectedUntil=0;b.connected=true;const prior=state.teamScores.blue;state.stepZone(1);assert.equal(z.contested,true);assert.equal(state.teamScores.blue,prior);
  state.teamScores.blue=9;state.teamScores.red=9;state.timeRemaining=0;state.checkWinConditions();assert.equal(state.winner.team,'draw');
});
test('F12/F34 rooms enforce host configuration and shared presets, preserve fair stock rules and co-op teams',()=>{
  const client=id=>({id,name:id,ws:{readyState:1,send(){}}}),host=client('a'),room=new Room('SKY-1234',host,{mode:'free_flight'});try{room.addPlayer(client('b'),'B');assert.ok([...room.players.values()].every(p=>p.team==='blue'));
    assert.equal(room.updateSettings('b',{mode:'1v1'}).success,false);assert.equal(room.updateSettings('a',{missionPreset:{bad:true}}).success,false);const preset=createMissionPreset({template:'escort'});assert.equal(room.updateSettings('a',{mode:'open_skies_coop',missionPreset:preset}).success,true);assert.deepEqual(room.options.missionPreset,preset);assert.equal(room.options.loadoutRule,'stock_equal_budget');
  }finally{room.cleanup();}
});
function socket(){const ws=new EventEmitter();ws.readyState=1;ws.bufferedAmount=0;ws.messages=[];ws.send=raw=>ws.messages.push(JSON.parse(raw));ws.close=()=>{ws.readyState=3;ws.emit('close');};ws.terminate=ws.close;return ws;}
test('F34 loading and changed countdown rosters cannot start invalid parties',()=>{
  const client=id=>({id,name:id,ws:{readyState:1,send(){}}}),room=new Room('SKY-4455',client('a'),{mode:'2v2'});
  try{for(const id of ['b','c','d'])room.addPlayer(client(id),id);for(const p of room.players.values())p.ready=true;assert.equal(room.canStart(),false);
    for(const p of room.players.values())p.loaded=true;assert.equal(room.canStart(),true);assert.equal(room.startCountdown(),true);room.disconnectPlayer('b',Date.now()+45000);assert.equal(room.state,'lobby');assert.equal(room.countdownTimer,null);assert.equal(room.canStart(),false);
  }finally{room.cleanup();}
});
test('F30 invalid room preset is rejected without replacing the current party',()=>{
  const wss=new EventEmitter(),server=new GameServer(wss);try{const ws=socket();wss.emit('connection',ws);const client=server.clients.get(ws.messages[0].id);client.protocol=2;const room=server.roomManager.createRoom(client,{mode:'free_flight'});
    server.handleMessage(client,Buffer.from(JSON.stringify({type:'create_room',options:{missionPreset:{version:999,enemyBudget:9000}}})));assert.equal(server.roomManager.getRoomByClient(client.id),room);assert.ok(ws.messages.some(m=>m.type==='join_error'&&m.code==='PRESET'));
  }finally{server.cleanup();}
});
test('F26 server wingmen respond to cover/attack/regroup and defend a damaged teammate',()=>{
  const {state,a,b}=fixture({mode:'open_skies_coop'});state.elapsed=1;a.position.set(0,6000,0);b.position.set(500,6000,0);b.hp=25;
  const wing=state.initPlayer({id:'wing-1',team:'blue',bot:true,role:'wingman'});wing.position.set(200,6000,300);
  const hostile=state.initPlayer({id:'enemy',team:'red',bot:true});hostile.position.set(500,6000,-2000);hostile.targetId=b.id;
  state.setOrder('a','cover');const cover=state.botCommand(wing,1/60);assert.equal(wing.coveringId,'b');assert.equal(cover.targetId,'enemy');
  state.setOrder('a','regroup');const regroup=state.botCommand(wing,1/60);assert.equal(regroup.targetId,null);assert.equal(wing.aiState,'regrouping');
  state.setOrder('a','attack','enemy');state.botCommand(wing,1/60);assert.equal(wing.aiState,'pincer approach');assert.equal(a.order,'cover');assert.equal(b.order,'cover');
});
test('F29 shared activities start at the host aircraft and choose a reachable local base',()=>{
  const {state,a}=fixture({mode:'free_flight'});state.room.hostId='a';a.position.set(1234,1700,4567);assert.equal(state.startActivity('race'),true);assert.deepEqual(state.activity.origin,{x:1234,y:1700,z:4567});assert.equal(state.activity.participants.size,2);assert.equal(state.startActivity('landing'),true);assert.ok(state.activity.base.id);
});
test('F35 secure resume rotates credentials and keeps damaged same seat; invalid/expired token cannot reclaim it',()=>{
  let time=1000;const wss=new EventEmitter(),server=new GameServer(wss,{now:()=>time,resumeGraceMs:45000});try{
    const ws=socket();wss.emit('connection',ws);const welcome=ws.messages[0],client=server.clients.get(welcome.id);client.protocol=2;const room=server.roomManager.createRoom(client,{mode:'1v1'});room.match=new MatchState(room);const p=room.match.initPlayer({id:client.id,team:'blue'});p.hp=43;p.score=740;room.state='in_game';ws.close();time+=10000;
    const next=socket();wss.emit('connection',next);const temporary=server.clients.get(next.messages[0].id);server.resume(temporary,{token:welcome.resumeToken});const resumed=next.messages.find(m=>m.type==='session_resumed');assert.equal(resumed.id,welcome.id);assert.notEqual(resumed.resumeToken,welcome.resumeToken);assert.equal(room.match.players.size,1);assert.equal(room.match.players.get(welcome.id).hp,43);assert.equal(room.match.players.get(welcome.id).score,740);
    const bad=socket();wss.emit('connection',bad);const attacker=server.clients.get(bad.messages[0].id);server.resume(attacker,{token:welcome.resumeToken});assert.ok(bad.messages.some(m=>m.type==='resume_error'));next.close();time+=45001;server.heartbeat();assert.equal(server.roomManager.getRoomByClient(welcome.id),null);
  }finally{server.cleanup();}
});
test('F38 pings/signalling stay in team, short-lived TURN secrets never enter public health',()=>{
  let now=1000;const wss=new EventEmitter(),server=new GameServer(wss,{now:()=>now,env:{SKYBREAK_TURN_URLS:'turn:relay.example:3478',SKYBREAK_TURN_SECRET:'test-only-secret'}});try{
    const a=socket(),b=socket(),enemy=socket();for(const ws of [a,b,enemy])wss.emit('connection',ws);const clients=[a,b,enemy].map(ws=>server.clients.get(ws.messages[0].id));clients.forEach(c=>c.protocol=2);
    const room=server.roomManager.createRoom(clients[0],{mode:'team_deathmatch'});server.roomManager.joinRoom(room.code,clients[1],'B');server.roomManager.joinRoom(room.code,clients[2],'E');room.players.get(clients[1].id).team='blue';room.players.get(clients[2].id).team='red';
    clients.forEach(c=>server.voiceJoin(c,room));server.voiceSignal(clients[0],room,{targetId:clients[2].id,description:{type:'offer',sdp:'test'}});assert.equal(enemy.messages.some(m=>m.type==='voice_signal'),false);
    server.voiceSignal(clients[0],room,{targetId:clients[1].id,description:{type:'offer',sdp:'test'}});assert.ok(b.messages.some(m=>m.type==='voice_signal'));const config=server.voiceConfig(clients[0]);assert.equal(config.relayAvailable,true);assert.equal(config.expiresAt,now+600000);assert.equal(JSON.stringify(server.health()).includes('test-only-secret'),false);
  }finally{server.cleanup();}
});
