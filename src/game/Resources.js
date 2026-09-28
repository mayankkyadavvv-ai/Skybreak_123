// One disposal per owned resource. Shared procedural maps are owned by their cache.
export function disposeObject(root, sharedTextures=new Set()) {
  const geometries=new Set(),materials=new Set(),textures=new Set();
  root.traverse(object=>{if(object.geometry)geometries.add(object.geometry);for(const material of (Array.isArray(object.material)?object.material:[object.material]))if(material)materials.add(material);});
  for(const material of materials){for(const value of Object.values(material))if(value?.isTexture&&!sharedTextures.has(value))textures.add(value);material.dispose();}
  for(const geometry of geometries)geometry.dispose();for(const texture of textures)texture.dispose();
  root.removeFromParent();
}
