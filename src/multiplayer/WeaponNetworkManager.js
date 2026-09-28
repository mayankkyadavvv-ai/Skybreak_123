// WeaponNetworkManager: Visual and Audio synchronization for remote multiplayer weapons
import * as T from "three";

export class WeaponNetworkManager {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.effects = game.effects;
    this.audio = game.audio;

    this.remoteBullets = [];
    this.remoteMissiles = [];

    // Pooled visual meshes for remote bullets
    this.bulletGeo = new T.CylinderGeometry(0.18, 0.18, 22, 4);
    this.bulletGeo.rotateX(Math.PI / 2);
    this.bulletMat = new T.MeshBasicMaterial({ color: 0xffcc33 });

    // Pooled visual mesh for missiles
    this.missileGeo = new T.ConeGeometry(0.48, 3.8, 6);
    this.missileGeo.rotateX(-Math.PI / 2);
    this.missileMat = new T.MeshBasicMaterial({ color: 0xff7722 });
  }

  handleCannonFired({ bId, ownerId, pos, vel }) {
    if (!pos || !vel) return;

    // Position of origin
    const origin = new T.Vector3(pos.x, pos.y, pos.z);
    const velocity = new T.Vector3(vel.x, vel.y, vel.z);

    // Visual muzzle flash
    this.effects?.emit(origin, velocity.clone().multiplyScalar(0.1), 0xffaa33, 6, 0.08);

    // Create moving tracer
    const mesh = new T.Mesh(this.bulletGeo, this.bulletMat);
    mesh.position.copy(origin);
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 0, -1), velocity.clone().normalize());
    this.scene.add(mesh);

    this.remoteBullets.push({
      mesh,
      position: origin,
      velocity,
      life: 1.8
    });

    // Directional audio
    const dist = this.game.camera ? origin.distanceTo(this.game.camera.position) : 500;
    this.audio?.play("cannon", { distance: dist });
  }

  handleMissileLaunched({ mId, ownerId, targetId, pos, dir, speed }) {
    if (!pos || !dir) return;

    const origin = new T.Vector3(pos.x, pos.y, pos.z);
    const direction = new T.Vector3(dir.x, dir.y, dir.z).normalize();

    // Visual ignition burst
    this.effects?.burst(origin, 10, 6);

    const mesh = new T.Mesh(this.missileGeo, this.missileMat);
    mesh.position.copy(origin);
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 0, -1), direction);
    this.scene.add(mesh);

    this.remoteMissiles.push({
      mId,
      mesh,
      position: origin,
      direction,
      speed: speed || 450,
      life: 16.0,
      trailTimer: 0,
      targetId
    });

    const dist = this.game.camera ? origin.distanceTo(this.game.camera.position) : 500;
    this.audio?.play("missile", { distance: dist });
  }

  handleFlaresDeployed({ playerId, diverted }) {
    const remoteJet = this.game.multiplayer?.remotePlayers.get(playerId);
    const jetPos = remoteJet?.model ? remoteJet.model.position : null;
    if (!jetPos) return;

    // Spawn 24 flare embers
    for (let i = 0; i < 24; i++) {
      const vel = new T.Vector3(
        (i % 2 ? 1 : -1) * (20 + Math.random() * 40),
        -5 - Math.random() * 15,
        30 + Math.random() * 50
      );
      this.effects?.emit(jetPos, vel, 0xffbb44, 8, 1.2 + Math.random());
    }

    const dist = this.game.camera ? jetPos.distanceTo(this.game.camera.position) : 500;
    this.audio?.play("flare", { distance: dist });
  }

  update(dt) {
    // 1. Update remote bullets
    for (let i = this.remoteBullets.length - 1; i >= 0; i--) {
      const b = this.remoteBullets[i];
      b.life -= dt;
      b.position.addScaledVector(b.velocity, dt);
      b.mesh.position.copy(b.position);

      if (b.life <= 0 || b.position.y < 5) {
        this.scene.remove(b.mesh);
        this.remoteBullets.splice(i, 1);
      }
    }

    // 2. Update remote missiles
    for (let i = this.remoteMissiles.length - 1; i >= 0; i--) {
      const m = this.remoteMissiles[i];
      m.life -= dt;
      m.speed = Math.min(1050, m.speed + 220 * dt);
      m.position.addScaledVector(m.direction, m.speed * dt);
      m.mesh.position.copy(m.position);
      m.mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 0, -1), m.direction);

      m.trailTimer += dt;
      if (m.trailTimer > 0.04) {
        m.trailTimer = 0;
        this.effects?.smoke(m.position, false, 8);
      }

      if (m.life <= 0 || m.position.y < 5) {
        this.scene.remove(m.mesh);
        this.remoteMissiles.splice(i, 1);
      }
    }
  }

  clear() {
    for (const b of this.remoteBullets) {
      this.scene.remove(b.mesh);
    }
    this.remoteBullets = [];

    for (const m of this.remoteMissiles) {
      this.scene.remove(m.mesh);
    }
    this.remoteMissiles = [];
  }
}
