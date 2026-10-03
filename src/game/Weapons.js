import * as T from "three";
import { pointSegmentDistance } from "./math.js";
import { SpatialHash } from "./SpatialHash.js";
class Weapons {
  constructor(scene, effects, damage, sound) {
    this.scene = scene;
    this.effects = effects;
    this.damage = damage;
    this.sound = sound;
    this._direction = new T.Vector3(); this._lead = new T.Vector3();
    this._axis = new T.Vector3(); this._forward = new T.Vector3(0, 0, -1);
    this._surface = new T.Vector3(); this._segment = new T.Vector3();
    this.shotSerial = 0;
    const bulletGeometry = new T.CylinderGeometry(.14, .14, 18, 4);
    bulletGeometry.rotateX(Math.PI / 2);
    const bulletMaterial = new T.MeshBasicMaterial({color: 0xffb34d, toneMapped: false});
    this.bullets = Array.from({ length: 180 }, () => {
      const mesh = new T.Mesh(bulletGeometry, bulletMaterial);
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
    this.spatialGrid = new SpatialHash(600);
    this._queryResults = [];
  }
  dispose(){this.clear();const geometry=new Set(),materials=new Set();for(const shot of [...this.bullets,...this.missiles]){shot.mesh.removeFromParent();geometry.add(shot.mesh.geometry);materials.add(shot.mesh.material);}for(const item of geometry)item.dispose();for(const item of materials)item.dispose();}
  clear() {
    for (const o of [...this.bullets, ...this.missiles]) {
      o.active = false;
      o.mesh.visible = false;
      o.owner = null;
      if ('target' in o) o.target = null;
      o.trail = 0; o.age = 0; o.motorClock = 0;
      o.previous.copy(o.p);
    }
    this.spatialGrid.clear();
    this._queryResults.length = 0;
  }
  cannon(owner, target = null, { spread = .002, random = Math.random } = {}) {
    const b = this.bullets.find((b2) => !b2.active);
    if (!b) return false;
    b.active = true; b.mesh.visible = this.shotSerial++ % 3 === 0;
    b.owner = owner;
    b.life = 2;
    b.p.set(owner.model?.userData?.modelId === 'a10x' ? -.35 : 0, -.4, -11.4).applyQuaternion(owner.quaternion).add(owner.position);
    b.previous.copy(b.p);
    const dir = this._direction.copy(owner.forward);
    if (target?.alive) {
      const lead = this._lead.copy(target.position).addScaledVector(target.velocity, owner.position.distanceTo(target.position) / 1700).sub(b.p).normalize();
      if (dir.dot(lead) > 0.994) dir.lerp(lead, 0.85).normalize();
    }
    dir.x += (random() - 0.5) * spread;
    dir.y += (random() - 0.5) * spread;
    b.v.copy(dir.normalize()).multiplyScalar(1700).add(owner.velocity);
    b.mesh.quaternion.setFromUnitVectors(this._forward, dir);
    this.effects.emit(b.p, owner.velocity, 0xffc575, 3.2, .035);
    owner.muzzlePulse = .035;
    this.sound?.("cannon", b.p);
    return true;
  }
  missile(owner, target) {
    if (!target?.alive) return false;
    if(this.canTrack && !this.canTrack(owner,target))return false;
    const m = this.missiles.find((m2) => !m2.active);
    if (!m) return false;
    m.active = m.mesh.visible = true;
    m.owner = owner;
    m.target = target;
    m.speed = owner.speed + 90;
    m.life = 18;
    m.trail = 0;
    m.age = 0; m.motorClock = 0; m.ignited = false;
    m.p.copy(owner.position).add(new T.Vector3(owner.team === "player" ? -3 : 3, -1, 1).applyQuaternion(owner.quaternion));
    m.dir.copy(owner.forward);
    m.previous.copy(m.p);
    m.mesh.quaternion.setFromUnitVectors(this._forward, m.dir);
    this.sound?.("release", m.p);
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
    if(this.effects.flareBurst)this.effects.flareBurst(jet);
    else for (let i = 0; i < 30; i++) this.effects.emit(jet.position, new T.Vector3((i % 2 ? 1 : -1) * (30 + Math.random() * 55), -10 - Math.random() * 20, 40 + Math.random() * 70).applyQuaternion(jet.quaternion).add(jet.velocity.clone().multiplyScalar(0.7)), 16766859, 9, 1.5 + Math.random() * 1.5);
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
      let hit = null, hitT = Infinity;
      const segment = this._segment.subVectors(b.p, b.previous), lengthSq = segment.lengthSq();
      for (const j of this._queryResults) {
        if (!j.alive || !b.owner || j === b.owner || (j.team === "enemy") === (b.owner.team === "enemy")) continue;
        const t = T.MathUtils.clamp(this._lead.subVectors(j.position,b.previous).dot(segment)/(lengthSq || 1),0,1);
        if (t < hitT) { hit = j; hitT = t; }
      }
      if (hit) {
        b.p.copy(b.previous).addScaledVector(segment, hitT);
        const dmg = b.owner?.stats?.cannonDamage || 14;
        this.damage(hit, dmg, b.owner, "cannon");
        this.effects.impact?.(b.p, 'metal');
        this.sound?.('hit', b.p);
        b.life = 0;
      }
      const surface = b.life > 0 && terrain?.(b.p);
      if (surface) { this.effects.impact?.(b.p, typeof surface === 'string' ? surface : 'ground'); this.sound?.(surface === 'water' ? 'waterHit' : 'groundHit', b.p); }
      if (b.life <= 0 || surface) {
        b.active = b.mesh.visible = false;
        b.owner = null;
      }
    }
    for (const m of this.missiles) {
      if (!m.active) continue;
      m.previous.copy(m.p);
      m.life -= dt;
      m.age += dt;
      if (m.life <= 0) { m.active = m.mesh.visible = false; m.owner = m.target = null; continue; }
      if (m.age >= .12 && !m.ignited) {
        m.ignited = true; this.effects.emit(m.p, this._surface.set(0,0,0), 0xffc781, 5, .07);
        this.sound?.('missile', m.p);
      }
      if (m.ignited) m.speed = Math.min(1050, m.speed + 240 * dt);
      if (m.target && !m.target.alive) m.target = null;
      if(m.target?.alive && this.canTrack && !this.canTrack(m.owner,m.target))m.target=null;
      if (m.target?.alive && m.ignited) {
        const distance = m.p.distanceTo(m.target.position);
        const intercept = this._lead.copy(m.target.position).addScaledVector(m.target.velocity, Math.min(0.75, distance / m.speed * 0.42)).sub(m.p).normalize();
        const angle = m.dir.angleTo(intercept);
        if (angle > .00001) {
          this._axis.crossVectors(m.dir, intercept);
          if (this._axis.lengthSq() < 1e-10) this._axis.set(0,1,0).cross(m.dir);
          if (this._axis.lengthSq() < 1e-10) this._axis.set(1,0,0).cross(m.dir);
          m.dir.applyAxisAngle(this._axis.normalize(), Math.min(angle, dt * 2.6)).normalize();
        }
      }
      m.p.addScaledVector(m.dir, m.speed * dt);
      m.mesh.quaternion.setFromUnitVectors(this._forward, m.dir);
      m.trail += dt;
      const distant = this.listenerPosition && m.p.distanceToSquared(this.listenerPosition) > 4000 ** 2;
      const trailInterval = distant || this.effects.quality < .5 ? .1 : .05;
      if (m.ignited && m.trail >= trailInterval) {
        m.trail %= trailInterval;
        if (this.effects.missileTrail) {
          this.effects.missileTrail(m.p, m.dir, m.speed);
        } else {
          this.effects.smoke(m.p, false, 10);
          this.effects.emit(m.p, new T.Vector3(), 16759664, 8, 0.14);
        }
      }
      m.motorClock += dt;
      if (m.ignited && m.motorClock >= .18) { m.motorClock %= .18; this.sound?.('rocket', m.p); }
      if (m.age >= .18 && m.target?.alive && pointSegmentDistance(m.target.position, m.previous, m.p) < m.target.radius + 19) {
        const target = m.target;
        this._segment.subVectors(m.p,m.previous);
        const t = T.MathUtils.clamp(this._lead.subVectors(target.position,m.previous).dot(this._segment)/(this._segment.lengthSq() || 1),0,1);
        m.p.copy(m.previous).addScaledVector(this._segment,t);
        this.damage(m.target, 110, m.owner, "missile");
        if (target.alive) this.effects.burst(m.p, 28, 16);
        this.sound?.("explosion", m.p);
        m.life = 0;
      }
      const surface = m.life > 0 && terrain?.(m.p);
      if (surface) { this.effects.burst(m.p, 28, 16); this.effects.impact?.(m.p, surface === 'water' ? 'water' : 'ground'); this.sound?.('explosion',m.p); }
      if (m.life <= 0 || surface) {
        m.active = m.mesh.visible = false;
        m.owner = m.target = null; m.trail = 0;
      }
    }
  }
}
function updateLock(player, target, lock, dt, options = {}) {
  if (!target?.alive) return 0;
  if(options.canTrack && !options.canTrack(player,target))return Math.max(0,lock-dt*2);
  const delta = target.position.clone().sub(player.position);
  const inRange = delta.length() < 8500 && delta.length() > 60;
  const inCone = player.forward.dot(delta.normalize()) > 0.965;
  return inRange && inCone ? Math.min(1.4, lock + dt*(options.rate ?? 1)) : Math.max(0, lock - dt * 2);
}
export {
  Weapons,
  updateLock
};
