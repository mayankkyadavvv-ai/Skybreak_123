import * as T from 'three';
// Bounded PMREM cache, built only after a time/weather change. No per-frame capture.
export class EnvironmentLighting {
  constructor(renderer,scene){this.scene=scene;this.renderer=renderer;this.generator=new T.PMREMGenerator(renderer);this.cache=new Map();this.key='';}
  update(key,world){
    this.renderer.toneMappingExposure=world.renderExposure??1;
    this.scene.environmentIntensity=world.environmentIntensity??.58;
    if(key===this.key)return;
    if(!this.cache.has(key)){
      const capture=new T.Scene();capture.background=world.scene.background.clone();
      const sky=world.sky.clone();sky.position.set(0,0,0);sky.material=world.sky.material.clone();
      sky.material.uniforms.altitude.value=0;sky.material.uniforms.lightningFlash.value=0;capture.add(sky);
      try{this.cache.set(key,this.generator.fromScene(capture,.05,1,100000,{size:128}));}finally{sky.material.dispose();capture.clear();}
    }
    this.key=key;this.scene.environment=this.cache.get(key).texture;this.scene.environmentIntensity=world.environmentIntensity??.58;
    if(this.cache.size>3){const oldest=this.cache.keys().next().value;this.cache.get(oldest).dispose();this.cache.delete(oldest);}
  }
  dispose(){this.scene.environment=null;for(const target of this.cache.values())target.dispose();this.cache.clear();this.generator.dispose();}
}
