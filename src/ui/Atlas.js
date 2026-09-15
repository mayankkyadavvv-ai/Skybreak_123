import countries from '../data/countries.json' with { type: 'json' };
import { CITIES } from '../game/GeoWorld.js';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const xy=(lon,lat)=>[lon+180,90-lat];
export function countryPath(geometry) {
  const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  return polygons.map(p=>p.map(r=>r.map(([lon,lat],i)=>`${i?'L':'M'}${xy(lon,lat).map(n=>n.toFixed(3)).join(',')}`).join('')+'Z').join('')).join('');
}
export function atlasMarkup() {
 return `<div class="atlas-toolbar"><button data-atlas-view="region">South Asia & Gulf</button><button data-atlas-view="world">Whole world</button><span>GEOGRAPHIC ATLAS · WGS84</span></div>
 <div class="atlas-stage"><svg id="earth-atlas" viewBox="228 47 48 33" role="img" aria-label="Geographic map of countries and city locations">
 <rect width="360" height="180" fill="#071c2b"/>
 ${Array.from({length:13},(_,i)=>`<path d="M${i*30},0V180" class="atlas-grid"/>`).join('')}
 ${Array.from({length:7},(_,i)=>`<path d="M0,${i*30}H360" class="atlas-grid"/>`).join('')}
 ${countries.map(c=>`<path d="${countryPath(c.geometry)}" class="atlas-country"><title>${esc(c.name)}</title></path>`).join('')}
 ${CITIES.map(c=>{const [x,y]=xy(c.lon,c.lat);return `<g class="atlas-city" data-city-id="${esc(c.id)}"><circle cx="${x}" cy="${y}" r=".14"/><title>${esc(c.name)} · ${c.lat.toFixed(4)}°, ${c.lon.toFixed(4)}°</title></g>`;}).join('')}
 </svg></div><div class="atlas-readout" id="atlas-readout">Choose a city below to locate its coordinates.</div>
 <label class="setting"><span>Locate city</span><select id="atlas-city-select"><option value="">Choose a city</option>${CITIES.map(c=>`<option value="${esc(c.id)}">${esc(c.name)} · ${esc(c.country)}</option>`).join('')}</select></label>
 <p class="panel-footnote">Country outlines: Natural Earth, 1:110m, de facto boundaries. City coordinates: project database. This geographic overview is separate from the compressed flight terrain; it is not satellite imagery or an operational navigation chart.</p>`;
}
export function attachAtlas(root) {
 const svg=root.querySelector('#earth-atlas');
 root.querySelectorAll('[data-atlas-view]').forEach(b=>b.onclick=()=>svg.setAttribute('viewBox',b.dataset.atlasView==='world'?'0 0 360 180':'228 47 48 33'));
 const locate=id=>{
  const city=CITIES.find(c=>c.id===id);if(!city)return;
  const [x,y]=xy(city.lon,city.lat);svg.setAttribute('viewBox',`${x-9} ${y-6} 18 12`);
  root.querySelector('#atlas-readout').textContent=`${city.name} · ${city.state} · ${city.country} · ${city.lat.toFixed(4)}° N, ${city.lon.toFixed(4)}° E`;
  root.querySelectorAll('.atlas-city').forEach(g=>g.classList.toggle('selected',g.dataset.cityId===id));
 };
 root.querySelector('#atlas-city-select').onchange=e=>locate(e.target.value);
 root.querySelectorAll('[data-city-id]').forEach(g=>g.onclick=()=>locate(g.dataset.cityId));
}
