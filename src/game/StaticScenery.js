import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
// Merge compatible, opaque, static root meshes per 5 km cell. Animated groups, lights,
// sprites, textured props, aircraft and terrain chunks retain their own lifecycle/culling.
export function batchStaticScenery(scene){
  scene.updateMatrixWorld(true);const groups=new Map(),oldGeometry=new Set(),oldMaterials=new Set();let before=0,after=0;
  for(const mesh of [...scene.children]){
    const m=mesh.material;if(!mesh.isMesh || !m?.isMeshStandardMaterial || m.transparent || m.map || m.normalMap || m.bumpMap || mesh.children.length)continue;
    const attributes=Object.keys(mesh.geometry.attributes).sort().join(',');
    const key=[Math.floor(mesh.position.x/5000),Math.floor(mesh.position.z/5000),m.color.getHex(),m.emissive.getHex(),m.emissiveIntensity,m.roughness,m.metalness,m.side,m.flatShading,m.vertexColors,mesh.castShadow,mesh.receiveShadow,attributes,!!mesh.geometry.index].join(':');
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(mesh);
  }
  for(const meshes of groups.values()){
    before+=meshes.length;if(meshes.length<2){after++;continue;}
    const sources=meshes.map(mesh=>mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)),merged=mergeGeometries(sources,false);for(const geometry of sources)geometry.dispose();
    if(!merged){after+=meshes.length;continue;}
    merged.computeBoundingSphere();const batch=new T.Mesh(merged,meshes[0].material);batch.name='static_scenery_cell';batch.castShadow=meshes[0].castShadow;batch.receiveShadow=meshes[0].receiveShadow;scene.add(batch);after++;
    for(const mesh of meshes){oldGeometry.add(mesh.geometry);oldMaterials.add(mesh.material);mesh.removeFromParent();}
  }
  scene.traverse(mesh=>{if(mesh.geometry)oldGeometry.delete(mesh.geometry);if(mesh.material)oldMaterials.delete(mesh.material);});
  for(const geometry of oldGeometry)geometry.dispose();for(const material of oldMaterials)material.dispose();return {eligibleMeshesBefore:before,eligibleMeshesAfter:after};
}
