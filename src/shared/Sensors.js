import { segmentOccludedByAegis } from './AegisLandmarks.js';
/** F27: gameplay sensor rules. No renderer/quality setting participates in detection. */
export const SENSOR_RULES = Object.freeze({ version: 1, visualRange: 9500, infraredRange: 6200, radarRange: 15000, maxSamples: 64, terrainSpacing: 240, memorySeconds: 3, lockCloudDepth: 850 });
const finitePoint = p => p && ['x', 'y', 'z'].every(k => Number.isFinite(p[k]));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function analyticCloudDensity(point, clouds = []) {
  let density = 0;
  for (let i = 0; i < Math.min(32, clouds.length); i++) {
    const cloud = clouds[i];
    const d = ((point.x - cloud.x) / Math.max(1, cloud.radiusX || 1000)) ** 2 + ((point.y - cloud.y) / Math.max(1, cloud.radiusY || 300)) ** 2 + ((point.z - cloud.z) / Math.max(1, cloud.radiusZ || 1000)) ** 2;
    if (d < 1) density += (1 - d) * clamp(cloud.density ?? 1, 0, 2);
  }
  return clamp(density, 0, 2);
}
export function evaluateDetection(observer, target, { terrainHeight = () => -1000, cloudDensityAt, clouds = [], weather = 'clear', terrainClearance = 12 } = {}) {
  const a = observer?.position || observer, b = target?.position || target;
  const absent = { detected: false, visual: false, infrared: false, radar: false, lockable: false, terrainBlocked: false, cloudDepth: 0, distance: Infinity, reason: 'invalid' };
  if (!finitePoint(a) || !finitePoint(b) || observer?.alive === false || target?.alive === false || target?.hp === 0) return absent;
  const distance = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  const health = clamp(observer?.systems?.sensor ?? 1, 0, 1), radarRange = SENSOR_RULES.radarRange * (.35 + .65 * health);
  if (distance > SENSOR_RULES.radarRange) return { ...absent, distance, reason: 'range' };
  const samples = clamp(Math.ceil(distance / SENSOR_RULES.terrainSpacing), 2, SENSOR_RULES.maxSamples);
  let blocked = segmentOccludedByAegis(a,b), cloudDepth = 0;
  if(blocked)return {...absent,distance,terrainBlocked:true,reason:'structure'};
  for (let i = 1; i < samples; i++) {
    const t = i / samples, point = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
    const ground = terrainHeight(point.x, point.z);
    if (Number.isFinite(ground) && point.y <= Math.max(0, ground) + terrainClearance) { blocked = true; break; }
    const density = cloudDensityAt ? cloudDensityAt(point, { weather }) : analyticCloudDensity(point, clouds);
    cloudDepth += clamp(Number(density) || 0, 0, 2) * distance / samples;
  }
  const optical = Math.exp(-cloudDepth / 700) * (weather === 'storm' ? .7 : 1);
  const visual = !blocked && distance <= SENSOR_RULES.visualRange * Math.max(.15, optical);
  const infrared = !blocked && distance <= SENSOR_RULES.infraredRange * (.5 + .5 * health) && cloudDepth < SENSOR_RULES.lockCloudDepth;
  // Ordinary clouds reduce optical/IR acquisition; our simple radar remains cloud-penetrating.
  const radar = !blocked && distance <= radarRange;
  return { detected: visual || infrared || radar, visual, infrared, radar, lockable: infrared, terrainBlocked: blocked, cloudDepth, distance,
    reason: blocked ? 'terrain' : visual ? 'visual' : infrared ? 'infrared' : radar ? 'radar' : 'range' };
}
export class ContactTracker {
  constructor({ memorySeconds = SENSOR_RULES.memorySeconds, maxContacts = 40 } = {}) { this.contacts = new Map(); this.memorySeconds = clamp(memorySeconds, 0, 10); this.maxContacts = clamp(maxContacts, 1, 64); }
  update(observer, entities, now, environment = {}) {
    const present = new Set();
    for (const target of entities.slice(0, this.maxContacts)) {
      const id = target.missionId || target.battleId || target.id;
      if (id === undefined || id === null || target === observer) continue;
      present.add(id);
      if (target.alive === false || target.hp === 0) { this.contacts.delete(id); continue; }
      const detection = evaluateDetection(observer, target, environment), previous = this.contacts.get(id);
      const friendly = target.team === observer.team || target.team === 'ally' && observer.team === 'player' || target.team === 'player' && observer.team === 'ally';
      if (detection.detected) this.contacts.set(id, { id, entityId: target.id, position: { x: target.position.x, y: target.position.y, z: target.position.z }, relation: friendly ? 'friend' : detection.visual || target.identified ? 'enemy' : 'unknown',
        kind: 'contact', detected: true, remembered: false, lastSeen: now, label: detection.visual || friendly ? target.callsign || 'CONTACT' : 'RADAR CONTACT', ...detection });
      else if (previous && now - previous.lastSeen <= this.memorySeconds) this.contacts.set(id, { ...previous, detected: false, remembered: true, lockable: false, visual: false, infrared: false, radar: false });
      else this.contacts.delete(id);
    }
    for (const [id, contact] of this.contacts) if (!present.has(id) || now - contact.lastSeen > this.memorySeconds) this.contacts.delete(id);
    return [...this.contacts.values()];
  }
  clear() { this.contacts.clear(); }
  snapshot() { return [...this.contacts.values()].map(contact => ({ ...contact, position: { ...contact.position } })); }
}
