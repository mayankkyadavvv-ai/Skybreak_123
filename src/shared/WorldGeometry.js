import { IAF_BASES } from '../game/GeoWorld.js';
export { IAF_BASES as RUNWAYS };
export const BASE = Object.freeze({x:-4200,y:45,z:-12500});
const lerp=(a,b,t)=>a+(b-a)*t;
const smoothstep=(x,a,b)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export function runwayLocal(base,p){const h=(base.runwayHeading||0)*Math.PI/180,dx=p.x-base.x,dz=p.z-base.z;return {x:dx*Math.cos(h)+dz*Math.sin(h),z:-dx*Math.sin(h)+dz*Math.cos(h)};}
export function onRunway(base,p,margin=0){const q=runwayLocal(base,p);return Math.abs(q.x)<=base.runwayWidth/2+margin&&Math.abs(q.z)<=base.runwayLength/2+margin;}
// Real Topographical Relief Features
export const TERRAIN_PEAKS = [
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

export function terrainHeight(x, z) {
  let h = -160;
  for (const [px, pz, ph, sx, sz] of TERRAIN_PEAKS) {
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
  if (b < 1.5) h = lerp(38, h, smoothstep(b, 0.85, 1.5));

  // Flatten forward operating IAF military airbase runways
  for (let i = 0; i < IAF_BASES.length; i++) {
    const ab = IAF_BASES[i];
    const q = runwayLocal(ab, {x, z});
    const edge = Math.max(Math.abs(q.x) - ab.runwayWidth / 2 - 220, Math.abs(q.z) - ab.runwayLength / 2 - 250, 0);
    if (edge < 600) h = lerp(ab.elevation, h, smoothstep(edge, 0, 600));
  }

  // Flatten Practice flight spawn area (x: ~0, z: ~5200)
  const ps = Math.hypot(x / 1400, (z - 5200) / 1400);
  if (ps < 1.5) h = lerp(55, h, smoothstep(ps, 0.8, 1.5));

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

