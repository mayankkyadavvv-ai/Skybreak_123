import * as T from 'three';
import { damp } from './math.js';
import { terrainHeight } from './World.js';

class CameraController {
  constructor(camera) {
    this.camera = camera; this.mode = 'chase'; this.modes = ['chase','cockpit','cinematic']; this.shake = 0;
    this.up = new T.Vector3(0,1,0); this.offset = new T.Vector3(); this.look = new T.Vector3();
    this.smoothLook = new T.Vector3(); this.desiredUp = new T.Vector3(); this.position = new T.Vector3(); this.forward = new T.Vector3();
    this.initialized = false;
    this.targetTrackAngle=0;this.targetOffset=new T.Vector3();
  }
  cycle() { this.mode = this.modes[(this.modes.indexOf(this.mode)+1)%this.modes.length]; }
  reset(player) {
    player.resetInterpolation?.(); this.camera.view = null; this.up.set(0,1,0); this.camera.up.copy(this.up);
    this.offset.set(0,8.5,32).applyQuaternion(player.quaternion);
    this.camera.position.copy(player.position).add(this.offset);
    this.forward.set(0,0,-1).applyQuaternion(player.quaternion);
    this.smoothLook.copy(player.position).addScaledVector(this.forward,110);
    this.camera.lookAt(this.smoothLook); this.camera.updateProjectionMatrix(); this.initialized = true; this.shake = 0;this.targetTrackAngle=0;
  }
  update(dt,game) {
    const p=game.player, settings=game.settings || {}, position=p.renderPosition || p.position, quaternion=p.renderQuaternion || p.quaternion;
    if (!this.initialized) this.reset(p);
    if (this.camera.view) {this.camera.view=null;this.camera.updateProjectionMatrix();}
    this.forward.set(0,0,-1).applyQuaternion(quaternion);this.desiredUp.set(0,1,0);
    const menu=['menu','quit','hangar'].includes(game.state);
    const landing=!!(settings.landingCamera!==false && p.gearDown && (p.isLanded || p.position.y-terrainHeight(p.position.x,p.position.z)<500));
    if(game.state==='hangar') {
      const angle=game.hangarAngle ?? game.menuTime*.18, distance=game.hangarDistance || 20;
      this.offset.set(Math.sin(angle)*distance,game.hangarHeight || 4.5,Math.cos(angle)*distance);
      this.look.copy(position);this.look.y+=.5;
    } else if(menu) {
      const wide=typeof innerWidth!=='undefined' && innerWidth>800, angle=game.menuTime*.06;
      this.offset.set(Math.sin(angle)*28-(wide?14:0),9.5,Math.cos(angle)*26+6);
      this.look.copy(position);this.look.x+=wide?-4.5:0;
    } else if(game.state==='dying') {
      this.offset.set(40,20,35);this.look.copy(position);
    } else if(this.mode==='cockpit') {
      const pose=p.getCockpitPose?.();
      if(pose?.eye)this.offset.copy(pose.eye);else this.offset.set(0,1.35,-4.5);
      this.offset.applyQuaternion(quaternion);
      this.desiredUp.set(0,1,0).applyQuaternion(quaternion);
      this.look.copy(position).addScaledVector(this.forward,150);
      if(game.input.freeLook || Math.abs(game.input.look?.x || 0)+Math.abs(game.input.look?.y || 0)>.001) {
        this.forward.set(Math.sin((game.input.look?.x || 0)*1.25),-(game.input.look?.y || 0)*.8,-Math.cos((game.input.look?.x || 0)*1.25)).applyQuaternion(quaternion);
        this.look.copy(position).addScaledVector(this.forward,150);
      }
    } else if(this.mode==='cinematic') {
      const missile=game.weapons?.missiles.find(value=>value.active && value.owner===p);
      if(missile) {this.offset.copy(missile.p).sub(position).addScaledVector(missile.dir,-19);this.offset.x+=6;this.offset.y+=5;this.look.copy(missile.p).addScaledVector(missile.dir,100);}
      else {this.offset.set(25,6,13).applyQuaternion(quaternion);this.look.copy(position).addScaledVector(this.forward,8);}
    } else {
      const speed=T.MathUtils.clamp(((p.speed ?? 180)-60)/450,0,1), distance=landing?34:28+speed*7;
      let desiredTrack=0;
      if(settings.targetCamera && !game.input.freeLook && !landing && game.target?.alive){
        this.targetOffset.copy(game.target.renderPosition || game.target.position).sub(position).normalize();
        const facing=Math.atan2(this.forward.x,-this.forward.z),bearing=Math.atan2(this.targetOffset.x,-this.targetOffset.z);
        desiredTrack=T.MathUtils.clamp(Math.atan2(Math.sin(bearing-facing),Math.cos(bearing-facing))*.55,-.9,.9);
      }
      this.targetTrackAngle=damp(this.targetTrackAngle,desiredTrack,3.5,dt);
      const angle=(game.input.look?.x || 0)*2-this.targetTrackAngle;
      this.offset.set(Math.sin(angle)*distance,(landing?8:7.5+speed*1.5)-(game.input.look?.y || 0)*14,Math.cos(angle)*distance).applyQuaternion(quaternion);
      this.desiredUp.set(0,1,0).applyQuaternion(quaternion).lerp(this.up.set(0,1,0),settings.horizonStabilization ?? .65).normalize();
      this.look.copy(position).addScaledVector(this.forward,Math.abs(angle)>.05?25:110);
      if(desiredTrack && game.target?.alive)this.look.lerp(this.targetOffset.multiplyScalar(120).add(position),.32);
    }
    const cockpit=this.mode==='cockpit'&&!menu&&game.state!=='dying';
    p.setCockpitView?.(cockpit);
    p.updateCockpit?.({speed:p.speed,altitude:p.position.y,heading:Math.atan2(this.forward.x,-this.forward.z),hp:p.hp,maxHp:p.maxHp,weapon:'MSL',ammunition:game.missilesLeft,locked:game.lock>=1.4,target:game.target},game.elapsed || 0);
    p.model.visible=p.alive!==false;
    const near=cockpit?(p.getCockpitPose?.()?.near || .08):1.2;
    if(this.camera.near!==near){this.camera.near=near;this.camera.updateProjectionMatrix();}
    this.position.copy(position).add(this.offset);
    const ground=game.world?.terrainHeight || terrainHeight;
    if(!menu && this.mode!=='cockpit') this.position.y=Math.max(this.position.y,Math.max(0,ground(this.position.x,this.position.z))+4);
    if(cockpit)this.camera.position.copy(this.position);else this.camera.position.lerp(this.position,1-Math.exp(-(menu?2.5:landing?6:8)*dt));
    if(!menu && this.mode!=='cockpit') this.camera.position.y=Math.max(this.camera.position.y,Math.max(0,ground(this.camera.position.x,this.camera.position.z))+3);
    if(cockpit){this.camera.up.copy(this.desiredUp);this.smoothLook.copy(this.look);}else{this.camera.up.lerp(this.desiredUp,1-Math.exp(-5*dt)).normalize();this.smoothLook.lerp(this.look,1-Math.exp(-(menu?3:10)*dt));}
    this.shake=Math.max(0,this.shake-dt*2.6);
    const intensity=settings.reducedMotion || settings.shake===false?0:settings.shakeIntensity ?? .35;
    if(intensity>0 && game.state==='playing') {
      const time=(game.elapsed || 0)*26, amount=(this.shake*.3+(p.boost ? .022 : 0))*intensity;
      this.camera.position.x+=Math.sin(time)*amount*.16;this.camera.position.y+=Math.cos(time*1.3)*amount*.12;
    }
    this.camera.lookAt(this.smoothLook);
    const speed=T.MathUtils.clamp(((p.speed ?? 180)-60)/480,0,1);
    const target=cockpit?(p.getCockpitPose?.()?.fov || 70):(settings.fov ?? 64)+(menu || settings.reducedMotion?0:(speed*14+(p.boost?5.5:0))*(settings.speedFov ?? .65));
    const next=damp(this.camera.fov,target,3.5,dt);
    if(Math.abs(next-this.camera.fov)>.001){this.camera.fov=next;this.camera.updateProjectionMatrix();}
    this.camera.updateMatrixWorld();
  }
}
export { CameraController };
