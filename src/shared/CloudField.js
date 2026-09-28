// Shared, seeded cloud volumes. No renderer, browser, quality or clock dependencies.
// Cosmetic lobes may be culled; visibility and fog always query this full field.
const random = (() => { let s = 290419; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; })();
const field = [];
function volume(x, y, z, rx, ry, rz, layer, density = .86) {
  field.push(Object.freeze({ id: `cloud-${field.length}`, x, y, z, radiusX: rx, radiusY: ry, radiusZ: rz, layer, density }));
}
for (let i = 0; i < 32; i++) volume((random()-.5)*78000, 2300+random()*1050, (random()-.5)*78000,
  1300+random()*1500, 310+random()*330, 1000+random()*1100, 'cumulus');
for (let i = 0; i < 12; i++) volume((random()-.5)*85000, 4700+random()*1000, (random()-.5)*85000,
  3000+random()*2800, 280+random()*270, 1900+random()*1400, 'stratus', .58);
for (let i = 0; i < 8; i++) volume((random()-.5)*90000, 8500+random()*2000, (random()-.5)*90000,
  4800+random()*2800, 190+random()*210, 1900+random()*1500, 'cirrus', .25);
for (const [x,z] of [[-12000,15000],[18000,-8000],[-5000,-22000],[8000,24000],[-22000,-5000],[25000,18000]]) {
  volume(x, 2800, z, 2200, 950, 1750, 'tower', .92);
  volume(x+420, 4350, z-200, 1700, 950, 1500, 'tower', .9);
}
// Aegis banks give the coastal sortie a layered horizon and reachable cloud cover.
for (const [x,z,y] of [[-22000,47500,2750],[-7000,50500,3100],[-15000,42500,2500],[-10000,45000,5300]]) {
  volume(x,y,z,2400,620,1900,'cumulus');
}
export const CLOUD_VOLUMES = Object.freeze(field);

export function cloudDensityAt(position, { weather = 'clear', volumes = CLOUD_VOLUMES } = {}) {
  if (!position || !Number.isFinite(position.x + position.y + position.z)) return 0;
  let density = 0;
  for (const c of volumes) {
    const cx=c.x??c.position?.x,cy=c.y??c.position?.y,cz=c.z??c.position?.z;
    const rx=c.radiusX??c.scale?.x*.35,ry=c.radiusY??c.scale?.y*.36,rz=c.radiusZ??c.scale?.x*.23;
    const dx=(position.x-cx)/rx, dy=(position.y-cy)/ry, dz=(position.z-cz)/rz;
    const d=dx*dx+dy*dy+dz*dz;
    if(d<1) {
      const edge=1-d;
      density=Math.max(density,edge*edge*(3-2*edge)*(c.density??.9));
    }
  }
  return Math.min(.98,density*(weather==='storm'?1.15:weather==='cloudy'?1.05:1));
}

export function cloudShadowAt(x,z) {
  let shade=0;
  for(const c of CLOUD_VOLUMES) {
    if(c.layer==='cirrus')continue;
    const dx=(x-c.x)/(c.radiusX*1.2),dz=(z-c.z)/(c.radiusZ*1.2),d=dx*dx+dz*dz;
    if(d<1)shade=Math.max(shade,(1-d)*c.density);
  }
  return shade;
}
