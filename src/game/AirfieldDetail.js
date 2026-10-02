import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { IAF_BASES } from './GeoWorld.js';
import { runwayLocal, WHEEL_HEIGHT, GLIDE_ANGLE } from './Landing.js';
import { disposeObject } from './Resources.js';

export class AirfieldDetail {
  constructor(scene) {
    this.group=new T.Group();this.group.name='airfield_details';scene.add(this.group);
    this.papis=[];this.bases=[];this._wind=new T.Vector3();this._up=new T.Vector3(0,1,0);this.timer=0;this.time=0;
    const box=new T.BoxGeometry(1,1,1),matrix=new T.Matrix4();
    const asphalt=new T.MeshStandardMaterial({color:0x303b3f,roughness:.96});
    const white=new T.MeshStandardMaterial({color:0xd7dedb,roughness:.8});
    const yellow=new T.MeshStandardMaterial({color:0xcab46f,roughness:.8});
    const body=new T.MeshStandardMaterial({color:0x5c727e,metalness:.3,roughness:.66});
    const service=new T.MeshStandardMaterial({color:0xc09b50,roughness:.72});
    const lampMat=new T.MeshBasicMaterial({color:0xffe5b7,toneMapped:false});
    const taxiLampMat=new T.MeshBasicMaterial({color:0x438bbe,toneMapped:false});
    const parkedParts=[new T.BoxGeometry(1.9,1.1,16),new T.BoxGeometry(12,.22,3.5).translate(0,0,1),new T.BoxGeometry(.22,2.8,3).translate(0,1.1,5)];
    const parkedGeometry=mergeGeometries(parkedParts);for(const part of parkedParts)part.dispose();
    for(const base of IAF_BASES) {
      const group=new T.Group();group.position.set(base.x,base.elevation,base.z);group.rotation.y=-(base.runwayHeading||0)*Math.PI/180;this.group.add(group);
      const add=(x,y,z,w,h,l,material)=>{const m=new T.Mesh(box,material);m.position.set(x,y,z);m.scale.set(w,h,l);group.add(m);return m;};
      const half=base.runwayLength/2,side=base.runwayWidth/2;
      add(0,.15,0,base.runwayWidth+24,.25,base.runwayLength+20,asphalt);
      add(side+150,.2,0,130,.3,700,asphalt);
      add(side+75,.22,0,30,.3,base.runwayLength*.75,asphalt);
      add(side+75,.4,0,1,.05,base.runwayLength*.75,yellow);
      for(const z of [-300,300])add(side+105,.24,z,80,.25,26,asphalt);
      const markings=[];
      for(const end of [-1,1]){
        for(let i=-4;i<=4;i++)if(i)markings.push([i*7,3.04,end*(half-70),4,.04,45]);
        for(const s of [-1,1])markings.push([s*base.runwayWidth*.23,3.04,end*(half-300),9,.04,40]);
      }
      const marks=new T.InstancedMesh(box,white,markings.length);
      markings.forEach(([x,y,z,w,h,d],i)=>{matrix.makeScale(w,h,d);matrix.setPosition(x,y,z);marks.setMatrixAt(i,matrix);});group.add(marks);
      const points=[],taxiPoints=[];
      for(let z=-half;z<=half;z+=75)for(const s of [-1,1])points.push([s*(side+3),3.5,z]);
      for(const end of [-1,1])for(let z=half+60;z<half+660;z+=60)points.push([0,3.5,end*z]);
      for(let z=-half*.75;z<half*.75;z+=100)for(const s of [-1,1])taxiPoints.push([side+75+s*16,.8,z]);
      const makeLamps=(points,material)=>{const lamps=new T.InstancedMesh(box,material,points.length);points.forEach((p,i)=>{matrix.makeScale(2,1,2);matrix.setPosition(...p);lamps.setMatrixAt(i,matrix);});group.add(lamps);return lamps;};
      makeLamps(points,lampMat);makeLamps(taxiPoints,taxiLampMat);
      const pip=[];
      for(let i=0;i<4;i++){const mat=new T.MeshBasicMaterial({color:0xff3434,toneMapped:false});pip.push(add(-side-22-i*8,3.5,half-300,5,1.4,2,mat));}
      this.papis.push({base,lamps:pip});
      const pole=new T.Mesh(new T.CylinderGeometry(.35,.35,12,6),white);pole.position.set(-side-60,6,half-100);group.add(pole);
      const sockPivot=new T.Group();sockPivot.position.set(-side-60,12,half-100);group.add(sockPivot);
      const sock=new T.Mesh(new T.CylinderGeometry(.25,1,4,10,1,true),new T.MeshStandardMaterial({color:0xd68e59,side:T.DoubleSide,roughness:.8}));sockPivot.add(sock);
      const parked=new T.InstancedMesh(parkedGeometry,body,4);parked.userData.gameplaySolid=false;
      for(let i=0;i<4;i++){matrix.makeRotationY(Math.PI/2);matrix.setPosition(side+145,2,-220+i*145);parked.setMatrixAt(i,matrix);}group.add(parked);
      const cart=new T.Group();cart.userData.gameplaySolid=false;group.add(cart);
      const chassis=new T.Mesh(box,service);chassis.scale.set(3.2,1.7,6.8);chassis.position.y=1.3;cart.add(chassis);
      const cabin=new T.Mesh(box,body);cabin.scale.set(2.9,1.8,2.2);cabin.position.set(0,3,1.2);cart.add(cabin);
      const beacon=new T.Mesh(box,lampMat);beacon.scale.set(.6,.25,.6);beacon.position.y=4;cart.add(beacon);
      this.bases.push({base,group,parked,cart,sock,sockPivot,phase:this.bases.length*2.6});
    }
  }
  update(player,dt=1/60,{time,wind}={}) {
    this.time=Number.isFinite(time)?time:this.time+dt;this.timer-=dt;
    // PAPI and service activity update at 10 Hz, then sleep completely off base.
    if(this.timer>0)return;this.timer=.1;
    const p=player.position;
    for(const {base,lamps} of this.papis){
      const q=runwayLocal(base,p),distance=q.z-(base.runwayLength/2-250);
      if(Math.abs(q.x)>12000||Math.abs(q.z)>15000)continue;
      const error=p.y-(base.elevation+WHEEL_HEIGHT+Math.max(0,distance)*Math.tan(GLIDE_ANGLE));
      const reds=distance<0?4:error>18?0:error>6?1:error>-6?2:error>-18?3:4;
      lamps.forEach((l,i)=>l.material.color.set(i<reds?0xff4538:0xfff4da));
    }
    for(const item of this.bases){
      const d=Math.hypot(p.x-item.base.x,p.z-item.base.z);item.group.visible=d<24000;item.parked.visible=d<6500;item.cart.visible=d<4000;
      if(d>6500)continue;
      // This cosmetic service lane is entirely on the apron, outside the strip
      // and taxi centreline; no moving invisible obstacle is added to physics.
      const t=this.time*.035+item.phase,side=item.base.runwayWidth/2;
      item.cart.position.set(side+192+Math.sin(t)*12,.3,Math.cos(t)*220);item.cart.rotation.y=Math.atan2(Math.cos(t)*12,-Math.sin(t)*220);
      const wx=Number(wind?.x)||0,wz=Number(wind?.z)||0,strength=Math.hypot(wx,wz);
      this._wind.set(wx,-Math.max(1,12-strength),wz).normalize();item.sock.quaternion.setFromUnitVectors(this._up,this._wind);item.sock.position.copy(this._wind).multiplyScalar(2);
      item.sockPivot.userData.windSpeed=strength;
    }
  }
  dispose(){disposeObject(this.group);this.papis.length=0;this.bases.length=0;}
}
