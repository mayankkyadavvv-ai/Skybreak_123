import { createMissionPreset } from './MissionGenerator.js';
export const CAMPAIGN_VERSION = 1;
export const CAMPAIGN_SECTORS = Object.freeze([
  { id: 'strait', name: 'Aegis Strait', template: 'escort', location: 'aegis', x: 24, y: 75, consequence: 'A healthy transport reveals a safer ridge route and removes one reinforcement.' },
  { id: 'ridge', name: 'Talon Ridge', template: 'intercept', location: 'ridge', x: 47, y: 23, consequence: 'Stopping the raid removes two defenders from the harbour operation.' },
  { id: 'harbour', name: 'Sable Harbour', template: 'strike-support', location: 'coast', x: 78, y: 62, consequence: 'Successful strike secures the three-sector corridor.' },
]);
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9:_-]{1,100}$/.test(value);
export function createCampaign({ ownerId = 'local', seed = 1, id = `campaign-${seed >>> 0}` } = {}) {
  return { version: CAMPAIGN_VERSION, id: safeId(id) ? id : `campaign-${seed >>> 0}`, ownerId: safeId(ownerId) ? ownerId : 'local', seed: seed >>> 0, revision: 0,
    sectors: Object.fromEntries(CAMPAIGN_SECTORS.map(sector => [sector.id, { status: sector.id === 'strait' ? 'available' : 'locked', attempts: 0, outcome: null }])), applied: [], completed: false };
}
export function normalizeCampaign(value, fallback = {}) {
  if (!value || typeof value !== 'object' || value.version !== CAMPAIGN_VERSION) return { value: createCampaign(fallback), recovered: !!value, backup: value || null };
  const result = createCampaign({ ...fallback, ownerId: value.ownerId, seed: value.seed, id: value.id });
  result.revision = Number.isSafeInteger(value.revision) ? Math.max(0, value.revision) : 0;
  for (const descriptor of CAMPAIGN_SECTORS) {
    const sector = value.sectors?.[descriptor.id];
    if (!sector) continue;
    result.sectors[descriptor.id].attempts = Number.isSafeInteger(sector.attempts) ? Math.max(0, Math.min(10000, sector.attempts)) : 0;
    if (sector.status === 'secured') { result.sectors[descriptor.id].status = 'secured'; result.sectors[descriptor.id].outcome = { protectedHealth: Math.max(0, Math.min(1, Number(sector.outcome?.protectedHealth) || 0)), elapsed: Math.max(0, Math.min(3600, Number(sector.outcome?.elapsed) || 0)) }; }
  }
  // Never unlock a sector from a corrupt saved status without its predecessor's result.
  for (let i = 1; i < CAMPAIGN_SECTORS.length; i++) {
    const id = CAMPAIGN_SECTORS[i].id, prev = CAMPAIGN_SECTORS[i - 1].id;
    if (result.sectors[prev].status !== 'secured') result.sectors[id].status = 'locked';
    else if (result.sectors[id].status !== 'secured') result.sectors[id].status = 'available';
  }
  result.completed = CAMPAIGN_SECTORS.every(sector => result.sectors[sector.id].status === 'secured');
  result.applied = Array.isArray(value.applied) ? [...new Set(value.applied.filter(safeId))].slice(-128) : [];
  return { value: result, recovered: false, backup: null };
}
export function campaignMission(campaign, sectorId, difficulty = 'easy') {
  const current = normalizeCampaign(campaign).value, index = CAMPAIGN_SECTORS.findIndex(sector => sector.id === sectorId), descriptor = CAMPAIGN_SECTORS[index];
  if (!descriptor || current.sectors[sectorId].status === 'locked') return { ok: false, error: 'Complete the preceding sector first.' };
  const safeRoute = current.sectors.strait.status === 'secured' && current.sectors.strait.outcome?.protectedHealth >= .5;
  const ridgeSecured = current.sectors.ridge.status === 'secured';
  return { ok: true, preset: createMissionPreset({ template: descriptor.template, location: descriptor.location, difficulty, pacing: 'fixed',
    seed: (current.seed + index * 7919) >>> 0, enemyBudget: index === 2 && ridgeSecured ? 4 : index === 1 && safeRoute ? 5 : 6, routeVariant: index === 1 && safeRoute ? 1 : 0 }),
    consequences: [index === 1 && safeRoute ? 'Safer approach route; one fewer reinforcement.' : '', index === 2 && ridgeSecured ? 'Ridge raid stopped; two fewer harbour defenders.' : ''].filter(Boolean) };
}
export function applyCampaignResult(campaign, { ownerId, campaignId, sectorId, instanceId, result } = {}) {
  const current = normalizeCampaign(campaign).value;
  if (ownerId !== current.ownerId || campaignId !== current.id) return { ok: false, error: 'Campaign belongs to another party.', value: current };
  if (!safeId(instanceId) || !result || typeof result.success !== 'boolean') return { ok: false, error: 'Invalid campaign result.', value: current };
  const sector = current.sectors[sectorId], descriptor = CAMPAIGN_SECTORS.find(s => s.id === sectorId);
  if (!sector || sector.status === 'locked' || result.template !== descriptor.template) return { ok: false, error: 'Result does not match the active sector.', value: current };
  if (current.applied.includes(instanceId) || sector.status === 'secured') return { ok: true, applied: false, value: current };
  current.applied.push(instanceId); current.applied = current.applied.slice(-128); sector.attempts++; current.revision++;
  if (result.success) { sector.status = 'secured'; sector.outcome = { protectedHealth: Math.max(0, Math.min(1, result.protectedHealth || 0)), elapsed: Math.max(0, Math.min(3600, result.elapsed || 0)) }; }
  return { ok: true, applied: true, value: normalizeCampaign(current).value };
}
export function loadCampaign(storage, key = 'skybreak.campaign.v1') {
  try { const raw = storage?.getItem(key); const parsed = raw ? JSON.parse(raw) : null, normalized = normalizeCampaign(parsed); if (normalized.recovered) { try { storage?.setItem(`${key}.backup`, raw); } catch {} } return { ...normalized, storageAvailable: !!storage }; }
  catch { return { value: createCampaign(), recovered: true, storageAvailable: false }; }
}
export function saveCampaign(storage, value, key = 'skybreak.campaign.v1') { try { storage?.setItem(key, JSON.stringify(normalizeCampaign(value).value)); return !!storage; } catch { return false; } }
