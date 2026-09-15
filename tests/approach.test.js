import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { Jet } from '../src/game/Jet.js';
import { updateFlight } from '../src/game/FlightPhysics.js';
import { IAF_BASES } from '../src/game/GeoWorld.js';
import { terrainHeight } from '../src/game/World.js';
import { runwayPoint, onRunway, assessTouchdown, approachInfo, GLIDE_ANGLE } from '../src/game/Landing.js';
const settings={input:'keyboard',sensitivity:.8};
const controls=(...keys)=>({keys:new Set(keys),mouse:{x:0,y:0}});
function approach(base){const p=new Jet('player');p.position.copy(runwayPoint(base,0,base.elevation+3.2+4750*Math.tan(GLIDE_ANGLE),base.runwayLength/2+4500));p.quaternion.setFromEuler(new T.Euler(-GLIDE_ANGLE,-(base.runwayHeading||0)*Math.PI/180,0,'YXZ'));p.velocity.copy(p.forward).multiplyScalar(112);p.speed=112;p.throttle=.56;p.landingMode=true;p.flaps=true;p.setGear(true);return p;}
test('every airbase supports a continuous final approach and safe touchdown',()=>{
 for(const base of IAF_BASES){
  const p=approach(base);let result=null;
  for(let n=0;n<3600;n++){
   const old=p.position.clone();updateFlight(p,controls(),1/60,settings);
   result=assessTouchdown(base,old,p);
   if(result)break;
  }
  assert.ok(result?.safe,base.id+' approach did not land safely');
  assert.ok(onRunway(base,result.hit));
 }
});
test('touchdown rejects gear-up, excessive sink, side-on and inverted contacts',()=>{
 const base=IAF_BASES[0],p=approach(base),old=runwayPoint(base,0,base.elevation+5,0);
 p.position.copy(runwayPoint(base,0,base.elevation+2,0));p.velocity.set(0,-5,-112);
 assert.equal(assessTouchdown(base,old,p).safe,true);
 p.setGear(false);assert.equal(assessTouchdown(base,old,p).safe,false);p.setGear(true);
 p.velocity.y=-12;assert.equal(assessTouchdown(base,old,p).safe,false);p.velocity.y=-5;
 p.quaternion.setFromEuler(new T.Euler(0,Math.PI/2,0));assert.equal(assessTouchdown(base,old,p).safe,false);
 p.quaternion.setFromEuler(new T.Euler(0,0,Math.PI));assert.equal(assessTouchdown(base,old,p).safe,false);
});
test('braking stops ground roll, boost alone cannot rotate, pull-up preserves climb',()=>{
 const p=new Jet('player');p.isLanded=true;p.landedElev=42;p.speed=110;p.throttle=0;p.position.set(0,45.2,0);
 for(let n=0;n<240;n++)updateFlight(p,controls('KeyB'),1/60,settings);
 assert.equal(p.speed,0);assert.equal(p.isLanded,true);
 p.speed=100;updateFlight(p,controls('ShiftLeft'),1/60,settings);assert.equal(p.isLanded,true);
 updateFlight(p,controls('ArrowUp'),1/60,settings);assert.equal(p.isLanded,false);assert.ok(p.velocity.y>0);assert.ok(p.position.y>45.2);
});
test('gear cannot retract on ground, manual throttle and flap approach response work',()=>{
 const p=new Jet('player');p.isLanded=true;p.toggleGear();assert.equal(p.gearDown,true);
 p.isLanded=false;p.landingMode=true;p.throttle=.5;
 for(let n=0;n<60;n++)updateFlight(p,controls('PageDown'),1/60,settings);
 assert.ok(p.throttle<.2);
 for(let n=0;n<60;n++)updateFlight(p,controls('PageUp'),1/60,settings);
 assert.ok(p.throttle>.45);
});
test('rotated runway geometry and ILS share the same coordinates',()=>{
 const base={...IAF_BASES[0],runwayHeading:65},p=approach(base);
 assert.ok(Math.abs(approachInfo(base,p).crossTrack)<1e-8);
 assert.ok(Math.abs(approachInfo(base,p).glideError)<1e-8);
 assert.ok(onRunway(base,runwayPoint(base,0,45,500)));
 assert.ok(!onRunway(base,runwayPoint(base,200,45,0)));
 for(const base of IAF_BASES)for(const z of [-.45,0,.45])assert.ok(Math.abs(terrainHeight(base.x,base.z+base.runwayLength*z)-base.elevation)<.01,base.id);
});
