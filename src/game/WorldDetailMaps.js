import * as T from 'three';
import { cloudShadowAt } from './CloudField.js';
export const COAST_BOUNDS=Object.freeze({minX:-28500,minZ:39500,width:25500,height:15500});
export function createCoastDepthMap(heightAt,size=192) {
  const data=new Uint8Array(size*size),b=COAST_BOUNDS;
  for(let z=0;z<size;z++)for(let x=0;x<size;x++){
    const height=heightAt(b.minX+x/(size-1)*b.width,b.minZ+z/(size-1)*b.height);
    data[z*size+x]=Math.round(T.MathUtils.clamp((height+512)/1024,0,1)*255);
  }
  const texture=new T.DataTexture(data,size,size,T.RedFormat);texture.minFilter=T.LinearFilter;texture.magFilter=T.LinearFilter;texture.colorSpace=T.NoColorSpace;texture.generateMipmaps=false;texture.needsUpdate=true;
  return texture;
}
export function createCloudShadowMap(size=96) {
  const data=new Uint8Array(size*size);
  for(let z=0;z<size;z++)for(let x=0;x<size;x++)data[z*size+x]=Math.round(cloudShadowAt(-85000+x/(size-1)*130000,-75000+z/(size-1)*130000)*255);
  const texture=new T.DataTexture(data,size,size,T.RedFormat);texture.minFilter=T.LinearFilter;texture.magFilter=T.LinearFilter;texture.colorSpace=T.NoColorSpace;texture.generateMipmaps=false;texture.needsUpdate=true;return texture;
}
