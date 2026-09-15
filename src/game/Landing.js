import * as T from 'three';
export const WHEEL_HEIGHT = 3.2;
export const GLIDE_ANGLE = 3 * Math.PI / 180;
export function runwayLocal(base, p) {
  const h=(base.runwayHeading||0)*Math.PI/180, dx=p.x-base.x,dz=p.z-base.z;
  return {x:dx*Math.cos(h)+dz*Math.sin(h),z:-dx*Math.sin(h)+dz*Math.cos(h)};
}
export function runwayPoint(base,x,y,z) {
  const h=(base.runwayHeading||0)*Math.PI/180;
  return new T.Vector3(base.x+x*Math.cos(h)-z*Math.sin(h),y,base.z+x*Math.sin(h)+z*Math.cos(h));
}
export function onRunway(base,p,margin=0) {
  const q=runwayLocal(base,p);
  return Math.abs(q.x)<=base.runwayWidth/2+margin && Math.abs(q.z)<=base.runwayLength/2+margin;
}
export function approachInfo(base,p) {
  const q=runwayLocal(base,p.position), touchdownZ=base.runwayLength/2-250;
  const distance=q.z-touchdownZ;
  const ideal=base.elevation+WHEEL_HEIGHT+Math.max(0,distance)*Math.tan(GLIDE_ANGLE);
  const forward=new T.Vector3(Math.sin((base.runwayHeading||0)*Math.PI/180),0,-Math.cos((base.runwayHeading||0)*Math.PI/180));
  const headingError=Math.acos(T.MathUtils.clamp(p.forward.dot(forward),-1,1))*180/Math.PI;
  return {distance,crossTrack:q.x,glideError:p.position.y-ideal,headingError,sink:-p.velocity.y,ideal};
}
export function assessTouchdown(base,previous,p) {
  if(p.isLanded)return null;
  const surface=base.elevation+WHEEL_HEIGHT;
  if(previous.y<surface || p.position.y>surface || p.position.y>=previous.y)return null;
  const alpha=(previous.y-surface)/(previous.y-p.position.y);
  const hit=previous.clone().lerp(p.position,alpha);
  if(!onRunway(base,hit))return null;
  const e=new T.Euler().setFromQuaternion(p.quaternion,'YXZ');
  const rw=runwayLocal(base,p.position);
  const heading=(base.runwayHeading||0)*Math.PI/180;
  const alignment=Math.abs(p.forward.dot(new T.Vector3(Math.sin(heading),0,-Math.cos(heading))));
  const sink=-p.velocity.y;
  if(!p.gearDown)return {safe:false,reason:'GEAR UP',hit};
  if(sink>8 || p.speed>155 || alignment<Math.cos(15*Math.PI/180) || Math.abs(e.z)>.18 || e.x<-.15 || e.x>.25)return {safe:false,reason:'UNSAFE TOUCHDOWN: sink rate, speed or alignment',hit};
  return {safe:true,hard:sink>6.5,sink,hit,centerline:Math.abs(rw.x)};
}
