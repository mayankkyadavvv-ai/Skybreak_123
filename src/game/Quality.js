import * as T from 'three';
export const QUALITY = Object.freeze({
  low:    { dpr:1,    shadow:0,    samples:0, bloom:0,    clouds:64,  particles:1200, streaks:48,  near:48,  mid:24, far:50000 },
  medium: { dpr:1.25, shadow:1024, samples:2, bloom:.22, clouds:128, particles:2200, streaks:96,  near:128, mid:48, far:95000 },
  high:   { dpr:1.5,  shadow:2048, samples:4, bloom:.28, clouds:220, particles:3200, streaks:160, near:192, mid:64, far:110000 },
  ultra:  { dpr:2,    shadow:2048, samples:4, bloom:.32, clouds:262, particles:4200, streaks:240, near:256, mid:96, far:120000 },
});
export const qualityFor = name => QUALITY[name] || QUALITY.medium;
export function configureRenderer(game, width, height, deviceDpr=1) {
  const q=qualityFor(game.settings.quality), renderer=game.renderer;
  const dpr=Math.min(Math.max(1,deviceDpr),q.dpr);
  const key=`${game.settings.quality}:${width}:${height}:${dpr}`;if(game.renderConfigKey===key)return q;game.renderConfigKey=key;
  renderer.setPixelRatio(dpr);renderer.setSize(width,height);
  renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
  renderer.shadowMap.enabled=q.shadow>0;
  if(game.composer) {
    const samples=Math.min(q.samples,renderer.capabilities?.maxSamples || 0);
    for(const target of [game.composer.renderTarget1,game.composer.renderTarget2]) {
      if(target.samples!==samples){target.samples=samples;target.dispose();}
    }
    game.composer.setPixelRatio(dpr);game.composer.setSize(width,height);
  }
  if(game.bloomPass){game.bloomPass.enabled=q.bloom>0;game.bloomPass.strength=q.bloom;game.bloomPass.threshold=1.15;game.bloomPass.radius=.3;}
  game.camera.far=q.far;game.camera.aspect=width/height;game.camera.updateProjectionMatrix();
  return q;
}
