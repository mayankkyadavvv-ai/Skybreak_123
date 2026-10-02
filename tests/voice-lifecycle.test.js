import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceManager } from '../src/multiplayer/VoiceManager.js';
import { Room } from '../server/Room.js';

function fixture(){
  const listeners=new Map(),sent=[],timers=new Map();let clock=100000,id=0,sendAllowed=true,stopped=false;
  const track={enabled:false,stop(){stopped=true;}},stream={getTracks:()=>[track],getAudioTracks:()=>[track]};
  class Connection{constructor(config){this.config=config;this.connectionState='connected';this.restarts=0;}addTrack(){}getConfiguration(){return this.config;}setConfiguration(config){this.config=config;}restartIce(){this.restarts++;}close(){this.closed=true;}}
  const network={clientId:'self',on(type,fn){listeners.set(type,fn);return()=>listeners.delete(type);},send(type,data){sent.push({type,data});return sendAllowed;}};
  const voice=new VoiceManager(network,{mediaDevices:{getUserMedia:async()=>stream},PeerConnection:Connection,now:()=>clock,setTimer:(fn,ms)=>{const n=++id;timers.set(n,{fn,at:clock+ms});return n;},clearTimer:n=>timers.delete(n)});
  return {voice,listeners,sent,timers,track,get stopped(){return stopped;},set sendAllowed(v){sendAllowed=v;},config(peers=['friend']){return {relayAvailable:true,expiresAt:clock+600000,iceServers:[{urls:'turn:relay.test',username:'ephemeral',credential:'test-only-short-lived'}],peers};},advance(ms){const end=clock+ms;for(;;){const next=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;timers.delete(next[0]);clock=next[1].at;next[1].fn();}clock=end;}};
}

test('voice renews before relay expiry, updates existing peers and clears timers on leave',async()=>{
  const f=fixture();await f.voice.enable();f.voice.configure(f.config());const pc=f.voice.peers.get('friend').pc;
  f.advance(539999);assert.equal(f.sent.filter(m=>m.type==='voice_join').length,1);
  f.advance(1);assert.equal(f.sent.filter(m=>m.type==='voice_join').length,2);assert.equal(f.voice.enabled,true);
  const next=f.config();next.iceServers[0].credential='renewed-test-credential';f.voice.configure(next);
  assert.equal(pc.config.iceServers[0].credential,'renewed-test-credential');assert.equal(pc.config.bundlePolicy,'max-bundle');assert.equal(pc.restarts,1);
  f.advance(60000);assert.equal(f.voice.enabled,true);f.voice.dispose();assert.equal(f.timers.size,0);assert.equal(f.stopped,true);assert.equal(pc.closed,true);
});
test('missing, expired and unsent relay renewals stop the microphone and peer connections',async()=>{
  for(const scenario of ['no-response','send-failed','bad-expiry']){
    const f=fixture();await f.voice.enable();f.voice.configure(f.config());const pc=f.voice.peers.get('friend').pc;f.voice.setTalking(true);
    if(scenario==='bad-expiry')f.voice.configure({...f.config(),expiresAt:0});
    else{if(scenario==='send-failed')f.sendAllowed=false;f.advance(scenario==='no-response'?600000:540000);}
    assert.equal(f.voice.enabled,false,scenario);assert.equal(f.voice.talking,false);assert.equal(f.stopped,true);assert.equal(pc.closed,true);assert.equal(f.timers.size,0);f.voice.dispose();
  }
});
test('new authorized roster removes stale voice peers; server membership reset closes the microphone',async()=>{
  const f=fixture();await f.voice.enable();f.voice.configure(f.config(['friend','departed']));const departed=f.voice.peers.get('departed').pc;
  f.voice.configure(f.config(['friend']));assert.equal(departed.closed,true);assert.equal(f.voice.peers.has('departed'),false);
  f.listeners.get('voice_error')({reason:'Squad membership changed'});assert.equal(f.voice.enabled,false);assert.equal(f.voice.peers.size,0);assert.equal(f.stopped,true);assert.equal(f.timers.size,0);f.voice.dispose();
});
test('lobby team and mode changes explicitly revoke existing voice membership',()=>{
  const client=id=>({id,name:id,sent:[],ws:{readyState:1,send(raw){clients.get(id).sent.push(JSON.parse(raw));}}}),clients=new Map();
  for(const id of ['a','b','c'])clients.set(id,client(id));
  const room=new Room('SKY-ABCD',clients.get('a'),{mode:'2v2'});room.addPlayer(clients.get('b'),'b');room.addPlayer(clients.get('c'),'c');
  for(const p of room.players.values())p.voice=true;
  room.setPlayerTeam('a','red');assert.equal(room.players.get('a').voice,false);
  assert.ok(clients.get('a').sent.some(m=>m.type==='voice_error'&&m.code==='VOICE_TEAM_CHANGED'));
  assert.ok(clients.get('c').sent.some(m=>m.type==='voice_peer_left'&&m.id==='a'));
  assert.ok(!clients.get('b').sent.some(m=>m.type==='voice_peer_left'&&m.id==='a'));
  room.updateSettings('a',{mode:'open_skies_coop'});assert.ok([...room.players.values()].every(p=>!p.voice&&p.team==='blue'));
  assert.ok(clients.get('b').sent.some(m=>m.type==='voice_error'));room.cleanup();
});
