import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import WebSocket, {WebSocketServer} from 'ws';
import {GameServer} from '../server/GameServer.js';

function pilot(url) {
  const ws = new WebSocket(url), messages = [], pending = [];
  ws.on('message', raw => {
    const message = JSON.parse(raw);
    if (message.type === 'server_ping') ws.send(JSON.stringify({type:'server_pong',t:message.t}));
    const index = pending.findIndex(wait => wait.accept(message));
    if (index < 0) messages.push(message);
    else {const wait=pending.splice(index,1)[0];clearTimeout(wait.timer);wait.resolve(message);}
  });
  return {
    ws, send:message=>ws.send(JSON.stringify(message)),
    receive(type, predicate=()=>true) {
      const accept=message=>message.type===type && predicate(message);
      const index=messages.findIndex(accept);
      if(index>=0)return Promise.resolve(messages.splice(index,1)[0]);
      return new Promise((resolve,reject)=>{
        const wait={accept,resolve,timer:setTimeout(()=>{pending.splice(pending.indexOf(wait),1);reject(Error('Timed out waiting for '+type));},6000)};
        pending.push(wait);
      });
    }
  };
}

test('real WebSocket clients join, start, sync, fire, communicate, reconnect and close cleanly', {timeout:15000}, async t=>{
  const http=createServer(),wss=new WebSocketServer({server:http,maxPayload:16*1024}),server=new GameServer(wss),pilots=[];
  await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{
    server.cleanup();for(const p of pilots)p.ws.terminate();
    await new Promise(resolve=>wss.close(resolve));await new Promise(resolve=>http.close(resolve));
  });
  const url=`ws://127.0.0.1:${http.address().port}`;
  const connect=()=>{const p=pilot(url);pilots.push(p);return p;};
  const host=connect(),guest=connect();
  const [a,b]=await Promise.all([host.receive('welcome'),guest.receive('welcome')]);
  host.send({type:'set_name',name:'Socket Alpha'});guest.send({type:'set_name',name:'Socket Bravo'});
  host.send({type:'create_room',options:{mode:'1v1',killLimit:5,matchDuration:300}});
  const {room}=await host.receive('room_joined');
  guest.send({type:'join_room',code:room.roomCode});
  const joined=await guest.receive('room_joined');assert.equal(joined.room.players.length,2);
  guest.send({type:'set_ready',ready:true});
  await host.receive('lobby_update',m=>m.players.length===2 && m.players.every(p=>p.ready));
  host.send({type:'start_match'});
  const [startA,startB]=await Promise.all([host.receive('game_started'),guest.receive('game_started')]);
  assert.equal(startA.myId,a.id);assert.equal(startB.myId,b.id);
  assert.equal(startA.snapshot.players.length,2);
  host.send({type:'telemetry',t:{throttle:.73,speed:270,gearDown:true}});
  const synced=await guest.receive('snapshot',m=>m.s.players.find(p=>p.id===a.id)?.thr===.73);
  assert.equal(synced.s.players.find(p=>p.id===a.id).gear,true);
  host.send({type:'fire_cannon',direction:{x:0,y:0,z:-1}});
  assert.equal((await guest.receive('cannon_fired')).ownerId,a.id);
  host.send({type:'quick_comm',commKey:'help',commText:'Cover me',teamOnly:false});
  assert.equal((await guest.receive('quick_comm')).senderId,a.id);
  guest.send({type:'deploy_flares'});
  assert.equal((await host.receive('flares_deployed')).playerId,b.id);
  const guestClosed=once(guest.ws,'close');guest.ws.close();await guestClosed;
  assert.equal((await host.receive('player_left')).playerId,b.id);
  const returning=connect(),c=await returning.receive('welcome');
  returning.send({type:'join_room',code:room.roomCode});
  const rejoined=await returning.receive('room_joined');assert.equal(rejoined.room.players.length,2);
  const resumed=await returning.receive('game_started');assert.equal(resumed.myId,c.id);
  assert.ok(resumed.snapshot.players.some(p=>p.id===a.id));
  const closed=once(host.ws,'close');server.cleanup();
  assert.equal((await closed)[0],1001);assert.equal(server.clients.size,0);
  assert.equal(server.roomManager.rooms.size,0);assert.equal(server.roomManager.clientRooms.size,0);
});
