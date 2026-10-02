import * as T from 'three';

const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
export function readFlightInstruments(jet,extra={}) {
  const q=jet.quaternion||{x:0,y:0,z:0,w:1}, {x,y,z,w}=q;
  const fx=-2*(x*z+y*w),fy=2*(x*w-y*z),fz=-(1-2*(x*x+y*y));
  return {
    heading:(Math.atan2(fx,-fz)*180/Math.PI+360)%360,
    pitch:Math.asin(clamp(fy,-1,1))*180/Math.PI,
    roll:Math.atan2(2*(w*z-x*y),1-2*(x*x+z*z))*180/Math.PI,
    speed:Math.max(0,Number(jet.speed)||0)*3.6,
    altitude:Number(jet.position?.y)||0,
    throttle:clamp(Number(jet.throttle)||0,0,1),
    gear:!!jet.gearDown,boost:!!jet.boost,
    hull:clamp((jet.hp||0)/Math.max(1,jet.maxHp||100),0,1),
    weapon:String(extra.weapon||'CANNON').slice(0,20),
    ammunition:Number.isFinite(extra.ammunition)?Math.max(0,extra.ammunition):null,
    target:String(extra.target?.callsign||extra.target?.name||extra.target||'NO TARGET').slice(0,24),
    locked:extra.locked===true,
  };
}

export function createCockpit() {
  const group=new T.Group();group.name='cockpit_interior';
  const dark=new T.MeshStandardMaterial({color:0x17252e,roughness:.78,metalness:.12});
  const black=new T.MeshStandardMaterial({color:0x080e13,roughness:.88});
  const frame=new T.MeshStandardMaterial({color:0x45515b,roughness:.52,metalness:.58});
  const add=(geo,mat,x,y,z)=>{const m=new T.Mesh(geo,mat);m.position.set(x,y,z);group.add(m);return m;};
  add(new T.BoxGeometry(1.30,.44,.18),dark,0,.84,-5.42);
  // Keep the coaming behind the display face, clear of the seated sightline.
  add(new T.BoxGeometry(1.38,.07,.30),black,0,1.105,-5.47).name='instrument_coaming';
  for(const side of [-1,1]){
    add(new T.BoxGeometry(.19,.27,2.6),dark,side*.63,.57,-3.8);
    add(new T.BoxGeometry(.055,.065,3.2),frame,side*.68,1.05,-4);
    const curve=new T.CatmullRomCurve3([new T.Vector3(side*.69,1.05,-5.28),new T.Vector3(side*.58,1.61,-5.34),new T.Vector3(side*.26,1.94,-5.45),new T.Vector3(0,2,-5.48)]);
    add(new T.TubeGeometry(curve,14,.026,5,false),frame,0,0,0);
    for(let i=0;i<5;i++) add(new T.BoxGeometry(.035,.026,.06),frame,side*.63,.72,-4.3+i*.2);
  }
  add(new T.BoxGeometry(.4,.5,.27),black,0,.98,-2.76);
  add(new T.BoxGeometry(.46,.75,.27),dark,0,.46,-2.76);
  const hudMaterial=new T.MeshBasicMaterial({color:0x88bfb1,transparent:true,opacity:.085,depthWrite:false,side:T.DoubleSide});
  const hud=add(new T.PlaneGeometry(.48,.28),hudMaterial,0,1.22,-5.47);hud.rotation.x=-.15;
  let canvas=null,ctx=null,texture=null;
  try{canvas=typeof document!=='undefined'?document.createElement('canvas'):null;if(canvas){canvas.width=768;canvas.height=256;ctx=canvas.getContext('2d');}}catch{}
  if(ctx){texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.minFilter=T.LinearFilter;texture.generateMipmaps=false;}
  const screenMaterial=new T.MeshBasicMaterial({color:texture?0xffffff:0x376e65,map:texture,toneMapped:false});
  add(new T.PlaneGeometry(1.20,.36),screenMaterial,0,.84,-5.32).name='instrument_screen';
  const pose={eye:new T.Vector3(0,1.36,-3.95),near:.04,fov:70};
  let nextUpdate=0,lastUpdate=-Infinity,state=null;
  function update(jet,extra={},now=0) {
    // Sortie elapsed time resets on Restart; never retain the previous flight's MFD.
    if(now>=lastUpdate && now<nextUpdate && state)return state;lastUpdate=now;nextUpdate=now+.1;
    state=readFlightInstruments(jet,extra);group.userData.instruments=state;
    if(!ctx)return state;
    ctx.fillStyle='#061117';ctx.fillRect(0,0,768,256);
    ctx.strokeStyle='#37665e';ctx.lineWidth=2;
    for(const x of [240,508]){ctx.beginPath();ctx.moveTo(x,10);ctx.lineTo(x,246);ctx.stroke();}
    ctx.font='bold 22px monospace';ctx.fillStyle='#9edfc8';ctx.fillText('SPEED  km/h',18,31);
    ctx.font='bold 40px monospace';ctx.fillText(Math.round(state.speed).toString().padStart(3,'0'),18,79);
    ctx.font='20px monospace';ctx.fillText('ALT  '+Math.round(state.altitude)+' m',18,118);
    ctx.fillText('THR  '+Math.round(state.throttle*100)+'%',18,156);
    ctx.fillStyle=state.gear?'#ffcf83':'#a5c5cb';ctx.fillText(state.gear?'GEAR DOWN':'GEAR UP',18,198);
    ctx.fillStyle='#93b2ba';ctx.fillText('HULL '+Math.round(state.hull*100)+'%',18,234);
    ctx.save();ctx.beginPath();ctx.rect(252,39,244,167);ctx.clip();ctx.translate(374,123);ctx.rotate(-state.roll*Math.PI/180);
    const offset=clamp(state.pitch,-80,80)*1.65;
    ctx.fillStyle='#315b70';ctx.fillRect(-350,-450+offset,700,450);
    ctx.fillStyle='#765b3f';ctx.fillRect(-350,offset,700,450);
    ctx.strokeStyle='#d1e8e0';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-260,offset);ctx.lineTo(260,offset);ctx.stroke();
    for(let p=-60;p<=60;p+=10){if(!p)continue;const yy=offset-p*1.65;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-30,yy);ctx.lineTo(30,yy);ctx.stroke();}
    ctx.restore();ctx.strokeStyle='#ffd17f';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(339,123);ctx.lineTo(365,123);ctx.lineTo(374,132);ctx.lineTo(383,123);ctx.lineTo(409,123);ctx.stroke();
    ctx.font='bold 22px monospace';ctx.fillStyle='#c0e5dd';ctx.fillText('HDG '+Math.round(state.heading).toString().padStart(3,'0')+'°',312,28);
    ctx.font='18px monospace';ctx.fillText('P '+state.pitch.toFixed(0)+'°  B '+state.roll.toFixed(0)+'°',288,234);
    ctx.fillStyle='#9edfc8';ctx.font='bold 22px monospace';ctx.fillText(state.weapon,526,34);
    ctx.font='22px monospace';ctx.fillText(state.ammunition===null?'READY':'AMMO '+Math.floor(state.ammunition),526,76);
    ctx.fillStyle=state.locked?'#ffcf83':'#a5c5cb';ctx.fillText(state.locked?'LOCKED':'SEARCH',526,122);
    ctx.font='17px monospace';ctx.fillText(state.target.slice(0,20),526,158);
    ctx.fillStyle='#82a5b0';ctx.fillText('SPEED: km/h',526,207);ctx.fillText('ALTITUDE: METRES',526,233);
    texture.needsUpdate=true;return state;
  }
  return {group,pose,update,get state(){return state;},texture};
}
