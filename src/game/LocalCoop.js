import * as T from 'three';
import { Jet } from './Jet.js';
import { CameraController } from './Camera.js';
import { ACTIONS, readGamepad, isHeld, bindingLabel } from './InputActions.js';
import { updateFlight } from './FlightPhysics.js';
import { updateLock } from './Weapons.js';
import { terrainHeight } from './World.js';
import { IAF_BASES } from './GeoWorld.js';
import { assessTouchdown } from './Landing.js';
import { createDamageState, repairSystems, systemEffects } from '../shared/DamageSystems.js';
import { SeatHUD } from '../ui/SeatHUD.js';
import { ContactTracker, evaluateDetection } from '../shared/Sensors.js';
import { cloudDensityAt } from '../shared/CloudField.js';
import { OPEN_SKIES } from './OpenSkies.js';
import { advanceCannon } from './WeaponCadence.js';

export function connectedControllers(pads) {
  if(!pads){try{pads=globalThis.navigator?.getGamepads?.() || [];}catch{pads=[];}}
  return Array.from(pads).filter(p=>p && p.connected!==false && p.mapping==='standard');
}
export function allocateLocalDevices(mode,pads) {
  const available=connectedControllers(pads),required=mode==='two-controllers'?2:1;
  if(available.length<required)return {ok:false,error:`${required} standard controller${required===1?'':'s'} connect karo aur controller par koi button press karo. Phir Start dabao.`};
  return {ok:true,primary:required===2?available[0].index:null,secondary:available[required-1].index};
}

/** No DOM keyboard listeners: this input exclusively owns one assigned pad. */
export class SeatControllerInput {
  constructor(index,settings,onAction){this.index=index;this.settings=settings;this.action=onAction;this.keys=new Set();this.heldActions=new Set();this.padHeld=new Set();this.blocked=new Set();this.axes={};this.mouse={x:0,y:0};this.look={x:0,y:0};this.levelTimer=0;this.connected=false;this.paused=false;this.neutral();}
  neutral(){this.axes={pitch:0,roll:0,lookX:0,lookY:0,brake:0};this.heldActions.clear();this.freeLook=false;this.look.x=0;this.look.y=0;this.levelTimer=0;}
  clear(){for(const name of this.padHeld)this.blocked.add(name);this.keys.clear();this.neutral();}
  poll(dt,pads){
    const pad=connectedControllers(pads).find(p=>p.index===this.index),state=readGamepad(pad,this.settings.gamepadDeadzone ?? .14);
    if(!pad){if(this.connected)this.action('disconnected');this.connected=false;this.clear();this.padHeld.clear();return;}
    if(!this.connected){for(const name of state.held)this.blocked.add(name);this.connected=true;}
    for(const name of this.blocked)if(!state.held.has(name))this.blocked.delete(name);
    const held=new Set([...state.held].filter(name=>!this.blocked.has(name)));
    if(!this.paused){this.axes=state.axes;this.heldActions=held;this.freeLook=Math.abs(state.axes.lookX)+Math.abs(state.axes.lookY)>.03;this.look={x:state.axes.lookX,y:state.axes.lookY};}
    else this.neutral();
    const edges=[...held].filter(name=>!this.padHeld.has(name));
    if(edges.includes('pause'))this.action('pause');
    else for(const name of edges)if(!['axis','held'].includes(ACTIONS[name]?.kind) && !this.paused)this.action(name);
    this.padHeld=new Set(state.held);
  }
  dispose(){this.clear();this.padHeld.clear();}
}

export class LocalCoop {
  constructor(game,options,allocation){this.game=game;this.options={...options};this.allocation=allocation;this.active=false;this.seats=[];this.saved={device:game.settings.device,input:game.settings.input,padIndex:game.input.padIndexOverride};}
  start(){
    const g=this.game;this.active=true;
    g.settings.device=this.allocation.primary===null?'keyboard':'gamepad';g.settings.input=g.settings.device;
    g.input.keyboardDisabled=this.allocation.primary!==null;g.input.padIndexOverride=this.allocation.primary;g.input.clear();
    g.player.localHuman=true;g.player.isHuman=true;
    const second=new Jet('ally',false,g.jetConfig);second.localHuman=true;second.isHuman=true;second.callsign='KESTREL 2 · LOCAL';second.systems=createDamageState();
    second.position.copy(g.player.position).add(new T.Vector3(180,45,100));second.quaternion.copy(g.player.quaternion);second.velocity.copy(g.player.velocity);second.speed=g.player.speed;second.throttle=g.player.throttle;second.setGear(false);second.resetInterpolation();
    // Replace an AI wingman with the second human; retain one AI in Open Skies.
    if(g.openSkies && g.allies.length>1){const replaced=g.allies.pop();replaced.dispose();}
    g.allies.push(second);g.scene.add(second.model);this.players=[g.player,second];
    this.root=document.createElement('div');this.root.className='local-coop-layer';g.ui.root.appendChild(this.root);
    const p2Settings={...g.settings,device:'gamepad',input:'gamepad',gamepadIndex:this.allocation.secondary};
    const p2Input=new SeatControllerInput(this.allocation.secondary,p2Settings,action=>this.action(1,action));p2Input.player=second;
    const camera=new T.PerspectiveCamera(g.camera.fov,1,1.2,g.camera.far),cam=new CameraController(camera);cam.reset(second);p2Input.aimCamera=camera;
    const view=Object.create(g);Object.assign(view,{player:second,input:p2Input,settings:p2Settings,camera,cam,target:null,lock:0,lockSound:false,incoming:[],hostileLock:false,notifications:[],missileCooldown:0,cannonCooldown:0,flareCooldown:0,missilesLeft:second.stats?.missiles || 6,cannonLeft:second.stats?.cannon || 1200,flaresLeft:second.stats?.flares || 20});
    view.ui=Object.create(g.ui);view.ui.message=(text,ttl=3)=>this.message(1,text,ttl);
    view.getSensorContacts=()=>this.seats[1]?.contacts || [];
    this.seats=[{view:g,input:g.input,camera:g.camera,cam:g.cam,player:g.player,paused:false},{view,input:p2Input,camera,cam,player:second,paused:false,tracker:new ContactTracker()}];
    for(let index=0;index<2;index++){
      const seat=this.seats[index];seat.hud=new SeatHUD(this.root,{seatId:String(index+1),label:`PLAYER ${index+1}`});
      seat.hud.el.querySelector('[data-seat-action="menu"]').addEventListener('click',()=>this.toggleMenu(index));
      seat.notice=document.createElement('div');seat.notice.className='seat-notice';seat.hud.el.appendChild(seat.notice);
      seat.menu=document.createElement('div');seat.menu.className='local-seat-menu';seat.menu.hidden=true;seat.menu.setAttribute('role','dialog');seat.menu.setAttribute('aria-label',`Player ${index+1} menu`);
      seat.menu.innerHTML=`<h3>PLAYER ${index+1}</h3><p data-seat-status>Doosra pilot fly kar sakta hai.</p><button data-local="resume">Resume flight</button><button data-local="camera">Change camera</button><button data-local="recover">Recover aircraft</button><button data-local="restart">Restart both players</button>${index===0?'<button data-local="exit">Exit local co-op</button>':''}`;
      seat.menu.addEventListener('click',event=>{const action=event.target.closest('[data-local]')?.dataset.local;if(!action)return;
        if(action==='resume')this.toggleMenu(index,false);if(action==='camera')seat.cam.cycle();if(action==='recover'){if(seat.player.alive)seat.input.levelTimer=3;else if(g.mission.freeFlight)this.resetSeat(index);this.toggleMenu(index,false);}
        if(action==='restart')g.restart();if(action==='exit')g.menu();});
      seat.hud.el.appendChild(seat.menu);
    }
    g.ui.hudEl.hidden=true;g.ui.root.classList.add('local-coop-active');this.resize();
    for (const [index, seat] of this.seats.entries()) {
      const key = action => bindingLabel(action, seat.view.settings);
      this.message(index,`${key('pitchUp')} nose up · ${key('pitchDown')} nose down · ${key('cannon')} cannon · ${key('missile')} missile · ${key('flare')} flares · ${key('pause')} menu`,8);
    }
    return {ok:true};
  }
  message(index,text,ttl=3){const seat=this.seats[index];if(seat){seat.notice.textContent=text;seat.noticeTime=ttl;}}
  toggleMenu(index,open){const seat=this.seats[index];if(!seat)return;seat.paused=open??!seat.paused;seat.menu.hidden=!seat.paused;seat.input.paused=seat.paused;seat.input.clear();if(seat.paused)seat.menu.querySelector('button')?.focus();else document.activeElement?.blur?.();}
  action(index,action){
    const g=this.game,seat=this.seats[index];if(!seat)return;
    if(['pause','disconnected','Blur'].includes(action)){this.toggleMenu(index,action==='pause'?undefined:true);if(action==='disconnected')seat.menu.querySelector('[data-seat-status]').textContent='Controller disconnected. Reconnect the same controller; then resume.';return;}
    if(seat.paused || !seat.player.alive || g.state!=='playing')return;
    const v=seat.view;
    if(action==='missile')g.launch.call(v);else if(action==='flare')g.flare.call(v);
    else if(action==='targetNext'||action==='targetPrev')g.cycleTarget.call(v,action==='targetPrev'?-1:1);
    else if(action==='camera')seat.cam.cycle();else if(action==='landingGear')g.toggleGear.call(v);
    else if(action==='teamComms'){g.commandSquadron('cover');this.message(index,'Squadron: cover the local team.');}
    else if(action==='tacticalMap')this.toggleMenu(index,true);
  }
  poll(dt,pads){if(!this.active)return;this.seats[1].input.poll(dt,pads);}
  step(dt){
    const g=this.game,seat=this.seats[1],v=seat.view,p=seat.player;if(!this.active)return;
    v.elapsed=g.elapsed;v.state=p.alive?g.state:'dying';v.mission=g.mission;v.stats=g.stats;
    for(const key of ['missileCooldown','flareCooldown'])v[key]=Math.max(0,v[key]-dt);
    if(p.alive){
      const previous=p.position.clone();updateFlight(p,seat.input,dt,v.getFlightSettings(),{terrainHeight});
      let touchdown=null;
      if(!p.isLanded && !(p.takeoffCooldown>0))for(const base of IAF_BASES){const result=assessTouchdown(base,previous,p);if(result){touchdown=result;if(result.safe){p.position.copy(result.hit);g.touchdown.call(v,base);}else if(g.mission.freeFlight)this.resetSeat(1);else g.damage(p,1000,null,'terrain');break;}}
      if(!touchdown && !p.isLanded && g.world.collision(p.position)){if(g.mission.freeFlight)this.resetSeat(1);else g.damage(p,1000,null,'terrain');}
      const center=g.openSkies?OPEN_SKIES.center:{x:0,z:0},radius=g.openSkies?OPEN_SKIES.boundaryRadius:95000;if(p.position.y>15000 || Math.hypot(p.position.x-center.x,p.position.z-center.z)>radius){if(g.mission.freeFlight)this.resetSeat(1);else g.damage(p,1000,null,'boundary');}
      if(!v.target?.alive)v.target=g.enemies.find(e=>e.alive && g.canDetect(p,e)) || null;
      v.lock=updateLock(p,v.target,v.lock,dt,{canTrack:(a,b)=>g.canDetect(a,b,'lockable'),rate:systemEffects(p.systems,g.settings.difficulty).lockRateMult});
      v.cannonCooldown=advanceCannon(v.cannonCooldown,dt,!seat.paused && !g.mission.freeFlight && isHeld(seat.input,'cannon',v.settings),()=>{if(v.cannonLeft<=0 || !g.weapons.cannon(p,v.target))return false;v.cannonLeft--;g.stats.shots++;return true;});
      if(v.lock>=1.4&&!v.lockSound){g.audio.play('lock');v.lockSound=true;}if(v.lock===0)v.lockSound=false;
    }
    v.incoming=g.weapons.missiles.filter(m=>m.active && m.target===p);
    v.hostileLock=g.enemies.some(e=>e.combat?.target===p&&e.combat.lock>.3);
    seat.contacts=seat.tracker.update(p,[g.player,...g.enemies,...g.allies.filter(a=>a!==p)],g.elapsed,{terrainHeight,cloudDensityAt,weather:g.atmosphere?.weather || g.settings.weather});
  }
  resetSeat(index){const s=this.seats[index],g=this.game,p=s.player,other=this.seats[1-index].player;
    p.alive=true;p.hp=p.maxHp;p.systems=createDamageState();p.isLanded=false;p.landingMode=false;p.setGear(false);p.speed=245;p.throttle=.6;p.angular.set(0,0,0);
    p.position.copy(other.alive?other.position:new T.Vector3(0,1550,5200)).add(new T.Vector3(index?220:-220,100,200));p.position.y=Math.max(p.position.y,terrainHeight(p.position.x,p.position.z)+600);
    p.quaternion.identity();p.velocity.set(0,0,-245);p.resetInterpolation();s.cam.mode='chase';s.cam.reset(p);s.input.clear();s.view.target=null;s.view.lock=0;this.message(index,'Aircraft reset · ↑ nose up / controller left stick down',3);
  }
  resize(){if(!this.active)return;const w=this.game.renderer.domElement.clientWidth || innerWidth,h=this.game.renderer.domElement.clientHeight || innerHeight;this.vertical=w/h<1.2;
    this.seats.forEach((s,i)=>{const rect=this.vertical?{left:0,top:i*50,width:100,height:50}:{left:i*50,top:0,width:50,height:100};s.rect=rect;s.hud.setViewport(rect);s.camera.aspect=(w*rect.width)/(h*rect.height);s.camera.updateProjectionMatrix();});
  }
  render(dt){
    const g=this.game,r=g.renderer,w=r.domElement.clientWidth || innerWidth,h=r.domElement.clientHeight || innerHeight;this.resize();
    const oldAuto=r.autoClear,oldViewport=r.getViewport(new T.Vector4()),oldScissor=r.getScissor(new T.Vector4()),oldTest=r.getScissorTest();r.setScissorTest(true);r.autoClear=true;
    for(const [i,s] of this.seats.entries()){
      for(const pilot of this.players)pilot.setCockpitView(false);
      const view=s.view;if(i===1){view.state=s.player.alive?g.state:'dying';view.menuTime=g.menuTime;}
      s.cam.update(dt,view);g.world.update(i===0?dt:0,s.player.position,s.camera);
      for(const jet of [g.player,...g.enemies,...g.allies])jet.updateVisualLOD?.(jet.position.distanceTo(s.camera.position));
      const rect=s.rect,x=w*rect.left/100,y=h*(100-rect.top-rect.height)/100,vw=w*rect.width/100,vh=h*rect.height/100;
      r.setViewport(x,y,vw,vh);r.setScissor(x,y,vw,vh);r.render(g.scene,s.camera);
      s.hud.update(view);if(s.noticeTime>0){s.noticeTime-=dt;if(s.noticeTime<=0)s.notice.textContent='';}
    }
    for(const pilot of this.players)pilot.setCockpitView(false);
    r.setViewport(oldViewport);r.setScissor(oldScissor);r.setScissorTest(oldTest);r.autoClear=oldAuto;g.ui.hudEl.hidden=true;
  }
  stop(){
    if(!this.active)return;this.active=false;const g=this.game,second=this.players[1];g.allies=g.allies.filter(j=>j!==second);second.dispose();
    this.seats[1].input.dispose();this.seats.forEach(s=>s.hud.dispose());this.root.remove();g.ui.root.classList.remove('local-coop-active');
    g.player.localHuman=false;g.player.isHuman=false;g.player.setCockpitView(false);Object.assign(g.settings,{device:this.saved.device,input:this.saved.input});g.input.keyboardDisabled=false;g.input.padIndexOverride=this.saved.padIndex;g.input.clear();
    g.camera.aspect=(g.renderer.domElement.clientWidth || innerWidth)/(g.renderer.domElement.clientHeight || innerHeight);g.camera.updateProjectionMatrix();g.ui.hudEl.hidden=!['playing','dying'].includes(g.state);
  }
}
