import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Jet} from '../src/game/Jet.js';
import {CameraController} from '../src/game/Camera.js';
import {configureRenderer,qualityFor} from '../src/game/Quality.js';
import {Atmosphere,SKY_PRESETS} from '../src/game/Atmosphere.js';
import {terrainJob,TERRAIN_BOUNDS} from '../src/game/TerrainChunks.js';
import {Effects} from '../src/game/Effects.js';
import {World} from '../src/game/World.js';
import {SpeedEffects} from '../src/game/SpeedEffects.js';
import {validateJetAsset} from '../src/game/JetAsset.js';
import {primaryWarning,hudContext} from '../src/ui/HUDState.js';
import {disposeObject} from '../src/game/Resources.js';

test('render interpolation never changes authoritative simulation position and snaps teleports',()=>{
 const jet=new Jet('player');jet.position.set(0,1000,0);jet.resetInterpolation();jet.beginStep();jet.position.x=100;jet.quaternion.setFromAxisAngle(new T.Vector3(0,1,0),.5);
 jet.renderInterpolated(.5);assert.equal(jet.model.position.x,50);assert.equal(jet.position.x,100);assert.ok(Math.abs(jet.model.quaternion.y-Math.sin(.125))<1e-6);
 jet.position.x=5000;jet.renderInterpolated(.2);assert.equal(jet.model.position.x,5000);jet.dispose();
});
test('camera respects zero speed FOV and shake, terrain clearance, and free-look without rotating the aircraft',()=>{
 const player=new Jet('player');player.position.set(0,10,0);player.resetInterpolation();player.speed=520;player.boost=true;
 const camera=new T.PerspectiveCamera(64,1,1,10000),controller=new CameraController(camera),game={player,settings:{fov:64,speedFov:0,shakeIntensity:0},world:{terrainHeight:()=>100},input:{freeLook:true,look:{x:.6,y:0}},state:'playing',elapsed:1,weapons:{missiles:[]}};
 const rotation=player.quaternion.clone();controller.shake=10;
 for(let i=0;i<120;i++)controller.update(1/60,game);
 assert.equal(camera.fov,64);assert.ok(camera.position.y>=103);assert.ok(player.quaternion.equals(rotation));assert.ok(Number.isFinite(camera.matrixWorld.elements[0]));
 controller.cycle();assert.equal(controller.mode,'cockpit');controller.cycle();assert.equal(controller.mode,'cinematic');controller.cycle();assert.equal(controller.mode,'chase');player.dispose();
});
test('renderer and composer use the same bounded DPR/size and capability-limited MSAA',()=>{
 const events=[],target=()=>({samples:0,dispose(){events.push('dispose');}});
 const renderer={capabilities:{maxSamples:2},shadowMap:{},setPixelRatio(value){this.ratio=value},setSize(w,h){this.size=[w,h]}},composer={renderTarget1:target(),renderTarget2:target(),setPixelRatio(value){this.ratio=value},setSize(w,h){this.size=[w,h]}},game={settings:{quality:'high'},renderer,composer,bloomPass:{},camera:new T.PerspectiveCamera()};
 configureRenderer(game,1366,768,3);assert.equal(renderer.ratio,1.5);assert.equal(composer.ratio,renderer.ratio);assert.deepEqual(composer.size,renderer.size);assert.equal(composer.renderTarget1.samples,2);assert.equal(game.bloomPass.threshold,1.15);
 game.settings.quality='low';configureRenderer(game,390,844,3);assert.equal(renderer.ratio,1);assert.equal(composer.renderTarget2.samples,0);assert.equal(game.bloomPass.enabled,false);assert.equal(renderer.shadowMap.enabled,false);
 assert.ok(qualityFor('ultra').particles>qualityFor('low').particles);
});
test('weather is idempotent and time changes preserve storm lighting; moon/water share one direction',()=>{
 const scene=new T.Scene();scene.background=new T.Color();scene.fog=new T.FogExp2();
 const names=['sunDir','moonDir','skyTop','skyBottom','sunGlow','isNight','stormFactor','lightningFlash'];
 const world={scene,sun:new T.DirectionalLight(),sunDirection:new T.Vector3(),hemi:new T.HemisphereLight(),sky:{material:{uniforms:Object.fromEntries(names.map(name=>[name,{value:['isNight','stormFactor','lightningFlash'].includes(name)?0:new T.Vector3()}]))}},water:{material:{uniforms:{sunDir:{value:new T.Vector3()}}}},clouds:[]};
 const atmosphere=new Atmosphere(world,scene);atmosphere.setWeather('storm');const intensity=world.sun.intensity;
 for(let i=0;i<10;i++)atmosphere.setWeather('storm');assert.equal(world.sun.intensity,intensity);
 atmosphere.setTimeOfDay('sunset');assert.equal(world.sun.intensity,SKY_PRESETS.sunset.sunIntensity*.55);assert.equal(world.sky.material.uniforms.stormFactor.value,1);
 atmosphere.setTimeOfDay('night');assert.ok(world.sunDirection.equals(SKY_PRESETS.night.moonDir));assert.ok(world.water.material.uniforms.sunDir.value.equals(world.sunDirection));atmosphere.dispose();
});
test('terrain LODs align coordinates, height, UV and normals at shared borders with skirts',()=>{
 const height=(x,z)=>Math.sin(x/500)*50+Math.cos(z/800)*30,build=(x,n)=>{const job=terrainJob(x,0,n,height);while(!job.step(35)){}return job.finish();};
 const left=build(0,8),right=build(1,16),lp=left.attributes.position,rp=right.attributes.position;
 for(let row=0;row<=8;row++){
   const l=row*9+8,r=row*2*17;assert.equal(lp.getX(l),rp.getX(r));assert.equal(lp.getZ(l),rp.getZ(r));assert.equal(lp.getY(l),rp.getY(r));assert.equal(left.attributes.uv.getX(l),right.attributes.uv.getX(r));assert.equal(left.attributes.normal.getX(l),right.attributes.normal.getX(r));
 }
 assert.equal(lp.getX(0),TERRAIN_BOUNDS.minX);assert.ok(lp.count>81);left.dispose();right.dispose();
});
test('smoke and contrails use normal blending, glow is separate, budgets and zero effects apply',()=>{
 const effects=new Effects(new T.Scene()),position=new T.Vector3(),velocity=new T.Vector3();effects.smoke(position);effects.contrail(position);effects.emit(position,velocity);
 assert.equal(effects.channels[0],0);assert.equal(effects.channels[1],0);assert.equal(effects.channels[2],1);
 assert.equal(effects.smokePoints.material.blending,T.NormalBlending);assert.equal(effects.points.material.blending,T.AdditiveBlending);
 effects.setQuality(1200,0);effects.burst(position);assert.ok(effects.particles.every(p=>p.life<=0));assert.equal(effects.geometry.drawRange.count,1200);effects.dispose();
});
test('cloud moisture is spatial, so clear air at cloud altitude stays dry',()=>{
 const cloud={position:new T.Vector3(0,3000,0),scale:new T.Vector3(2000,1000,1),userData:{qualityVisible:true}};
 const world={clouds:[cloud],cloudDensityAt:World.prototype.cloudDensityAt};assert.ok(world.cloudDensityAt(cloud.position)>.8);assert.equal(world.cloudDensityAt(new T.Vector3(8000,3000,0)),0);
 const effects=new SpeedEffects(new T.Scene()),camera=new T.PerspectiveCamera(),player={alive:true,speed:180,position:new T.Vector3(8000,3000,0)};
 effects.update(1,player,camera,null,world);assert.equal(effects.cloudMoisture,0);player.position.copy(cloud.position);effects.update(1,player,camera,null,world);assert.ok(effects.cloudMoisture>0);effects.dispose();
});
test('one warning wins by priority and uses the current key binding',()=>{
 const game={player:{position:new T.Vector3(0,50,0),velocity:new T.Vector3(0,-10,0),stall:true,gearDown:false},incoming:[{}],settings:{keyBindings:{flare:'KeyF'}}};
 assert.equal(primaryWarning(game,0,'approach').id,'missile');assert.match(primaryWarning(game,0,'approach').text,/F FLARES/);game.incoming=[];assert.equal(primaryWarning(game,0,'approach').id,'stall');game.player.stall=false;assert.equal(primaryWarning(game,0,'approach').id,'terrain');game.player.isLanded=true;assert.equal(hudContext(game,0,{distance:500}),'ground');
});
test('asset loader rejects missing provenance and remote paths, and failure preserves procedural aircraft',async()=>{
 assert.throws(()=>validateJetAsset({url:'https://example.org/model.glb'}));assert.throws(()=>validateJetAsset({url:'/assets/jet.glb'}));
 const player=new Jet('player'),model=player.model,id=player.modelId,hp=player.hp;assert.equal(await player.loadVisual({url:'/bad.glb'}),false);assert.equal(player.model,model);assert.equal(player.hp,hp);assert.equal(player.modelId,id);player.dispose();
});
test('resource cleanup disposes shared mesh resources once and preserves explicitly shared textures',()=>{
 const group=new T.Group(),geometry=new T.BoxGeometry(),texture=new T.Texture(),material=new T.MeshStandardMaterial({map:texture});let geometries=0,materials=0,textures=0;
 geometry.addEventListener('dispose',()=>geometries++);material.addEventListener('dispose',()=>materials++);texture.addEventListener('dispose',()=>textures++);
 group.add(new T.Mesh(geometry,material),new T.Mesh(geometry,material));disposeObject(group,new Set([texture]));assert.equal(geometries,1);assert.equal(materials,1);assert.equal(textures,0);
});

test('aircraft attachments include nested asset transforms and use the simulation pose',()=>{
 const jet=new Jet('player'),assetRoot=new T.Group();assetRoot.position.set(2,1,0);assetRoot.scale.setScalar(2);jet.model.add(assetRoot);
 const tip=new T.Object3D();tip.position.set(-7,0,2);assetRoot.add(tip);jet.model.userData.anchors.wingtip_left=tip;
 jet.position.set(100,300,400);jet.quaternion.setFromAxisAngle(new T.Vector3(0,1,0),Math.PI/2);
 jet.model.position.set(999,999,999);jet.model.quaternion.identity();
 const expected=new T.Vector3(-12,1,4).applyQuaternion(jet.quaternion).add(jet.position);
 assert.ok(jet.getWingTips().left.distanceTo(expected)<1e-9);
 const exhaust=jet.model.userData.anchors.exhaust.position.clone().applyQuaternion(jet.quaternion).add(jet.position);
 assert.ok(jet.getExhaustPosition().distanceTo(exhaust)<1e-9);jet.dispose();
});

test('gear pose preserves an imported pivot offset and scale on retract and reset',()=>{
 const jet=new Jet('player'),gear=jet.model.userData.gearGroup;gear.position.set(1,-2,3);gear.scale.set(2,3,4);
 jet.setGear(false);assert.equal(gear.visible,false);assert.equal(gear.scale.y,.03);
 jet.setGear(true);assert.deepEqual(gear.position.toArray(),[1,-2,3]);assert.deepEqual(gear.scale.toArray(),[2,3,4]);assert.equal(gear.visible,true);jet.dispose();
});

test('static scenery batches preserve world bounds and do not include animated groups',async()=>{
 const {batchStaticScenery}=await import('../src/game/StaticScenery.js');const scene=new T.Scene(),material=new T.MeshStandardMaterial({color:0xcccccc});
 for(const x of [10,50,100]){const mesh=new T.Mesh(new T.BoxGeometry(10,20,10),material);mesh.position.set(x,0,0);scene.add(mesh);}
 const animated=new T.Group();animated.add(new T.Mesh(new T.BoxGeometry(),material));scene.add(animated);
 const before=new T.Box3().setFromObject(scene);const result=batchStaticScenery(scene),after=new T.Box3().setFromObject(scene);assert.equal(result.eligibleMeshesAfter,1);assert.ok(before.equals(after));assert.equal(animated.children.length,1);disposeObject(scene);
});
