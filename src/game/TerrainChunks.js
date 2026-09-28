import * as T from 'three';
import { qualityFor } from './Quality.js';
export const TERRAIN_BOUNDS={minX:-85000,maxX:45000,minZ:-75000,maxZ:55000};
const SIZE=10000,COUNT=13;
const snow=new T.Color(0xe0e9ef);
function terrainColor(color,x,z,h){
  color.setHex(h<5?0x284852:h<35?0xcab485:z < -42000 || h>2400?0x606972:z < -30000?0x3a5640:x > -14000 && x < 20000 && z > -12000 && z < 26000?0xd6b376:x < -20000 && z > -35000?0xa88d6c:0x56784a);
  if(h>2400)color.lerp(snow,T.MathUtils.clamp((h-2200)/1200,0,1));
  return color.multiplyScalar(.96+.04*Math.sin(x*.015)*Math.cos(z*.018));
}
// A job samples in small batches. Heights/UVs use the same world coordinates at every LOD.
export function terrainJob(ix,iz,segments,height){
  const n=segments,count=(n+1)**2,edgeCount=4*(n+1),total=count+edgeCount;
  const positions=new Float32Array(total*3),colors=new Float32Array(total*3),uvs=new Float32Array(total*2);
  const normal=new Float32Array(total*3),color=new T.Color();let cursor=0;
  const x0=TERRAIN_BOUNDS.minX+ix*SIZE,z0=TERRAIN_BOUNDS.minZ+iz*SIZE;
  return {segments,ix,iz,step(limit=256){
    const end=Math.min(count,cursor+limit);
    for(;cursor<end;cursor++){
      const row=Math.floor(cursor/(n+1)),col=cursor%(n+1),x=x0+col*SIZE/n,z=z0+row*SIZE/n,h=height(x,z),i=cursor*3;
      positions[i]=x;positions[i+1]=h;positions[i+2]=z;
      uvs[cursor*2]=(x-TERRAIN_BOUNDS.minX)/130000;uvs[cursor*2+1]=(z-TERRAIN_BOUNDS.minZ)/130000;
      terrainColor(color,x,z,h).toArray(colors,i);
      // Shared derivative distance keeps edge lighting continuous between resolutions.
      const dx=height(x-10,z)-height(x+10,z),dz=height(x,z-10)-height(x,z+10),len=Math.hypot(dx,20,dz);
      normal[i]=dx/len;normal[i+1]=20/len;normal[i+2]=dz/len;
    }
    return cursor===count;
  },finish(){
    if(cursor!==count)throw new Error('Terrain sampling is incomplete');
    const indices=[];
    for(let row=0;row<n;row++)for(let col=0;col<n;col++){const a=row*(n+1)+col,b=a+n+1;indices.push(a,b,a+1,b,b+1,a+1);}
    const edges=[Array.from({length:n+1},(_,i)=>i),Array.from({length:n+1},(_,i)=>i*(n+1)+n),Array.from({length:n+1},(_,i)=>n*(n+1)+n-i),Array.from({length:n+1},(_,i)=>(n-i)*(n+1))];
    let skirt=count;
    for(const edge of edges){const start=skirt;for(const top of edge){positions.set(positions.subarray(top*3,top*3+3),skirt*3);positions[skirt*3+1]-=650;colors.set(colors.subarray(top*3,top*3+3),skirt*3);uvs.set(uvs.subarray(top*2,top*2+2),skirt*2);normal.set(normal.subarray(top*3,top*3+3),skirt*3);skirt++;}
      for(let i=0;i<n;i++)indices.push(edge[i],edge[i+1],start+i,edge[i+1],start+i+1,start+i);
    }
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));geometry.setAttribute('normal',new T.BufferAttribute(normal,3));geometry.setAttribute('color',new T.BufferAttribute(colors,3));geometry.setAttribute('uv',new T.BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeBoundingSphere();return geometry;
  }};
}
export class TerrainChunks {
  constructor(scene,material,height){
    this.height=height;this.material=material;this.group=new T.Group();this.group.name='terrain_chunks';scene.add(this.group);
    this.tiles=new Map();this.cache=new Map();this.queue=[];this.timer=0;this.quality='medium';this.serial=0;
    for(let z=0;z<COUNT;z++)for(let x=0;x<COUNT;x++){
      const job=terrainJob(x,z,8,height);job.step(Infinity);const geometry=job.finish(),mesh=new T.Mesh(geometry,material);mesh.receiveShadow=true;
      this.group.add(mesh);this.tiles.set(`${x}:${z}`,{x,z,mesh,base:geometry,level:8,wanted:8});
    }
  }
  setQuality(name){if(this.quality===name)return;this.quality=name;this.queue.length=0;this.job=null;this.timer=0;}
  update(dt,position){
    this.timer-=dt;
    if(this.timer<=0){
      this.timer=.75;const q=qualityFor(this.quality),cx=Math.floor((position.x-TERRAIN_BOUNDS.minX)/SIZE),cz=Math.floor((position.z-TERRAIN_BOUNDS.minZ)/SIZE);
      this.queue.length=0;
      for(const tile of this.tiles.values()){
        const distance=Math.max(Math.abs(tile.x-cx),Math.abs(tile.z-cz));tile.wanted=distance===0?q.near:distance<=1?q.mid:8;
        const key=`${tile.x}:${tile.z}:${tile.wanted}`,cached=this.cache.get(key);
        if(tile.wanted===8){tile.mesh.geometry=tile.base;tile.level=8;}
        else if(cached){tile.mesh.geometry=cached.geometry;tile.level=tile.wanted;cached.used=++this.serial;}
        else if(tile.level!==tile.wanted && this.job?.tile!==tile)this.queue.push(tile);
      }
      this.queue.sort((a,b)=>Math.hypot(a.x-cx,a.z-cz)-Math.hypot(b.x-cx,b.z-cz));
    }
    if(this.job && this.job.tile.wanted!==this.job.segments)this.job=null;
    while(!this.job && this.queue.length){const tile=this.queue.shift();if(tile.level!==tile.wanted)this.job={...terrainJob(tile.x,tile.z,tile.wanted,this.height),tile};}
    if(!this.job)return;
    const start=performance.now();let done=false;
    do{done=this.job.step(64);}while(!done && performance.now()-start<2.5);
    if(done){
      const job=this.job,geometry=job.finish(),key=`${job.ix}:${job.iz}:${job.segments}`;
      const old=this.cache.get(key);if(old)old.geometry.dispose();
      this.cache.set(key,{geometry,used:++this.serial});job.tile.mesh.geometry=geometry;job.tile.level=job.segments;this.job=null;
      // Keep a small LRU of recent locations, excluding currently visible geometry.
      const active=new Set([...this.tiles.values()].map(tile=>tile.mesh.geometry));
      const unused=[...this.cache].filter(([,entry])=>!active.has(entry.geometry)).sort((a,b)=>a[1].used-b[1].used);
      while(this.cache.size>24 && unused.length){const [key,entry]=unused.shift();entry.geometry.dispose();this.cache.delete(key);}
    }
  }
  dispose(){this.group.removeFromParent();for(const tile of this.tiles.values())tile.base.dispose();for(const entry of this.cache.values())entry.geometry.dispose();this.cache.clear();this.tiles.clear();this.queue.length=0;this.job=null;}
}
