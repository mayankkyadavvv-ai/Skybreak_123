// Original procedural materials: no reference-game textures are redistributed.
function detail(material, kind) {
  material.customProgramCacheKey = () => `skybreak-surface-${kind}-1`;
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 surfacePosition;\nvarying vec3 surfaceNormal;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nsurfacePosition = position; surfaceNormal = normal;');
    shader.fragmentShader = `varying vec3 surfacePosition;
      varying vec3 surfaceNormal;
      float surfaceHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float surfaceNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(surfaceHash(i),surfaceHash(i+vec2(1,0)),f.x),mix(surfaceHash(i+vec2(0,1)),surfaceHash(i+vec2(1,1)),f.x),f.y);}
      ` + shader.fragmentShader;
    const terrain = `
      vec2 p = surfacePosition.xz;
      float broad = surfaceNoise(p * .0018);
      float grain = surfaceNoise(p * .032);
      float slope = 1. - abs(normalize(surfaceNormal).y);
      float rocky = max(smoothstep(.16,.55,slope),smoothstep(550.,1500.,surfacePosition.y));
      vec3 rock = mix(vec3(.13,.15,.17),vec3(.30,.28,.24),broad);
      rock *= .8 + .4*grain;
      float snow = smoothstep(2500.,3400.,surfacePosition.y) * (1.-smoothstep(.25,.6,slope));
      vec3 mountain = mix(rock,vec3(.78,.84,.89),snow);
      diffuseColor.rgb = mix(diffuseColor.rgb,mountain,rocky*.92);
      float closeDetail = 1.-smoothstep(4000.,14000.,length(vViewPosition));
      diffuseColor.rgb *= mix(1.,.84+.32*grain,closeDetail);
    `;
    const aircraft = `
      vec2 p=vec2(surfacePosition.z*.7,surfacePosition.x*1.5 + surfacePosition.y*.35);
      vec2 width=max(fwidth(p),vec2(.001));
      vec2 edge=min(fract(p),1.-fract(p));
      vec2 seam=1.-smoothstep(width*.35,width*1.4+vec2(.007),edge);
      float visible=1.-smoothstep(90.,260.,length(vViewPosition));
      diffuseColor.rgb *= 1.-max(seam.x,seam.y)*.23*visible;
      diffuseColor.rgb *= .96+.08*surfaceNoise(p*3.);
    `;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n' + (kind === 'terrain' ? terrain : aircraft));
  };
}
export const terrainDetail = material => detail(material, 'terrain');
export const aircraftDetail = material => detail(material, 'aircraft');
