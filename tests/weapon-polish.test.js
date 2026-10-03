import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { Weapons } from '../src/game/Weapons.js';
import { advanceCannon } from '../src/game/WeaponCadence.js';
import { SpatialHash } from '../src/game/SpatialHash.js';
import { weaponStatus } from '../src/ui/HUDState.js';
const aircraft = (team='player', z=0) => ({team, alive:true, hp:100, position:new T.Vector3(0,1000,z), velocity:new T.Vector3(0,0,-200), forward:new T.Vector3(0,0,-1), quaternion:new T.Quaternion(), speed:200, radius:8});
function setup(t) {
  const events=[], effects={emit(){},burst(...args){events.push(['burst',...args]);},impact(...args){events.push(['impact',...args]);},missileTrail(){}};
  const w=new Weapons(new T.Scene(),effects,(jet,amount)=>{events.push(['damage']);jet.hp-=amount;if(jet.hp<=0)jet.alive=false;},(...args)=>events.push(['sound',...args]));
  t.after(()=>w.dispose());return {w,events};
}
test('cannon cadence preserves configured rate at 30/60/144 Hz and irregular timesteps; release and dry fire have no backlog',()=>{
  for(const pattern of [[1/30],[1/60],[1/144],[.01,.04,.015]]){
    let time=0,cooldown=0,shots=0,i=0;
    while(time<10-1e-9){const dt=Math.min(pattern[i++%pattern.length],10-time);cooldown=advanceCannon(cooldown,dt,true,()=>{shots++;return true;});time+=dt;}
    assert.equal(shots,154);
    for(let i=0;i<100;i++)cooldown=advanceCannon(cooldown,.1,false,()=>assert.fail('released'));
    assert.equal(cooldown,0);assert.equal(advanceCannon(0,.2,true,()=>false),0);
  }
});
test('cannon assistance never changes aircraft direction; pooled rounds reset previous position',t=>{
  const {w}=setup(t),p=aircraft(),enemy=aircraft('enemy',-400);enemy.position.x=10;
  const before=p.forward.clone();w.cannon(p,enemy,{random:()=>.7});assert.deepEqual(p.forward,before);
  const b=w.bullets[0];b.active=false;p.position.x=900;w.cannon(p);assert.deepEqual(b.previous,b.p);
  assert.equal(w.bullets[0].mesh.geometry,w.bullets[1].mesh.geometry);
});
test('swept query includes target radius across a cell boundary',()=>{
  const grid=new SpatialHash(600),target={};grid.insert(target,new T.Vector3(605,100,0),10);
  assert.deepEqual(grid.querySegment(new T.Vector3(597,100,40),new T.Vector3(597,100,-40),0),[target]);
});
test('fast bullets apply damage and impact once at hit segment, no proximity-only marker',t=>{
  const {w,events}=setup(t),p=aircraft(),enemy=aircraft('enemy',-100);w.cannon(p,null,{spread:0});
  w.update(.1,[p,enemy],()=>false);w.update(.1,[p,enemy],()=>false);
  assert.equal(events.filter(e=>e[0]==='damage').length,1);
  assert.equal(events.filter(e=>e[0]==='impact').length,1);
  assert.ok(Math.abs(w.bullets[0].p.z+100)<1);
});
test('missile separates before ignition, turn is bounded, destroyed target clears and expiry releases pool state',t=>{
  const {w,events}=setup(t),p=aircraft(),enemy=aircraft('enemy',-1200);
  assert.equal(w.missile(p,enemy),true);const m=w.missiles[0];w.update(.05,[p,enemy],()=>false);
  assert.equal(m.ignited,false);assert.equal(m.speed,290);
  w.update(.1,[p,enemy],()=>false);assert.equal(m.ignited,true);
  assert.equal(events.filter(e=>e[0]==='sound'&&e[1]==='missile').length,1);
  enemy.position.set(0,1000,1000);const old=m.dir.clone();w.update(.1,[p,enemy],()=>false);assert.ok(old.angleTo(m.dir)<=.260001);
  enemy.alive=false;w.update(.1,[p,enemy],()=>false);assert.equal(m.target,null);
  m.life=.01;w.update(.02,[p],()=>false);assert.equal(m.active,false);assert.equal(m.owner,null);
  enemy.alive=true;w.missile(p,enemy);assert.equal(m.age,0);assert.equal(m.trail,0);assert.equal(m.ignited,false);assert.deepEqual(m.previous,m.p);
});
test('missile lethal collision emits only one explosion sound and leaves destruction visuals to damage owner',t=>{
  const {w,events}=setup(t),p=aircraft(),enemy=aircraft('enemy',-180);w.missile(p,enemy);
  for(let i=0;i<60;i++)w.update(1/60,[p,enemy],()=>false);
  assert.equal(events.filter(e=>e[0]==='damage').length,1);
  assert.equal(events.filter(e=>e[0]==='sound'&&e[1]==='explosion').length,1);
  assert.equal(events.filter(e=>e[0]==='burst').length,0);
});
test('terrain hit feedback uses collision surface and never claims aircraft damage',t=>{
  const {w,events}=setup(t);w.cannon(aircraft());w.update(.02,[],()=> 'water');
  assert.equal(events.find(e=>e[0]==='impact')[2],'water');assert.equal(events.some(e=>e[0]==='damage'),false);
});
test('HUD prioritizes ammo and cooldown over stale lock and uses active binding',()=>{
  const g={missilesLeft:1,missileCooldown:0,target:null,lock:0,settings:{}};assert.equal(weaponStatus(g),'NO TARGET');
  g.target={alive:true};assert.match(weaponStatus(g),/ACQUIRING/);g.lock=1.4;g.settings.keyBindings={missile:'KeyM'};assert.equal(weaponStatus(g),'LOCKED · M / RMB');
  g.missileCooldown=1;assert.match(weaponStatus(g),/RELOADING/);g.missilesLeft=0;assert.equal(weaponStatus(g),'OUT OF AMMO');
});
