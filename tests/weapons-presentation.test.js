import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { Weapons } from '../src/game/Weapons.js';
import { Effects } from '../src/game/Effects.js';
import { emitMissileSegment } from '../src/game/WeaponVisuals.js';
import { weaponHUD } from '../src/ui/WeaponHUD.js';
import { WeaponNetworkManager } from '../src/multiplayer/WeaponNetworkManager.js';

const jet = (team, z=0) => ({team, position:new T.Vector3(0,1000,z), forward:new T.Vector3(0,0,-1), velocity:new T.Vector3(0,0,-200), quaternion:new T.Quaternion(), speed:200, alive:true, radius:12, stats:{cannonDamage:14}});

test('cannon flash and sound fire once, geometry is shared, and aiming never mutates owner heading', () => {
  const scene=new T.Scene(), fx=new Effects(scene), sounds=[];
  const w=new Weapons(scene,fx,()=>{},(...args)=>sounds.push(args));
  const owner=jet('player'), target=jet('enemy',-800), before=owner.forward.clone();
  assert.ok(w.cannon(owner,target,{spread:.01,random:()=>1}));
  assert.ok(owner.forward.equals(before));
  assert.equal(sounds.length,1);assert.equal(sounds[0][0],'cannon');
  assert.ok(fx.particles.some(p=>p.life>0));
  assert.equal(w.bullets[0].mesh.geometry,w.bullets[1].mesh.geometry);
  for(let i=1;i<180;i++)w.cannon(owner);
  assert.equal(w.cannon(owner),false);assert.equal(sounds.length,180);
  w.clear();assert.ok(w.bullets.every(b=>!b.active&&!b.mesh.visible));
  w.dispose();fx.dispose();assert.equal(scene.children.length,0);
});

test('missile trail samples the travelled segment, stays bounded and respects effects off', () => {
  const points=[],fx={intensity:1,missileTrail:p=>points.push(p.clone())},dir=new T.Vector3(0,0,-1);
  emitMissileSegment(fx,new T.Vector3(),new T.Vector3(0,0,-60),dir,1000);
  assert.equal(points.length,5);assert.ok(points[0].z>points[4].z);
  for(let i=1;i<points.length;i++)assert.ok(points[i-1].distanceTo(points[i])<=12.01);
  points.length=0;emitMissileSegment(fx,new T.Vector3(),new T.Vector3(0,0,-1000),dir,1000);assert.equal(points.length,8);
  points.length=0;fx.intensity=0;emitMissileSegment(fx,new T.Vector3(),dir,dir,1000);assert.equal(points.length,0);
});

test('terrain impacts trigger once and a missed cannon round never reports damage', () => {
  const scene=new T.Scene(),fx=new Effects(scene);let impacts=0,damage=0;
  fx.weaponImpact=()=>impacts++;
  const w=new Weapons(scene,fx,()=>damage++,()=>{}),owner=jet('player');
  w.cannon(owner);w.update(.05,[],()=>true);w.update(.05,[],()=>true);
  assert.equal(impacts,1);assert.equal(damage,0);
  const target=jet('enemy',-2000);w.missile(owner,target);w.update(.05,[target],()=>true);w.update(.05,[target],()=>true);
  assert.equal(impacts,2);assert.equal(damage,0);
  w.dispose();fx.dispose();
});

test('weapon HUD separates empty, cooldown, lock and actual hit feedback', () => {
  const g={missilesLeft:2,cannonLeft:1200,lock:1.4,target:{alive:true},elapsed:10};
  assert.equal(weaponHUD(g).mode,'locked');assert.equal(weaponHUD(g).hit,'');
  g.missileCooldown=.85;assert.equal(weaponHUD(g).mode,'reload');assert.equal(weaponHUD(g).progress,.5);
  g.missilesLeft=0;assert.equal(weaponHUD(g).mode,'empty');
  g.weaponHitUntil=10.24;assert.equal(weaponHUD(g).hit,'HIT');
  g.weaponHitKill=true;assert.equal(weaponHUD(g).hit,'DESTROYED');
  g.elapsed=11;assert.equal(weaponHUD(g).hit,'');
  g.cannonLeft=0;assert.equal(weaponHUD(g).cannon,'EMPTY');
});

test('remote projectile visuals are bounded, clear on restart, and release shared resources', () => {
  const scene=new T.Scene(),fx=new Effects(scene),remote=new WeaponNetworkManager({scene,effects:fx});
  const args={pos:{x:0,y:1000,z:0},vel:{x:0,y:0,z:-1000},dir:{x:0,y:0,z:-1}};
  for(let i=0;i<250;i++)remote.handleCannonFired(args);
  for(let i=0;i<50;i++)remote.handleMissileLaunched(args);
  assert.equal(remote.remoteBullets.length,180);assert.equal(remote.remoteMissiles.length,36);
  remote.update(.1);remote.clear();assert.equal(remote.remoteBullets.length,0);assert.equal(remote.remoteMissiles.length,0);
  remote.dispose();fx.dispose();assert.equal(scene.children.length,0);
});
