import * as T from 'three';
import { disposeObject } from './Resources.js';
// No external model is bundled. A future licensed local asset must satisfy this contract.
export const FLAGSHIP_ASSET=null;
export function validateJetAsset(asset){
  if(!asset || !/^\/assets\/[\w/.-]+\.glb$/.test(asset.url || '') || asset.url.includes('..'))throw new Error('Use a local /assets/*.glb path');
  if(!asset.author || !asset.source || !asset.license)throw new Error('Asset author, source and license are required');
  if(asset.forward!=='-Z' || asset.up!=='Y')throw new Error('Asset axes must be -Z forward, Y up');
  if(!Number.isFinite(asset.length) || asset.length<10 || asset.length>40)throw new Error('Specify the aircraft length in metres');
}
export async function loadJetAsset(asset){
  validateJetAsset(asset);
  const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
  const loaded=await new GLTFLoader().loadAsync(asset.url),root=loaded.scene;
  try{
    const bounds=new T.Box3().setFromObject(root),size=bounds.getSize(new T.Vector3());
    if(size.z<=0)throw new Error('Empty aircraft model');
    root.scale.multiplyScalar(asset.length/size.z);root.updateMatrixWorld(true);
    const center=new T.Box3().setFromObject(root).getCenter(new T.Vector3());root.position.sub(center);
    const wrapper=new T.Group();wrapper.add(root);
    const required=['wingtip_left','wingtip_right','exhaust','gear','elevator_left','elevator_right','aileron_left','aileron_right','rudder'];
    const anchors=Object.fromEntries(required.map(name=>[name,root.getObjectByName(name)]));
    if(required.some(name=>!anchors[name]))throw new Error('Missing aircraft attachments or animation pivots');
    wrapper.userData={asset,anchors,flames:[],elevators:[anchors.elevator_left,anchors.elevator_right],ailerons:[anchors.aileron_left,anchors.aileron_right],rudders:[anchors.rudder],canards:[],gearGroup:anchors.gear};
    root.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=true;mesh.receiveShadow=true;}});
    return wrapper;
  }catch(error){disposeObject(root);throw error;}
}
