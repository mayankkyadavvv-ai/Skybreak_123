import { batchStaticScenery } from "./StaticScenery.js";
import * as T from "three";
import { TerrainChunks } from "./TerrainChunks.js";
import { qualityFor } from "./Quality.js";
import { disposeObject } from "./Resources.js";
import { rng } from "./math.js";
import { create3DBorderBeacons, CITIES, IAF_BASES } from "./GeoWorld.js";
import { createGeoTexture } from "./GeoTexture.js";
import { runwayLocal, onRunway } from "./Landing.js";

const BASE = new T.Vector3(-4200, 45, -12500);


// Real Topographical Relief Features
const peaks = [
  // Western / Central ridges
  [-7500, 4500, 2400, 5e3, 3600],
  [6900, 2e3, 2600, 4400, 5200],
  [-7200, -7500, 2200, 4100, 5800],
  [8200, -11500, 2800, 4700, 4700],
  [0, -20500, 2200, 5100, 3400],
  [16500, 11e3, 2400, 5e3, 4e3],
  [-16600, 13500, 2800, 4e3, 7e3],
  // Aravalli Ridge running northeast from Rajasthan toward Delhi
  [14000, 14000, 1600, 4000, 8000],
  [18000, 4000, 1400, 3500, 7000],
  [22000, -5000, 1200, 3000, 6000],
  [26000, -14000, 1100, 2500, 5000],
  // Western Ghats (Sahyadri Range running south along Maharashtra)
  [13000, 42000, 1800, 3500, 9000],
  [15000, 54000, 1900, 3200, 8500],
  // Balochistan & Sulaiman Mountain Ranges
  [-32000, -22000, 2400, 7000, 12000],
  [-26000, -38000, 3100, 6000, 9000],
  [-42000, 4000, 2100, 8000, 11000],
  // Northern Himalayan & Karakoram Mountain Range (K2, Nanga Parbat, Siachen, Pir Panjal)
  [8000, -46000, 4800, 11000, 7500],
  [-6000, -50000, 5200, 10000, 8500],
  [20000, -52000, 5600, 12000, 8500],
  [6000, -62000, 6800, 14000, 9500],
  [12000, -65000, 6200, 12000, 9000],
  [-6000, -56000, 5800, 11000, 8500],
  [22000, -58000, 6400, 13000, 8500],
  [-2000, -48000, 4900, 10000, 7500],
  [18000, -42000, 5200, 11000, 8000],
  [-14000, -58000, 5100, 11000, 9000]
];

function terrainHeight(x, z) {
  let h = -160;
  for (const [px, pz, ph, sx, sz] of peaks) {
    const d = ((x - px) / sx) ** 2 + ((z - pz) / sz) ** 2;
    h += ph * Math.exp(-d * 1.45);
  }
  const ridges = Math.sin(x * 23e-4 + Math.sin(z * 8e-4) * 2) * Math.sin(z * 17e-4) + 0.45 * Math.sin(x * 6e-3 + z * 3e-3);
  h += Math.max(0, h) * ridges * 0.18;

  // Thar Desert Sand Dunes modulation (gentle 40-75m rolling relief)
  if (x > -14000 && x < 22000 && z > -12000 && z < 26000) {
    const duneWaves = Math.sin(x * 0.0035 + z * 0.0018) * Math.cos(z * 0.0028) * 45;
    h = Math.max(40, h + duneWaves);
  }

  // Flatten home military airbase
  const b = Math.hypot((x - BASE.x) / 850, (z - BASE.z) / 1900);
  if (b < 1.5) h = T.MathUtils.lerp(38, h, T.MathUtils.smoothstep(b, 0.85, 1.5));

  // Flatten forward operating IAF military airbase runways
  for (let i = 0; i < IAF_BASES.length; i++) {
    const ab = IAF_BASES[i];
    const q = runwayLocal(ab, {x, z});
    const edge = Math.max(Math.abs(q.x) - ab.runwayWidth / 2 - 220, Math.abs(q.z) - ab.runwayLength / 2 - 250, 0);
    if (edge < 600) h = T.MathUtils.lerp(ab.elevation, h, T.MathUtils.smoothstep(edge, 0, 600));
  }

  // Flatten Practice flight spawn area (x: ~0, z: ~5200)
  const ps = Math.hypot(x / 1400, (z - 5200) / 1400);
  if (ps < 1.5) h = T.MathUtils.lerp(55, h, T.MathUtils.smoothstep(ps, 0.8, 1.5));

  // Coastal / Arabian sea gradient in south-west
  if (z > 38000 && x < 4000) {
    const oceanDepth = -40 - (z - 38000) * 0.015 - Math.max(0, -x) * 0.008;
    h = Math.min(h, oceanDepth);

    // 4 Scenic Coastal Islands (Beaches, rocky bluffs, atolls)
    const islands = [
      [-18000, 46000, 2600, 180],
      [-11000, 52000, 2200, 150],
      [-25000, 43000, 1900, 130],
      [-6000, 45000, 1800, 160]
    ];
    for (const [ix, iz, ir, ih] of islands) {
      const idist = Math.hypot(x - ix, z - iz);
      if (idist < ir) {
        const factor = Math.cos((idist / ir) * Math.PI * 0.5);
        const islandH = factor * ih + Math.sin(x * 0.007 + z * 0.005) * 12;
        h = Math.max(h, islandH);
      }
    }
  }

  for (const base of IAF_BASES) if (onRunway(base, {x, z}, 30)) return base.elevation;
  return h;
}

function createTerrainNormalMap(size = 512) {
  try {
    if (typeof document === "undefined") return null;
    const cv = document.createElement("canvas");
    cv.width = cv.height = size;
    const ctx = cv.getContext("2d");
    if (!ctx) return null;
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    const heights = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (x / size) * Math.PI * 32;
        const v = (y / size) * Math.PI * 32;
        const n1 = Math.sin(u * 1.4) * Math.cos(v * 1.4);
        const n2 = Math.sin(u * 3.6 + n1 * 1.8) * Math.cos(v * 3.2);
        const n3 = Math.sin(u * 7.8 + v * 5.4) * 0.38;
        // High-frequency tactile micro-crags and wind-swept sand/rock ripples
        const n4 = Math.sin(u * 16.4 - v * 12.2 + n2 * 1.2) * 0.20;
        const n5 = (Math.sin((u + v) * 32.0) * Math.cos((u - v) * 28.0)) * 0.12;
        heights[y * size + x] = n1 * 0.42 + n2 * 0.28 + n3 * 0.16 + n4 * 0.09 + n5 * 0.05;
      }
    }

    const bumpScale = 1.35;
    for (let y = 0; y < size; y++) {
      const ym = ((y - 1 + size) % size) * size;
      const yp = ((y + 1) % size) * size;
      const yCurr = y * size;
      for (let x = 0; x < size; x++) {
        const xm = (x - 1 + size) % size;
        const xp = (x + 1) % size;

        const hL = heights[yCurr + xm];
        const hR = heights[yCurr + xp];
        const hD = heights[ym + x];
        const hU = heights[yp + x];

        const dx = (hR - hL) * bumpScale;
        const dy = (hU - hD) * bumpScale;
        const dz = 1.0;

        const len = Math.hypot(dx, dy, dz) || 1.0;
        const nx = -dx / len;
        const ny = -dy / len;
        const nz = dz / len;

        const idx = (yCurr + x) * 4;
        data[idx] = Math.round((nx * 0.5 + 0.5) * 255);
        data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        data[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    const tex = new T.CanvasTexture(cv);
    tex.wrapS = T.RepeatWrapping;
    tex.wrapT = T.RepeatWrapping;
    tex.repeat.set(180, 180);
    return tex;
  } catch {
    return null;
  }
}

class World {
  constructor(scene) {
    this.scene = scene;
    this.buildings = [];
    this.clouds = [];
    this.nightLights = [];
    this.time = 0;

    scene.background = new T.Color(0x8ab8cb);
    this.baseFogDensity = 14e-6;
    scene.fog = new T.FogExp2(0x8ab8cb, this.baseFogDensity);

    this.sunDirection=new T.Vector3(-.55,.58,-.6).normalize();
    this.sun = new T.DirectionalLight(0xfffaf0, 2.2);
    this.sun.position.set(-7e3, 6e3, -1e4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -100, right: 100, top: 100, bottom: -100, near: 1, far: 1200 });
    this.sun.shadow.bias = -4e-4;

    this.hemi = new T.HemisphereLight(0xbaddf0, 0x526b3f, 1.0);
    scene.add(this.sun, this.sun.target, this.hemi);

    // Sky Dome with enhanced Rayleigh & Mie Atmospheric Scattering, Stratosphere altitude shading, and celestial lighting
    const skyGeo = new T.SphereGeometry(85e3, 32, 20);
    const skyMat = new T.ShaderMaterial({
      side: T.BackSide,
      depthWrite: false,
      uniforms: {
        sunDir: { value: new T.Vector3(-0.6, 0.38, -0.7).normalize() },
        moonDir: { value: new T.Vector3(0.55, 0.62, 0.55).normalize() },
        skyTop: { value: new T.Vector3(0.08, 0.28, 0.58) },
        skyBottom: { value: new T.Vector3(0.68, 0.78, 0.84) },
        sunGlow: { value: new T.Vector3(1.0, 0.85, 0.65) },
        isNight: { value: 0.0 },
        altitude: { value: 0.0 },
        stormFactor: { value: 0.0 },
        lightningFlash: { value: 0.0 }
      },
      vertexShader: `
        varying vec3 vWorldDir;
        void main() {
          vWorldDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vWorldDir;
        uniform vec3 sunDir;
        uniform vec3 moonDir;
        uniform vec3 skyTop;
        uniform vec3 skyBottom;
        uniform vec3 sunGlow;
        uniform float isNight;
        uniform float altitude;
        uniform float stormFactor;
        uniform float lightningFlash;

        // Pseudo-random 3D hash for crisp stars & scintillation
        float hash3(vec3 p) {
          p = fract(p * 0.3183099 + 0.1);
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }

        void main() {
          vec3 dir = normalize(vWorldDir);
          float zenith = max(dir.y, 0.0);
          vec3 sDir = normalize(sunDir);
          float cosTheta = dot(dir, sDir);

          // 1. Rayleigh Scattering & Zenith Phase Gradient
          float rayleighPhase = 0.75 * (1.0 + cosTheta * cosTheta);
          float zenithGrad = pow(zenith, 0.44);
          vec3 baseSky = mix(skyBottom, skyTop, zenithGrad);

          // Forward horizon in-scattering (warm radiant horizon glow facing the sun)
          float forwardHorizon = pow(max(cosTheta, 0.0), 3.2) * (1.0 - smoothstep(0.0, 0.32, zenith));
          baseSky += sunGlow * forwardHorizon * 0.48 * (1.0 - isNight);

          // 2. High-Altitude Stratosphere Shading (Thinning atmosphere above 4500m up to 14000m)
          float altNorm = clamp(altitude / 14000.0, 0.0, 1.0);
          vec3 spaceDeep = vec3(0.005, 0.010, 0.024); // Deep cosmic black-navy
          baseSky = mix(baseSky, mix(skyBottom * 0.22, spaceDeep, zenithGrad), altNorm * 0.82);

          // Curved planetary limb atmospheric glow along horizon at high altitude
          float limbArc = smoothstep(0.0, 0.045, zenith) * (1.0 - smoothstep(0.045, 0.18, zenith)) * altNorm;
          baseSky += vec3(0.18, 0.60, 1.0) * limbArc * 1.85;

          // 3. Multi-Lobe Mie Scattering (Solar Corona & Aureole)
          float g = 0.78;
          float miePhase = (1.0 - g * g) / pow(max(1e-4, 1.0 + g * g - 2.0 * g * cosTheta), 1.5);
          float solarCorona = pow(max(cosTheta, 0.0), 20.0) * 0.40 + pow(max(cosTheta, 0.0), 160.0) * 0.95;
          vec3 mieScatter = sunGlow * (miePhase * 0.042 + solarCorona) * (1.0 - isNight * 0.90);

          // 4. Physical Sun Disc with Limb Darkening & Optical Glare
          float sunDiscCos = 0.99952;
          float sunEdge = smoothstep(sunDiscCos - 0.00035, sunDiscCos, cosTheta);
          vec3 sunDiscColor = vec3(1.0, 0.98, 0.90) * (1.0 - isNight) * 5.8;

          // Horizontal canopy lens flare streak
          float horizDist = abs(dir.y - sDir.y);
          float flareStreak = exp(-horizDist * horizDist * 220.0) * pow(max(cosTheta, 0.0), 5.5) * 0.32 * (1.0 - isNight);
          vec3 flareColor = sunGlow * flareStreak;

          // Combine daylight scattering
          vec3 color = baseSky * rayleighPhase * 0.95 + mieScatter + sunDiscColor * sunEdge + flareColor;

          // 5. Night Sky: Multi-Spectral Twinkling Stars, Milky Way Dust Lane, & Moon Disc
          if (isNight > 0.05 || altNorm > 0.40) {
            float nightVisibility = max(isNight, (altNorm - 0.40) * 1.6);
            if (zenith > 0.02) {
              vec3 starGrid = floor(dir * 620.0);
              float starVal = hash3(starGrid);
              if (starVal > 0.980) {
                float starIntensity = pow((starVal - 0.980) / 0.020, 2.8);
                vec3 starTint = mix(vec3(0.80, 0.92, 1.0), vec3(1.0, 0.84, 0.65), fract(starVal * 87.0));
                color += starTint * starIntensity * nightVisibility * 1.6;
              }

              float mwAngle = abs(dir.y * 0.85 + dir.x * 0.52 - 0.12);
              float mwBand = exp(-mwAngle * mwAngle * 14.0) * smoothstep(0.08, 0.45, zenith);
              vec3 mwColor = mix(vec3(0.05, 0.08, 0.14), vec3(0.09, 0.07, 0.12), dir.z * 0.5 + 0.5);
              color += mwColor * mwBand * isNight * 1.4;
            }

            // Moon Disc & Lunar Corona
            if (isNight > 0.25) {
              float moonCos = dot(dir, normalize(moonDir));
              float moonDiscCos = 0.99932;
              float moonDisc = smoothstep(moonDiscCos - 0.00035, moonDiscCos, moonCos);
              float moonAureole = pow(max(moonCos, 0.0), 38.0) * 0.32 + pow(max(moonCos, 0.0), 280.0) * 0.75;
              vec3 moonColor = vec3(0.90, 0.94, 1.0) * (moonDisc * 3.8 + moonAureole * 0.85);
              color += moonColor * isNight;
            }
          }

          // 6. Storm Weather Overcast & Lightning Illumination
          if (stormFactor > 0.01) {
            vec3 stormHaze = vec3(0.12, 0.14, 0.18);
            color = mix(color, stormHaze, stormFactor * 0.65);
          }
          if (lightningFlash > 0.01) {
            vec3 flashScatter = vec3(0.70, 0.82, 1.0) * lightningFlash * 2.2;
            color += flashScatter;
          }

          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `
    });
    this.sky = new T.Mesh(skyGeo, skyMat);
    scene.add(this.sky);

    // Create high-res procedural satellite map texture & micro-detail normal map
    try {
      this.geoTexture = createGeoTexture();
    } catch {
      this.geoTexture = null;
    }

    try {
      this.terrainNormalMap = createTerrainNormalMap();
    } catch {
      this.terrainNormalMap = null;
    }

    this.landMat = new T.MeshStandardMaterial({
      map: this.geoTexture,
      normalMap: this.terrainNormalMap,
      normalScale: new T.Vector2(0.45, 0.45),
      vertexColors: !this.geoTexture,
      roughness: 0.82,
      metalness: 0.04,
      flatShading: false
    });
    this.terrainChunks=new TerrainChunks(scene,this.landMat,terrainHeight);
    this.terrain=this.terrainChunks.group;

    // Multi-Octave Trochoidal Gerstner Wave Ocean Shader with Shoreline Breaking Surf & Sun Glint
    const waterMat = new T.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        eye: { value: new T.Vector3() },
        sunDir: { value: new T.Vector3(-0.6, 0.35, -0.7).normalize() },
        waterDeep: { value: new T.Vector3(0.012, 0.14, 0.22) },
        waterShallow: { value: new T.Vector3(0.18, 0.52, 0.65) },
        waterSun: { value: new T.Vector3(1.0, 0.82, 0.55) },
        fogColor: { value: new T.Vector3(0.55, 0.71, 0.77) }
      },
      vertexShader: `
        uniform float time;
        varying vec3 wp;
        varying vec3 vNormal;
        varying float vWaveHeight;

        void gerstner(inout vec3 p, inout vec3 norm, vec2 dir, float A, float L, float steepness, float speed) {
          float k = 6.28318 / L;
          float c = sqrt(9.8 / k) * speed;
          float w = k * c;
          float phi = time * w;
          float d = dot(dir, p.xz) * k + phi;
          float cosD = cos(d);
          float sinD = sin(d);
          float Q = steepness / (k * A * 4.0);

          p.x += Q * A * dir.x * cosD;
          p.z += Q * A * dir.y * cosD;
          p.y += A * sinD;

          float WA = k * A;
          norm.x -= dir.x * WA * cosD;
          norm.z -= dir.y * WA * cosD;
          norm.y -= Q * WA * sinD;
        }

        void main() {
          vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
          vec3 norm = vec3(0.0, 1.0, 0.0);

          // 4 Multi-directional Harmonic Gerstner Waves
          gerstner(p, norm, normalize(vec2(1.0, 0.6)), 2.6, 480.0, 0.42, 0.85);
          gerstner(p, norm, normalize(vec2(-0.7, 0.7)), 1.5, 260.0, 0.36, 1.05);
          gerstner(p, norm, normalize(vec2(0.4, -0.9)), 0.8, 140.0, 0.30, 1.25);
          gerstner(p, norm, normalize(vec2(0.8, -0.2)), 0.4, 65.0, 0.22, 1.55);

          wp = p;
          vNormal = normalize(norm);
          vWaveHeight = p.y;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 wp;
        varying vec3 vNormal;
        varying float vWaveHeight;
        uniform float time;
        uniform vec3 eye;
        uniform vec3 sunDir;
        uniform vec3 waterDeep;
        uniform vec3 waterShallow;
        uniform vec3 waterSun;
        uniform vec3 fogColor;

        void main() {
          float dist = length(eye - wp);
          float distFade = clamp(1.0 - dist / 55000.0, 0.0, 1.0);

          // High-frequency capillary ripples
          float micro1 = sin(wp.x * 0.16 + time * 1.6) * cos(wp.z * 0.14 - time * 1.4);
          float micro2 = sin(wp.x * 0.32 - time * 2.0 + wp.z * 0.22) * 0.5;
          vec3 fineNormal = normalize(vNormal + vec3(micro1 * 0.04 + micro2 * 0.03, 0.0, micro1 * 0.035 - micro2 * 0.02) * distFade);

          vec3 v = normalize(eye - wp);

          // Fresnel Sky Reflection
          float ndotv = max(dot(fineNormal, v), 0.0);
          float fresnel = 0.02 + 0.98 * pow(1.0 - ndotv, 4.0);

          // Specular Sun Glint
          vec3 refl = reflect(-sunDir, fineNormal);
          float rdotv = max(dot(refl, v), 0.0);
          float sunGlint = pow(rdotv, 260.0) * 2.5;
          float sunSheen = pow(rdotv, 28.0) * 0.40;

          // Water depth gradient
          vec3 oceanCol = mix(waterDeep, waterShallow, fresnel * 0.72 + smoothstep(-2.0, 3.2, vWaveHeight) * 0.28);
          oceanCol += waterSun * (sunGlint + sunSheen);

          // 1. Trochoidal Wave Crest Foam
          float waveFoam = smoothstep(1.7, 3.1, vWaveHeight + micro1 * 0.7) * 1.5 * distFade;

          // 2. Shoreline Breaking Surf Foam around Islands & Coastlines
          // Islands at: [-18000, 46000], [-11000, 52000], [-25000, 43000], [-6000, 45000]
          float dCoast = min(
            min(
              abs(length(wp.xz - vec2(-18000.0, 46000.0)) - 2600.0),
              abs(length(wp.xz - vec2(-11000.0, 52000.0)) - 2200.0)
            ),
            min(
              abs(length(wp.xz - vec2(-25000.0, 43000.0)) - 1900.0),
              abs(length(wp.xz - vec2(-6000.0, 45000.0)) - 1800.0)
            )
          );

          if (wp.z > 36000.0 && wp.x < 3000.0) {
            float contDist = abs(wp.x - (3000.0 - (wp.z - 36000.0) * 0.85));
            dCoast = min(dCoast, contDist);
          }

          float shorelineFoam = 0.0;
          if (dCoast < 450.0) {
            float shoreWave = sin(dCoast * 0.045 - time * 2.8) * 0.5 + 0.5;
            shorelineFoam = pow(shoreWave, 3.0) * smoothstep(450.0, 40.0, dCoast) * 1.8 * distFade;
          }

          vec3 foamColor = vec3(0.95, 0.98, 1.0);
          oceanCol = mix(oceanCol, foamColor, clamp(waveFoam + shorelineFoam, 0.0, 0.92));

          // Distance Fog
          float fogFactor = smoothstep(22000.0, 68000.0, dist);
          oceanCol = mix(oceanCol, fogColor, fogFactor);

          gl_FragColor = vec4(oceanCol, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `
    });
    this.water = new T.Mesh(new T.PlaneGeometry(16e4, 16e4, 140, 140), waterMat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = 1;
    scene.add(this.water);

    this.radarDishes = [];
    this.createClouds();
    this.createBase();
    this.createForwardAirbases();
    this.createCityMarkers();
    this.createILSGates();
    this.borderBeacons = create3DBorderBeacons(scene);
    this.staticBatchStats=batchStaticScenery(scene);

    this.quality = null;
  }

  createILSGates() {
    this.ilsGroup = new T.Group();
    this.ilsGroup.visible = false;
    this.scene.add(this.ilsGroup);

    const gateMat = new T.MeshBasicMaterial({
      color: 0x00e5ff,
      wireframe: true,
      transparent: true,
      opacity: 0.8
    });

    const crossMat = new T.MeshBasicMaterial({
      color: 0x38ef7d,
      transparent: true,
      opacity: 0.85
    });

    this.ilsGateMeshes = [];
    for (let i = 0; i < 6; i++) {
      const g = new T.Group();
      const frame = new T.Mesh(new T.BoxGeometry(60 + i * 5, 34 + i * 3, 4), gateMat);
      const ch = new T.Mesh(new T.BoxGeometry(16, 2, 2), crossMat);
      const cv = new T.Mesh(new T.BoxGeometry(2, 16, 2), crossMat);
      g.add(frame, ch, cv);
      this.ilsGroup.add(g);
      this.ilsGateMeshes.push(g);
    }
  }


  createClouds() {
    let tex = null;
    let midTex = null;
    let cirrusTex = null;
    try {
      if (typeof document !== "undefined") {
        // 1. High-Fidelity Multi-Lobed Volumetric Cumulus Cloud Texture with Soft Self-Shadowing
        const cv = document.createElement("canvas");
        cv.width = cv.height = 512;
        const c = cv.getContext("2d");
        const lobes = [
          [256, 290, 190, 0.88, 0.95],
          [160, 310, 150, 0.78, 0.90],
          [350, 310, 150, 0.78, 0.90],
          [210, 220, 140, 0.82, 0.98],
          [310, 230, 130, 0.80, 0.98],
          [260, 160, 110, 0.75, 1.00],
          [120, 260, 100, 0.65, 0.85],
          [400, 260, 100, 0.65, 0.85]
        ];
        for (const [lx, ly, lr, lo, lBright] of lobes) {
          const g = c.createRadialGradient(lx, ly - lr * 0.25, lr * 0.05, lx, ly, lr);
          // Top highlight (sunlit white), middle volume, shaded base (ambient scatter)
          g.addColorStop(0, `rgba(${Math.round(255 * lBright)}, ${Math.round(255 * lBright)}, 255, ${lo})`);
          g.addColorStop(0.40, `rgba(244, 248, 255, ${lo * 0.65})`);
          g.addColorStop(0.75, `rgba(215, 228, 242, ${lo * 0.28})`);
          g.addColorStop(1, "rgba(200, 218, 238, 0)");
          c.fillStyle = g;
          c.beginPath();
          c.arc(lx, ly, lr, 0, Math.PI * 2);
          c.fill();
        }
        tex = new T.CanvasTexture(cv);
        tex.colorSpace=T.SRGBColorSpace;

        // 2. Mid-Altitude Stratus Sheet Texture
        const mcv = document.createElement("canvas");
        mcv.width = 512;
        mcv.height = 256;
        const mc = mcv.getContext("2d");
        const mg = mc.createRadialGradient(256, 128, 20, 256, 128, 240);
        mg.addColorStop(0, "rgba(252, 254, 255, 0.78)");
        mg.addColorStop(0.45, "rgba(240, 246, 254, 0.48)");
        mg.addColorStop(0.80, "rgba(225, 236, 248, 0.18)");
        mg.addColorStop(1, "rgba(215, 230, 245, 0)");
        mc.fillStyle = mg;
        mc.fillRect(0, 0, 512, 256);
        midTex = new T.CanvasTexture(mcv);
        midTex.colorSpace=T.SRGBColorSpace;

        // 3. High Stratospheric Cirrus Ribbon Texture
        const ccv = document.createElement("canvas");
        ccv.width = 512;
        ccv.height = 128;
        const cc = ccv.getContext("2d");
        const cg = cc.createLinearGradient(0, 0, 512, 128);
        cg.addColorStop(0, "rgba(255,255,255,0)");
        cg.addColorStop(0.2, "rgba(248,252,255,0.32)");
        cg.addColorStop(0.5, "rgba(252,254,255,0.52)");
        cg.addColorStop(0.8, "rgba(242,248,255,0.28)");
        cg.addColorStop(1, "rgba(255,255,255,0)");
        cc.fillStyle = cg;
        cc.fillRect(0, 0, 512, 128);
        cirrusTex = new T.CanvasTexture(ccv);
        cirrusTex.colorSpace=T.SRGBColorSpace;
      }
    } catch {}

    const rand = rng(29);
    const clusters=Array.from({length:26},()=>({x:(rand()-.5)*76000,z:(rand()-.5)*76000,y:2300+rand()*1100}));
    // 1. Lower Cumulus Cloud Deck (2,200m - 3,800m)
    for (let i = 0; i < 130; i++) {
      const mat = new T.SpriteMaterial({ map: tex, transparent: true, opacity: 0.72, depthWrite: false, color: 0xf5f9fd });
      const s = new T.Sprite(mat);
      const center=clusters[Math.floor(i/5)];
      s.position.set(center.x+(rand()-.5)*3200,center.y+(rand()-.5)*450,center.z+(rand()-.5)*2400);
      mat.rotation=(rand()-.5)*.22;
      s.scale.set(1800 + rand() * 2800, 580 + rand() * 950, 1);
      this.scene.add(s);
      this.clouds.push(s);
    }

    // 2. Mid-Altitude Stratus Cloud Deck (4,400m - 6,200m)
    for (let i = 0; i < 50; i++) {
      const mat = new T.SpriteMaterial({ map: midTex || tex, transparent: true, opacity: 0.55, depthWrite: false, color: 0xeff5fb });
      const s = new T.Sprite(mat);
      s.position.set((rand() - 0.5) * 90e3, 4400 + rand() * 1800, (rand() - 0.5) * 90e3);
      s.scale.set(3600 + rand() * 5200, 800 + rand() * 1100, 1);
      this.scene.add(s);
      this.clouds.push(s);
    }

    // 3. High Stratospheric Cirrus Streaks (8,200m - 11,500m)
    for (let i = 0; i < 40; i++) {
      const mat = new T.SpriteMaterial({ map: cirrusTex || tex, transparent: true, opacity: 0.42, depthWrite: false, color: 0xeaf2ff });
      const s = new T.Sprite(mat);
      s.position.set((rand() - 0.5) * 95e3, 8200 + rand() * 3200, (rand() - 0.5) * 95e3);
      s.scale.set(6000 + rand() * 8500, 1050 + rand() * 1600, 1);
      this.scene.add(s);
      this.clouds.push(s);
    }

    // 4. Towering Cumulonimbus Cloud Canyons (Epic stacked formations from 2,000m to 5,500m)
    const towerCenters = [
      [-12000, 15000],
      [18000, -8000],
      [-5000, -22000],
      [8000, 24000],
      [-22000, -5000],
      [25000, 18000]
    ];
    for (const [tcx, tcz] of towerCenters) {
      for (let step = 0; step < 7; step++) {
        const mat = new T.SpriteMaterial({ map: tex, transparent: true, opacity: 0.78, depthWrite: false, color: 0xf6faff });
        const s = new T.Sprite(mat);
        const offsetX = (rand() - 0.5) * 1800;
        const offsetZ = (rand() - 0.5) * 1800;
        s.position.set(tcx + offsetX, 2000 + step * 520, tcz + offsetZ);
        s.scale.set(2400 + rand() * 1800, 850 + rand() * 650, 1);
        this.scene.add(s);
        this.clouds.push(s);
      }
    }
  }

  createBase() {
    const runway = new T.Mesh(new T.BoxGeometry(140, 3, 2400), new T.MeshStandardMaterial({ color: 2569787, roughness: 0.85 }));
    runway.position.copy(BASE);
    runway.position.y = 38;
    this.scene.add(runway);

    const taxiMat=new T.MeshStandardMaterial({color:0x343c40,roughness:.96});
    const markingMat=new T.MeshStandardMaterial({color:0xd1b267,roughness:.85});
    const apron=new T.Mesh(new T.BoxGeometry(330,1,1750),taxiMat);apron.position.set(BASE.x-260,39,BASE.z);apron.receiveShadow=true;this.scene.add(apron);
    const road=new T.Mesh(new T.BoxGeometry(24,1,2600),taxiMat);road.position.set(BASE.x+450,39,BASE.z);this.scene.add(road);
    for(let row=-3;row<=3;row++){
      const connector=new T.Mesh(new T.BoxGeometry(210,.8,25),taxiMat);connector.position.set(BASE.x-150,39.3,BASE.z+row*250);this.scene.add(connector);
      for(const edge of [-1,1]){const bay=new T.Mesh(new T.BoxGeometry(4,.2,70),markingMat);bay.position.set(BASE.x-280+edge*42,40,BASE.z+row*220);this.scene.add(bay);}
    }
    for(const end of [-1,1])for(const side of [-1,1])for(let i=0;i<4;i++){
      const stripe=new T.Mesh(new T.BoxGeometry(6,.2,100),new T.MeshStandardMaterial({color:0xd6deda,roughness:.9}));stripe.position.set(BASE.x+side*(18+i*10),39.6,BASE.z+end*1070);this.scene.add(stripe);
    }
    const white = new T.MeshBasicMaterial({ color: 13951444 });
    for (let i = -10; i <= 10; i++) {
      const line = new T.Mesh(new T.BoxGeometry(5, 0.5, 44), white);
      line.position.set(BASE.x, 40, BASE.z + i * 100);
      this.scene.add(line);
    }

    const greenMat = new T.MeshBasicMaterial({ color: 0x22ff44 });
    const redMat = new T.MeshBasicMaterial({ color: 0xff2222 });
    const amberMat = new T.MeshBasicMaterial({ color: 0xffbb22 });

    for (let i = -3; i <= 3; i++) {
      const gLight = new T.Mesh(new T.BoxGeometry(4, 2, 4), greenMat);
      gLight.position.set(BASE.x + i * 18, 40, BASE.z - 1180);
      this.scene.add(gLight);
      this.nightLights.push(gLight);
    }
    for (let i = -3; i <= 3; i++) {
      const rLight = new T.Mesh(new T.BoxGeometry(4, 2, 4), redMat);
      rLight.position.set(BASE.x + i * 18, 40, BASE.z + 1180);
      this.scene.add(rLight);
      this.nightLights.push(rLight);
    }
    for (let z = -1100; z <= 1100; z += 120) {
      for (let side of [-70, 70]) {
        const edge = new T.Mesh(new T.BoxGeometry(3, 2, 3), amberMat);
        edge.position.set(BASE.x + side, 39.5, BASE.z + z);
        this.scene.add(edge);
        this.nightLights.push(edge);
      }
    }

    for (let side of [-1, 1]) {
      for (let i = 0; i < 8; i++) {
        const hangar = new T.Mesh(new T.BoxGeometry(100, 35, 120), new T.MeshStandardMaterial({ color: 6911095, roughness: 0.85 }));
        hangar.position.set(BASE.x + side * 230, 55, BASE.z + (i - 4) * 220);
        hangar.castShadow = true;
        this.scene.add(hangar);
        this.buildings.push(new T.Box3().setFromObject(hangar));
      }
    }
    const tower = new T.Mesh(new T.BoxGeometry(35, 100, 35), new T.MeshStandardMaterial({ color: 9215385 }));
    tower.position.set(BASE.x + 350, 85, BASE.z);
    this.scene.add(tower);
    this.buildings.push(new T.Box3().setFromObject(tower));

    const towerBeacon = new T.Mesh(new T.SphereGeometry(6, 6, 6), redMat);
    towerBeacon.position.set(BASE.x + 350, 140, BASE.z);
    this.scene.add(towerBeacon);
    this.nightLights.push(towerBeacon);
  }

  createForwardAirbases() {
    // Builds 3D tarmac runway meshes, ALS lights, hangars, and ATC towers for all IAF Strategic Bases
    const tarmacMat = new T.MeshStandardMaterial({ color: 0x24282c, roughness: 0.85 });
    const whiteLineMat = new T.MeshBasicMaterial({ color: 0xdddddd });
    const greenMat = new T.MeshBasicMaterial({ color: 0x22ff44 });
    const redMat = new T.MeshBasicMaterial({ color: 0xff2222 });
    const amberMat = new T.MeshBasicMaterial({ color: 0xffbb22 });
    const hangarMat = new T.MeshStandardMaterial({ color: 0x5a636e, roughness: 0.8 });

    // Build runways for all IAF Bases (excluding base_runway09 which is created in createBase)
    const basesToBuild = IAF_BASES.filter((b) => b.id !== "base_runway09");

    for (const base of basesToBuild) {
      const rwElevation = base.elevation;
      const runwayY = rwElevation + 1.5;
      const length = base.runwayLength || 2200;
      const width = base.runwayWidth || 100;

      // 1. Runway Surface Strip
      const rw = new T.Mesh(new T.BoxGeometry(width, 2.5, length), tarmacMat);
      rw.position.set(base.x, runwayY, base.z);
      this.scene.add(rw);

      // 2. White Centerline Striping
      const stripeCount = Math.floor(length / 120);
      for (let i = -stripeCount; i <= stripeCount; i++) {
        const stripe = new T.Mesh(new T.BoxGeometry(4, 0.4, 45), whiteLineMat);
        stripe.position.set(base.x, runwayY + 1.3, base.z + i * 110);
        this.scene.add(stripe);
      }

      // 3. Threshold Green and Red Lights
      const halfL = length / 2;
      for (let i = -3; i <= 3; i++) {
        const gLight = new T.Mesh(new T.BoxGeometry(3, 1.5, 3), greenMat);
        gLight.position.set(base.x + i * 14, runwayY + 1.2, base.z - halfL + 20);
        this.scene.add(gLight);
        this.nightLights.push(gLight);

        const rLight = new T.Mesh(new T.BoxGeometry(3, 1.5, 3), redMat);
        rLight.position.set(base.x + i * 14, runwayY + 1.2, base.z + halfL - 20);
        this.scene.add(rLight);
        this.nightLights.push(rLight);
      }

      // 4. Amber Runway Edge Lights
      const edgeSpacing = 140;
      for (let z = -halfL + 100; z <= halfL - 100; z += edgeSpacing) {
        for (const side of [-width / 2 - 2, width / 2 + 2]) {
          const edge = new T.Mesh(new T.BoxGeometry(2.5, 1.5, 2.5), amberMat);
          edge.position.set(base.x + side, runwayY + 1.2, base.z + z);
          this.scene.add(edge);
          this.nightLights.push(edge);
        }
      }

      // 5. Hardened Aircraft Shelter Hangars (HAS)
      for (let i = -2; i <= 2; i++) {
        if (i === 0) continue;
        const hangar = new T.Mesh(new T.CylinderGeometry(32, 32, 90, 8, 1, false, 0, Math.PI), hangarMat);
        hangar.rotation.z = Math.PI / 2;
        hangar.position.set(base.x + width * 0.75 + 80, runwayY + 16, base.z + i * 180);
        this.scene.add(hangar);
        this.buildings.push(new T.Box3().setFromObject(hangar));
      }

      // 6. Airbase ATC Tower with Flashing Aviation Beacon
      const atc = new T.Mesh(new T.BoxGeometry(25, 75, 25), tarmacMat);
      atc.position.set(base.x - width * 0.75 - 75, runwayY + 37.5, base.z);
      this.scene.add(atc);
      this.buildings.push(new T.Box3().setFromObject(atc));

      const beacon = new T.Mesh(new T.SphereGeometry(5, 6, 6), redMat);
      beacon.position.set(base.x - width * 0.75 - 75, runwayY + 78, base.z);
      this.scene.add(beacon);
      this.nightLights.push(beacon);

      // 7. Rotating Air Surveillance Military Radar Tower
      const radarMast = new T.Mesh(new T.CylinderGeometry(4, 7, 50, 8), tarmacMat);
      radarMast.position.set(base.x - width * 0.75 - 75, runwayY + 25, base.z + 85);
      this.scene.add(radarMast);
      this.buildings.push(new T.Box3().setFromObject(radarMast));

      const radarDishGroup = new T.Group();
      radarDishGroup.position.set(base.x - width * 0.75 - 75, runwayY + 52, base.z + 85);
      const dishGeo = new T.CylinderGeometry(14, 14, 3, 16, 1, false, 0, Math.PI);
      dishGeo.rotateZ(Math.PI / 2);
      const dishMesh = new T.Mesh(dishGeo, hangarMat);
      dishMesh.scale.set(1, 0.45, 1.8);
      radarDishGroup.add(dishMesh);

      const hornBoom = new T.Mesh(new T.CylinderGeometry(0.5, 0.5, 9, 6), amberMat);
      hornBoom.rotation.x = Math.PI / 2;
      hornBoom.position.set(0, 0, 5.5);
      radarDishGroup.add(hornBoom);

      this.scene.add(radarDishGroup);
      this.radarDishes.push(radarDishGroup);

      const radarBeacon = new T.Mesh(new T.SphereGeometry(3, 4, 4), redMat);
      radarBeacon.position.set(base.x - width * 0.75 - 75, runwayY + 58, base.z + 85);
      this.scene.add(radarBeacon);
      this.nightLights.push(radarBeacon);
    }
  }

  createCityMarkers() {
    const cityMat = new T.MeshBasicMaterial({ color: 0xffdd88 });
    const bldgMat = new T.MeshStandardMaterial({ color: 0x445566, roughness: 0.85 });
    const glassMat = new T.MeshStandardMaterial({ color: 0x88ccdd, roughness: 0.2, metalness: 0.8 });
    const redLightMat = new T.MeshBasicMaterial({ color: 0xff2222 });
    const stoneMat = new T.MeshStandardMaterial({ color: 0xc89868, roughness: 0.95 });

    for (const city of CITIES) {
      const isMega = city.population.includes("M") && parseInt(city.population) > 5;
      const count = isMega ? 16 : 8;
      const spread = isMega ? 900 : 500;

      for (let i = 0; i < count; i++) {
        const ox = Math.sin(i * 1.7) * spread;
        const oz = Math.cos(i * 1.3) * spread;
        const bh = 65 + (i % 5) * 45 + (isMega ? 75 : 0);
        const bldg = new T.Mesh(new T.BoxGeometry(45 + (i % 3) * 25, bh, 45 + (i % 2) * 25), isMega && i % 3 === 0 ? glassMat : bldgMat);
        const groundH = terrainHeight(city.x + ox, city.z + oz);
        bldg.position.set(city.x + ox, groundH + bh / 2, city.z + oz);
        bldg.castShadow = true;
        this.scene.add(bldg);
        this.buildings.push(new T.Box3().setFromObject(bldg));

        // Aviation obstruction hazard beacons on mega city skyscrapers
        if (bh > 120) {
          const roofBeacon = new T.Mesh(new T.SphereGeometry(3.5, 4, 4), redLightMat);
          roofBeacon.position.set(city.x + ox, groundH + bh + 3, city.z + oz);
          this.scene.add(roofBeacon);
          this.nightLights.push(roofBeacon);
        }
      }

      // --- CUSTOM ICONIC GLOBE LANDMARKS ---
      if (city.id === "dubai") {
        // Burj Khalifa Needle Skyscraper (720m tall)
        const tBaseH = terrainHeight(city.x, city.z);
        const tiers = [
          { r: 70, h: 220, y: 110 },
          { r: 48, h: 200, y: 320 },
          { r: 30, h: 180, y: 510 },
          { r: 16, h: 120, y: 660 }
        ];
        for (const tier of tiers) {
          const tMesh = new T.Mesh(new T.CylinderGeometry(tier.r * 0.75, tier.r, tier.h, 8), glassMat);
          tMesh.position.set(city.x, tBaseH + tier.y, city.z);
          this.scene.add(tMesh);
          this.buildings.push(new T.Box3().setFromObject(tMesh));
        }
        // Needle Spire & Red Aviation Beacon
        const spire = new T.Mesh(new T.CylinderGeometry(2, 8, 80, 6), bldgMat);
        spire.position.set(city.x, tBaseH + 760, city.z);
        this.scene.add(spire);
        const spireBeacon = new T.Mesh(new T.SphereGeometry(8, 6, 6), redLightMat);
        spireBeacon.position.set(city.x, tBaseH + 805, city.z);
        this.scene.add(spireBeacon);
        this.nightLights.push(spireBeacon);
      } else if (city.id === "delhi") {
        // India Gate Monument Arch
        const dh = terrainHeight(city.x, city.z);
        const pillarGeo = new T.BoxGeometry(12, 42, 14);
        const lintelGeo = new T.BoxGeometry(38, 12, 16);
        const leftPillar = new T.Mesh(pillarGeo, stoneMat);
        leftPillar.position.set(city.x - 12, dh + 21, city.z);
        const rightPillar = new T.Mesh(pillarGeo, stoneMat);
        rightPillar.position.set(city.x + 12, dh + 21, city.z);
        const lintel = new T.Mesh(lintelGeo, stoneMat);
        lintel.position.set(city.x, dh + 48, city.z);
        this.scene.add(leftPillar, rightPillar, lintel);
        this.buildings.push(new T.Box3().setFromObject(lintel));
      } else if (city.id === "mumbai" || city.id === "karachi") {
        // Coastal Harbor Docks & Cargo Ship
        const pier = new T.Mesh(new T.BoxGeometry(320, 10, 45), bldgMat);
        pier.position.set(city.x + 800, 6, city.z + 400);
        const ship = new T.Mesh(new T.BoxGeometry(180, 22, 36), new T.MeshStandardMaterial({ color: 0x882222, roughness: 0.8 }));
        ship.position.set(city.x + 1100, 7, city.z + 500);
        this.scene.add(pier, ship);
      } else if (city.id === "jodhpur" || city.id === "jaisalmer") {
        // Sandstone Desert Hill Fort Bastions
        const fh = terrainHeight(city.x + 300, city.z + 300);
        const fort = new T.Mesh(new T.CylinderGeometry(60, 75, 45, 8), stoneMat);
        fort.position.set(city.x + 300, fh + 22, city.z + 300);
        this.scene.add(fort);
        this.buildings.push(new T.Box3().setFromObject(fort));
      } else if (city.id === "leh" || city.id === "thoise_afb") {
        // High-altitude Snow Radar Outpost
        const lh = terrainHeight(city.x, city.z);
        const dome = new T.Mesh(new T.SphereGeometry(35, 12, 12), new T.MeshStandardMaterial({ color: 0xddeeff, roughness: 0.4 }));
        dome.position.set(city.x, lh + 35, city.z);
        this.scene.add(dome);
        this.buildings.push(new T.Box3().setFromObject(dome));
      }

      // City Center Navigation Beacon
      const beacon = new T.Mesh(new T.SphereGeometry(city.militaryBase ? 32 : 22, 6, 6), cityMat);
      beacon.position.set(city.x, terrainHeight(city.x, city.z) + 140, city.z);
      this.scene.add(beacon);
      this.nightLights.push(beacon);
    }
  }

  getRunwayAt(x, z) {
    // Check home BASE first
    const dxBase = Math.abs(x - BASE.x);
    const dzBase = Math.abs(z - BASE.z);
    if (dxBase <= 450 && dzBase <= 2000) {
      const baseObj = IAF_BASES.find((b) => b.id === "base_runway09") || {
        id: "base_runway09",
        name: "Runway 09 Forward Operating Base",
        shortName: "Runway 09 (Home Base)",
        elevation: 38,
        runwayHeading: 0,
        runwayLength: 2400,
        runwayWidth: 140,
        squadron: "No. 1 Squadron Tigers"
      };
      return { base: baseObj, elevation: 38, dx: dxBase, dz: dzBase, heading: 0 };
    }

    for (let i = 0; i < IAF_BASES.length; i++) {
      const base = IAF_BASES[i];
      const dx = Math.abs(x - base.x);
      const dz = Math.abs(z - base.z);
      const halfW = Math.max(450, (base.runwayWidth || 100) * 3.5);
      const halfL = Math.max(1800, (base.runwayLength || 2200) * 0.85);
      if (dx <= halfW && dz <= halfL) {
        return {
          base,
          elevation: base.elevation,
          dx,
          dz,
          heading: base.runwayHeading || 0
        };
      }
    }
    return null;
  }

  getAirbaseNear(x, z, maxDist = 3800) {
    const dHome = Math.hypot(x - BASE.x, z - BASE.z);
    if (dHome <= maxDist) {
      const baseObj = IAF_BASES.find((b) => b.id === "base_runway09") || {
        id: "base_runway09",
        name: "Runway 09 Forward Operating Base",
        shortName: "Runway 09 (Home Base)",
        elevation: 38,
        runwayHeading: 0,
        runwayLength: 2400,
        runwayWidth: 140,
        squadron: "No. 1 Squadron Tigers"
      };
      return { base: baseObj, elevation: 38, distance: dHome };
    }

    let nearest = null;
    let minDist = maxDist;
    for (let i = 0; i < IAF_BASES.length; i++) {
      const base = IAF_BASES[i];
      const d = Math.hypot(x - base.x, z - base.z);
      if (d <= minDist) {
        minDist = d;
        nearest = { base, elevation: base.elevation, distance: d };
      }
    }
    return nearest;
  }

  setQuality(name) {
    if(name===this.quality)return;
    this.quality=name;const q=qualityFor(name);
    const size=q.shadow || 1024;
    this.sun.shadow.mapSize.set(size,size);
    if(this.sun.shadow.map){this.sun.shadow.map.dispose();this.sun.shadow.map=null;}
    this.clouds.forEach((cloud,i)=>{cloud.userData.qualityVisible=i<q.clouds;cloud.visible=i<q.clouds;});
    this.terrainChunks?.setQuality(name);
    this.landMat.normalScale.setScalar(name==='low'?.08:.2);
  }

  sunVisibility(camera) {
    if(this.sunDirection.y<=0 || this.weather==='storm' || this.timeOfDay==='night')return 0;
    const origin=camera.position,d=this.sunDirection;
    // Ray sample the authoritative relief and base collision bounds, at 5 Hz.
    for(let distance=50;distance<18000;distance*=1.5){
      if(origin.y+d.y*distance<terrainHeight(origin.x+d.x*distance,origin.z+d.z*distance))return 0;
    }
    this._sunRay ??=new T.Ray();this._sunRay.set(origin,d);
    if(this.buildings.some(box=>this._sunRay.intersectsBox(box)))return 0;
    return 1-this.cloudDensityAt(origin);
  }
  cloudDensityAt(position) {
    let density=0;
    for(const c of this.clouds){
      if(!c.userData.qualityVisible)continue;
      const dx=(position.x-c.position.x)/(c.scale.x*.35),dy=(position.y-c.position.y)/(c.scale.y*.36),dz=(position.z-c.position.z)/(c.scale.x*.23);
      const d=dx*dx+dy*dy+dz*dz;
      if(d<1)density=Math.max(density,(1-d)*.9);
    }
    return density;
  }
  dispose(){this.terrainChunks?.dispose();disposeObject(this.scene);this.sun.shadow.map?.dispose();}

  collision(p, isLanded = false, gearDown = false) {
    // If jet is landed or in ground rollout on a runway/tarmac, exempt from terrain collision
    if (isLanded) return false;

    // 1. Over runway envelope: exempt from collision when gear is down or above runway base
    const rw = this.getRunwayAt(p.x, p.z);
    if (rw) {
      const runwayTopY = rw.elevation + 2;
      if (p.y >= runwayTopY - 4.0) {
        return false;
      }
    }

    // 2. Over airbase perimeter: exempt from collision when gear is down or above flattened ground
    const nearBase = this.getAirbaseNear(p.x, p.z, 3800);
    if (nearBase) {
      if (p.y >= Math.max(nearBase.elevation,terrainHeight(p.x,p.z)) - 3.0) {
        return false;
      }
    }

    const h = terrainHeight(p.x, p.z);
    // 3. When landing gear is extended, protect the jet during flare and wheel touchdown anywhere
    if (gearDown && p.y >= h - 2.5) {
      return false;
    }

    // Genuine crash into steep mountain cliff, water abyss or high obstacles
    if (p.y < Math.max(3, h) - 2.5) return true;
    return this.buildings.some((b) => b.containsPoint(p));
  }

  update(dt, p, camera) {
    this.time += dt;
    this.terrainChunks.update(dt,p);
    this.water.material.uniforms.time.value = this.time;
    this.water.material.uniforms.eye.value.copy(camera.position);
    if (this.water.material.uniforms.fogColor && this.scene.fog?.color) {
      this.water.material.uniforms.fogColor.value.set(this.scene.fog.color.r, this.scene.fog.color.g, this.scene.fog.color.b);
    }
    this.sky.position.copy(camera.position);
    if (this.sky.material?.uniforms?.altitude) {
      this.sky.material.uniforms.altitude.value = Math.max(0, camera.position.y);
    }
    this.sun.position.copy(p).addScaledVector(this.sunDirection,650);
    this.sun.target.position.copy(p);
    this._visibilityTimer=(this._visibilityTimer || 0)-dt;
    if(this._visibilityTimer<=0){this._visibilityTimer=.2;this.sunVisibilityTarget=this.sunVisibility(camera);}
    this.sunVisibilityValue=T.MathUtils.damp(this.sunVisibilityValue || 0,this.sunVisibilityTarget || 0,5,dt);

    // Animated Rotating Surveillance Radar Dishes at IAF Airbases
    for (let i = 0; i < this.radarDishes.length; i++) {
      this.radarDishes[i].rotation.y += dt * 1.5;
    }

    // Dynamic Visual ILS Glideslope Approach Guidance
    if (this.ilsGroup) {
      let nearestBase = null;
      let minD = Infinity;
      for (let i = 0; i < IAF_BASES.length; i++) {
        const b = IAF_BASES[i];
        const d = Math.hypot(p.x - b.x, p.z - b.z);
        if (d < minD) {
          minD = d;
          nearestBase = b;
        }
      }
      if (nearestBase && minD < 14000) {
        this.ilsGroup.visible = true;
        const halfL = (nearestBase.runwayLength || 2200) * 0.5;
        for (let i = 0; i < this.ilsGateMeshes.length; i++) {
          const gateDist = (i + 1) * 1100;
          const gateX = nearestBase.x;
          const gateZ = nearestBase.z + halfL + gateDist;
          const gateY = nearestBase.elevation + 8 + gateDist * 0.0524;
          this.ilsGateMeshes[i].position.set(gateX, gateY, gateZ);
        }
      } else {
        this.ilsGroup.visible = false;
      }
    }

    const inside=this.cloudDensityAt(camera.position);
    for(const c of this.clouds){
      if(!c.userData.qualityVisible)continue;
      const distance=c.position.distanceTo(camera.position);
      const farFade=1-T.MathUtils.smoothstep(distance,52000,80000);
      const nearFade=T.MathUtils.smoothstep(distance,100,Math.max(220,c.scale.y*.5));
      c.material.opacity=(c.userData.baseOpacity || .65)*farFade*nearFade;
      c.visible=farFade>0 && nearFade>.01;
    }
    const targetDensity=T.MathUtils.lerp(this.baseFogDensity || 14e-6,55e-5,inside);
    this.scene.fog.density = T.MathUtils.lerp(this.scene.fog.density, targetDensity, dt * 3.5);
  }
}

export {
  BASE,
  World,
  terrainHeight
};
