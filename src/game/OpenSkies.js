// Encounter state uses simulation seconds only. No wall-clock timers or UI dependencies.
export const OPEN_SKIES = Object.freeze({
  total: 8, recoverySeconds: 10, spawnGrace: 8,
  center: { x: -14500, z: 47500 }, start: { x: -14500, y: 1600, z: 54000 },
  warningRadius: 14500, boundaryRadius: 18500,
  phases: [
    { name: 'Establish air superiority', objective: 'Clear the first patrol', roles: ['dogfighter', 'dogfighter', 'missile'], radio: 'Patrol ahead. Three contacts. Clear the approach to the strait.' },
    { name: 'Protect squadron', objective: 'Defeat reinforcements · protect your wingmen', roles: ['support', 'missile', 'dogfighter', 'support'], radio: 'Four reinforcements inbound. They are targeting our squadron. Cover each other.' },
    { name: 'Ace encounter', objective: 'Defeat VIPER · bring your squadron home', roles: ['ace'], radio: 'VIPER is inbound. Watch the lock warning, flare on launch, then attack during the recovery turn.' },
  ],
});

export function seededRandom(seed) {
  let state = Number(seed) >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let n = Math.imul(state ^ state >>> 15, 1 | state);
    n ^= n + Math.imul(n ^ n >>> 7, 61 | n);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

export class OpenSkiesEncounter {
  constructor(seed = Date.now()) {
    this.seed = Number(seed) >>> 0;
    this.random = seededRandom(this.seed);
    this.state = 'briefing';
    this.phase = -1;
    this.remaining = 0;
    this.spawned = 0;
    this.defeated = 0;
    this.waveIds = [];
    this.recovery = 0;
    this.elapsed = 0;
    this.radioTimes = new Map();
  }
  start() { return this.state === 'briefing' ? this.nextWave() : []; }
  nextWave() {
    this.phase++;
    const phase = OPEN_SKIES.phases[this.phase];
    this.state = 'active';
    this.waveIds = phase.roles.map((role, slot) => ({ id: `phase-${this.phase}-${slot}`, role, slot, seed: Math.floor(this.random() * 0xFFFFFFFF), bearing: (this.random() - .5) * 1.3 }));
    this.remaining = this.waveIds.length;
    this.spawned += this.remaining;
    return [{ type: 'wave', phase: this.phase, units: this.waveIds, radio: phase.radio }];
  }
  tick(dt, enemies, playerAlive, playing = true) {
    if (!playing || !['active', 'recovery'].includes(this.state)) return [];
    this.elapsed += Math.max(0, Math.min(dt, .1));
    if (!playerAlive) { this.state = 'failed'; return [{ type: 'failed' }]; }
    if (this.state === 'active') {
      this.remaining = this.waveIds.reduce((n, unit) => n + Number(enemies.some(jet => jet.battleId === unit.id && jet.alive)), 0);
      this.defeated = this.spawned - this.remaining;
      if (this.remaining) return [];
      if (this.phase === OPEN_SKIES.phases.length - 1) {
        this.state = 'complete';
        return [{ type: 'complete' }];
      }
      this.state = 'recovery'; this.recovery = OPEN_SKIES.recoverySeconds;
      return [{ type: 'radio', text: 'Wave clear. Regroup, check your wingmen. More contacts in ten seconds.' }];
    }
    this.recovery = Math.max(0, this.recovery - Math.max(0, Math.min(dt, .1)));
    return this.recovery <= 1e-6 ? this.nextWave() : [];
  }
  canRadio(key, cooldown = 5) {
    if (this.elapsed - (this.radioTimes.get(key) ?? -Infinity) < cooldown) return false;
    this.radioTimes.set(key, this.elapsed);
    return true;
  }
  abort() { this.state = 'aborted'; this.waveIds = []; this.radioTimes.clear(); }
  snapshot() {
    const phase = OPEN_SKIES.phases[Math.max(0, this.phase)];
    return { state: this.state, phase: this.phase + 1, phases: 3, name: phase.name, objective: phase.objective,
      remaining: this.remaining, waveTotal: phase.roles.length, defeated: this.defeated, total: OPEN_SKIES.total,
      recovery: Math.ceil(this.recovery), seed: this.seed };
  }
}

export const MEDAL_RULES = Object.freeze({ completion: 50, accuracy: 20, protection: 20, wingmen: 10, silver: 65, gold: 85, xp: { Bronze: 100, Silver: 250, Gold: 400 } });
const finite = (value, max = 1e9) => Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : 0;
export function scoreOpenSkies({ success, stats = {}, maxHp = 100, allies = [], elapsed = 0, seed = 0 }) {
  const attempts = finite(stats.shots) + finite(stats.missiles);
  const hits = Math.min(attempts, finite(stats.hits) + finite(stats.missileHits));
  const accuracy = attempts ? hits / attempts : 0;
  const damage = finite(stats.damageTaken);
  const protection = 1 - Math.min(1, damage / Math.max(1, finite(maxHp)));
  const survivors = Math.min(2, allies.filter(jet => jet.alive).length);
  const breakdown = { completion: success ? MEDAL_RULES.completion : 0, accuracy: Math.round(accuracy * MEDAL_RULES.accuracy), protection: Math.round(protection * MEDAL_RULES.protection), wingmen: survivors * MEDAL_RULES.wingmen / 2 };
  const points = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const medal = !success ? 'No medal' : points >= MEDAL_RULES.gold ? 'Gold' : points >= MEDAL_RULES.silver ? 'Silver' : 'Bronze';
  return { success: !!success, points, medal, breakdown, accuracy: Math.round(accuracy * 100), damage: Math.round(damage), survivors, elapsed: finite(elapsed), seed: Number(seed) >>> 0, bonusXP: success ? MEDAL_RULES.xp[medal] : 0 };
}
