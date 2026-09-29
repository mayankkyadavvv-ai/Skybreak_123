import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { readServiceConfig } from '../server/ServiceConfig.js';
import { createMatchService } from '../server/index.js';
import { endpointOptions, verifyMatchEndpoint } from '../scripts/verify-match-endpoint.mjs';

const origin='https://skybreak-iota.vercel.app',revision='a'.repeat(40);
const production={NODE_ENV:'production',SKYBREAK_ALLOWED_ORIGINS:origin,SKYBREAK_DEPLOY_REVISION:revision};
async function service(t,extra={}){const s=createMatchService({env:{...production,...extra}});await new Promise(resolve=>s.server.listen(0,'127.0.0.1',resolve));t.after(()=>s.close());return {s,endpoint:`ws://127.0.0.1:${s.server.address().port}/ws`};}

test('production worker refuses missing, wildcard, insecure and path-bearing origin configuration before listening',()=>{
  for(const value of ['', '*', 'http://example.test', 'https://*.example.test', 'https://example.test/path', 'https://user:password@example.test']) assert.throws(()=>createMatchService({env:{NODE_ENV:'production',SKYBREAK_ALLOWED_ORIGINS:value}}),/configuration/);
});
test('worker normalizes exact origins and uses the measured one-room/eight-client production defaults',()=>{
  const c=readServiceConfig({...production,SKYBREAK_ALLOWED_ORIGINS:`${origin}/, ${origin}`});
  assert.equal(c.env.SKYBREAK_ALLOWED_ORIGINS,origin);assert.equal(c.maxRooms,1);assert.equal(c.maxClients,8);
  const local=readServiceConfig({});assert.equal(local.maxRooms,4);assert.equal(local.maxClients,32);
  for(const extra of [{PORT:'abc'},{PORT:'65536'},{SKYBREAK_MAX_CLIENTS:'0'},{SKYBREAK_MAX_ROOMS:'1.5'},{SKYBREAK_DEPLOY_REVISION:'not-a-commit'}])assert.throws(()=>readServiceConfig({...production,...extra}),/configuration/);
});
test('partial, weak or malformed TURN configuration fails without exposing the secret',()=>{
  const secret='test-only-private-value';
  for(const extra of [{SKYBREAK_TURN_URLS:'turn:relay.test:3478'},{SKYBREAK_TURN_SECRET:secret},{SKYBREAK_TURN_URLS:'https://relay.test',SKYBREAK_TURN_SECRET:secret},{SKYBREAK_TURN_URLS:'turn:relay.test:3478',SKYBREAK_TURN_SECRET:secret},{SKYBREAK_TURN_URLS:'turns:relay.test:5349?transport=udp',SKYBREAK_TURN_SECRET:'s'.repeat(64)}]){
    assert.throws(()=>readServiceConfig({...production,...extra}),error=>error.message.includes('configuration')&&!error.message.includes(secret));
  }
});
test('endpoint smoke rejects credential-bearing URLs and insecure non-local endpoints',()=>{
  for(const endpoint of ['ws://public.example/ws','wss://u:p@example.test/ws','wss://example.test/ws?secret=x'])assert.throws(()=>endpointOptions(endpoint,origin));
  assert.throws(()=>endpointOptions('wss://match.example/ws','http://public.example'));
  assert.equal(endpointOptions('wss://match.example/ws',origin).health,'https://match.example/ready');
});
test('production health is redacted and a different browser origin is rejected',async t=>{
  const {s,endpoint}=await service(t,{SKYBREAK_TURN_URLS:'turn:relay.test:3478',SKYBREAK_TURN_SECRET:'s'.repeat(64)});
  const health=await (await fetch(`http://127.0.0.1:${s.server.address().port}/ready`)).json();
  assert.equal(health.deployment.relayConfigured,true);assert.equal(health.deployment.revision,revision);assert.ok(!JSON.stringify(health).includes('s'.repeat(64)));
  const ws=new WebSocket(endpoint,{origin:'https://other.test'});const [code]=await once(ws,'close');assert.equal(code,1008);assert.equal(s.gameServer.clients.size,0);
});
test('real endpoint smoke verifies readiness, input, resume and cleanup without a relay', {timeout:15000},async t=>{
  const {endpoint}=await service(t);const r=await verifyMatchEndpoint({endpoint,origin,expectedRevision:revision,reconnectMs:30});
  assert.equal(r.status,'passed-automated',JSON.stringify(r.errors));assert.equal(r.relayConfigured,false);assert.equal(r.voiceRelayMediaVerified,false);assert.ok(r.checks.includes('QA room, clients and reservations are cleaned up'));
});
test('TURN smoke verifies expiring party credentials but never claims relay media or saves credentials', {timeout:15000},async t=>{
  const secret='s'.repeat(64),{endpoint}=await service(t,{SKYBREAK_TURN_URLS:'turn:relay.test:3478',SKYBREAK_TURN_SECRET:secret});
  const r=await verifyMatchEndpoint({endpoint,origin,requireRelay:true,reconnectMs:30});assert.equal(r.status,'passed-automated',JSON.stringify(r.errors));assert.equal(r.relayConfigured,true);assert.equal(r.voiceRelayMediaVerified,false);
  assert.ok(r.checks.includes('Party member receives short-lived TURN credentials'));assert.ok(!JSON.stringify(r).includes(secret));assert.ok(!Object.hasOwn(r,'iceServers'));
});
test('failed required-relay gate cleans its private room; wrong revision opens no socket',async t=>{
  const {s,endpoint}=await service(t);const r=await verifyMatchEndpoint({endpoint,origin,requireRelay:true,reconnectMs:30});assert.equal(r.status,'failed');assert.equal(s.gameServer.roomManager.rooms.size,0);assert.equal(s.gameServer.clients.size,0);
  const connections=s.gameServer.metrics.connections;const mismatch=await verifyMatchEndpoint({endpoint,origin,expectedRevision:'b'.repeat(40)});assert.equal(mismatch.status,'failed');assert.equal(s.gameServer.metrics.connections,connections);
});
test('endpoint smoke leaves an existing connected pilot untouched and opens no QA sockets',async t=>{
  const {s,endpoint}=await service(t),ws=new WebSocket(endpoint,{origin});await once(ws,'open');
  try{const connections=s.gameServer.metrics.connections;const r=await verifyMatchEndpoint({endpoint,origin,reconnectMs:30});assert.equal(r.status,'failed');assert.equal(s.gameServer.metrics.connections,connections);assert.equal(ws.readyState,WebSocket.OPEN);}
  finally{const closed=once(ws,'close');ws.close();await closed;}
});
