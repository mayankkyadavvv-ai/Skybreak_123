import * as T from "three";
import { runwayLocal, onRunway } from "./Landing.js";
import { rng } from "./math.js";
import { create3DBorderBeacons, CITIES, IAF_BASES } from "./GeoWorld.js";
import { createGeoTexture } from "./GeoTexture.js";

const BASE = new T.Vector3(-4200, 45, -12500);
const _sunOffset = new T.Vector3(-350, 500, -300);

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
    const q=runwayLocal(ab,{x,z});
    const edge=Math.max(Math.abs(q.x)-ab.runwayWidth/2-220,Math.abs(q.z)-ab.runwayLength/2-250,0);
    if(edge<600) h=T.MathUtils.lerp(ab.elevation,h,T.MathUtils.smoothstep(edge,0,600));
  }

  // Flatten Practice flight spawn area (x: ~0, z: ~5200)
  const ps = Math.hypot(x / 1400, (z - 5200) / 1400);
  if (ps < 1.5) h = T.MathUtils.lerp(55, h, T.MathUtils.smoothstep(ps, 0.8, 1.5));

  // Coastal / Arabian sea gradient in south-west
  if (z > 38000 && x < 4000) {
    const oceanDepth = -40 - (z - 38000) * 0.015 - Math.max(0, -x) * 0.008;
    h = Math.min(h, oceanDepth);
  }

  for (const base of IAF_BASES) if (onRunway(base,{x,z},30)) return base.elevation;
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
        const u = (x / size) * Math.PI * 8;
        const v = (y / size) * Math.PI * 8;
        const n1 = Math.sin(u * 1.5) * Math.cos(v * 1.5);
        const n2 = Math.sin(u * 3.7 + n1 * 1.8) * Math.cos(v * 3.3);
        const n3 = Math.sin(u * 8.2 + v * 5.1) * 0.4;
        heights[y * size + x] = n1 * 0.5 + n2 * 0.35 + n3 * 0.15;
      }
    }

    const bumpScale = 3.5;
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
    tex.repeat.set(42, 42);
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
    scene.fog = new T.FogExp2(0x8db4c3, 39e-6);

    this.sun = new T.DirectionalLight(0xfffaf0, 3.8);
    this.sun.position.set(-7e3, 6e3, -1e4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -100, right: 100, top: 100, bottom: -100, near: 1, far: 1200 });
    this.sun.shadow.bias = -4e-4;

    this.hemi = new T.HemisphereLight(0xbaddf0, 0x526b3f, 2.0);
    scene.add(this.sun, this.sun.target, this.hemi);

    // Sky Dome with starfield and atmospheric scattering
    const skyGeo = new T.SphereGeometry(85e3, 28, 18);
    const skyMat = new T.ShaderMaterial({
      side: T.BackSide,
      depthWrite: false,
      uniforms: {
        sunDir: { value: new T.Vector3(-0.6, 0.35, -0.7).normalize() },
        skyTop: { value: new T.Vector3(0.12, 0.31, 0.51) },
        skyBottom: { value: new T.Vector3(0.66, 0.77, 0.82) },
        sunGlow: { value: new T.Vector3(1.0, 0.72, 0.43) },
        isNight: { value: 0.0 }
      },
      vertexShader: `varying vec3 vPos;
      void main(){
        vPos=position;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
      }`,
      fragmentShader: `varying vec3 vPos;
      uniform vec3 sunDir;
      uniform vec3 skyTop;
      uniform vec3 skyBottom;
      uniform vec3 sunGlow;
      uniform float isNight;
      void main(){
        vec3 d=normalize(vPos);
        float h=max(d.y,0.0);
        vec3 c=mix(skyBottom,skyTop,pow(h,0.48));
        float s=max(dot(d,sunDir),0.0);
        c+=sunGlow*pow(s,18.)*.25;
        c+=vec3(1.,.9,.8)*pow(s,1500.)*3.;
        if (isNight > 0.5 && d.y > 0.05) {
          float stars = fract(sin(dot(floor(d * 500.0), vec3(12.9898, 78.233, 45.164))) * 43758.5453);
          if (stars > 0.985) c += vec3(0.95, 0.98, 1.0) * pow((stars - 0.985) / 0.015, 2.0);
        }
        gl_FragColor=vec4(c,1.);
      }`
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
      normalScale: new T.Vector2(0.85, 0.85),
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.04,
      flatShading: false
    });
    this.terrain = new T.Mesh(this.terrainGeometry(180), this.landMat);
    this.terrain.receiveShadow = true;
    scene.add(this.terrain);

    // Realistic Ocean Water Shader with Fresnel reflections, sun glint & wave crest foam
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
      vertexShader: `varying vec3 wp;
      void main(){
        wp=(modelMatrix*vec4(position,1.)).xyz;
        gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);
      }`,
      fragmentShader: `varying vec3 wp;
      uniform float time;
      uniform vec3 eye;
      uniform vec3 sunDir;
      uniform vec3 waterDeep;
      uniform vec3 waterShallow;
      uniform vec3 waterSun;
      uniform vec3 fogColor;
      void main(){
        float dist = length(eye - wp);
        float distFade = clamp(1.0 - dist / 55000.0, 0.0, 1.0);
        
        // Multi-octave harmonic wave simulation
        float w1 = sin(wp.x * 0.024 + time * 0.72) * cos(wp.z * 0.028 - time * 0.54);
        float w2 = sin(wp.x * 0.012 - time * 0.32 + wp.z * 0.008) * cos(wp.z * 0.016 + time * 0.42);
        float w3 = sin(wp.x * 0.065 + wp.z * 0.055 + time * 1.35) * 0.35;
        
        // Dynamic surface normal
        vec3 n = normalize(vec3((w1 * 0.04 + w2 * 0.025 + w3 * 0.06), 1.0, (cos(wp.z * 0.02 + time * 0.6) * 0.05 + w3 * 0.05) * distFade));
        vec3 v = normalize(eye - wp);
        
        // Fresnel sky/depth reflection
        float fresnel = pow(1.0 - max(dot(n, v), 0.0), 3.5);
        
        // Specular sun highlight (sun glint)
        vec3 refl = reflect(-sunDir, n);
        float spec = pow(max(dot(refl, v), 0.0), 220.0);
        float broadSpec = pow(max(dot(refl, v), 0.0), 24.0) * 0.35;
        
        vec3 c = mix(waterDeep, waterShallow, fresnel * 0.75);
        c += waterSun * (spec * 1.85 + broadSpec);
        
        // Ocean foam on wave crests
        float foam = pow(max(0.0, (w1 + w2 * 1.2) * 1.35 - 0.2), 2.5) * 2.4 * distFade;
        c += vec3(0.92, 0.96, 1.0) * foam;
        
        // Horizon fog blending
        float fogFactor = smoothstep(22000.0, 68000.0, dist);
        c = mix(c, fogColor, fogFactor);
        
        gl_FragColor = vec4(c, 1.0);
      }`
    });
    this.water = new T.Mesh(new T.PlaneGeometry(16e4, 16e4), waterMat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = 1;
    scene.add(this.water);

    this.createClouds();
    this.createBase();
    this.createForwardAirbases();
    this.createCityMarkers();
    this.borderBeacons = create3DBorderBeacons(scene);

    this.quality = null;
  }

  terrainGeometry(n) {
    const geo = new T.PlaneGeometry(2e5, 2e5, n, n);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position,
      colors = [],
      uvs = [];
    const c = new T.Color();

    const minX = -85000,
      maxX = 45000,
      minZ = -75000,
      maxZ = 55000;

    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        z = p.getZ(i),
        h = terrainHeight(x, z);
      p.setY(i, h);

      // Geographic UV alignment with real globe projection
      const u = (x - minX) / (maxX - minX);
      const v = (z - minZ) / (maxZ - minZ);
      uvs.push(u, 1-v);

      // Real Geographical Multi-Biome Coloration
      if (h < 5) {
        c.setHex(0x284852); // Submerged coastal shallows
      } else if (h < 35) {
        c.setHex(0xcab485); // Coastal sandy beaches / estuaries
      } else if (z < -42000 || h > 2400) {
        // High Himalayan snow peaks & Karakoram glaciers
        const snowF = Math.min(1.0, Math.max(0, (h - 2200) / 1200));
        c.setHex(0x606972).lerp(new T.Color(0xf2f7fc), Math.max(0.2, snowF));
      } else if (z < -30000) {
        // Himalayan foothills / pine valleys (Kashmir, Himachal)
        c.setHex(0x3a5640);
      } else if (x > -14000 && x < 20000 && z > -12000 && z < 26000) {
        // Thar & Sindh Desert golden sand dunes
        c.setHex(0xd6b376);
      } else if (x < -20000 && z > -35000) {
        // Balochistan arid plateau & Makran hills
        c.setHex(0xa88d6c);
      } else {
        // Fertile agricultural river plains (Punjab, Haryana, Delhi)
        c.setHex(0x56784a);
      }
      c.multiplyScalar(0.92 + 0.08 * Math.sin(x * 0.015) * Math.cos(z * 0.018));
      colors.push(c.r, c.g, c.b);
    }

    geo.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
    geo.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }

  createClouds() {
    let tex = null;
    let cirrusTex = null;
    try {
      if (typeof document !== "undefined") {
        const cv = document.createElement("canvas");
        cv.width = cv.height = 128;
        const c = cv.getContext("2d"),
          g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0, "rgba(250,248,238,.75)");
        g.addColorStop(0.35, "rgba(242,243,234,.48)");
        g.addColorStop(1, "rgba(235,241,242,0)");
        c.fillStyle = g;
        c.fillRect(0, 0, 128, 128);
        tex = new T.CanvasTexture(cv);

        const ccv = document.createElement("canvas");
        ccv.width = 256;
        ccv.height = 128;
        const cc = ccv.getContext("2d");
        const cg = cc.createLinearGradient(0, 0, 256, 128);
        cg.addColorStop(0, "rgba(255,255,255,0)");
        cg.addColorStop(0.3, "rgba(245,250,255,0.32)");
        cg.addColorStop(0.6, "rgba(250,252,255,0.45)");
        cg.addColorStop(0.9, "rgba(240,248,255,0.18)");
        cg.addColorStop(1, "rgba(255,255,255,0)");
        cc.fillStyle = cg;
        cc.fillRect(0, 0, 256, 128);
        cirrusTex = new T.CanvasTexture(ccv);
      }
    } catch {}

    const rand = rng(29);
    // Lower Cumulus Deck (2,600m - 4,000m)
    for (let i = 0; i < 120; i++) {
      const mat = new T.SpriteMaterial({ map: tex, transparent: true, opacity: 0.66, depthWrite: false, color: 15199985 });
      const s = new T.Sprite(mat);
      s.position.set((rand() - 0.5) * 65e3, 2600 + rand() * 1400, (rand() - 0.5) * 65e3);
      s.scale.set(1200 + rand() * 2400, 380 + rand() * 600, 1);
      this.scene.add(s);
      this.clouds.push(s);
    }

    // High Stratospheric Cirrus Deck (7,800m - 9,600m)
    for (let i = 0; i < 36; i++) {
      const mat = new T.SpriteMaterial({ map: cirrusTex || tex, transparent: true, opacity: 0.35, depthWrite: false, color: 0xeaf2ff });
      const s = new T.Sprite(mat);
      s.position.set((rand() - 0.5) * 80e3, 7800 + rand() * 1800, (rand() - 0.5) * 80e3);
      s.scale.set(4500 + rand() * 6000, 800 + rand() * 1200, 1);
      this.scene.add(s);
      this.clouds.push(s);
    }
  }

  createBase() {
    const runway = new T.Mesh(new T.BoxGeometry(140, 3, 2400), new T.MeshStandardMaterial({ color: 2569787, roughness: 0.85 }));
    runway.position.copy(BASE);
    runway.position.y = 38;
    this.scene.add(runway);

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
      const stripeCount = Math.floor((length / 2 - 100) / 110);
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
    }
  }

  createCityMarkers() {
    const cityMat = new T.MeshBasicMaterial({ color: 0xffdd88 });
    const bldgMat = new T.MeshStandardMaterial({ color: 0x445566, roughness: 0.85 });
    const glassMat = new T.MeshStandardMaterial({ color: 0x88ccdd, roughness: 0.2, metalness: 0.8 });
    const redLightMat = new T.MeshBasicMaterial({ color: 0xff2222 });
    const stoneMat = new T.MeshStandardMaterial({ color: 0xc89868, roughness: 0.95 });

    for (const city of CITIES) {
      // Airfield structures are built separately: never spawn city towers on runways.
      if (IAF_BASES.some(b=>Math.hypot(b.x-city.x,b.z-city.z)<1200)) continue;
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

  getRunwayAt(x,z) {
    for(const base of IAF_BASES) if(onRunway(base,{x,z})) {
      const q=runwayLocal(base,{x,z});
      return {base,elevation:base.elevation,dx:Math.abs(q.x),dz:Math.abs(q.z),heading:base.runwayHeading||0};
    }
    return null;
  }

  setQuality(q, renderer) {
    if (q === this.quality) return;
    this.quality = q;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === "high" ? 1.5 : q === "medium" ? 1.25 : 1));
    renderer.shadowMap.enabled = q !== "low";
    const size = q === "high" ? 2048 : 1024;
    this.sun.shadow.mapSize.set(size, size);
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
    this.clouds.forEach((c, i) => (c.visible = q === "high" || i < (q === "low" ? 35 : 90)));
    this.terrain.geometry.dispose();
    this.terrain.geometry = this.terrainGeometry(q === "high" ? 220 : q === "low" ? 100 : 180);
    if (this.landMat?.normalScale) {
      this.landMat.normalScale.set(q === "low" ? 0.35 : 0.85, q === "low" ? 0.35 : 0.85);
    }
  }

  collision(p, isLanded = false, gearDown = false) {
    const rw = this.getRunwayAt(p.x, p.z);
    if (rw && isLanded && gearDown) {
      const runwayTopY = rw.elevation + 2;
      if (p.y >= runwayTopY - 1.2) {
        return false;
      }
    }
    const h = terrainHeight(p.x, p.z);
    if (p.y < Math.max(3, h) + 3) return true;
    return this.buildings.some((b) => b.containsPoint(p));
  }

  update(dt, p, camera) {
    this.time += dt;
    this.water.material.uniforms.time.value = this.time;
    this.water.material.uniforms.eye.value.copy(camera.position);
    if (this.water.material.uniforms.fogColor && this.scene.fog?.color) {
      this.water.material.uniforms.fogColor.value.set(this.scene.fog.color.r, this.scene.fog.color.g, this.scene.fog.color.b);
    }
    this.sky.position.copy(camera.position);
    this.sun.position.copy(p).add(_sunOffset);
    this.sun.target.position.copy(p);

    let inside = false;
    for (const c of this.clouds) {
      if (c.visible && Math.abs(p.y - c.position.y) < 160 && Math.hypot(p.x - c.position.x, p.z - c.position.z) < c.scale.x * 0.2) {
        inside = true;
        break;
      }
    }
    const targetDensity = inside ? 55e-5 : 39e-6;
    this.scene.fog.density = T.MathUtils.lerp(this.scene.fog.density, targetDensity, dt * 3.5);
  }
}

export {
  BASE,
  World,
  terrainHeight
};
