import * as T from 'three';
import { IAF_BASES } from './GeoWorld.js';
import { runwayPoint, approachInfo } from './Landing.js';
export class AirfieldDetail {
  constructor(scene) {
    this.papis=[];
    const box=new T.BoxGeometry(1,1,1);
    for(const base of IAF_BASES) {
      const group=new T.Group();group.position.set(base.x,base.elevation,base.z);group.rotation.y=-(base.runwayHeading||0)*Math.PI/180;
      scene.add(group);
      const add=(x,y,z,w,h,l,material)=>{const m=new T.Mesh(box,material);m.position.set(x,y,z);m.scale.set(w,h,l);group.add(m);return m;};
      const asphalt=new T.MeshStandardMaterial({color:0x33383b,roughness:.96});
      const white=new T.MeshStandardMaterial({color:0xe5e4d9,roughness:.8});
      const yellow=new T.MeshStandardMaterial({color:0xeab94b,roughness:.8});
      const half=base.runwayLength/2;
      // Shoulder, apron and a parallel taxiway, separate from the landing strip.
      add(0,.15,0,base.runwayWidth+24,.25,base.runwayLength+20,asphalt);
      add(base.runwayWidth/2+170,.2,0,150,.3,700,asphalt);
      add(base.runwayWidth/2+75,.22,0,30,.3,base.runwayLength*.75,asphalt);
      add(base.runwayWidth/2+75,.4,0,1,.05,base.runwayLength*.75,yellow);
      for(const end of [-1,1]) {
        for(let i=-4;i<=4;i++) if(i) add(i*7,3.02,end*(half-70),4,.04,45,white);
        for(const side of [-1,1]) add(side*base.runwayWidth*.23,3.02,end*(half-300),9,.04,40,white);
      }
      // Instanced edge, approach and taxiway lights reduce draw calls.
      const points=[];
      for(let z=-half;z<=half;z+=75)for(const side of [-1,1])points.push([side*(base.runwayWidth/2+3),3.5,z]);
      for(let z=half+60;z<half+780;z+=60)points.push([0,3.5,z]);
      const lamps=new T.InstancedMesh(box,new T.MeshBasicMaterial({color:new T.Color(3,2.8,2.1),toneMapped:false}),points.length);
      const matrix=new T.Matrix4();points.forEach((p,i)=>{matrix.makeScale(2,1,2);matrix.setPosition(...p);lamps.setMatrixAt(i,matrix);});group.add(lamps);
      const pip=[];
      for(let i=0;i<4;i++) {
        const mat=new T.MeshBasicMaterial({color:0xff3434,toneMapped:false});
        pip.push(add(-base.runwayWidth/2-22-i*8,3.5,half-300,5,1.4,2,mat));
      }
      this.papis.push({base,lamps:pip});
      // Windsock: decorative fixed crosswind cue, not live weather data.
      const pole=new T.Mesh(new T.CylinderGeometry(.45,.45,12,6),white);pole.position.set(-base.runwayWidth/2-60,6,half-100);group.add(pole);
      const sock=new T.Mesh(new T.ConeGeometry(1.6,6,10,1,true),new T.MeshStandardMaterial({color:0xff713b,side:T.DoubleSide}));sock.rotation.z=-Math.PI/2;sock.position.copy(pole.position).add(new T.Vector3(3,5,0));group.add(sock);
    }
  }
  update(player) {
    for(const {base,lamps} of this.papis) {
      const a=approachInfo(base,player);
      const reds=a.distance<0?4:a.glideError>18?0:a.glideError>6?1:a.glideError> -6?2:a.glideError> -18?3:4;
      lamps.forEach((l,i)=>l.material.color.set(i<reds?0xff2525:0xffffff));
    }
  }
}
