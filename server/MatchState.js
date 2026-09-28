import crypto from 'node:crypto';
import { Vector3, Quaternion, Euler } from 'three';
import { createFlightState, restoreFlightState, serializeFlightState, stepFlight } from '../src/shared/FlightCore.js';
import { PROTOCOL_VERSION, FIXED_DT, sanitizeInput, validateInputBatch, finiteVector, clamp } from '../src/shared/Protocol.js';
import { terrainHeight, RUNWAYS, onRunway } from '../src/shared/WorldGeometry.js';
import { CoopOpenSkiesRuntime, MissionRuntime } from '../src/shared/MissionRuntime.js';
import { createDamageState, applySystemDamage, systemEffects } from '../src/shared/DamageSystems.js';
import { evaluateDetection } from '../src/shared/Sensors.js';
import { cloudDensityAt } from '../src/shared/CloudField.js';
import { ActivityRuntime } from '../src/shared/Activities.js';
import { segmentOccludedByAegis } from '../src/shared/AegisLandmarks.js';

const direction = p => new Vector3(0, 0, -1).applyQuaternion(new Quaternion(p.quaternion.x, p.quaternion.y, p.quaternion.z, p.quaternion.w));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const segmentDistance = (p, a, b) => { const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,l=dx*dx+dy*dy+dz*dz,t=l?clamp(((p.x-a.x)*dx+(p.y-a.y)*dy+(p.z-a.z)*dz)/l,0,1):0;return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy,p.z-a.z-t*dz); };
const neutral = (p) => ({ ...sanitizeInput(), gearDown: p.gearDown, landingMode: p.landingMode, flaps: p.flaps, assisted: true });
function seeded(seed) { let n=(seed>>>0)||1;return ()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;}; }

/** A room has exactly one instance, one simulation clock and one reward ledger. */
export class MatchState {
  constructor(room, options = {}) {
    this.room=room; this.options={mode:'1v1',killLimit:3,matchDuration:600,friendlyFire:false,weaponsEnabled:true,enemyRadar:true,timeOfDay:'day',weather:'clear',...options};
    this.epoch=crypto.randomUUID(); this.seed=Number.isSafeInteger(options.seed)?options.seed>>>0:crypto.randomBytes(4).readUInt32LE(); this.random=seeded(this.seed);
    this.players=new Map();this.bullets=[];this.missiles=[];this.bulletSeq=0;this.missileSeq=0;this.elapsed=0;this.tickNumber=0;this.accumulator=0;
    this.startedAt=Date.now();this.timeRemaining=this.options.matchDuration===0?Infinity:this.options.matchDuration;this.status='playing';this.winner=null;
    this.teamScores={blue:0,red:0};this.recentDamage=new Map();this.history=[];this.pings=[];this.pingSeq=0;this.rewardLedger=new Set();
    this.zone={id:this.options.map==='frontier'?'frontier-control':'aegis-control',position:this.options.map==='frontier'?{x:0,y:1600,z:0}:{x:-14500,y:1600,z:47500},radius:2300,minAltitude:250,maxAltitude:4200,owner:null,contested:false,progress:0,blue:0,red:0};this.zoneScoreTime=0;
    this.mission=this.isCoop?{id:this.epoch,phase:'briefing',phaseIndex:0,totalPhases:3,objective:'Form up with your squadron',enemiesRemaining:0,totalDestroyed:0,phaseEndsAt:4,status:'playing',rewardId:null}:null;
    this.runtime=null;this.activity=null;this.metrics={processedInputs:0,rejectedInputs:0,collisions:0,simTicks:0};
  }
  get isCoop(){return this.options.mode==='open_skies_coop';}
  now(){return this.startedAt+this.elapsed*1000;}
  initPlayer(player) {
    if(this.players.has(player.id))return this.players.get(player.id);
    const team=this.isCoop&&!player.bot?'blue':player.team||'blue';const index=[...this.players.values()].filter(p=>p.team===team).length;
    const spawn=this.chooseSpawn(team,index);const flight=createFlightState(spawn);
    const p={...flight,id:player.id,name:player.name||'Pilot',team,jetModel:player.jetModel||'x17',liveryId:player.liveryId||'grey',bot:!!player.bot,role:player.role||'fighter',connected:player.connected!==false,hp:100,maxHp:100,missiles:6,cannon:1200,flares:20,alive:true,deadTime:0,respawnTimer:0,spawnProtectedUntil:this.now()+3500,kills:0,deaths:0,assists:0,score:0,damageDealt:0,ping:player.ping||30,inputEpoch:crypto.randomUUID(),ack:0,lastReceivedSeq:0,inputQueue:[],lastCommand:null,lastInputAt:this.elapsed,lock:{targetId:null,progress:0,locked:false},targetId:null,order:'cover',orderTargetId:null,disconnectedAt:null};
    // Competitive airframes share a published stock budget; liveries never affect authority.
    p.stats={speedMult:1,turnMult:1,boostMult:1};this.players.set(p.id,p);this.recentDamage.set(p.id,[]);
    if(this.isCoop&&!p.bot&&this.mission.phase!=='briefing')this.ensureWingmen();
    return p;
  }
  chooseSpawn(team,index=0){
    const centre=this.isCoop||this.options.mode==='air_superiority'&&this.options.map!=='frontier'||this.options.map==='aegis'?{x:-14500,z:47500}:{x:0,z:0};
    let best=null,bestScore=-Infinity;
    for(let i=0;i<8;i++){
      const x=centre.x+((i%3)-1)*1700+(index%2?350:-350),z=centre.z+(team==='blue'?1:-1)*(6500+Math.floor(i/3)*1100),y=Math.max(1600+(index%3)*120,terrainHeight(x,z)+650);
      const enemies=[...this.players.values()].filter(p=>p.alive&&p.team!==team);const score=enemies.length?Math.min(...enemies.map(p=>dist(p.position,{x,y,z})+(this.hasLineOfSight(p.position,{x,y,z})?0:2500))):-i;
      if(score>bestScore){bestScore=score;best={position:{x,y,z},quaternion:{x:0,y:team==='blue'?0:1,z:0,w:team==='blue'?1:0},velocity:{x:0,y:0,z:team==='blue'?-240:240},angular:{x:0,y:0,z:0},speed:240,throttle:.6};}
    }return best;
  }
  removePlayer(id){this.players.delete(id);this.recentDamage.delete(id);this.bullets=this.bullets.filter(b=>b.ownerId!==id);this.missiles=this.missiles.filter(m=>m.ownerId!==id);for(const p of this.players.values())if(p.targetId===id)p.targetId=null;if(this.isCoop)this.ensureWingmen();}
  setConnected(id,connected){const p=this.players.get(id);if(!p)return;p.connected=connected;p.disconnectedAt=connected?null:this.elapsed;p.inputQueue=[];p.lastCommand=null;p.lock={targetId:null,progress:0,locked:false};if(connected){p.inputEpoch=crypto.randomUUID();p.ack=0;p.lastReceivedSeq=0;} }
  acceptInputs(id,msg){const p=this.players.get(id);if(!p||!p.connected||p.bot)return {ok:false,reason:'invalid_player'};const result=validateInputBatch(msg,p,this.epoch);if(!result.ok){this.metrics.rejectedInputs++;return result;}p.inputQueue.push(...result.accepted);p.lastReceivedSeq=result.last;p.lastInputAt=this.elapsed;return {ok:true};}
  updateTelemetry(){return false;}
  // Never accept positions, HP, ammunition, progression or a client 'landed' claim.
  updateLock(p,dt){
    const target=this.players.get(p.targetId);const d=target?dist(p.position,target.position):Infinity;
    const f=direction(p);const angle=target&&d>0?f.dot(new Vector3(target.position.x-p.position.x,target.position.y-p.position.y,target.position.z-p.position.z).multiplyScalar(1/d)):-1;
    const valid=target?.alive&&p.alive&&target.id!==p.id&&(target.team!==p.team||this.options.friendlyFire)&&d>=60&&d<=8500*systemEffects(p.systems,this.options.difficulty).sensorRangeMult&&angle>.965&&evaluateDetection(p,target,{terrainHeight,cloudDensityAt,weather:this.options.weather}).lockable;
    if(!valid){p.lock={targetId:p.targetId,progress:0,locked:false};return;}
    const progress=p.lock.targetId===p.targetId?p.lock.progress:0;p.lock={targetId:p.targetId,progress:Math.min(1,progress+dt/1.4*systemEffects(p.systems,this.options.difficulty).lockRateMult),locked:progress+dt/1.4*systemEffects(p.systems,this.options.difficulty).lockRateMult>=1};
  }
  hasLineOfSight(a,b){if(segmentOccludedByAegis(a,b))return false;const length=dist(a,b),count=Math.min(48,Math.max(2,Math.ceil(length/250)));for(let i=1;i<count;i++){const t=i/count,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;if(a.y+(b.y-a.y)*t<Math.max(0,terrainHeight(x,z))+12)return false;}return true;}
  handleFireCannon(id,{direction:aim}={}){
    const p=this.players.get(id),now=this.now();if(!p?.alive||!this.options.weaponsEnabled||p.cannon<=0||this.bullets.length>=512||now-(p.lastCannonAt??-Infinity)<55)return null;
    const f=direction(p);if(aim&&(!finiteVector(aim)||new Vector3(aim.x,aim.y,aim.z).normalize().dot(f)<.94))return null;
    p.lastCannonAt=now;p.cannon--;p.spawnProtectedUntil=0;
    const bullet={id:++this.bulletSeq,ownerId:id,team:p.team,position:{...p.position},previous:{...p.position},velocity:{x:f.x*1700+p.velocity.x,y:f.y*1700+p.velocity.y,z:f.z*1700+p.velocity.z},life:2,rewindSeconds:Math.min(.1,(p.ping||0)/2000)};this.bullets.push(bullet);return bullet;
  }
  handleFireMissile(id,{targetId,direction:aim}={}){
    const p=this.players.get(id),target=this.players.get(targetId),now=this.now();if(!p?.alive||!this.options.weaponsEnabled||p.missiles<=0||this.missiles.length>=96||!target?.alive||target.id===id||now-(p.lastMissileAt??-Infinity)<1700)return null;
    if(target.team===p.team&&!this.options.friendlyFire)return null;
    if(!p.lock.locked||p.lock.targetId!==targetId||p.targetId!==targetId)return null;
    const f=direction(p);if(aim&&(!finiteVector(aim)||new Vector3(aim.x,aim.y,aim.z).normalize().dot(f)<.94))return null;
    if(!this.hasLineOfSight(p.position,target.position))return null;
    p.lastMissileAt=now;p.missiles--;p.spawnProtectedUntil=0;p.lock.progress=0;p.lock.locked=false;
    const missile={id:++this.missileSeq,ownerId:id,team:p.team,targetId,position:{...p.position},previous:{...p.position},direction:{x:f.x,y:f.y,z:f.z},speed:p.speed+90,life:18,active:true};this.missiles.push(missile);return missile;
  }
  handleDeployFlares(id){const p=this.players.get(id),now=this.now();if(!p?.alive||!this.options.weaponsEnabled||p.flares<=0||now-(p.lastFlareAt??-Infinity)<750)return null;p.lastFlareAt=now;p.flares--;let diverted=0;for(const m of this.missiles)if(m.targetId===id&&dist(m.position,p.position)<4500){m.targetId=null;m.life=Math.min(m.life,2.5);m.direction.x+=(this.random()-.5)*1.5;m.direction.y-=.6;m.direction.z+=(this.random()-.5)*1.5;const len=Math.hypot(m.direction.x,m.direction.y,m.direction.z);for(const key of ['x','y','z'])m.direction[key]/=len;diverted++;}return diverted;}
  canRearmAtBase(id,baseId){const p=this.players.get(id),base=RUNWAYS.find(b=>b.id===baseId);return !!(p?.alive&&base&&p.gearDown&&p.isLanded&&p.currentBase===baseId&&p.speed<15&&onRunway(base,p.position,5)&&Math.abs(p.position.y-base.elevation-3.2)<2&&this.now()-(p.lastRearmAt??-Infinity)>=8000);}
  rearmPlayer(id,baseId){if(!this.canRearmAtBase(id,baseId))return false;const p=this.players.get(id);p.lastRearmAt=this.now();p.hp=p.maxHp;p.cannon=1200;p.missiles=6;p.flares=20;p.systems=createDamageState();return true;}
  applyDamage(victimId,amount,attackerId,weapon='cannon'){
    const p=this.players.get(victimId),attacker=this.players.get(attackerId),now=this.now();if(!p?.alive||!Number.isFinite(amount)||amount<=0||now<p.spawnProtectedUntil)return null;
    if(attacker&&attacker!==p&&attacker.team===p.team&&!this.options.friendlyFire)return null;
    const actual=Math.min(p.hp,amount);p.hp=Math.max(0,p.hp-actual);
    p.systems=applySystemDamage(p.systems,actual,{maxHp:p.maxHp,weapon});
    if(attacker&&attacker!==p){attacker.damageDealt+=actual;attacker.score+=Math.round(actual*1.5);const log=this.recentDamage.get(victimId)||[];log.push({attackerId,amount:actual,timestamp:now});this.recentDamage.set(victimId,log.filter(h=>now-h.timestamp<8000).slice(-100));}
    const killEvent=p.hp<=0?this.handleKill(p,attacker,weapon):null;const event={victimId,newHp:p.hp,attackerId,weaponType:weapon,amount:actual,killEvent};this.room.broadcast?.({type:'damage',...event});if(killEvent)this.room.broadcast?.({type:'kill',...killEvent});return event;
  }
  handleKill(p,killer,weapon){
    if(!p.alive)return null;p.alive=false;p.deaths++;p.deadTime=0;p.respawnTimer=this.isCoop?Infinity:5;p.inputQueue=[];p.lock={targetId:null,progress:0,locked:false};
    let assist=null;const counts=new Map();for(const h of this.recentDamage.get(p.id)||[])if(h.attackerId!==killer?.id&&this.now()-h.timestamp<8000)counts.set(h.attackerId,(counts.get(h.attackerId)||0)+h.amount);
    const top=[...counts].filter(([,n])=>n>=25).sort((a,b)=>b[1]-a[1])[0];if(top){assist=this.players.get(top[0]);if(assist){assist.assists++;assist.score+=400;}}
    if(killer&&killer!==p){killer.kills++;killer.score+=1000;if(!this.isCoop)this.teamScores[killer.team]+=(this.options.mode==='air_superiority'?5:1);}
    if(this.isCoop&&p.team==='red')this.mission.totalDestroyed++;
    this.recentDamage.set(p.id,[]);const event={victimId:p.id,victimName:p.name,killerId:killer?.id||null,killerName:killer?.name||'Terrain / Crash',weapon,assistId:assist?.id||null,assistName:assist?.name||null,teamScores:{...this.teamScores}};this.checkWinConditions();return event;
  }
  respawnPlayer(id){const p=this.players.get(id);if(!p||this.isCoop)return null;const spawn=this.chooseSpawn(p.team);restoreFlightState(p,createFlightState(spawn));Object.assign(p,{hp:p.maxHp,alive:true,missiles:6,cannon:1200,flares:20,respawnTimer:0,spawnProtectedUntil:this.now()+3000,inputEpoch:crypto.randomUUID(),ack:0,lastReceivedSeq:0,inputQueue:[],lastCommand:null,targetId:null,lock:{targetId:null,progress:0,locked:false}});return p;}
  ensureWingmen(){if(!this.isCoop)return;const humans=[...this.players.values()].filter(p=>!p.bot).length,desired=Math.max(0,4-humans);const wingmen=[...this.players.values()].filter(p=>p.bot&&p.team==='blue'&&p.role==='wingman');while(wingmen.length>desired){const p=wingmen.pop();this.players.delete(p.id);this.recentDamage.delete(p.id);}for(let i=wingmen.length;i<desired;i++)this.initPlayer({id:`wing-${i+1}`,name:`WING ${i+1}`,team:'blue',bot:true,role:'wingman'});}
  processMissionEvents(events){
    for(const event of events){
      if(event.type==='spawn')for(const entity of event.entities){
        const team=entity.team==='enemy'?'red':'blue';
        const p=this.initPlayer({id:entity.id,name:entity.callsign||entity.role,team,bot:true,role:entity.role,jetModel:entity.role==='ace'?'su57':'x17',liveryId:team==='red'?'desert':'grey'});
        p.missionId=entity.id;p.position.set(entity.position.x,entity.position.y,entity.position.z);p.hp=entity.hp||100;p.maxHp=entity.maxHp||p.hp;
        p.attackAfter=this.elapsed+8;p.spawnProtectedUntil=this.now()+2500;p.routeManaged=!!entity.routeManaged;p.objective=!!entity.objective;p.graceUntil=entity.graceUntil;
        if(entity.route){p.route=entity.route.map(q=>({...q}));p.routeIndex=entity.routeIndex||0;}
        p.speed=entity.speed||220;p.velocity=direction(p).multiplyScalar(p.speed);
        for(const key of ['defencePatrol','targetRole','releaseRadius','exitRadius','routeComplete','reachedExit','strikeReleased'])if(entity[key]!==undefined)p[key]=entity[key];
      }
      if(event.type==='recall')for(const id of event.ids||[]){const p=this.players.get(id);if(p)p.order='regroup';}
      if(event.type==='radio')this.room.broadcast?.({type:'mission_radio',text:event.text});
      if(event.type==='phase')this.room.broadcast?.({type:'mission_phase',phase:event.phase,text:event.text});
      if(event.type==='complete'||event.type==='failed'){
        const success=event.type==='complete';this.mission.result=event.result;this.mission.status=success?'completed':'failed';this.mission.rewardId=success?`${this.epoch}:complete`:null;
        if(success)for(const p of this.players.values())if(!p.bot&&!this.rewardLedger.has(p.id)){this.rewardLedger.add(p.id);p.score+=500;}
        this.endMatch(success?'Squadron victory':'Mission failed',success?'blue':'red');
      }
    }
  }
  stepCoop(dt){
    if(!this.isCoop)return;
    if(!this.runtime&&this.elapsed>=4){const humans=[...this.players.values()].filter(p=>!p.bot).length;this.runtime=this.options.missionPreset?new MissionRuntime(this.options.missionPreset,{terrainHeight}):new CoopOpenSkiesRuntime({seed:this.seed,difficulty:this.options.difficulty,humans},{terrainHeight});this.processMissionEvents(this.runtime.start());}
    if(!this.runtime)return;
    const entities=[...this.players.values()],players=entities.filter(p=>!p.bot);
    this.processMissionEvents(this.runtime.step(dt,{entities,players}));const view=this.runtime.snapshot();
    this.mission={...this.mission,...view,phaseIndex:view.phase||1,totalPhases:view.phases||1,enemiesRemaining:view.remaining??entities.filter(p=>p.bot&&p.team==='red'&&p.alive).length,totalDestroyed:view.defeated||0,status:view.state==='complete'?'completed':view.state==='failed'?'failed':'playing',objective:view.objective,phaseEndsAt:this.elapsed+(view.recovery||0)};
  }
  startActivity(type,options={}){
    if(this.options.mode!=='free_flight'||!['race','formation','landing'].includes(type))return false;
    const players=[...this.players.values()].filter(p=>!p.bot&&p.connected),host=players.find(p=>p.id===this.room.hostId)||players[0];if(!host)return false;
    const base=RUNWAYS.find(b=>b.id===options.baseId)||[...RUNWAYS].sort((a,b)=>Math.hypot(a.x-host.position.x,a.z-host.position.z)-Math.hypot(b.x-host.position.x,b.z-host.position.z))[0];
    this.activity=new ActivityRuntime(type,{participants:players.map(p=>({id:p.id})),seed:this.seed,origin:{...host.position},base,instanceId:`${this.epoch}:${this.tickNumber}`});return true;
  }
  botCommand(p,dt){
    const others=[...this.players.values()],friends=others.filter(t=>t!==p&&t.team===p.team&&t.alive);
    const leader=friends.filter(t=>!t.bot||t.objective).sort((a,b)=>(a.objective?-1:0)-(b.objective?-1:0)||a.hp/a.maxHp-b.hp/b.maxHp)[0];
    const candidates=others.filter(t=>t.alive&&t.team!==p.team&&evaluateDetection(p,t,{terrainHeight,cloudDensityAt,weather:this.options.weather}).detected);
    const priority=t=>dist(t.position,p.position)+(friends.some(w=>w.bot&&w.targetId===t.id)?1500:0)-(leader&&t.targetId===leader.id?7000:0);
    const ordered=this.players.get(p.orderTargetId);let target=ordered?.alive&&candidates.includes(ordered)?ordered:candidates.sort((a,b)=>priority(a)-priority(b))[0];
    let destination=target?{...target.position}:null;const side=p.id.endsWith('1')?1:-1;
    const cover=p.team==='blue'&&p.order==='cover'&&leader&&(!target||target.targetId!==leader.id&&dist(target.position,leader.position)>3500);
    p.coveringId=leader?.id || null;p.aiState=p.order==='regroup'?'regrouping':cover?'covering':target?'attacking':'patrolling';
    if(p.team==='blue'&&p.order==='regroup'||cover||!target){destination=leader?{x:leader.position.x+side*300,y:leader.position.y+60,z:leader.position.z+450}:{x:-14500,y:1700,z:47500};if(cover||p.order==='regroup')target=null;}
    else if(p.team==='blue'&&p.order==='attack'&&dist(p.position,target.position)>1400){const flank=direction(target).cross(new Vector3(0,1,0)).multiplyScalar(side*420);destination.x+=flank.x;destination.z+=flank.z;p.aiState='pincer approach';}
    if(!destination)return neutral(p);
    for(const other of others)if(other!==p&&other.alive){const gap=dist(p.position,other.position);if(gap>0&&gap<220){destination.x+=(p.position.x-other.position.x)/gap*400;destination.y+=(p.position.y-other.position.y)/gap*120;destination.z+=(p.position.z-other.position.z)/gap*400;}}
    const delta=new Vector3(destination.x-p.position.x,destination.y-p.position.y,destination.z-p.position.z),length=delta.length()||1,local=delta.clone().applyQuaternion(new Quaternion(p.quaternion.x,p.quaternion.y,p.quaternion.z,p.quaternion.w).invert());
    const heading=Math.atan2(local.x,-local.z),desiredPitch=Math.asin(clamp(delta.y/length,-1,1));const ground=terrainHeight(p.position.x+direction(p).x*1400,p.position.z+direction(p).z*1400);
    const command=sanitizeInput({pitch:p.position.y<ground+450?.95:desiredPitch/.48,roll:heading*1.1,yaw:heading*.6,throttleSet:target&&length>2800?.82:.6,boost:target&&length>6500,assisted:true,targetId:target?.id});
    if(p.role==='ace'&&this.elapsed%22<4){command.pitch=.8;command.roll=.65;command.boost=true;}
    p.targetId=target?.id||null;
    if(target&&this.elapsed>(p.attackAfter||0)&&p.order!=='regroup'){
      const dot=direction(p).dot(delta.multiplyScalar(1/length));
      if(length<1800&&dot>.995){const b=this.handleFireCannon(p.id);if(b)this.room.broadcast?.({type:'cannon_fired',bId:b.id,ownerId:p.id,pos:b.position,vel:b.velocity});}
      if((p.team==='blue'||p.role==='missile'||p.role==='ace')&&p.lock.locked){const m=this.handleFireMissile(p.id,{targetId:target.id});if(m)this.room.broadcast?.({type:'missile_launched',mId:m.id,ownerId:p.id,targetId:m.targetId,pos:m.position,dir:m.direction,speed:m.speed});}
      if(this.missiles.some(m=>m.targetId===p.id&&dist(m.position,p.position)<1800)&&this.random()<dt*.9)this.handleDeployFlares(p.id);
    }
    return command;
  }
  setOrder(id,order,targetId){const p=this.players.get(id);if(!this.isCoop||!p||p.bot||!['cover','attack','regroup'].includes(order))return false;const target=this.players.get(targetId);if(order==='attack'&&(!target?.alive||target.team===p.team))return false;for(const w of this.players.values())if(w.bot&&w.team===p.team){w.order=order;w.orderTargetId=order==='attack'?targetId:null;}return true;}
  stepZone(dt){if(this.options.mode!=='air_superiority')return;const z=this.zone;z.blue=0;z.red=0;for(const p of this.players.values())if(p.alive&&p.connected&&p.spawnProtectedUntil<=this.now()&&p.position.y>=z.minAltitude&&p.position.y<=z.maxAltitude&&Math.hypot(p.position.x-z.position.x,p.position.z-z.position.z)<=z.radius)z[p.team]++;
    z.contested=z.blue>0&&z.red>0;const team=z.blue&&!z.red?'blue':z.red&&!z.blue?'red':null;
    if(team){const step=(team==='blue'?1:-1)*dt/8;z.progress=clamp(z.progress+step,-1,1);if(z.progress>=1)z.owner='blue';if(z.progress<=-1)z.owner='red';if(z.owner==='blue'&&z.progress<=0||z.owner==='red'&&z.progress>=0)z.owner=null;}
    this.zoneScoreTime+=dt;if(this.zoneScoreTime>=1){this.zoneScoreTime-=1;if(z.owner&&!z.contested&&z[z.owner]>0){this.teamScores[z.owner]+=3;for(const p of this.players.values())if(p.alive&&p.connected&&p.spawnProtectedUntil<=this.now()&&p.position.y>=z.minAltitude&&p.position.y<=z.maxAltitude&&p.team===z.owner&&Math.hypot(p.position.x-z.position.x,p.position.z-z.position.z)<z.radius)p.score+=30;}}
  }
  tick(dt){if(this.status==='ended')return;this.accumulator+=Math.min(.25,Math.max(0,dt));let steps=0;while(this.accumulator+1e-10>=FIXED_DT&&steps<15&&this.status!=='ended'){this.accumulator-=FIXED_DT;this.step(FIXED_DT);steps++;} }
  step(dt){
    this.elapsed+=dt;this.tickNumber++;this.metrics.simTicks++;if(Number.isFinite(this.timeRemaining))this.timeRemaining=Math.max(0,this.timeRemaining-dt);
    this.stepCoop(dt);
    for(const p of [...this.players.values()]){
      if(p.routeManaged)continue;
      if(!p.alive){if(!this.isCoop&&(p.respawnTimer-=dt)<=0)this.respawnPlayer(p.id);continue;}
      let command;
      if(p.bot)command=this.botCommand(p,dt);
      else{const item=p.connected?p.inputQueue.shift():null;if(item){command=item;p.ack=item.seq;p.lastCommand=item;this.metrics.processedInputs++;}else command=p.connected&&this.elapsed-p.lastInputAt<.15?(p.lastCommand||neutral(p)):neutral(p);p.targetId=command.targetId;}
      const result=stepFlight(p,command,dt,{terrainHeight,runways:RUNWAYS,difficulty:this.options.difficulty});this.updateLock(p,dt);
      if(result.collision){p.spawnProtectedUntil=0;this.metrics.collisions++;this.applyDamage(p.id,p.maxHp,null,'terrain');}
    }
    for(let i=this.bullets.length-1;i>=0;i--){const b=this.bullets[i];b.life-=dt;b.previous={...b.position};for(const key of ['x','y','z'])b.position[key]+=b.velocity[key]*dt;let hit=false;for(const p of this.players.values()){if(!p.alive||p.id===b.ownerId||p.team===b.team&&!this.options.friendlyFire)continue;let target=p.position;const historical=this.history.findLast?.(h=>h.time<=this.elapsed-b.rewindSeconds)?.positions.get(p.id);if(historical)target=historical;if(segmentDistance(target,b.previous,b.position)<15){this.applyDamage(p.id,14,b.ownerId,'cannon');hit=true;break;}}if(hit||b.life<=0||b.position.y<Math.max(0,terrainHeight(b.position.x,b.position.z)))this.bullets.splice(i,1);}
    for(let i=this.missiles.length-1;i>=0;i--){const m=this.missiles[i];m.life-=dt;m.speed=Math.min(1050,m.speed+240*dt);let t=this.players.get(m.targetId);if(t?.alive&&!evaluateDetection({position:m.position},t,{terrainHeight,cloudDensityAt,weather:this.options.weather}).infrared){m.targetId=null;t=null;}if(t?.alive){const l=dist(t.position,m.position)||1;for(const key of ['x','y','z'])m.direction[key]+=( (t.position[key]-m.position[key])/l-m.direction[key])*dt*2.8;const d=Math.hypot(m.direction.x,m.direction.y,m.direction.z)||1;for(const key of ['x','y','z'])m.direction[key]/=d;}else m.targetId=null;m.previous={...m.position};for(const key of ['x','y','z'])m.position[key]+=m.direction[key]*m.speed*dt;if(t?.alive&&segmentDistance(t.position,m.previous,m.position)<26){this.applyDamage(t.id,110,m.ownerId,'missile');this.missiles.splice(i,1);continue;}if(m.life<=0||m.position.y<Math.max(0,terrainHeight(m.position.x,m.position.z)))this.missiles.splice(i,1);}
    this.history.push({time:this.elapsed,positions:new Map([...this.players].map(([id,p])=>[id,{...p.position}]))});while(this.history.length>14)this.history.shift();
    this.pings=this.pings.filter(p=>p.expiresAt>this.now());this.stepZone(dt);if(this.activity)this.activity.step(dt,{players:[...this.players.values()].filter(p=>!p.bot).map(p=>({...p,forward:direction(p)}))});this.checkWinConditions();
  }
  checkWinConditions(){
    if(this.status==='ended'||this.options.mode==='free_flight')return;
    if(this.isCoop){if(this.timeRemaining<=0){this.mission.status='failed';this.mission.objective='Mission time expired';this.endMatch('Mission failed','red');}return;}
    const limit=this.options.mode==='air_superiority'?(this.options.scoreLimit||300):this.options.killLimit;
    if(limit>0){if(this.options.mode==='1v1'){for(const p of this.players.values())if(p.kills>=limit){this.endMatch(p.name,p.team);return;}}else for(const team of ['blue','red'])if(this.teamScores[team]>=limit){this.endMatch(`${team==='blue'?'Blue':'Red'} Team`,team);return;}}
    if(this.timeRemaining<=0){if(this.options.mode==='1v1'){const ranked=[...this.players.values()].sort((a,b)=>b.score-a.score);if(ranked[0]?.score===ranked[1]?.score)this.endMatch('Draw','draw');else this.endMatch(ranked[0]?.name||'Draw',ranked[0]?.team||'draw');}else{const b=this.teamScores.blue,r=this.teamScores.red;this.endMatch(b===r?'Draw':b>r?'Blue Team':'Red Team',b===r?'draw':b>r?'blue':'red');}}
  }
  endMatch(name,team){if(this.status==='ended')return;this.status='ended';this.winner={name,team};}
  snapshotFor(viewerId,snapshot=this.getSnapshot()){
    const viewer=this.players.get(viewerId);if(!viewer)return {...snapshot,players:[],missiles:[],pings:[]};
    const observers=viewer.alive?[viewer]:[...this.players.values()].filter(p=>p.team===viewer.team&&p.alive);
    const environment={terrainHeight,cloudDensityAt,weather:this.options.weather};
    const visible=new Set([...this.players.values()].filter(p=>p.id===viewerId || p.team===viewer.team || observers.some(observer=>evaluateDetection(observer,p,environment).detected)).map(p=>p.id));
    const rounded=(values,scale)=>values.map(n=>Math.round(n*scale)/scale);
    const players=snapshot.players.filter(p=>visible.has(p.id)).map(p=>{
      if(p.id===viewerId)return p; // Full precision rollback state belongs only to its owner.
      const {flight,ammo,lock,ang,...remote}=p;
      return {...remote,pos:rounded(p.pos,100),vel:rounded(p.vel,100),quat:rounded(p.quat,100000),spd:Math.round(p.spd*100)/100,thr:Math.round(p.thr*1000)/1000,systems:flight.systems};
    });
    const threats=[...this.players.values()].filter(p=>p.alive&&p.team!==viewer.team&&p.lock.targetId===viewerId&&p.lock.progress>0).map(p=>({id:visible.has(p.id)?p.id:null,kind:p.lock.locked?'lock':'tracking'}));
    return {...snapshot,players,threats,missiles:snapshot.missiles.filter(m=>m.targetId===viewerId||visible.has(m.ownerId)||observers.some(p=>dist(p.position,{x:m.pos[0],y:m.pos[1],z:m.pos[2]})<8000)),pings:snapshot.pings.filter(p=>p.team===viewer.team),roster:snapshot.players.filter(p=>!p.bot).map(({id,name,team,model,kills,deaths,assists,score,ping,connected})=>({id,name,team,model,kills,deaths,assists,score,ping,connected}))};
  }
  getSnapshot(){return {protocol:PROTOCOL_VERSION,epoch:this.epoch,seed:this.seed,tick:this.tickNumber,simTime:this.elapsed,t:this.now(),rem:Number.isFinite(this.timeRemaining)?Math.round(this.timeRemaining):null,scores:{...this.teamScores},players:[...this.players.values()].map(p=>({id:p.id,name:p.name,team:p.team,model:p.jetModel,livery:p.liveryId,pos:[p.position.x,p.position.y,p.position.z],quat:[p.quaternion.x,p.quaternion.y,p.quaternion.z,p.quaternion.w],vel:[p.velocity.x,p.velocity.y,p.velocity.z],ang:[p.angular.x,p.angular.y,p.angular.z],spd:p.speed,thr:p.throttle,hp:p.hp,maxHp:p.maxHp,ammo:{cannon:p.cannon,missiles:p.missiles,flares:p.flares},alive:p.alive,boost:p.boost,gear:p.gearDown,landed:p.isLanded,respawn:Number.isFinite(p.respawnTimer)?Math.max(0,Math.ceil(p.respawnTimer)):null,shield:p.spawnProtectedUntil>this.now(),kills:p.kills,deaths:p.deaths,assists:p.assists,score:p.score,ping:p.ping,bot:p.bot,role:p.role,order:p.order,aiState:p.aiState,coveringId:p.coveringId,connected:p.connected,ack:p.ack,inputEpoch:p.inputEpoch,lock:{...p.lock},flight:serializeFlightState(p)})),missiles:this.missiles.map(m=>({id:m.id,ownerId:m.ownerId,targetId:m.targetId,pos:[m.position.x,m.position.y,m.position.z],dir:[m.direction.x,m.direction.y,m.direction.z],speed:m.speed})),mission:this.mission?{...this.mission}:null,activity:this.activity?.snapshot()||null,zone:this.options.mode==='air_superiority'?{...this.zone}:null,pings:this.pings.map(p=>({...p})),status:this.status,winner:this.winner};}
}
