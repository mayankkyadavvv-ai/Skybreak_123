import * as T from "three";
import { forward, pointSegmentDistance } from "./math.js";
import { WeaponVisuals, emitMissileSegment } from "./WeaponVisuals.js";
import { SpatialHash } from "./SpatialHash.js";
class Weapons {
  constructor(scene, effects, damage, sound) {
    this.scene = scene;
    this.effects = effects;
    this.damage = damage;
    this.sound = sound;
    this.visuals = new WeaponVisuals();
    this._trailPoint = new T.Vector3();
    this.bullets = Array.from({ length: 180 }, () => {
      const mesh = this.visuals.tracer();
      mesh.visible = false;
      scene.add(mesh);
      return { mesh, active: false, p: mesh.position, previous: new T.Vector3(), v: new T.Vector3(), life: 0, owner: null };
    });
    this.missiles = Array.from({ length: 36 }, () => {
      const mesh = this.visuals.missile();
      mesh.visible = false;
      scene.add(mesh);
      return { mesh, p: mesh.position, previous: new T.Vector3(), dir: new T.Vector3(), active: false, target: null, owner: null, speed: 0, life: 0, trail: 0 };
    });
    this.spatialGrid = new SpatialHash(600);
    this._queryResults = [];
  }
  dispose() { this.clear(); for (const shot of [...this.bullets, ...this.missiles]) shot.mesh.removeFromParent(); this.visuals.dispose(); }
  clear() {
    for (const o of [...this.bullets, ...this.missiles]) {
      o.active = false;
      o.mesh.visible = false;
      o.owner = null;
      if ('target' in o) o.target = null;
    }
    this.spatialGrid.clear();
    this._queryResults.length = 0;
  }
  cannon(owner, target = null, { spread = .002, random = Math.random } = {}) {
    const b = this.bullets.find((b2) => !b2.active);
    if (!b) return false;
    b.active = b.mesh.visible = true;
    b.mesh.children[0].visible = this.effects.intensity !== 0;
    b.owner = owner;
    b.life = 2;
    b.p.copy(owner.position).addScaledVector(owner.forward, 10);
    let dir = owner.forward.clone();
    if (target?.alive) {
      const lead = target.position.clone().addScaledVector(target.velocity, owner.position.distanceTo(target.position) / 1700).sub(b.p).normalize();
      if (dir.dot(lead) > 0.994) dir.lerp(lead, 0.85).normalize();
    }
    dir.x += (random() - 0.5) * spread;
    dir.y += (random() - 0.5) * spread;
    b.v.copy(dir.normalize()).multiplyScalar(1700).add(owner.velocity);
    b.mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 0, -1), dir);
    if (this.effects.muzzleFlash) this.effects.muzzleFlash(b.p, owner.velocity, dir);
    else this.effects.emit(b.p, owner.velocity, 0xffcb68, 10, .065);
    this.sound?.("cannon", owner.team === "player" ? undefined : b.p);
    return true;
  }
  missile(owner, target) {
    if (!target?.alive) return false;
    const m = this.missiles.find((m2) => !m2.active);
    if (!m) return false;
    m.active = m.mesh.visible = true;
    m.mesh.children[0].visible = this.effects.intensity !== 0;
    m.owner = owner;
    m.target = target;
    m.speed = owner.speed + 90;
    m.life = 18;
    m.trail = 0;
    m.p.copy(owner.position).add(new T.Vector3(owner.team === "player" ? -3 : 3, -1, 1).applyQuaternion(owner.quaternion));
    m.dir.copy(owner.forward);
    m.previous.copy(m.p);
    m.mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 0, -1), m.dir);
    this.effects.muzzleFlash?.(m.p, owner.velocity, m.dir);
    this.sound?.("missile", owner.team === "player" ? undefined : m.p);
    return true;
  }
  deployFlares(jet) {
    let diverted = 0;
    for (const m of this.missiles) {
      if (m.active && m.target === jet && m.p.distanceTo(jet.position) < 4500) {
        m.target = null;
        m.dir.add(new T.Vector3((Math.random() - 0.5) * 1.7, -0.55, 0.4)).normalize();
        m.life = Math.min(m.life, 2.4);
        diverted++;
      }
    }
    for (let i = 0; i < 30; i++) this.effects.emit(jet.position, new T.Vector3((i % 2 ? 1 : -1) * (30 + Math.random() * 55), -10 - Math.random() * 20, 40 + Math.random() * 70).applyQuaternion(jet.quaternion).add(jet.velocity.clone().multiplyScalar(0.7)), 16766859, 9, 1.5 + Math.random() * 1.5);
    this.sound?.("flare", jet.position);
    return diverted;
  }
  update(dt, jets, terrain) {
    this.spatialGrid.clear();
    for (const j of jets) {
      if (j.alive) {
        this.spatialGrid.insert(j, j.position, j.radius);
      }
    }

    for (const b of this.bullets) {
      if (!b.active) continue;
      b.previous.copy(b.p);
      b.p.addScaledVector(b.v, dt);
      b.life -= dt;

      this.spatialGrid.querySegment(b.previous, b.p, 3, this._queryResults);
      for (const j of this._queryResults) {
        if (!j.alive || j === b.owner || j.team === "enemy" === (b.owner.team === "enemy")) continue;
        const dmg = b.owner?.stats?.cannonDamage || 14;
        this.damage(j, dmg, b.owner, "cannon");
        if (this.effects.weaponImpact) this.effects.weaponImpact(b.p, b.v, false);
        else this.effects.burst(b.p, 5, 5);
        b.life = 0;
        break;
      }
      const groundHit = b.life > 0 && terrain?.(b.p);
      if (groundHit) this.effects.weaponImpact?.(b.p, b.v, false);
      if (b.life <= 0 || groundHit) {
        b.active = b.mesh.visible = false;
      }
    }
    for (const m of this.missiles) {
      if (!m.active) continue;
      m.previous.copy(m.p);
      m.life -= dt;
      m.speed = Math.min(1050, m.speed + 240 * dt);
      if (m.target?.alive) {
        const distance = m.p.distanceTo(m.target.position);
        const intercept = m.target.position.clone().addScaledVector(m.target.velocity, Math.min(0.75, distance / m.speed * 0.42)).sub(m.p).normalize();
        const angle = m.dir.angleTo(intercept);
        m.dir.lerp(intercept, Math.min(1, dt * 2.6 / Math.max(0.01, angle))).normalize();
      }
      m.p.addScaledVector(m.dir, m.speed * dt);
      m.mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 0, -1), m.dir);
      emitMissileSegment(this.effects, m.previous, m.p, m.dir, m.speed, this._trailPoint);
      const motor = m.mesh.children[0];
      motor.visible = this.effects.intensity !== 0;
      motor.scale.setScalar(1 + Math.sin(m.life * 73) * .07);
      if (m.target?.alive && pointSegmentDistance(m.target.position, m.previous, m.p) < m.target.radius + 19) {
        this.damage(m.target, 110, m.owner, "missile");
        if (this.effects.weaponImpact) this.effects.weaponImpact(m.p, m.dir, true);
        else this.effects.burst(m.p, 35, 25);
        this.sound?.("explosion", m.p);
        m.life = 0;
      }
      const groundHit = m.life > 0 && terrain?.(m.p);
      if (groundHit) { this.effects.weaponImpact?.(m.p, m.dir, true); this.sound?.("explosion", m.p); }
      if (m.life <= 0 || groundHit) {
        m.active = m.mesh.visible = false;
      }
    }
  }
}
function updateLock(player, target, lock, dt) {
  if (!target?.alive) return 0;
  const delta = target.position.clone().sub(player.position);
  const inRange = delta.length() < 8500 && delta.length() > 60;
  const inCone = player.forward.dot(delta.normalize()) > 0.965;
  return inRange && inCone ? Math.min(1.4, lock + dt) : Math.max(0, lock - dt * 2);
}
export {
  Weapons,
  updateLock
};

