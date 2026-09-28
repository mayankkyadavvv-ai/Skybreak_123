/** F25 bounded reinforcements: time is simulation time, authority never changes flight physics. */
export const DIRECTOR_VERSION = 1;
export class BattleDirector {
  constructor({ difficulty = 'easy', pacing = 'adaptive', total = 6 } = {}) {
    this.difficulty = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'easy';
    this.pacing = pacing === 'fixed' ? 'fixed' : 'adaptive';
    this.total = Math.max(0, Math.min(12, Math.floor(total)));
    this.cap = { easy: 3, medium: 4, hard: 5 }[this.difficulty];
    this.spawned = 0; this.elapsed = 0; this.lastSpawn = -30; this.pending = 0; this.warning = 0;
    this.quiet = 0; this.recallAt = 0; this.history = [];
  }
  initialCount() { const n = Math.min(this.total, this.cap, 2); this.spawned = n; this.lastSpawn = 0; return n; }
  tick(dt, { active = 0, squadHealth = 1, nearestEnemy = 0, progress = 0 } = {}) {
    dt = Math.max(0, Math.min(.25, Number(dt) || 0)); this.elapsed += dt;
    this.quiet = active === 0 ? this.quiet + dt : 0;
    const events = [];
    if (active && nearestEnemy > 12500 && this.elapsed >= this.recallAt) {
      this.recallAt = this.elapsed + 12; events.push({ type: 'recall', reason: 'Return distant patrols toward the mission area.' });
    }
    if (this.pending) {
      this.warning = Math.max(0, this.warning - dt);
      if (this.warning <= 0 && active < this.cap) {
        const count = Math.min(this.pending, this.cap - active, this.total - this.spawned);
        if (count > 0) { this.spawned += count; this.pending = 0; this.lastSpawn = this.elapsed; this.quiet = 0;
          events.push({ type: 'reinforce', count, grace: 8 }); this.record('spawn', count); }
      }
      return events;
    }
    if (this.spawned >= this.total || active >= this.cap) return events;
    const gap = this.pacing === 'fixed' ? 24 : squadHealth < .4 ? 38 : squadHealth < .65 ? 27 : 16;
    const clearGap = this.pacing === 'fixed' ? 12 : squadHealth < .4 ? 25 : 10;
    if ((this.elapsed - this.lastSpawn >= gap && active <= 1) || this.quiet >= clearGap || progress > .8 && this.elapsed - this.lastSpawn > 15 && active <= 1) {
      this.pending = Math.min(2, this.cap - active, this.total - this.spawned);
      this.warning = 8;
      events.push({ type: 'telegraph', count: this.pending, seconds: 8 }); this.record('warning', this.pending);
    }
    return events;
  }
  record(type, count) { this.history.push({ time: Math.round(this.elapsed * 10) / 10, type, count }); if (this.history.length > 32) this.history.shift(); }
  snapshot() { return { version: DIRECTOR_VERSION, category: this.pacing, activeCap: this.cap, spawned: this.spawned, total: this.total, recovery: Math.ceil(this.warning), pending: this.pending }; }
  serialize() { return { ...this, history: this.history.map(event => ({ ...event })) }; }
  static restore(value) { const director = new BattleDirector(value); for (const key of ['spawned', 'elapsed', 'lastSpawn', 'pending', 'warning', 'quiet', 'recallAt']) if (Number.isFinite(value?.[key])) director[key] = value[key]; director.history = Array.isArray(value?.history) ? value.history.slice(-32) : []; return director; }
}
