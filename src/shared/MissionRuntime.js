import { createMissionPreset, missionSetup, MISSION_TEMPLATES } from './MissionGenerator.js';
import { BattleDirector } from './BattleDirector.js';
const copy = value => JSON.parse(JSON.stringify(value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const positionValid = p => p && ['x', 'y', 'z'].every(key => Number.isFinite(p[key]));
const alive = value => value && value.alive !== false && value.hp > 0;
const entityId = entity => entity?.missionId || entity?.battleId || entity?.id;

/** A mission runs on one authority only. step mutates routeManaged entities passed by host;
 * combat aircraft remain in the host flight/AI simulation. All events are emitted once. */
export class MissionRuntime {
  constructor(input, options = {}) {
    this.preset = createMissionPreset(input); this.setup = missionSetup(this.preset, options);
    this.seed = this.preset.seed; this.difficulty = this.preset.difficulty;
    this.state = 'briefing'; this.elapsed = 0; this.reason = ''; this.result = null;
    this.director = new BattleDirector({ ...this.preset, total: this.setup.fighters.length });
    this.spawnedIds = new Set(); this.deadIds = new Set(); this.missing = new Map(); this.radioTimes = new Map();
    this.baseHealth = 100; this.breaches = new Set(); this.strikeReleased = false;
    this.protectedHealth = 1; this.objectiveProgress = 0; this.revision = 0;
  }
  start() {
    if (this.state !== 'briefing') return [];
    this.state = 'active';
    const entities = [...this.setup.objectives, ...this.setup.fighters.slice(0, this.director.initialCount())].map(entity => ({ ...copy(entity), alive: true, graceUntil: 8 }));
    for (const entity of entities) this.spawnedIds.add(entity.id);
    return [{ type: 'spawn', entities }, { type: 'radio', text: this.setup.briefing }];
  }
  canRadio(key, cooldown = 5) { if (this.elapsed - (this.radioTimes.get(key) ?? -Infinity) < cooldown) return false; this.radioTimes.set(key, this.elapsed); return true; }
  step(dt, { entities = [], players = [], playing = true } = {}) {
    if (!playing || this.state !== 'active') return [];
    dt = Math.max(0, Math.min(.25, Number(dt) || 0)); this.elapsed += dt;
    const events = [], map = entities instanceof Map ? entities : new Map(entities.map(entity => [entityId(entity), entity]));
    if (!players.some(alive)) return this.finish(false, 'Squadron lost. Retry the operation.');
    if (this.elapsed >= MISSION_TEMPLATES[this.preset.template].limit) return this.finish(false, 'Mission time expired. Regroup and retry.');
    for (const id of this.spawnedIds) {
      const entity = map.get(id);
      if (!entity) {
        this.missing.set(id, (this.missing.get(id) || 0) + dt);
        if (this.missing.get(id) > 2 && !this.deadIds.has(id) && !this.breaches.has(id)) return this.finish(false, `Mission contact ${id} was lost. Retry safely.`);
      } else { this.missing.delete(id); if (!alive(entity)) this.deadIds.add(id); }
    }
    const protectedDescriptor = this.setup.objectives.find(entity => entity.team === 'ally');
    const protectedEntity = protectedDescriptor && map.get(protectedDescriptor.id);
    if (protectedDescriptor && protectedEntity && !alive(protectedEntity)) return this.finish(false, `${protectedDescriptor.callsign} was destroyed. Protect the package on retry.`);
    this.protectedHealth = protectedEntity ? Math.max(0, protectedEntity.hp / protectedEntity.maxHp) : this.protectedHealth;
    const defenceIds = this.setup.fighters.filter(entity => entity.defencePatrol).map(entity => entity.id);
    const defenceCleared = defenceIds.every(id => this.deadIds.has(id));
    for (const descriptor of this.setup.objectives) {
      const entity = map.get(descriptor.id);
      if (!alive(entity) || this.breaches.has(descriptor.id)) continue;
      // Strike package holds outside the release corridor until the marked patrol is destroyed.
      const hold = descriptor.role === 'strike' && !defenceCleared && (entity.routeIndex || 0) >= 1;
      if (hold) {
        entity.aiState = 'holding for defence suppression';
        const angle = this.elapsed * .035, anchor = descriptor.route[0];
        const destination = { x: anchor.x + Math.sin(angle) * 700, y: anchor.y, z: anchor.z + Math.cos(angle) * 700 };
        this.advance(entity, destination, dt, false);
      } else this.advanceRoute(entity, descriptor, dt, events);
      if (descriptor.role === 'strike' && (entity.routeIndex || 0) >= 2 && !this.strikeReleased) {
        this.strikeReleased = true; events.push({ type: 'objective', text: 'HAMMER strike complete. Cover its withdrawal.', position: { ...this.setup.target } });
      }
      if (entity.routeComplete) {
        this.breaches.add(descriptor.id);
        if (descriptor.role === 'transport' || descriptor.role === 'strike') return [...events, ...this.finish(true, descriptor.role === 'transport' ? 'LANTERN reached the extraction gate.' : 'HAMMER completed its strike and returned safely.')];
        entity.alive = false; entity.hp = 0; entity.missionDespawn = true;
        if (this.preset.template === 'intercept') return [...events, ...this.finish(false, 'A bomber reached the release line.')];
        this.baseHealth = Math.max(0, this.baseHealth - 40);
        events.push({ type: 'objective', text: `Base hit. Integrity ${this.baseHealth}%.`, position: { ...this.setup.protectedZone } });
        if (this.baseHealth <= 0) return [...events, ...this.finish(false, 'The airbase was lost.')];
      }
    }
    const objectiveDead = this.setup.objectives.filter(entity => entity.team === 'enemy').every(entity => this.deadIds.has(entity.id) || this.breaches.has(entity.id));
    const fightersDead = this.setup.fighters.every(entity => this.deadIds.has(entity.id));
    const routed = this.setup.objectives[0] && map.get(this.setup.objectives[0].id);
    this.objectiveProgress = routed?.route?.length ? Math.min(1, (routed.routeIndex || 0) / routed.route.length) : this.deadIds.size / Math.max(1, this.setup.fighters.length + this.setup.objectives.length);
    if (['intercept', 'base-defence'].includes(this.preset.template) && objectiveDead && fightersDead) return [...events, ...this.finish(true, this.preset.template === 'intercept' ? 'Bombers and escorts neutralized.' : `Airbase secured with ${this.baseHealth}% integrity.`)];
    const liveFighters = this.setup.fighters.map(entity => map.get(entity.id)).filter(alive);
    const activePlayers = players.filter(alive);
    const squadHealth = activePlayers.reduce((n, p) => n + p.hp / Math.max(1, p.maxHp || 100), 0) / Math.max(1, activePlayers.length);
    let nearest = Infinity; for (const enemy of liveFighters) for (const player of activePlayers) if (positionValid(enemy.position) && positionValid(player.position)) nearest = Math.min(nearest, distance(enemy.position, player.position));
    for (const event of this.director.tick(dt, { active: liveFighters.length, squadHealth, nearestEnemy: nearest, progress: this.objectiveProgress })) {
      if (event.type === 'telegraph') events.push({ type: 'radio', text: `${event.count} reinforcements in eight seconds. Check your squadron.` });
      if (event.type === 'recall') events.push({ type: 'recall', ids: liveFighters.filter(enemy => distance(enemy.position, this.setup.center) > 12000).map(entityId), destination: { ...this.setup.center } });
      if (event.type === 'reinforce') {
        const fresh = this.setup.fighters.filter(entity => !this.spawnedIds.has(entity.id)).slice(0, event.count).map(entity => ({ ...copy(entity), alive: true, graceUntil: this.elapsed + event.grace }));
        for (const entity of fresh) this.spawnedIds.add(entity.id);
        events.push({ type: 'spawn', entities: fresh });
      }
    }
    return events;
  }
  advance(entity, destination, dt, canArrive = true) {
    if (!positionValid(entity.position) || !positionValid(destination)) return false;
    const span = distance(entity.position, destination), speed = Math.min(190, Math.max(60, entity.speed || 130)), move = Math.min(span, speed * dt);
    if (!entity.velocity) entity.velocity = { x: 0, y: 0, z: 0 };
    if (span > .001) for (const axis of ['x', 'y', 'z']) { const direction = (destination[axis] - entity.position[axis]) / span; entity.position[axis] += direction * move; entity.velocity[axis] = direction * speed; }
    return canArrive && span <= Math.max(move, 35);
  }
  advanceRoute(entity, descriptor, dt) {
    if (!Array.isArray(entity.route)) entity.route = copy(descriptor.route);
    entity.routeIndex = Math.max(0, entity.routeIndex || 0);
    const destination = entity.route[entity.routeIndex];
    if (!destination) { entity.routeComplete = true; return; }
    entity.aiState = descriptor.role === 'bomber' ? 'bombing run' : descriptor.role === 'transport' ? 'transiting' : 'strike route';
    if (this.advance(entity, destination, dt)) { entity.routeIndex++; if (entity.routeIndex >= entity.route.length) entity.routeComplete = true; }
  }
  finish(success, reason) {
    if (this.state !== 'active') return [];
    this.state = success ? 'complete' : 'failed'; this.reason = reason; this.revision++;
    this.result = { success, reason, seed: this.seed, version: 1, template: this.preset.template, category: `custom-${this.preset.pacing}`, elapsed: this.elapsed, defeated: this.deadIds.size,
      baseHealth: this.baseHealth, protectedHealth: this.protectedHealth, preset: { ...this.preset } };
    return [{ type: success ? 'complete' : 'failed', reason, result: { ...this.result } }];
  }
  abort() { if (!['complete', 'failed'].includes(this.state)) this.state = 'aborted'; this.radioTimes.clear(); }
  snapshot() { return { state: this.state, template: this.preset.template, name: this.setup.name, objective: this.setup.objective, briefing: this.setup.briefing,
    seed: this.seed, category: `custom-${this.preset.pacing}`, elapsed: this.elapsed, remainingSeconds: Math.max(0, Math.ceil(MISSION_TEMPLATES[this.preset.template].limit - this.elapsed)),
    phase: this.strikeReleased ? 2 : 1, phases: this.preset.template === 'strike-support' ? 2 : 1, total: this.setup.fighters.length + this.setup.objectives.filter(entity => entity.team === 'enemy').length,
    defeated: this.deadIds.size, remaining: Math.max(0, [...this.spawnedIds].filter(id => !this.deadIds.has(id) && !this.breaches.has(id)).length - this.setup.objectives.filter(e => e.team === 'ally').length),
    protectedHealth: this.protectedHealth, baseHealth: this.baseHealth, progress: this.objectiveProgress, director: this.director.snapshot(), result: this.result }; }
  serialize() { return { version: 1, preset: this.preset, setup: copy(this.setup), state: this.state, elapsed: this.elapsed, reason: this.reason, result: this.result,
    spawnedIds: [...this.spawnedIds], deadIds: [...this.deadIds], breaches: [...this.breaches], baseHealth: this.baseHealth, strikeReleased: this.strikeReleased,
    protectedHealth: this.protectedHealth, objectiveProgress: this.objectiveProgress, director: this.director.serialize(), revision: this.revision }; }
  static restore(value) {
    if (value?.version !== 1) throw new Error('Unsupported mission state version.');
    const runtime = new MissionRuntime(value.preset);
    for (const key of ['state', 'elapsed', 'reason', 'result', 'baseHealth', 'strikeReleased', 'protectedHealth', 'objectiveProgress', 'revision']) if (value[key] !== undefined) runtime[key] = value[key];
    if (value.setup) runtime.setup = copy(value.setup);
    for (const key of ['spawnedIds', 'deadIds', 'breaches']) runtime[key] = new Set(Array.isArray(value[key]) ? value[key].slice(0, 32) : []);
    runtime.director = BattleDirector.restore(value.director); return runtime;
  }
}

/** F36 authoritative version of the existing 3 + 4 + ace encounter. No renderer state. */
export class CoopOpenSkiesRuntime {
  constructor({ seed = 1, difficulty = 'easy', humans = 2 } = {}, { terrainHeight } = {}) {
    this.seed = seed >>> 0; this.difficulty = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'easy';
    this.humans = Math.max(1, Math.min(4, Number(humans) || 2)); this.terrainHeight = terrainHeight;
    this.state = 'briefing'; this.phase = -1; this.elapsed = 0; this.recovery = 0; this.spawned = 0; this.defeated = 0;
    this.waveIds = []; this.deadIds = new Set(); this.missing = new Map(); this.result = null;
    this.anchor = { x: -14500, y: 1800, z: 52000 };
    const extra = Math.max(0, this.humans - 2);
    this.phases = [
      { name: 'Establish air superiority', objective: 'Clear the first patrol', roles: ['dogfighter', 'dogfighter', 'missile', ...Array(extra).fill('dogfighter')] },
      { name: 'Protect squadron', objective: 'Defeat reinforcements and cover your squad', roles: ['support', 'missile', 'dogfighter', 'support', ...Array(extra).fill('dogfighter')] },
      { name: 'Ace encounter', objective: 'Defeat VIPER together', roles: ['ace'] },
    ];
  }
  start() { return this.state === 'briefing' ? this.nextWave() : []; }
  nextWave() {
    this.phase++; this.state = 'active';
    const phase = this.phases[this.phase], units = phase.roles.map((role, slot) => {
      const angle = (slot - (phase.roles.length - 1) / 2) * .28 + ((this.seed % 101) / 100 - .5) * .25;
      const position = { x: this.anchor.x + Math.sin(angle) * (4600 + slot * 240), y: this.anchor.y + 200 + slot * 80, z: this.anchor.z - Math.cos(angle) * (4600 + slot * 240) };
      if (this.terrainHeight) position.y = Math.max(position.y, this.terrainHeight(position.x, position.z) + 800);
      return { id: `phase-${this.phase}-${slot}`, role, team: 'enemy', callsign: role === 'ace' ? 'VIPER' : `RAIDER ${slot + 1}`, slot, seed: (this.seed + this.phase * 131 + slot * 71) >>> 0,
        hp: role === 'ace' ? 190 + (this.humans - 1) * 25 : 100, maxHp: role === 'ace' ? 190 + (this.humans - 1) * 25 : 100,
        position, speed: role === 'ace' ? 255 : 220, alive: true, graceUntil: this.elapsed + 8, routeManaged: false };
    });
    this.waveIds = units.map(unit => unit.id); this.spawned += units.length;
    return [{ type: 'spawn', entities: units }, { type: 'phase', phase: this.phase + 1, text: phase.name }, { type: 'radio', text: `${phase.name}. ${units.length} contacts inbound; cover one another.` }];
  }
  step(dt, { entities = [], players = [], playing = true } = {}) {
    if (!playing || !['active', 'recovery'].includes(this.state)) return [];
    dt = Math.max(0, Math.min(.25, Number(dt) || 0)); this.elapsed += dt;
    const map = entities instanceof Map ? entities : new Map(entities.map(entity => [entityId(entity), entity]));
    const survivors = players.filter(alive);
    if (!survivors.length) return this.finish(false, 'Squadron lost.');
    if (this.elapsed >= 1200) return this.finish(false, 'Sortie time expired.');
    if (positionValid(survivors[0].position)) this.anchor = { x: survivors[0].position.x, y: Math.max(1300, survivors[0].position.y), z: survivors[0].position.z };
    if (this.state === 'recovery') { this.recovery = Math.max(0, this.recovery - dt); return this.recovery <= 1e-6 ? this.nextWave() : []; }
    for (const id of this.waveIds) {
      const entity = map.get(id);
      if (entity && !alive(entity)) this.deadIds.add(id);
      if (!entity && !this.deadIds.has(id)) { const missing = (this.missing.get(id) || 0) + dt; this.missing.set(id, missing); if (missing > 2) return this.finish(false, 'An encounter contact was lost. Rematch to recover.'); }
    }
    this.defeated = this.deadIds.size;
    if (this.waveIds.some(id => !this.deadIds.has(id))) return [];
    if (this.phase === this.phases.length - 1) return this.finish(true, 'VIPER defeated. Squadron mission complete.');
    this.state = 'recovery'; this.recovery = 10; return [{ type: 'radio', text: 'Wave clear. Regroup. Reinforcements in ten seconds.' }];
  }
  finish(success, reason) {
    if (['complete', 'failed', 'aborted'].includes(this.state)) return [];
    this.state = success ? 'complete' : 'failed'; this.result = { success, reason, template: 'open_skies', seed: this.seed, elapsed: this.elapsed, defeated: this.defeated, difficulty: this.difficulty, category: 'co-op' };
    return [{ type: success ? 'complete' : 'failed', reason, result: { ...this.result } }];
  }
  abort() { this.state = 'aborted'; }
  snapshot() { const phase = this.phases[Math.max(0, this.phase)]; return { state: this.state, phase: this.phase + 1, phases: 3, name: phase.name, objective: phase.objective,
    remaining: this.waveIds.filter(id => !this.deadIds.has(id)).length, total: this.phases.reduce((sum, p) => sum + p.roles.length, 0), defeated: this.defeated, recovery: Math.ceil(this.recovery), seed: this.seed, elapsed: this.elapsed, result: this.result }; }
  serialize() { return { version: 1, kind: 'open_skies', seed: this.seed, difficulty: this.difficulty, humans: this.humans, state: this.state, phase: this.phase, elapsed: this.elapsed, recovery: this.recovery, spawned: this.spawned, defeated: this.defeated, waveIds: [...this.waveIds], deadIds: [...this.deadIds], anchor: { ...this.anchor }, result: this.result }; }
  static restore(value, options) { if (value?.version !== 1 || value.kind !== 'open_skies') throw new Error('Unsupported encounter state.'); const runtime = new CoopOpenSkiesRuntime(value, options); for (const key of ['state', 'phase', 'elapsed', 'recovery', 'spawned', 'defeated', 'waveIds', 'anchor', 'result']) if (value[key] !== undefined) runtime[key] = copy(value[key]); runtime.deadIds = new Set(value.deadIds || []); return runtime; }
}
