import * as T from 'three';
import { AEGIS_LANDMARKS,AEGIS_COLLIDERS } from '../shared/AegisLandmarks.js';
import { disposeObject } from './Resources.js';

export { AEGIS_LANDMARKS,AEGIS_COLLIDERS };
export class CoastalDetail {
  constructor(scene) {
    this.group=new T.Group();this.group.name='aegis_landmarks';scene.add(this.group);
    this.landmarks=AEGIS_LANDMARKS;this.items=[];
    const box=new T.BoxGeometry(1,1,1);
    const materials={concrete:new T.MeshStandardMaterial({color:0x6e7775,roughness:.85}),ivory:new T.MeshStandardMaterial({color:0xe0d8bc,roughness:.68}),blue:new T.MeshStandardMaterial({color:0x3d6471,roughness:.68,metalness:.15}),glass:new T.MeshStandardMaterial({color:0x739e9e,roughness:.21,metalness:.22}),trim:new T.MeshStandardMaterial({color:0xb77f54,roughness:.62})};
    const lampMaterial=new T.MeshBasicMaterial({color:0xffdda5,toneMapped:false});
    for(const descriptor of this.landmarks){
      const group=new T.Group();group.name=descriptor.id;this.group.add(group);
      for(const p of descriptor.parts){const mesh=new T.Mesh(box,materials[p.material]||materials.concrete);mesh.position.set(p.x,p.y,p.z);mesh.scale.set(p.w,p.h,p.d);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}
      const details=new T.Group();details.name='near_landmark_detail';group.add(details);
      if(descriptor.kind==='lighthouse'){
        const y=descriptor.y;
        for(let i=0;i<3;i++){const band=new T.Mesh(box,materials.trim);band.position.set(descriptor.x,y+18+i*18,descriptor.z);band.scale.set(14.2,3,14.2);details.add(band);}
        const beacon=new T.Mesh(new T.SphereGeometry(3,10,6),lampMaterial);beacon.position.set(descriptor.x,y+74,descriptor.z);group.add(beacon);this.beacon=beacon;
      }
      if(descriptor.kind==='harbour'){
        const matrix=new T.Matrix4(),containers=new T.InstancedMesh(box,materials.trim,12);
        for(let i=0;i<12;i++){matrix.makeScale(24,9,9);matrix.setPosition(-12300-(i%4)*32,38+Math.floor(i/4)*9,53767+(i%3)*17);containers.setMatrixAt(i,matrix);}details.add(containers);
        for(const x of [-12370,-12600]){
          const mast=new T.Mesh(box,materials.blue);mast.position.set(x,57,53842);mast.scale.set(5,50,5);details.add(mast);
          const boom=new T.Mesh(box,materials.blue);boom.position.set(x,80,53802);boom.scale.set(6,5,95);details.add(boom);
        }
      }
      if(descriptor.kind==='bridge'){
        for(const side of [-1,1]){const rail=new T.Mesh(box,materials.trim);rail.position.set(descriptor.x+side*35,descriptor.y+7,descriptor.z);rail.scale.set(2,6,1500);details.add(rail);}
        const line=new T.Mesh(box,new T.MeshBasicMaterial({color:0xc6bca5}));line.position.set(descriptor.x,descriptor.y+4.1,descriptor.z);line.scale.set(1,.05,1500);details.add(line);
      }
      this.items.push({descriptor,group,details});
    }
    this.collisionBoxes=AEGIS_COLLIDERS.map(c=>new T.Box3(new T.Vector3(c.min.x,c.min.y,c.min.z),new T.Vector3(c.max.x,c.max.y,c.max.z)));
  }
  update(time,position,{reducedMotion=false}={}) {
    for(const item of this.items){const d=Math.hypot(position.x-item.descriptor.x,position.z-item.descriptor.z);item.group.visible=d<item.descriptor.range;item.details.visible=d<6500;}
    if(this.beacon)this.beacon.scale.setScalar(reducedMotion?1:.8+.2*(.5+.5*Math.sin(time*.6)));
  }
  dispose(){disposeObject(this.group);this.items.length=0;this.collisionBoxes.length=0;}
}
