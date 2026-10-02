import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function batchAircraftDetails(group){
  const buckets=new Map();
  for(const child of [...group.children]){
    if(!child.isMesh || child.children.length || Array.isArray(child.material))continue;
    child.updateMatrix();let geometry=child.geometry.clone();
    if(geometry.index){const indexed=geometry;geometry=geometry.toNonIndexed();indexed.dispose();}
    geometry.applyMatrix4(child.matrix);
    if(!buckets.has(child.material))buckets.set(child.material,[]);buckets.get(child.material).push({child,geometry});
  }
  for(const [material,items]of buckets){
    const merged=mergeGeometries(items.map(item=>item.geometry),false);
    for(const {geometry}of items)geometry.dispose();
    if(!merged)continue;
    const old=new Set();for(const {child}of items){old.add(child.geometry);child.removeFromParent();}
    for(const geometry of old)geometry.dispose();
    merged.computeBoundingSphere();group.add(new T.Mesh(merged,material));
  }
}

// F02: draw-call LOD for the benchmark airframe. Authoritative collision and anchors
// stay on Jet; these merged snapshots contain only static visible exterior geometry.
export function buildAircraftLOD(exterior,bodyMaterial,span=16) {
  exterior.updateMatrixWorld(true);
  const batches=new Map();
  const excludes=new Set(['airframe_detail','landing_gear']);
  const walk=(node,excluded=false)=>{
    excluded=excluded||excludes.has(node.name);
    if(!excluded && node.isMesh && !Array.isArray(node.material) && !node.material.transparent && node.geometry.attributes.position){
      let geometry=node.geometry.clone();if(geometry.index){const original=geometry;geometry=geometry.toNonIndexed();original.dispose();}
      geometry.applyMatrix4(node.matrixWorld);
      for(const key of Object.keys(geometry.attributes))if(!['position','normal','uv'].includes(key))geometry.deleteAttribute(key);
      if(!geometry.attributes.normal)geometry.computeVertexNormals();
      if(!geometry.attributes.uv)geometry.setAttribute('uv',new T.BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));
      if(!batches.has(node.material))batches.set(node.material,[]);batches.get(node.material).push(geometry);
    }
    for(const child of node.children)walk(child,excluded);
  };walk(exterior);
  const middle=new T.Group();middle.name='airframe_mid_lod';
  for(const [material,geometries] of batches){const geometry=mergeGeometries(geometries,false);for(const source of geometries)source.dispose();if(!geometry)continue;geometry.computeBoundingSphere();const mesh=new T.Mesh(geometry,material);mesh.castShadow=true;middle.add(mesh);}
  const far=new T.Group();far.name='airframe_far_lod';
  const points=[0,0,-10,-1.4,.2,-3,1.4,.2,-3,0,.15,8,-span*.5,0,4,-1.2,0,-2,span*.5,0,4,1.2,0,-2,-4.1,0,7.5,-1.1,.1,4.5,4.1,0,7.5,1.1,.1,4.5,-1,.2,4,-1,2.8,7,-1,.2,8,1,.2,4,1,2.8,7,1,.2,8];
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(points,3));geometry.setIndex([0,1,2,1,3,2,4,3,5,6,7,3,8,3,9,10,11,3,12,13,14,15,17,16]);geometry.computeVertexNormals();
  const material=bodyMaterial.clone();material.side=T.DoubleSide;material.bumpMap=null;material.onBeforeCompile=()=>{};
  const silhouette=new T.Mesh(geometry,material);far.add(silhouette);middle.visible=false;far.visible=false;
  return {middle,far,level:'near'};
}
