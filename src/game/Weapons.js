import * as T from "three";
import { forward, pointSegmentDistance } from "./math.js";
class Weapons {
  constructor(scene, effects, damage, sound) {
    this.scene = scene;
    this.effects = effects;
    this.damage = damage;
    this.sound = sound;
    this.bullets = Array.from({ length: 180 }, () => {
      const mesh = new T.Mesh(new T.CylinderGeometry(0.18, 0.18, 24, 4), new T.MeshBasicMaterial({ color: 16770723 }));
      mesh.geometry.rotateX(Math.PI / 2);
      mesh.visible = false;
      scene.add(mesh);
      return { mesh, active: false, p: mesh.position, previous: new T.Vector3(), v: new T.Vector3(), life: 0, owner: null };
    });
    const geo = new T.ConeGeometry(0.5, 4, 6);
    geo.rotateX(-Math.PI / 2);
    const mat = new T.MeshBasicMaterial({ color: 16763256 });
    this.missiles = Array.from({ length: 36 }, () => {
      const mesh = new T.Mesh(geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      return { mesh, p: mesh.position, previous: new T.Vector3(), dir: new T.Vector3(), active: false, target: null, owner: null, speed: 0, life: 0, trail: 0 };
    });
  }
  clear() {
    for (const o of [...this.bullets, ...this.missiles]) {
      o.active = false;
      o.mesh.visible = false;
    }
  }
  cannon(owner, target = null) {
    const b = this.bullets.find((b2) => !b2.active);
    if (!b) return false;
    b.active = b.mesh.visible = true;
    b.owner = owner;
    b.life = 2;
    b.p.copy(owner.position).addScaledVector(owner.forward, 10);
    let dir = owner.forward;
    if (target?.alive) {
      const lead = target.position.clone().addScaledVector(target.velocity, owner.position.distanceTo(target.position) / 1700).sub(b.p).normalize();
      if (dir.dot(lead) > 0.994) dir.lerp(lead, 0.85).normalize();
    }
    dir.x += (Math.random() - 0.5) * 2e-3;
    dir.y += (Math.random() - 0.5) * 2e-3;
    b.v.copy(dir.normalize()).multiplyScalar(1700).add(owner.velocity);
    b.mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 0, -1), dir);
    this.effects.emit(b.p, owner.velocity, 16772789, 5, 0.06);
    if (owner.team === "player") this.sound?.("cannon");
    return true;
  }
  missile(owner, target) {
    if (!target?.alive) return false;
    const m = this.missiles.find((m2) => !m2.active);
    if (!m) return false;
    m.active = m.mesh.visible = true;
    m.owner = owner;
    m.target = target;
    m.speed = owner.speed + 90;
    m.life = 18;
    m.trail = 0;
    m.p.copy(owner.position).add(new T.Vector3(owner.team === "player" ? -3 : 3, -1, 1).applyQuaternion(owner.quaternion));
    m.dir.copy(owner.forward);
    m.previous.copy(m.p);
    this.effects.burst(m.p, 8, 5);
    if (owner.team === "player") this.sound?.("missile");
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
    for (const b of this.bullets) {
      if (!b.active) continue;
      b.previous.copy(b.p);
      b.p.addScaledVector(b.v, dt);
      b.life -= dt;
      for (const j of jets) {
        if (!j.alive || j === b.owner || j.team === "enemy" === (b.owner.team === "enemy")) continue;
        if (pointSegmentDistance(j.position, b.previous, b.p) < j.radius + 3) {
          const dmg = b.owner?.stats?.cannonDamage || 14;
          this.damage(j, dmg, b.owner, "cannon");
          this.effects.burst(b.p, 5, 5);
          b.life = 0;
          break;
        }
      }
      if (b.life <= 0 || terrain?.(b.p)) {
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
      m.trail += dt;
      if (m.trail > 0.045) {
        m.trail = 0;
        this.effects.smoke(m.p, false, 10);
        this.effects.emit(m.p, new T.Vector3(), 16759664, 8, 0.14);
      }
      if (m.target?.alive && pointSegmentDistance(m.target.position, m.previous, m.p) < m.target.radius + 19) {
        this.damage(m.target, 110, m.owner, "missile");
        this.effects.burst(m.p, 35, 25);
        this.sound?.("explosion", m.p);
        m.life = 0;
      }
      if (m.life <= 0 || terrain?.(m.p)) {
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
