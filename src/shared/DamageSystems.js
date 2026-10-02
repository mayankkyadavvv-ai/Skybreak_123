/** F28 systems normalized to 0..1. Only the simulation authority applies damage/repairs. */
export const DAMAGE_SYSTEM_VERSION = 1;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
export function createDamageState(value = {}) { return { version: DAMAGE_SYSTEM_VERSION, engine: Number.isFinite(value.engine) ? clamp(value.engine, 0, 1) : 1,
  wing: Number.isFinite(value.wing) ? clamp(value.wing, 0, 1) : 1, sensor: Number.isFinite(value.sensor) ? clamp(value.sensor, 0, 1) : 1,
  revision: Number.isSafeInteger(value.revision) && value.revision >= 0 ? value.revision : 0, hits: Number.isSafeInteger(value.hits) && value.hits >= 0 ? value.hits : 0 };
}
export function applySystemDamage(state, amount, { maxHp = 100, weapon = 'cannon', system } = {}) {
  const result = createDamageState(state);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(maxHp) || maxHp <= 0) return result;
  const fraction = clamp(amount / maxHp, 0, 1);
  // Stable hit distribution; no wall-clock random value enters authoritative/replay state.
  const selected = ['engine', 'wing', 'sensor'].includes(system) ? system : ['wing', 'engine', 'sensor'][result.hits % 3];
  const spread = weapon === 'missile' || weapon === 'collision' || weapon === 'terrain' ? .32 : .08;
  for (const key of ['engine', 'wing', 'sensor']) result[key] = clamp(result[key] - fraction * (key === selected ? .9 : spread), 0, 1);
  result.hits++; result.revision++; return result;
}
export function systemEffects(value, difficulty = 'easy') {
  const state = createDamageState(value), easy = difficulty === 'easy';
  return { thrustMult: (easy ? .65 : .4) + (easy ? .35 : .6) * state.engine,
    turnMult: (easy ? .68 : .42) + (easy ? .32 : .58) * state.wing,
    rollMult: (easy ? .7 : .5) + (easy ? .3 : .5) * state.wing,
    sensorRangeMult: .35 + .65 * state.sensor, lockRateMult: .45 + .55 * state.sensor,
    smoke: state.engine < .72, warnings: ['engine', 'wing', 'sensor'].filter(key => state[key] < .7).map(key => `${key.toUpperCase()} ${Math.round(state[key] * 100)}%`) };
}
export function canRepairSystems(aircraft, base) {
  if (!aircraft?.alive || !aircraft.isLanded || !base || !Number.isFinite(aircraft.speed) || aircraft.speed > 110 || aircraft.speed < 0) return false;
  const p = aircraft.position;
  if (!p || !['x', 'y', 'z'].every(key => Number.isFinite(p[key])) || !Number.isFinite(base.x) || !Number.isFinite(base.z)) return false;
  const angle = ((base.runwayHeading || 0) * Math.PI) / 180, dx = p.x - base.x, dz = p.z - base.z;
  const lateral = dx * Math.cos(angle) - dz * Math.sin(angle), longitudinal = dx * Math.sin(angle) + dz * Math.cos(angle);
  return Math.abs(lateral) <= (base.runwayWidth || 80) / 2 + 15 && Math.abs(longitudinal) <= (base.runwayLength || 2800) / 2 + 30 && Math.abs(p.y - ((base.elevation || 0) + 3.2)) <= 8;
}
export function repairSystems(aircraft, base, { now = 0, cooldown = 5 } = {}) {
  if (!canRepairSystems(aircraft, base)) return { ok: false, reason: 'Land on an authorized runway at a safe rollout speed.' };
  if (Number.isFinite(aircraft.lastSystemRepairAt) && now - aircraft.lastSystemRepairAt < cooldown) return { ok: false, reason: 'Repair service is already complete.' };
  const before = createDamageState(aircraft.systems), changed = ['engine', 'wing', 'sensor'].some(key => before[key] < 1);
  if (!changed) return { ok: true, changed: false, state: before };
  aircraft.systems = { ...createDamageState(), revision: before.revision + 1 };
  aircraft.lastSystemRepairAt = now;
  return { ok: true, changed: true, state: { ...aircraft.systems } };
}
