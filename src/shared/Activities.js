import { missionRandom } from './MissionGenerator.js';
export const ACTIVITY_VERSION = 1;
export const ACTIVITY_TYPES = Object.freeze({ race: 'Checkpoint Race', formation: 'Formation Flight', landing: 'Landing Precision' });
const clone = value => JSON.parse(JSON.stringify(value));
const finitePoint = p => p && ['x', 'y', 'z'].every(key => Number.isFinite(p[key]));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const idOf = p => String(p.participantId || p.networkId || p.id);
function segmentDistance(a, b, p) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, denominator = dx * dx + dy * dy + dz * dz;
  const t = denominator ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / denominator, 0, 1) : 0;
  return dist({ x: a.x + dx * t, y: a.y + dy * t, z: a.z + dz * t }, p);
}
/** Authority passes real aircraft state, not client-provided scores/checkpoint indexes. */
export class ActivityRuntime {
  constructor(type, { participants = [], seed = 1, origin = { x: 0, y: 1550, z: 5200 }, base = null, duration, countdown = 5, instanceId = `activity-${seed >>> 0}` } = {}) {
    if (!Object.hasOwn(ACTIVITY_TYPES, type)) throw new Error('Choose race, formation or landing.');
    if (!finitePoint(origin)) throw new Error('Invalid activity origin.');
    if (!Array.isArray(participants) || !participants.length || participants.length > 8) throw new Error('Activities support one to eight pilots.');
    const ids = participants.map(p => String(typeof p === 'object' ? p.id : p));
    if (new Set(ids).size !== ids.length || ids.some(id => !/^[\w:-]{1,100}$/.test(id))) throw new Error('Invalid or duplicate participant.');
    if (type === 'landing' && (!base || !Number.isFinite(base.x) || !Number.isFinite(base.z))) throw new Error('Choose a valid landing airbase.');
    this.version = ACTIVITY_VERSION; this.type = type; this.seed = seed >>> 0; this.instanceId = String(instanceId).slice(0, 100);
    this.origin = { ...origin }; this.base = base ? clone(base) : null;
    this.duration = clamp(Number(duration) || (type === 'race' ? 180 : type === 'landing' ? 240 : 75), 30, 600);
    this.countdown = clamp(Number(countdown) || 0, 0, 10); this.elapsed = 0; this.state = 'countdown'; this.reason = '';
    this.participants = new Map(ids.map(id => [id, { id, status: 'ready', checkpoint: 0, score: 0, formationSeconds: 0, elapsed: null, missing: 0, previous: null, wasLanded: false, approach: null }]));
    const random = missionRandom(this.seed);
    this.gates = Array.from({ length: 6 }, (_, index) => ({ id: index, x: origin.x + Math.sin(index * .65) * (500 + random() * 350), y: origin.y + Math.sin(index * .8) * 120,
      z: origin.z - 1200 - index * 1600, radius: 260 }));
    this.leader = { ...origin }; this.results = null; this.events = [];
  }
  cancel(reason = 'Activity cancelled.') { if (['complete', 'cancelled'].includes(this.state)) return []; this.state = 'cancelled'; this.reason = reason; return [{ type: 'activity-cancelled', reason }]; }
  step(dt, { players = [] } = {}) {
    if (['complete', 'cancelled'].includes(this.state)) return [];
    dt = clamp(Number(dt) || 0, 0, .25);
    const map = players instanceof Map ? players : new Map(players.map(p => [idOf(p), p]));
    const events = [];
    if (this.state === 'countdown') {
      this.countdown = Math.max(0, this.countdown - dt);
      if (this.countdown > 0) return [];
      this.state = 'active'; for (const p of this.participants.values()) p.status = 'active'; events.push({ type: 'activity-start', activity: this.type });
    }
    this.elapsed += dt;
    // The formation guide is a clearly identified guide beacon, never a fake human.
    this.leader = { x: this.origin.x + Math.sin(this.elapsed / 22) * 650, y: this.origin.y + Math.sin(this.elapsed / 28) * 90, z: this.origin.z - this.elapsed * 155 };
    let slot = 0;
    for (const participant of this.participants.values()) {
      const player = map.get(participant.id);
      const target = this.formationTarget(slot++);
      if (participant.status !== 'active') continue;
      if (!player || player.connected === false) { participant.missing += dt; if (participant.missing >= 15) { participant.status = 'disconnected'; events.push({ type: 'activity-withdrawn', id: participant.id }); } continue; }
      participant.missing = 0;
      if (player.alive === false || player.hp === 0) { participant.status = 'retired'; continue; }
      if (!finitePoint(player.position)) continue;
      if (this.type === 'race') {
        const gate = this.gates[participant.checkpoint];
        const previous = participant.previous || player.position;
        // Reject a discontinuity instead of awarding gates crossed by fast-travel/reset.
        const moved = dist(previous, player.position), plausible = moved <= Math.max(180, (Number(player.speed) || 500) * dt * 2 + 30);
        if (gate && plausible && segmentDistance(previous, player.position, gate) <= gate.radius) {
          participant.checkpoint++; participant.score = participant.checkpoint;
          events.push({ type: 'checkpoint', id: participant.id, checkpoint: participant.checkpoint, total: this.gates.length });
          if (participant.checkpoint === this.gates.length) { participant.status = 'finished'; participant.elapsed = this.elapsed; events.push({ type: 'activity-finish', id: participant.id }); }
        }
      } else if (this.type === 'formation') {
        const velocity = player.velocity || { x: 0, y: 0, z: -(player.speed || 0) }, magnitude = Math.hypot(velocity.x, velocity.y, velocity.z);
        const aligned = magnitude > 40 && -velocity.z / magnitude > .92;
        if (dist(player.position, target) <= 270 && Math.abs((player.speed || magnitude) - 155) < 70 && aligned) participant.formationSeconds += dt;
        participant.score = Math.round(participant.formationSeconds * 10);
        if (this.elapsed >= this.duration) { participant.status = participant.formationSeconds >= 8 ? 'finished' : 'incomplete'; participant.elapsed = this.elapsed; }
      } else {
        // Capture airborne approach state before the touchdown handler zeros vertical velocity.
        if (!player.isLanded && player.position.y > (this.base.elevation || 0) + 3.3) participant.approach = { at: this.elapsed, sinkRate: Math.abs(player.velocity?.y || 0), speed: player.speed || 0, position: { ...player.position },
          forward: player.forward ? { x: player.forward.x, z: player.forward.z } : { x: player.velocity?.x || 0, z: player.velocity?.z || -1 } };
        if (player.isLanded && !participant.wasLanded && participant.approach && this.elapsed - participant.approach.at < 2) {
          const assessed = assessActivityLanding(player, this.base, participant.approach);
          if (assessed.valid) { participant.score = assessed.score; participant.status = 'finished'; participant.elapsed = this.elapsed; events.push({ type: 'activity-finish', id: participant.id, score: participant.score }); }
          else events.push({ type: 'activity-landing-rejected', id: participant.id, reason: assessed.reason });
        }
        participant.wasLanded = !!player.isLanded;
      }
      participant.previous = { x: player.position.x, y: player.position.y, z: player.position.z };
    }
    if (this.elapsed >= this.duration || [...this.participants.values()].every(p => p.status !== 'active')) {
      for (const p of this.participants.values()) if (p.status === 'active') p.status = 'incomplete';
      this.state = 'complete'; this.results = this.rank(); events.push({ type: 'activity-complete', results: clone(this.results) });
    }
    return events;
  }
  formationTarget(slot) { return { x: this.leader.x + (slot % 2 ? 1 : -1) * (150 + Math.floor(slot / 2) * 170), y: this.leader.y + 25, z: this.leader.z + 150 + Math.floor(slot / 2) * 170 }; }
  rank() {
    const rows = [...this.participants.values()].map(p => ({ id: p.id, status: p.status, score: p.score, elapsed: p.elapsed, formationSeconds: Math.round(p.formationSeconds * 10) / 10, checkpoint: p.checkpoint }));
    rows.sort((a, b) => (a.status === 'finished' ? 0 : 1) - (b.status === 'finished' ? 0 : 1) || (this.type === 'race' ? (a.elapsed ?? Infinity) - (b.elapsed ?? Infinity) : b.score - a.score) || a.id.localeCompare(b.id));
    let rank = 0;
    for (let i = 0; i < rows.length; i++) { const previous = rows[i - 1], row = rows[i], tied = previous && row.status === previous.status && (this.type === 'race' ? Math.abs((row.elapsed ?? Infinity) - (previous.elapsed ?? Infinity)) <= .05 : row.score === previous.score); if (!tied) rank = i + 1; row.rank = rank; }
    return rows;
  }
  snapshot() { return { version: this.version, instanceId: this.instanceId, type: this.type, name: ACTIVITY_TYPES[this.type], objective: this.type === 'race' ? 'Fly through all six rings in order' : this.type === 'formation' ? 'Stay within your guide position at 155 m/s' : 'Land on the marked runway with gear down', state: this.state, countdown: Math.ceil(this.countdown), elapsed: this.elapsed, remaining: Math.max(0, this.duration - this.elapsed),
    participants: [...this.participants.values()].map(({ previous, approach, ...p }) => ({ ...p })), gates: this.type === 'race' ? clone(this.gates) : [], leader: this.type === 'formation' ? { ...this.leader } : null,
    targets: this.type === 'formation' ? [...this.participants.keys()].map((id, i) => ({ id, ...this.formationTarget(i) })) : [], base: this.base, results: this.results, reason: this.reason, rewards: 'Activity results only; no combat XP.' }; }
  serialize() { return { ...this.snapshot(), origin: this.origin, seed: this.seed, duration: this.duration, countdown: this.countdown, participants: [...this.participants.values()].map(clone), gates: clone(this.gates) }; }
  static restore(value) { if (value?.version !== ACTIVITY_VERSION) throw new Error('Unsupported activity version.'); const runtime = new ActivityRuntime(value.type, { ...value, participants: value.participants.map(p => p.id) });
    for (const key of ['state', 'elapsed', 'reason', 'results', 'leader', 'gates']) if (value[key] !== undefined) runtime[key] = clone(value[key]);
    runtime.participants = new Map(value.participants.map(p => [p.id, clone(p)])); return runtime; }
}
export function assessActivityLanding(player, base, approach) {
  const p = player.position, angle = (base.runwayHeading || 0) * Math.PI / 180, dx = p.x - base.x, dz = p.z - base.z;
  const lateral = Math.abs(dx * Math.cos(angle) - dz * Math.sin(angle)), along = Math.abs(dx * Math.sin(angle) + dz * Math.cos(angle));
  const f = approach.forward, length = Math.hypot(f.x, f.z) || 1, headingDot = Math.abs((f.x * Math.sin(angle) - f.z * Math.cos(angle)) / length), headingError = Math.acos(clamp(headingDot, -1, 1));
  if (lateral > (base.runwayWidth || 80) / 2 || along > (base.runwayLength || 2800) / 2 || Math.abs(p.y - ((base.elevation || 0) + 3.2)) > 8 || approach.sinkRate > 8 || approach.speed < 35 || approach.speed > 115 || headingError > .3 || player.gearDown === false) return { valid: false, reason: 'Use the runway, gear down, a shallow approach and safe touchdown speed.' };
  const score = Math.round(100 * (.4 * (1 - clamp(lateral / ((base.runwayWidth || 80) / 2), 0, 1)) + .35 * (1 - clamp(approach.sinkRate / 8, 0, 1)) + .25 * (1 - clamp(headingError / .3, 0, 1))));
  return { valid: true, score, lateral, headingError, sinkRate: approach.sinkRate };
}
