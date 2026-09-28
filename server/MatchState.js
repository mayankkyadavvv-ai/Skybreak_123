// Authoritative Match State & 30Hz Simulation Engine for SkyBreak
// Manages player states, combat hits, damage, kills, assists, respawns, and win conditions.
import { IAF_BASES } from "../src/game/GeoWorld.js";

const finiteVector = (v) => v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
const facingVector = (q) => ({
  x: -2 * (q.x * q.z + q.y * q.w),
  y: 2 * (q.x * q.w - q.y * q.z),
  z: -1 + 2 * (q.x * q.x + q.y * q.y)
});
const distanceToSegment = (point, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const lengthSq = dx * dx + dy * dy + dz * dz;
  const t = lengthSq ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy + (point.z - a.z) * dz) / lengthSq)) : 0;
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy, point.z - a.z - t * dz);
};

export class MatchState {
  constructor(room, options = {}) {
    this.room = room;
    this.options = {
      mode: options.mode || "1v1",
      killLimit: options.killLimit ?? 3,
      matchDuration: options.matchDuration ?? 600, // 0 means untimed Free Flight
      friendlyFire: Boolean(options.friendlyFire),
      weaponsEnabled: options.weaponsEnabled ?? true,
      enemyRadar: options.enemyRadar ?? true,
      timeOfDay: options.timeOfDay || "day",
      weather: options.weather || "clear",
      ...options
    };

    this.players = new Map();
    this.bullets = [];
    this.missiles = [];
    this.bulletSeq = 0;
    this.missileSeq = 0;

    this.elapsed = 0;
    this.timeRemaining = this.options.matchDuration === 0 ? Infinity : this.options.matchDuration;
    this.status = "playing"; // "playing" | "ended"
    this.winner = null;

    this.teamScores = { blue: 0, red: 0 };
    this.recentDamage = new Map(); // victimId -> [{ attackerId, amount, timestamp }]
    this.intervalId = null;
    this.lastTick = Date.now();
  }

  initPlayer(player) {
    const isBlue = player.team === "blue";
    const teamIndex = Array.from(this.players.values()).filter((p) => p.team === player.team).length;

    // Spawn positioning: Blue Team spawns in South facing North, Red Team in North facing South
    const spawnZ = isBlue ? 5200 + teamIndex * 350 : -5200 - teamIndex * 350;
    const spawnX = (teamIndex % 2 === 0 ? 1 : -1) * Math.floor((teamIndex + 1) / 2) * 450;
    const spawnY = 1600 + (teamIndex % 3) * 120;
    const rotY = isBlue ? 0 : Math.PI;

    // Quaternion from Y-rotation
    const qy = Math.sin(rotY / 2);
    const qw = Math.cos(rotY / 2);

    const pState = {
      id: player.id,
      name: player.name || "Pilot",
      team: player.team || "blue",
      jetModel: player.jetModel || "x17",
      liveryId: player.liveryId || "grey",
      position: { x: spawnX, y: spawnY, z: spawnZ },
      quaternion: { x: 0, y: qy, z: 0, w: qw },
      velocity: { x: 0, y: 0, z: isBlue ? -240 : 240 },
      angular: { x: 0, y: 0, z: 0 },
      speed: 240,
      throttle: 0.6,
      boost: false,
      gearDown: false,
      hp: 100,
      maxHp: 100,
      missiles: 6,
      cannon: 1200,
      flares: 20,
      alive: true,
      deadTime: 0,
      respawnTimer: 0,
      spawnProtectedUntil: Date.now() + 3500, // 3.5 seconds initial spawn shield
      kills: 0,
      deaths: 0,
      assists: 0,
      score: 0,
      damageDealt: 0,
      ping: player.ping || 30,
      isLanded: false
    };

    this.players.set(player.id, pState);
    this.recentDamage.set(player.id, []);
    return pState;
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    this.recentDamage.delete(playerId);
    this.bullets = this.bullets.filter((b) => b.ownerId !== playerId);
    this.missiles = this.missiles.filter((m) => m.ownerId !== playerId);
  }

  updateTelemetry(playerId, data) {
    const p = this.players.get(playerId);
    if (!p || !p.alive || !data || typeof data !== "object") return;

    if (finiteVector(data.position) && Math.abs(data.position.x) <= 95000 && Math.abs(data.position.z) <= 95000 && data.position.y >= 5 && data.position.y <= 16000) {
      const now = Date.now();
      const elapsed = Math.min(1, Math.max(0, (now - (p.lastTelemetryAt || now)) / 1000));
      const traveled = Math.hypot(data.position.x - p.position.x, data.position.y - p.position.y, data.position.z - p.position.z);
      if (traveled <= 80 + 900 * elapsed) {
        p.position = { ...data.position };
        p.lastTelemetryAt = now;
      }
    }
    if (data.quaternion && [data.quaternion.x, data.quaternion.y, data.quaternion.z, data.quaternion.w].every(Number.isFinite)) {
      const q = data.quaternion;
      const length = Math.hypot(q.x, q.y, q.z, q.w);
      if (length > 0.5 && length < 1.5) p.quaternion = { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length };
    }
    if (finiteVector(data.velocity) && Math.hypot(data.velocity.x, data.velocity.y, data.velocity.z) <= 850) {
      p.velocity = { ...data.velocity };
    }
    if (Number.isFinite(data.speed)) p.speed = Math.min(750, Math.max(0, data.speed));
    if (Number.isFinite(data.throttle)) p.throttle = Math.min(1, Math.max(0, data.throttle));
    p.boost = Boolean(data.boost);
    p.gearDown = Boolean(data.gearDown);
    p.isLanded = Boolean(data.isLanded);
    if (data.angular && typeof data.angular === "object") {
      for (const axis of ["x", "y", "z"]) if (Number.isFinite(data.angular[axis])) p.angular[axis] = Math.max(-3, Math.min(3, data.angular[axis]));
    }
  }

  handleFireCannon(playerId, { direction } = {}) {
    const p = this.players.get(playerId);
    if (!p || !p.alive || !this.options.weaponsEnabled || p.cannon <= 0) return null;
    const now = Date.now();
    if (!finiteVector(direction) || Math.hypot(direction.x, direction.y, direction.z) < 0.5 || now - (p.lastCannonAt || 0) < 55) return null;
    const fwd = facingVector(p.quaternion);
    const dirLength = Math.hypot(direction.x, direction.y, direction.z);
    if ((fwd.x * direction.x + fwd.y * direction.y + fwd.z * direction.z) / dirLength < 0.94) return null;
    p.lastCannonAt = now;

    p.cannon = Math.max(0, p.cannon - 1);
    p.spawnProtectedUntil = 0;

    const bId = ++this.bulletSeq;
    const speed = 1700;
    const dir = direction;
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    const ndir = { x: dir.x / len, y: dir.y / len, z: dir.z / len };

    const bullet = {
      id: bId,
      ownerId: playerId,
      team: p.team,
      position: { ...p.position },
      previous: { ...p.position },
      velocity: {
        x: ndir.x * speed + p.velocity.x,
        y: ndir.y * speed + p.velocity.y,
        z: ndir.z * speed + p.velocity.z
      },
      life: 2.0
    };

    this.bullets.push(bullet);
    return bullet;
  }

  handleFireMissile(playerId, { targetId, direction } = {}) {
    const p = this.players.get(playerId);
    if (!p || !p.alive || !this.options.weaponsEnabled || p.missiles <= 0) return null;

    const target = this.players.get(targetId);
    if (!target || !target.alive) return null;

    if (target.team === p.team && !this.options.friendlyFire) return null;
    const now = Date.now();
    if (!finiteVector(direction) || Math.hypot(direction.x, direction.y, direction.z) < 0.5 || now - (p.lastMissileAt || 0) < 1700) return null;
    const range = Math.hypot(target.position.x - p.position.x, target.position.y - p.position.y, target.position.z - p.position.z);
    if (range < 60 || range > 8500) return null;
    const fwd = facingVector(p.quaternion);
    const targetDot = (fwd.x * (target.position.x - p.position.x) + fwd.y * (target.position.y - p.position.y) + fwd.z * (target.position.z - p.position.z)) / range;
    if (targetDot < 0.965) return null;
    p.lastMissileAt = now;

    p.missiles = Math.max(0, p.missiles - 1);
    p.spawnProtectedUntil = 0;

    const mId = ++this.missileSeq;
    const dir = direction;
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;

    const missile = {
      id: mId,
      ownerId: playerId,
      team: p.team,
      targetId,
      position: { ...p.position },
      previous: { ...p.position },
      direction: { x: dir.x / len, y: dir.y / len, z: dir.z / len },
      speed: p.speed + 90,
      life: 18.0,
      active: true
    };

    this.missiles.push(missile);
    return missile;
  }

  handleDeployFlares(playerId) {
    const p = this.players.get(playerId);
    if (!p || !p.alive || !this.options.weaponsEnabled || p.flares <= 0) return 0;
    const now = Date.now();
    if (now - (p.lastFlareAt || 0) < 750) return 0;
    p.lastFlareAt = now;

    p.flares = Math.max(0, p.flares - 1);
    let diverted = 0;

    for (const m of this.missiles) {
      if (m.active && m.targetId === playerId) {
        const dist = Math.hypot(m.position.x - p.position.x, m.position.y - p.position.y, m.position.z - p.position.z);
        if (dist < 4500) {
          m.targetId = null;
          m.life = Math.min(m.life, 2.5);
          m.direction.x += (Math.random() - 0.5) * 1.5;
          m.direction.y -= 0.6;
          m.direction.z += (Math.random() - 0.5) * 1.5;
          diverted++;
        }
      }
    }
    return diverted;
  }

  canRearmAtBase(playerId, baseId) {
    const p = this.players.get(playerId);
    const base = IAF_BASES.find((item) => item.id === baseId);
    if (!p?.alive || !base || !p.gearDown || !p.isLanded || p.speed > 110) return false;
    return Math.abs(p.position.x - base.x) <= base.runwayWidth / 2 + 25 &&
      Math.abs(p.position.z - base.z) <= base.runwayLength / 2 + 40 &&
      Math.abs(p.position.y - (base.elevation + 3.2)) < 12;
  }

  rearmPlayer(playerId) {
    const p = this.players.get(playerId);
    if (!p) return;
    p.hp = p.maxHp;
    p.cannon = 1200;
    p.missiles = 6;
    p.flares = 20;
  }

  applyDamage(victimId, amount, attackerId, weaponType = "cannon") {
    const victim = this.players.get(victimId);
    if (!victim || !victim.alive) return null;

    const now = Date.now();
    if (now < victim.spawnProtectedUntil) return null;

    const attacker = attackerId ? this.players.get(attackerId) : null;
    if (attacker && attacker.team === victim.team && attacker !== victim && !this.options.friendlyFire) {
      return null;
    }

    victim.hp = Math.max(0, victim.hp - amount);

    if (attacker && attacker !== victim) {
      attacker.damageDealt = (attacker.damageDealt || 0) + amount;
      attacker.score = (attacker.score || 0) + Math.round(amount * 1.5);
      const history = this.recentDamage.get(victimId) || [];
      history.push({ attackerId, amount, timestamp: now });
      this.recentDamage.set(victimId, history);
    }

    let killEvent = null;
    if (victim.hp <= 0) {
      killEvent = this.handleKill(victim, attacker, weaponType);
    }

    return {
      victimId,
      newHp: victim.hp,
      attackerId,
      weaponType,
      amount,
      killEvent
    };
  }

  handleKill(victim, killer, weaponType) {
    victim.alive = false;
    victim.deaths = (victim.deaths || 0) + 1;
    victim.deadTime = 0;
    victim.respawnTimer = 5.0;

    let assistPlayer = null;
    const now = Date.now();
    const history = this.recentDamage.get(victim.id) || [];

    const candidateAssists = history.filter(
      (h) => h.attackerId !== killer?.id && now - h.timestamp < 8000
    );

    const assistMap = new Map();
    for (const ca of candidateAssists) {
      assistMap.set(ca.attackerId, (assistMap.get(ca.attackerId) || 0) + ca.amount);
    }

    let topAssistId = null;
    let maxAssistDmg = 0;
    for (const [aId, dmg] of assistMap.entries()) {
      if (dmg >= 25 && dmg > maxAssistDmg) {
        maxAssistDmg = dmg;
        topAssistId = aId;
      }
    }

    if (topAssistId) {
      assistPlayer = this.players.get(topAssistId);
      if (assistPlayer) {
        assistPlayer.assists = (assistPlayer.assists || 0) + 1;
        assistPlayer.score = (assistPlayer.score || 0) + 400;
      }
    }

    if (killer && killer !== victim) {
      killer.kills = (killer.kills || 0) + 1;
      killer.score = (killer.score || 0) + 1000;
      if (killer.team) this.teamScores[killer.team] = (this.teamScores[killer.team] || 0) + 1;
    }

    this.recentDamage.set(victim.id, []);

    const event = {
      victimId: victim.id,
      victimName: victim.name,
      killerId: killer?.id || null,
      killerName: killer?.name || "Terrain / Crash",
      weapon: weaponType,
      assistId: assistPlayer?.id || null,
      assistName: assistPlayer?.name || null,
      teamScores: { ...this.teamScores }
    };

    this.checkWinConditions();
    return event;
  }

  respawnPlayer(playerId) {
    const p = this.players.get(playerId);
    if (!p) return null;

    const isBlue = p.team === "blue";
    const teamIndex = Math.floor(Math.random() * 3);
    const spawnZ = isBlue ? 5200 + teamIndex * 400 : -5200 - teamIndex * 400;
    const spawnX = (Math.random() - 0.5) * 1600;
    const spawnY = 1600 + Math.random() * 400;
    const rotY = isBlue ? 0 : Math.PI;

    p.position = { x: spawnX, y: spawnY, z: spawnZ };
    p.quaternion = { x: 0, y: Math.sin(rotY / 2), z: 0, w: Math.cos(rotY / 2) };
    p.velocity = { x: 0, y: 0, z: isBlue ? -240 : 240 };
    p.speed = 240;
    p.throttle = 0.6;
    p.boost = false;
    p.hp = p.maxHp;
    p.alive = true;
    p.missiles = 6;
    p.cannon = 1200;
    p.flares = 20;
    p.respawnTimer = 0;
    p.spawnProtectedUntil = Date.now() + 3000;

    return p;
  }

  checkWinConditions() {
    if (this.status === "ended") return;
    if (this.options.mode === "free_flight") return;

    const limit = this.options.killLimit;

    if (limit > 0 && this.options.mode === "1v1") {
      for (const p of this.players.values()) {
        if (p.kills >= limit) {
          this.endMatch(p.name, p.team);
          return;
        }
      }
    } else if (limit > 0) {
      if (this.teamScores.blue >= limit) {
        this.endMatch("Blue Team", "blue");
        return;
      }
      if (this.teamScores.red >= limit) {
        this.endMatch("Red Team", "red");
        return;
      }
    }

    if (this.timeRemaining <= 0) {
      if (this.options.mode === "1v1") {
        const sorted = Array.from(this.players.values()).sort((a, b) => b.score - a.score);
        this.endMatch(sorted[0]?.name || "Draw", sorted[0]?.team || "draw");
      } else {
        if (this.teamScores.blue > this.teamScores.red) this.endMatch("Blue Team", "blue");
        else if (this.teamScores.red > this.teamScores.blue) this.endMatch("Red Team", "red");
        else this.endMatch("Draw", "draw");
      }
    }
  }

  endMatch(winnerName, winnerTeam) {
    this.status = "ended";
    this.winner = { name: winnerName, team: winnerTeam };
  }

  tick(dt) {
    if (this.status === "ended") return;

    this.elapsed += dt;
    if (Number.isFinite(this.timeRemaining)) this.timeRemaining = Math.max(0, this.timeRemaining - dt);
    if (this.timeRemaining <= 0) this.checkWinConditions();

    // Bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life -= dt;
      b.previous = { ...b.position };
      b.position.x += b.velocity.x * dt;
      b.position.y += b.velocity.y * dt;
      b.position.z += b.velocity.z * dt;

      let hit = false;
      for (const p of this.players.values()) {
        if (!p.alive || p.id === b.ownerId) continue;
        if (p.team === b.team && !this.options.friendlyFire) continue;

        const dist = distanceToSegment(p.position, b.previous, b.position);
        if (dist < 15) {
          this.applyDamage(p.id, 14, b.ownerId, "cannon");
          hit = true;
          break;
        }
      }

      if (hit || b.life <= 0 || b.position.y < 5) {
        this.bullets.splice(i, 1);
      }
    }

    // Missiles
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.life -= dt;
      m.speed = Math.min(1050, m.speed + 240 * dt);

      if (m.targetId) {
        const target = this.players.get(m.targetId);
        if (target && target.alive) {
          const dx = target.position.x - m.position.x;
          const dy = target.position.y - m.position.y;
          const dz = target.position.z - m.position.z;
          const dist = Math.hypot(dx, dy, dz) || 1;

          const turnRate = dt * 2.8;
          m.direction.x += (dx / dist - m.direction.x) * turnRate;
          m.direction.y += (dy / dist - m.direction.y) * turnRate;
          m.direction.z += (dz / dist - m.direction.z) * turnRate;
          const dlen = Math.hypot(m.direction.x, m.direction.y, m.direction.z) || 1;
          m.direction.x /= dlen;
          m.direction.y /= dlen;
          m.direction.z /= dlen;

        } else {
          m.targetId = null;
        }
      }

      m.previous = { ...m.position };
      m.position.x += m.direction.x * m.speed * dt;
      m.position.y += m.direction.y * m.speed * dt;
      m.position.z += m.direction.z * m.speed * dt;

      const target = m.targetId && this.players.get(m.targetId);
      if (target?.alive && distanceToSegment(target.position, m.previous, m.position) < 26) {
        this.applyDamage(target.id, 110, m.ownerId, "missile");
        this.missiles.splice(i, 1);
        continue;
      }

      if (m.life <= 0 || m.position.y < 5) {
        this.missiles.splice(i, 1);
      }
    }

    // Dead players respawn countdown
    for (const p of this.players.values()) {
      if (!p.alive) {
        p.respawnTimer -= dt;
        if (p.respawnTimer <= 0) {
          this.respawnPlayer(p.id);
        }
      }
    }
  }

  getSnapshot() {
    const playerSnapshots = [];
    for (const p of this.players.values()) {
      playerSnapshots.push({
        id: p.id,
        name: p.name,
        team: p.team,
        model: p.jetModel,
        livery: p.liveryId,
        pos: [Math.round(p.position.x * 10) / 10, Math.round(p.position.y * 10) / 10, Math.round(p.position.z * 10) / 10],
        quat: [
          Math.round(p.quaternion.x * 1000) / 1000,
          Math.round(p.quaternion.y * 1000) / 1000,
          Math.round(p.quaternion.z * 1000) / 1000,
          Math.round(p.quaternion.w * 1000) / 1000
        ],
        vel: [Math.round(p.velocity.x), Math.round(p.velocity.y), Math.round(p.velocity.z)],
        spd: Math.round(p.speed),
        thr: Math.round(p.throttle * 100) / 100,
        hp: Math.round(p.hp),
        ammo: { cannon: p.cannon, missiles: p.missiles, flares: p.flares },
        alive: p.alive,
        boost: p.boost,
        gear: p.gearDown,
        landed: p.isLanded,
        respawn: Math.max(0, Math.ceil(p.respawnTimer)),
        shield: p.spawnProtectedUntil > Date.now(),
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        score: p.score,
        ping: p.ping
      });
    }

    return {
      t: Date.now(),
      rem: Number.isFinite(this.timeRemaining) ? Math.round(this.timeRemaining) : null,
      scores: this.teamScores,
      players: playerSnapshots,
      status: this.status,
      winner: this.winner
    };
  }
}
