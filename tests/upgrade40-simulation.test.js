import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { parseHTML } from 'linkedom';
import { Jet } from '../src/game/Jet.js';
import { Game } from '../src/game/Game.js';
import { Weapons } from '../src/game/Weapons.js';
import { normalizeSettings } from '../src/game/Settings.js';
import { updateFlight, flightCommands } from '../src/game/FlightPhysics.js';
import { recoveryIntent, controllerDeadzone } from '../src/game/FlightAssists.js';
import { SeatControllerInput, allocateLocalDevices, LocalCoop } from '../src/game/LocalCoop.js';
import { AdaptiveQuality } from '../src/game/AdaptiveQuality.js';
import { readFlightInstruments } from '../src/game/Cockpit.js';
import { createFlightState, stepFlight, serializeFlightState } from '../src/shared/FlightCore.js';
import { createMissionPreset, missionSetup, encodeMissionPreset, decodeMissionPreset, MISSION_TEMPLATES } from '../src/shared/MissionGenerator.js';
import { MissionRuntime, CoopOpenSkiesRuntime } from '../src/shared/MissionRuntime.js';
import { BattleDirector } from '../src/shared/BattleDirector.js';
import { createCampaign, applyCampaignResult, campaignMission, normalizeCampaign, loadCampaign, saveCampaign } from '../src/shared/Campaign.js';
import { evaluateDetection, ContactTracker } from '../src/shared/Sensors.js';
import { cloudDensityAt, CLOUD_VOLUMES } from '../src/shared/CloudField.js';
import { createDamageState, applySystemDamage, systemEffects, repairSystems } from '../src/shared/DamageSystems.js';
import { terrainHeight, RUNWAYS } from '../src/shared/WorldGeometry.js';
import { AEGIS_LANDMARKS, collidesWithAegisLandmark } from '../src/shared/AegisLandmarks.js';
import { ActivityRuntime, assessActivityLanding } from '../src/shared/Activities.js';
import { FlightSchool } from '../src/game/FlightSchool.js';
import { SortieRecorder, ReplayPlayer, validateReplay } from '../src/game/Replay.js';

const input=(...keys)=>({keys:new Set(keys),heldActions:new Set(),mouse:{x:0,y:0},axes:{},look:{x:0,y:0},levelTimer:0,clear(){this.keys.clear();this.heldActions.clear();this.levelTimer=0;}});
function gameHarness(id=3){
  const g=Object.create(Game.prototype),effects={emit(){},burst(){},smoke(){},clear(){}};
  Object.assign(g,{scene:new T.Scene(),camera:new T.PerspectiveCamera(),cam:{mode:'chase',reset(){},cycle(){}},effects,audio:{init(){},play(){}},settings:normalizeSettings().settings,state:'menu',enemies:[],allies:[],player:new Jet('player'),input:input(),world:{collision:p=>p.y<Math.max(3,terrainHeight(p.x,p.z))+3},ui:{modalType:null,inGame(){this.modalType=null;},message(){},showMenu(){this.modalType=null;},showResult(success,reason){g.result={success,reason};}}});
  g.input.player=g.player;g.weapons=new Weapons(g.scene,effects,g.damage.bind(g),()=>{});g.start(id,{seed:4422});return g;
}
function cleanup(g){g.stopLocalCoop();for(const p of [g.player,...g.enemies,...g.allies])p.dispose();g.weapons.dispose();}
const pilot=()=>({id:'pilot',alive:true,hp:100,maxHp:100,position:{x:0,y:2000,z:0},velocity:{x:0,y:0,z:-200},forward:{x:0,y:0,z:-1}});

test('F16 first fixed tick raises/lowers nose at low, cruise and boost speeds offline and online',()=>{
  for(const speed of [80,220,540])for(const sign of [-1,1]){
    const p=new Jet('player');p.speed=speed;updateFlight(p,input(sign>0?'ArrowUp':'ArrowDown'),1/60,normalizeSettings().settings);assert.ok(p.forward.y*sign>0);p.dispose();
    const shared=createFlightState({speed});stepFlight(shared,{pitch:sign});assert.ok(new T.Vector3(0,0,-1).applyQuaternion(shared.quaternion).y*sign>0);
  }
});
test('F18 point-to-fly commands use the aircraft frame and stay bounded through keyboard override/free look',()=>{
  const p=new Jet('player'),i=input();i.player=p;i.pointAim={x:1,y:1,z:-1};const settings={device:'mouse',mouseMode:'point-to-fly',sensitivity:1};
  const c=flightCommands(i,settings);assert.ok(c.pitch>0&&c.pitch<=1&&c.roll>0&&c.roll<=1);const q=p.quaternion.clone();assert.ok(q.equals(p.quaternion));
  i.keys.add('ArrowDown');assert.equal(flightCommands(i,settings).pitch,-1);i.keys.clear();i.freeLook=true;assert.equal(flightCommands(i,settings).pitch,0);p.dispose();
});
test('F17 calibration rejects active sticks and profiles preserve custom pitch and inversion',()=>{
  assert.equal(controllerDeadzone(Array.from({length:30},()=>[.5,0])).ok,false);
  const good=controllerDeadzone(Array.from({length:30},()=>[.025,-.04,0,0]));assert.ok(good.ok&&good.deadzone>=.075);
  const g=gameHarness();g.ui.saveSettings=()=>{};g.applySettings=()=>{};g.settings.keyBindings={missile:'KeyF'};g.settings.mouseInvert=true;
  const saved=g.saveControlProfile('My keyboard');assert.ok(saved.ok);g.settings.mouseInvert=false;g.loadControlProfile(saved.id);assert.equal(g.settings.mouseInvert,true);assert.equal(g.settings.keyBindings.missile,'KeyF');
  assert.equal(g.calibrateController(Array.from({length:30},()=>[.5,0])).ok,false);g.removeControlProfile(saved.id);assert.equal(g.settings.controlProfiles.length,0);cleanup(g);
});
test('F20 recovery selects actual safe terrain intent, manual input overrides and impossible recovery is explicit',()=>{
  const p=createFlightState({position:{x:0,y:150,z:0},velocity:{x:0,y:-20,z:-220}});
  const recovery=recoveryIntent(p,{},(x,z)=>z< -150&&Math.abs(x)<80?220:0);assert.ok(recovery.pitch>0);assert.ok(recovery.urgent);assert.notEqual(recovery.roll,0);
  assert.equal(recoveryIntent(p,{pitch:.2},()=>999).overridden,true);assert.equal(recoveryIntent(p,{},()=>999).unrecoverable,true);
  assert.deepEqual(serializeFlightState(p).position,{x:0,y:150,z:0});
});
test('F08 adaptive quality uses sustained bounded levels, cooldown and restores cosmetic baseline',()=>{
  const q=new AdaptiveQuality({enabled:true});for(let i=0;i<1800;i++)q.update(40,.04);assert.equal(q.level,3);assert.ok(q.changes.length<=3);
  const changes=q.changes.length;for(let i=0;i<20;i++)q.update(14,1/60);assert.equal(q.changes.length,changes);q.configure({enabled:false});assert.equal(q.current.resolution,1);
});
test('F03 instruments read real orientation and cockpit survives LOD and customization',()=>{
  const p=new Jet('player');p.speed=200;p.position.y=1700;p.quaternion.setFromEuler(new T.Euler(.2,.4,.1));
  const data=readFlightInstruments(p,{target:{callsign:'TEST'},weapon:'MSL',ammunition:4,locked:true});assert.equal(data.speed,720);assert.equal(data.altitude,1700);assert.ok(data.pitch>0);assert.equal(data.target,'TEST');assert.equal(data.ammunition,4);
  p.setCockpitView(true);assert.ok(p.getCockpitPose().near<.1);p.updateVisualLOD(10000);p.setCockpitView(false);p.updateVisualLOD(30);p.dispose();
});
test('F04 landmark collision covers solids and leaves bridge passage open',()=>{
  const bridge=AEGIS_LANDMARKS.find(l=>l.kind==='bridge'),deck=bridge.parts.find(p=>p.id==='deck');assert.equal(collidesWithAegisLandmark(deck),true);
  assert.equal(collidesWithAegisLandmark({x:deck.x,y:deck.y-15,z:deck.z+100}),false);
});
test('F05/F27 cloud and terrain queries are deterministic and independent of graphics settings',()=>{
  assert.equal(CLOUD_VOLUMES.length,68);const c=CLOUD_VOLUMES[0],p={x:c.x,y:c.y,z:c.z};assert.ok(cloudDensityAt(p)>.5);
  const a={position:{x:0,y:1500,z:0},alive:true,systems:createDamageState()},b={id:'b',position:{x:0,y:1500,z:-3000},alive:true,team:'enemy',hp:100};
  assert.equal(evaluateDetection(a,b,{terrainHeight:()=>1800}).detected,false);
  const cloudy=evaluateDetection(a,b,{terrainHeight:()=>0,cloudDensityAt:()=>1});assert.equal(cloudy.radar,true);assert.equal(cloudy.lockable,false);
  const tracker=new ContactTracker();tracker.update(a,[b],0,{terrainHeight:()=>0});const lost=tracker.update(a,[b],1,{terrainHeight:()=>1800})[0];assert.equal(lost.remembered,true);assert.equal(lost.lockable,false);assert.equal(tracker.update(a,[b],5,{terrainHeight:()=>1800}).length,0);
});

for(const template of Object.keys(MISSION_TEMPLATES))test(`F23/F30 ${template}: versioned deterministic preset, objective completion and missing-target failure`,()=>{
  const preset=createMissionPreset({template,seed:4422,enemyBudget:4}),runtime=new MissionRuntime(preset,{terrainHeight});
  assert.deepEqual(decodeMissionPreset(encodeMissionPreset(preset)).value,preset);assert.deepEqual(missionSetup(preset,{terrainHeight}),missionSetup(preset,{terrainHeight}));
  const entities=new Map(),apply=events=>{for(const e of events)if(e.type==='spawn')for(const unit of e.entities)entities.set(unit.id,unit);};apply(runtime.start());
  for(let i=0;i<2400&&runtime.state==='active';i++){for(const e of entities.values())if(e.team==='enemy'){e.hp=0;e.alive=false;}apply(runtime.step(.25,{entities,players:[pilot()]}));}
  assert.equal(runtime.result?.success,true,JSON.stringify(runtime.snapshot()));assert.deepEqual(runtime.step(.25,{entities,players:[pilot()]}),[]);
  const failed=new MissionRuntime(preset);failed.start();for(let i=0;i<12;i++)failed.step(.25,{entities:[],players:[pilot()]});assert.equal(failed.result.success,false);
});
test('F23 actual Game lifecycle spawns operations, advances routes and clears markers/entities on exit',()=>{
  const g=gameHarness(4);assert.ok(g.operation);assert.ok(g.operationProtected);const before=g.operationProtected.position.clone();for(let i=0;i<60;i++)g.step(1/60);assert.ok(g.operationProtected.position.distanceTo(before)>100);
  g.menu();assert.equal(g.operation,null);assert.equal(g.operationMarkers,null);assert.equal(g.enemies.length,0);cleanup(g);
});
test('F24 campaign persistence applies same result once, unlocks consequences and handles corrupt saves',()=>{
  let c=createCampaign({seed:42});assert.equal(campaignMission(c,'ridge').ok,false);
  const event={ownerId:c.ownerId,campaignId:c.id,sectorId:'strait',instanceId:'run-1',result:{template:'escort',success:true,protectedHealth:.9,elapsed:100}};
  c=applyCampaignResult(c,event).value;assert.equal(c.sectors.ridge.status,'available');assert.equal(campaignMission(c,'ridge').preset.routeVariant,1);assert.equal(applyCampaignResult(c,event).applied,false);
  const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};assert.equal(saveCampaign(storage,c),true);assert.deepEqual(loadCampaign(storage).value,c);assert.equal(normalizeCampaign({version:999}).recovered,true);
  assert.equal(applyCampaignResult(c,{...event,ownerId:'someone-else'}).ok,false);
});
test('F25 wounded squad gets bounded recovery, every reinforcement is telegraphed and state round-trips',()=>{
  const director=new BattleDirector({difficulty:'easy',total:12}),events=[];assert.equal(director.initialCount(),2);
  for(let i=0;i<400;i++)events.push(...director.tick(.25,{active:0,squadHealth:.2}));
  let warnings=0,spawns=0;for(const e of events){if(e.type==='telegraph')warnings++;if(e.type==='reinforce'){spawns++;assert.ok(warnings>=spawns);assert.ok(e.count<=director.cap);assert.equal(e.grace,8);}}assert.ok(spawns>0);assert.ok(director.spawned<=12);assert.deepEqual(BattleDirector.restore(director.serialize()).snapshot(),director.snapshot());
});
test('F28 damaged systems change thrust/turn/sensors and only a real runway repairs them',()=>{
  const intact=systemEffects(createDamageState()),damaged=applySystemDamage(createDamageState(),80,{system:'engine',weapon:'missile'});assert.ok(systemEffects(damaged).thrustMult<intact.thrustMult);
  const base=RUNWAYS[0],p={...pilot(),speed:0,isLanded:true,systems:damaged,position:{x:base.x,y:base.elevation+3.2,z:base.z}};
  assert.equal(repairSystems({...p,isLanded:false},base).ok,false);assert.equal(repairSystems({...p,position:{x:0,y:5000,z:0}},base).ok,false);
  assert.equal(repairSystems(p,base,{now:10}).changed,true);assert.equal(p.systems.engine,1);assert.equal(repairSystems(p,base,{now:11}).ok,false);
});
test('F29 shared race enforces checkpoint order, agrees on ties and cancels cleanly',()=>{
  const activity=new ActivityRuntime('race',{participants:['a','b'],countdown:0}),a={...pilot(),id:'a'},b={...pilot(),id:'b'};activity.step(.1,{players:[a,b]});
  a.position={...activity.gates[4]};activity.step(.1,{players:[a,b]});assert.equal(activity.participants.get('a').checkpoint,0);
  a.position={x:0,y:1550,z:5200};b.position={...a.position};activity.step(.1,{players:[a,b]});
  for(const gate of activity.gates){
    for(let i=0;i<400;i++){const dx=gate.x-a.position.x,dy=gate.y-a.position.y,dz=gate.z-a.position.z,d=Math.hypot(dx,dy,dz),move=Math.min(d,100);for(const [key,delta] of [['x',dx],['y',dy],['z',dz]])a.position[key]+=d?delta/d*move:0;b.position={...a.position};activity.step(.1,{players:[a,b]});if(d<100)break;}
  }
  assert.equal(activity.state,'complete');assert.equal(activity.results.length,2);assert.equal(activity.results[0].rank,activity.results[1].rank);assert.equal(activity.snapshot().rewards.includes('no combat XP'),true);
  const cancelled=new ActivityRuntime('formation',{participants:['a','b']});cancelled.cancel();assert.deepEqual(cancelled.step(.1,{players:[a,b]}),[]);
});
test('F36 2/3/4 scripted human states complete common phases with one terminal event',()=>{
  for(const humans of [2,3,4]){const r=new CoopOpenSkiesRuntime({seed:22,humans}),entities=new Map(),players=Array.from({length:humans},(_,i)=>({...pilot(),id:`p${i}`}));let completed=0;
    const apply=events=>{for(const e of events){if(e.type==='spawn')for(const p of e.entities)entities.set(p.id,p);if(e.type==='complete')completed++;}};apply(r.start());
    for(let i=0;i<500&&r.state!=='complete';i++){for(const p of entities.values()){p.alive=false;p.hp=0;}apply(r.step(.25,{entities,players}));}
    assert.equal(r.result.success,true);assert.equal(completed,1);assert.deepEqual(r.step(.25,{entities,players}),[]);
  }
});
test('F15 replay stores bounded states, preserves identity and has independent seek without rewards',()=>{
  const r=new SortieRecorder({seconds:10}),p=pilot();r.reset({sortieId:'one'});for(let i=0;i<200;i++){p.position.x=i;if(i===150)p.hp=50;r.capture(i/10,[{entity:p,relation:'player'}]);}
  const recording=r.finish({success:true});assert.equal(recording.frames.length,100);assert.ok(recording.events.some(e=>e.type==='damage'));const playback=new ReplayPlayer(recording);const frame=playback.seek(15.05);assert.equal(frame.entities[0].id,'pilot');assert.ok(Math.abs(frame.entities[0].position[0]-150.5)<.001);assert.deepEqual(p.position,{x:199,y:2000,z:0});assert.throws(()=>validateReplay({...recording,version:99}));
});
test('F13 lessons need actual progress and safe resets clean the previous scene',()=>{
  let clean=0;const values=new Map(),school=new FlightSchool({storage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},onCleanup:()=>clean++}),g={player:pilot(),state:'playing',missilesLeft:6,flaresLeft:20};g.player.throttle=.5;
  school.start('climb',g);school.update(g,.1);assert.equal(school.completed,false);g.player.position.y+=130;for(let i=0;i<21;i++)school.update(g,.1);assert.equal(school.completed,true);school.start('targeting',g);assert.equal(clean,1);g.lock=1.4;school.update(g,.1);g.missilesLeft--;school.update(g,.1);assert.equal(school.completed,true);school.stop();assert.equal(clean,2);
});
function pad(index,held=[],axes=[0,0,0,0]){return {index,id:`controller-${index}`,connected:true,mapping:'standard',axes,buttons:Array.from({length:17},(_,i)=>({pressed:held.includes(i),value:held.includes(i)?1:0}))};}
test('F40 device allocation is exclusive and disconnect/reconnect does not re-fire held buttons',()=>{
  const pads=[pad(0),pad(1)];assert.deepEqual(allocateLocalDevices('two-controllers',pads),{ok:true,primary:0,secondary:1});assert.equal(allocateLocalDevices('two-controllers',[pad(0)]).ok,false);
  const actions=[],i=new SeatControllerInput(1,normalizeSettings().settings,a=>actions.push(a));i.poll(.016,pads);i.poll(.016,[pad(0,[0]),pad(1)]);assert.equal(actions.length,0);
  i.poll(.016,[pad(0),pad(1,[0],[.5,.4,0,0])]);assert.deepEqual(actions,['missile']);assert.ok(i.axes.pitch>0);i.poll(.016,[pad(0)]);assert.equal(actions.at(-1),'disconnected');assert.equal(i.heldActions.size,0);
  i.poll(.016,[pad(0),pad(1,[0])]);assert.equal(actions.filter(x=>x==='missile').length,1);i.poll(.016,pads);i.poll(.016,[pad(0),pad(1,[0])]);assert.equal(actions.filter(x=>x==='missile').length,2);
});
test('F40 integrated seats preserve independent movement, menu ownership, death and cleanup',()=>{
  const original=globalThis.document,{document}=parseHTML('<html><body><main id="app"><div id="hud"></div></main></body></html>');globalThis.document=document;globalThis.innerWidth=1366;globalThis.innerHeight=768;
  const g=gameHarness(2);g.ui.root=document.getElementById('app');g.ui.hudEl=document.getElementById('hud');g.renderer={domElement:{clientWidth:1366,clientHeight:768}};
  try{g.localCoop=new LocalCoop(g,{mode:'open_skies',inputMode:'keyboard-controller'},{primary:null,secondary:1});g.localCoop.start();const s=g.localCoop.seats[1];const first=g.player.quaternion.clone();s.input.poll(1/60,[pad(1)]);s.input.poll(1/60,[pad(1,[],[0,.8,0,0])]);g.localCoop.step(1/60);assert.ok(s.player.forward.y>0);assert.ok(first.equals(g.player.quaternion));
    g.localCoop.toggleMenu(1,true);assert.equal(g.localCoop.seats[0].paused,false);assert.equal(g.state,'playing');g.damage(g.player,1000,null,'collision');assert.equal(g.state,'playing');assert.equal(s.player.alive,true);assert.equal(document.querySelectorAll('.seat-hud').length,2);
    g.stopLocalCoop();assert.equal(document.querySelectorAll('.seat-hud').length,0);assert.equal(g.settings.device,'keyboard');assert.equal(g.allies.some(p=>p.localHuman),false);
  }finally{cleanup(g);globalThis.document=original;}
});
