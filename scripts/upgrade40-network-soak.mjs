import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import WebSocket from 'ws';
import { createMatchService } from '../server/index.js';
import { FlightPrediction } from '../src/multiplayer/FlightPrediction.js';
import { terrainHeight, RUNWAYS } from '../src/shared/WorldGeometry.js';

const seconds = Math.max(45, Math.min(900, Number(process.env.SKYBREAK_SOAK_SECONDS) || 65));
const output = process.env.SKYBREAK_SOAK_OUTPUT || 'evidence/upgrade40/qa-network-soak.json';
const report = { kind: 'Eight scripted WebSocket clients on one host', startedAt: new Date().toISOString(), protocol: 2,
  environment: { os: `${platform()} ${release()}`, cpu: cpus()[0]?.model, logicalCPUs: cpus().length, node: process.version },
  durationRequested: seconds, artificialRTT: [50, 100, 180], latencyModel: 'Ordered application-delay queues with deterministic jitter; one 400 ms snapshot stall per client',
  humanPlayers: 0, realNetworks: 1, assertions: [], errors: [], unverified: ['Four humans across two external networks', 'Rendered correction smoothness', 'Real packet loss and TURN voice', 'Deployed TLS service'], status: 'running' };
const check = (ok, label) => { if (!ok) throw Error(label); report.assertions.push(label); };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const service = createMatchService({ env: {} }), pilots = [];
let loop, memoryTimer, room, wallStart, tickCosts = [], stopping = false;
const quantile = (values, q) => { const a = [...values].sort((a, b) => a - b); return a[Math.min(a.length - 1, Math.floor(a.length * q))] || 0; };

class Pilot {
  constructor(index) {
    this.index=index;this.rtt=[50,100,180][index%3];this.id=null;this.token=null;this.snapshot=null;this.messages=[];this.inbound=[];this.outbound=[];
    this.prediction=new FlightPrediction({environment:{terrainHeight,runways:RUNWAYS}});this.bytesIn=0;this.bytesOut=0;this.snapshots=0;this.errors=[];this.active=false;this.ended=null;this.resumeCount=0;
  }
  connect(url, resume=false) {
    this.ws=new WebSocket(url);this.ws.on('error',error=>{if(!stopping)this.errors.push(error.message);});
    this.ws.on('message',raw=>{
      this.bytesIn+=raw.length;const msg=JSON.parse(raw);
      if(msg.type==='server_ping'){this.send({type:'server_pong',t:msg.t});return;}
      if(msg.type==='welcome'){
        if(resume)this.send({type:'resume_session',token:this.token});
        else {this.id=msg.id;this.token=msg.resumeToken;this.send({type:'hello',protocol:2});this.send({type:'set_name',name:`Scripted ${this.index+1}`});}
      }
      if(msg.type==='session_resumed'){this.resumedId=msg.id;this.token=msg.resumeToken;this.resumeCount++;}
      if(msg.type==='game_started'){
        this.active=true;this.snapshot=msg.snapshot;const self=msg.snapshot.players.find(p=>p.id===this.id);
        this.prediction.reset(self.flight,msg.snapshot.epoch,self.inputEpoch,self.ack,msg.snapshot.tick);this.inbound=[];this.outbound=[];
      }
      if(msg.type==='snapshot'){
        const now=performance.now(),stall=!this.stalled&&wallStart&&now-wallStart>14000?400:0;if(stall)this.stalled=true;
        const due=Math.max(now+this.rtt/2+(this.snapshots%5)*3+stall,this.inbound.at(-1)?.due || 0);
        this.inbound.push({due,s:msg.s});this.snapshots++;return;
      }
      if(msg.type==='match_ended'){this.ended=msg;this.active=false;}
      if(msg.type.endsWith('_error')||['error','input_rejected','protocol_error'].includes(msg.type))this.errors.push(`${msg.type}: ${msg.code || msg.reason}`);
      if(msg.type!=='hello')this.messages.push(msg);if(this.messages.length>100)this.messages.shift();
    });
  }
  send(msg) { if(this.ws.readyState!==WebSocket.OPEN)return false;const raw=JSON.stringify(msg);this.bytesOut+=Buffer.byteLength(raw);this.ws.send(raw);return true; }
  async receive(type, predicate=()=>true) { const until=performance.now()+8000;while(performance.now()<until){const index=this.messages.findIndex(m=>m.type===type&&predicate(m));if(index>=0)return this.messages.splice(index,1)[0];await wait(10);}throw Error(`Pilot ${this.index}: ${type} timeout`); }
  step(now, ticks) {
    if(this.ws.readyState!==WebSocket.OPEN||!this.active)return;
    while(this.inbound[0]?.due<=now){const {s}=this.inbound.shift();this.snapshot=s;const p=s.players.find(p=>p.id===this.id);if(p)this.prediction.reconcile(p,{epoch:s.epoch,tick:s.tick});}
    const alive=this.snapshot?.players.find(p=>p.id===this.id)?.alive;
    if(alive)for(let i=0;i<ticks;i++)this.prediction.predict({pitch:.03,roll:this.index%2?.45:-.45,yaw:0,throttle:0,assisted:true,gearDown:false,boost:false});
    if(this.prediction.outbound.length>=2)this.prediction.flush({send:(type,data)=>{this.outbound.push({due:Math.max(now+this.rtt/2,this.outbound.at(-1)?.due || 0),message:{type,...data}});return true;}});
    while(this.outbound[0]?.due<=now)this.send(this.outbound.shift().message);
  }
}

try {
  await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));const port=service.server.address().port,url=`ws://127.0.0.1:${port}/ws`;
  for(let i=0;i<8;i++){const p=new Pilot(i);pilots.push(p);p.connect(url);await p.receive('welcome');}
  pilots[0].send({type:'create_room',options:{mode:'air_superiority',maxPlayers:8,matchDuration:seconds,scoreLimit:1000,killLimit:0,weather:'cloudy',seed:4422}});
  const created=await pilots[0].receive('room_joined');for(const p of pilots.slice(1)){p.send({type:'join_room',code:created.room.roomCode});await p.receive('room_joined');}
  for(const p of pilots){p.send({type:'loaded'});p.send({type:'set_ready',ready:true});}
  await pilots[0].receive('lobby_update',m=>m.players.length===8&&m.players.every(p=>p.ready&&p.loaded));
  pilots[0].send({type:'start_match'});await Promise.all(pilots.map(p=>p.receive('game_started')));
  room=service.gameServer.roomManager.getRoom(created.room.roomCode);wallStart=performance.now();const cpuStart=process.cpuUsage(),memStart=process.memoryUsage();let maxRss=memStart.rss,last=wallStart,accumulator=0;
  loop=setInterval(()=>{const now=performance.now();accumulator+=Math.min(.15,(now-last)/1000);last=now;const ticks=Math.floor(accumulator*60);accumulator-=ticks/60;for(const p of pilots)p.step(now,ticks);tickCosts.push(room.metrics.tickMs);if(tickCosts.length>100000)tickCosts.shift();},1000/60);
  report.memorySamples=[];memoryTimer=setInterval(()=>{const sample=process.memoryUsage();maxRss=Math.max(maxRss,sample.rss);report.memorySamples.push({second:Math.round((performance.now()-wallStart)/1000),rss:sample.rss,heapUsed:sample.heapUsed});},1000);
  await wait(18000);const returning=pilots[7],oldId=returning.id,oldToken=returning.token;const before=room.match.players.get(oldId);const score=before.score;returning.active=false;returning.ws.close();
  await wait(10000);returning.connect(url,true);await returning.receive('session_resumed');await returning.receive('game_started');
  check(returning.resumedId===oldId,'Ten-second disconnect resumes the same player identity');check(returning.token!==oldToken,'Resume rotates its private credential');check(room.match.players.size===8,'Resume does not duplicate an aircraft');check(room.match.players.get(oldId).score>=score,'Resume retains earned score');
  while(!pilots.every(p=>p.ended)&&performance.now()-wallStart<(seconds+10)*1000)await wait(200);
  const actual=(performance.now()-wallStart)/1000,cpu=process.cpuUsage(cpuStart);clearInterval(loop);clearInterval(memoryTimer);
  check(pilots.every(p=>p.ended),'All eight sockets receive the authoritative match result');
  const winner=JSON.stringify(pilots[0].ended.winner);check(pilots.every(p=>JSON.stringify(p.ended.winner)===winner),'All clients agree on the final winner/tie');
  check(pilots.every(p=>p.snapshots>200),'Every client receives sustained snapshots');check(pilots.every(p=>p.errors.length===0),'No protocol, input validation or socket errors');
  check(room.match.metrics.simTicks/actual>55,'Measured simulation exceeds 55 ticks/second');
  report.measurements={wallSeconds:actual,simulationTicks:room.match.metrics.simTicks,simulationHz:room.match.metrics.simTicks/actual,roomLoopIterations:room.metrics.ticks,
    simulationTickMs:{p50:quantile(tickCosts,.5),p95:quantile(tickCosts,.95),p99:quantile(tickCosts,.99),max:room.metrics.maxTickMs},
    cpuSeconds:(cpu.user+cpu.system)/1e6,cpuOneCorePercent:(cpu.user+cpu.system)/1e4/actual,rssStart:memStart.rss,rssEnd:process.memoryUsage().rss,rssPeak:maxRss,
    bytesIn:service.gameServer.metrics.bytesIn,bytesOut:room.metrics.bytesOut,outboundBytesPerSecond:room.metrics.bytesOut/actual,droppedSnapshots:room.metrics.droppedSnapshots,
    note:'CPU and RSS include the server plus eight scripted prediction clients. Tick cost measures simulation; total CPU includes snapshot filtering/serialization and clients.'};
  report.clients=pilots.map(p=>({pilot:p.index+1,artificialRTT:p.rtt,snapshots:p.snapshots,bytesIn:p.bytesIn,bytesOut:p.bytesOut,resumes:p.resumeCount,
    prediction:{...p.prediction.metrics,pending:p.prediction.pending.length},errors:p.errors}));
  for(const p of pilots)p.send({type:'leave_room'});await wait(100);check(service.gameServer.roomManager.rooms.size===0,'Leaving the party cleans the room');
  report.status='passed';
} catch(error) { report.status='failed';report.errors.push(error.stack);report.clientErrors=pilots.map(p=>({pilot:p.index+1,errors:p.errors}));process.exitCode=1; }
finally {
  stopping=true;clearInterval(loop);clearInterval(memoryTimer);for(const p of pilots)p.ws?.terminate();await service.close();
  report.finishedAt=new Date().toISOString();await mkdir(new URL('../evidence/upgrade40/',import.meta.url),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,evidence:output,assertions:report.assertions,errors:report.errors}));
}
