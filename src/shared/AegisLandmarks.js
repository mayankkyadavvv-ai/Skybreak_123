import { terrainHeight } from './WorldGeometry.js';

// Original Aegis landmarks. Collision uses individual solid parts so the open
// passage below the viaduct stays open; no enclosing whole-landmark hitbox.
const part=(id,x,y,z,w,h,d,material='concrete')=>Object.freeze({id,x,y,z,w,h,d,material});
const lightGround=terrainHeight(-16050,45600);
const harbourGround=terrainHeight(-11940,53700);
const bridgeX=-20250,bridgeZ=46000,bridgeLength=1500;
let bridgeDeck=0;
for(let i=0;i<=24;i++)bridgeDeck=Math.max(bridgeDeck,terrainHeight(bridgeX,bridgeZ-bridgeLength/2+i*bridgeLength/24));
bridgeDeck+=70;
const lighthouseParts=[part('foundation',-16050,lightGround+1,45600,28,6,28),part('tower',-16050,lightGround+36,45600,14,68,14,'ivory'),part('lantern',-16050,lightGround+74,45600,22,8,22,'glass')];
const harbourParts=[part('terminal',-11940,harbourGround+12,53700,100,24,64,'blue'),part('pier',-12320,30,53800,760,8,140),part('warehouse',-12125,47,53800,125,26,72,'blue')];
for(let i=0;i<5;i++)harbourParts.push(part('pier-support-'+i,-12000-i*160,12,53800,12,28,110));
const bridgeParts=[part('deck',bridgeX,bridgeDeck,bridgeZ,72,8,bridgeLength)];
// Terraced approach slabs meet the actual relief at each end. Small vertical
// steps are covered by the slab thickness; supports remain solid individual parts.
for(const side of [-1,1])for(let i=0;i<12;i++){
  const z=bridgeZ+side*(bridgeLength/2+30+i*60),t=(i+.5)/12;
  const ground=terrainHeight(bridgeX,z),y=bridgeDeck*(1-t)+(ground+2)*t;
  bridgeParts.push(part('approach-'+side+'-'+i,bridgeX,y,z,72,12,62));
  if(i%3===0)bridgeParts.push(part('approach-support-'+side+'-'+i,bridgeX,(ground+y)/2,z,36,Math.max(2,y-ground),12));
}
for(let i=0;i<5;i++){
  const z=bridgeZ-650+i*325,ground=Math.max(0,terrainHeight(bridgeX,z));
  for(const side of [-1,1])bridgeParts.push(part('pillar-'+i+'-'+side,bridgeX+side*25,(ground+bridgeDeck)/2,z,12,bridgeDeck-ground,24));
}
export const AEGIS_LANDMARKS=Object.freeze([
  Object.freeze({id:'aegis-lighthouse',name:'Aegis Lighthouse',kind:'lighthouse',x:-16050,y:lightGround,z:45600,range:26000,parts:Object.freeze(lighthouseParts)}),
  Object.freeze({id:'strait-harbour',name:'Strait Harbour',kind:'harbour',x:-12320,y:30,z:53800,range:26000,parts:Object.freeze(harbourParts)}),
  Object.freeze({id:'west-viaduct',name:'West Viaduct',kind:'bridge',x:bridgeX,y:bridgeDeck,z:bridgeZ,range:32000,parts:Object.freeze(bridgeParts)}),
]);
export const AEGIS_COLLIDERS=Object.freeze(AEGIS_LANDMARKS.flatMap(landmark=>landmark.parts.map(p=>Object.freeze({
  landmarkId:landmark.id,partId:p.id,min:{x:p.x-p.w/2,y:p.y-p.h/2,z:p.z-p.d/2},max:{x:p.x+p.w/2,y:p.y+p.h/2,z:p.z+p.d/2}
}))));
export function collidesWithAegisLandmark(p) {
  return AEGIS_COLLIDERS.some(({min,max})=>p.x>=min.x&&p.x<=max.x&&p.y>=min.y&&p.y<=max.y&&p.z>=min.z&&p.z<=max.z);
}
export function segmentOccludedByAegis(a,b) {
  for(const {min,max} of AEGIS_COLLIDERS){
    let enter=0,exit=1;
    for(const key of ['x','y','z']){
      const delta=b[key]-a[key];
      if(Math.abs(delta)<1e-9){if(a[key]<min[key]||a[key]>max[key]){exit=-1;break;}}
      else{const t1=(min[key]-a[key])/delta,t2=(max[key]-a[key])/delta;enter=Math.max(enter,Math.min(t1,t2));exit=Math.min(exit,Math.max(t1,t2));if(enter>exit)break;}
    }
    if(enter<=exit && exit>0 && enter<1)return true;
  }
  return false;
}
