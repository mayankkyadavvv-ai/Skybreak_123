// WeaponNetworkManager: Visual and Audio synchronization for remote multiplayer weapons
import * as T from "three";
import { WeaponVisuals, emitMissileSegment } from "../game/WeaponVisuals.js";

export class WeaponNetworkManager {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.effects = game.effects;
    this.audio = game.audio;

    this.remoteBullets = [];
    this.remoteMissiles = [];

    this.visuals = new WeaponVisuals();
    this._trailPoint = new T.Vector3();
    this._previous = new T.Vector3();

  }

  handleCannonFired({ bId, ownerId, pos, vel }) {
    if (!pos || !vel || this.remoteBullets.length >= 180) return;

    // Position of origin
    const origin = new T.Vector3(pos.x, pos.y, pos.z);
    const velocity = new T.Vector3(vel.x, vel.y, vel.z);

    // Visual muzzle flash
    this.effects?.muzzleFlash?.(origin, velocity.clone().multiplyScalar(.1), velocity.clone().normalize());

    // Create moving tracer
    const mesh = this.visuals.tracer();
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
    if (!pos || !dir || this.remoteMissiles.length >= 36) return;

    const origin = new T.Vector3(pos.x, pos.y, pos.z);
    const direction = new T.Vector3(dir.x, dir.y, dir.z).normalize();

    // Visual ignition burst
    this.effects?.muzzleFlash?.(origin, new T.Vector3(), direction);

    const mesh = this.visuals.missile();
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
      this._previous.copy(m.position);
      m.position.addScaledVector(m.direction, m.speed * dt);
      m.mesh.position.copy(m.position);
      m.mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 0, -1), m.direction);

      emitMissileSegment(this.effects, this._previous, m.position, m.direction, m.speed, this._trailPoint);
      m.mesh.children[0].visible = this.effects?.intensity !== 0;

      if (m.life <= 0 || m.position.y < 5) {
        this.scene.remove(m.mesh);
        this.remoteMissiles.splice(i, 1);
      }
    }
  }

  dispose() { this.clear(); this.visuals.dispose(); }

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

