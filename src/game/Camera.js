import * as T from "three";
import { damp } from "./math.js";

// Reusable vectors to completely eliminate frame-loop garbage collection
const _look = new T.Vector3();
const _offset = new T.Vector3();
const _desiredUp = new T.Vector3(0, 1, 0);
const _pos = new T.Vector3();
const _defaultUp = new T.Vector3(0, 1, 0);
const _tempUp = new T.Vector3();

class CameraController {
  constructor(camera) {
    this.camera = camera;
    this.mode = "chase";
    this.modes = ["chase", "free", "cinematic"];
    this.shake = 0;
    this.up = new T.Vector3(0, 1, 0);
    if (this.camera.view) {
      this.camera.view = null;
      this.camera.updateProjectionMatrix();
    }
  }

  cycle() {
    this.mode = this.modes[(this.modes.indexOf(this.mode) + 1) % this.modes.length];
  }

  reset(player) {
    this.camera.view = null;
    this.camera.updateProjectionMatrix();
    this.up.set(0, 1, 0);
    this.camera.up.set(0, 1, 0);
    _offset.set(0, 8.5, 32).applyQuaternion(player.quaternion);
    this.camera.position.copy(player.position).add(_offset);
    _look.copy(player.position).addScaledVector(player.forward, 110);
    this.camera.lookAt(_look);
  }

  update(dt, game) {
    const p = game.player;
    if (this.camera.view !== null) {
      this.camera.view = null;
      this.camera.updateProjectionMatrix();
    }

    _desiredUp.set(0, 1, 0);

    if (game.state === "hangar") {
      const a = game.hangarAngle !== undefined ? game.hangarAngle : (game.menuTime * 0.18);
      const dist = game.hangarDistance || 26;
      const h = game.hangarHeight || 6.5;
      _offset.set(Math.sin(a) * dist, h, Math.cos(a) * dist);
      _look.copy(p.position).add(new T.Vector3(0, 0.4, 0));
      _desiredUp.set(0, 1, 0);
    } else if (game.state === "menu" || game.state === "quit") {
      const a = game.menuTime * 0.085;
      const isWide = typeof innerWidth !== "undefined" && innerWidth > 800;
      _offset.set(Math.sin(a) * 28 - (isWide ? 14 : 0), 9.5, Math.cos(a) * 26 + 6);
      _look.copy(p.position).add(new T.Vector3(isWide ? -4.5 : 0, 0, 0));
      _desiredUp.set(0, 1, 0);
    } else if (game.state === "intro") {
      _offset.set(0, 8.5, 32).applyQuaternion(p.quaternion);
      _look.copy(p.position).addScaledVector(p.forward, 110);
    } else if (game.state === "dying") {
      _offset.set(40, 20, 35);
      _look.copy(p.position);
    } else if (this.mode === "cockpit") {
      _offset.set(0, 1.35, -4.5).applyQuaternion(p.quaternion);
      _desiredUp.copy(_defaultUp).applyQuaternion(p.quaternion);
      _look.copy(p.position).addScaledVector(p.forward, 150);
    } else if (this.mode === "free") {
      const a = game.input.look.x * Math.PI;
      _offset.set(Math.sin(a) * 35, 10 - game.input.look.y * 20, Math.cos(a) * 35).applyQuaternion(p.quaternion);
      _look.copy(p.position);
    } else if (this.mode === "cinematic") {
      const missile = game.weapons.missiles.find((m) => m.active && m.owner === p);
      if (missile) {
        _offset.copy(missile.p).sub(p.position).addScaledVector(missile.dir, -19).add({ x: 6, y: 5, z: 0 });
        _look.copy(missile.p).addScaledVector(missile.dir, 150);
      } else {
        _offset.set(25, 6, 13).applyQuaternion(p.quaternion);
        _look.copy(p.position).addScaledVector(p.forward, 8);
      }
    } else {
      // Smooth chase camera
      _offset.set(0, 8.5, 32).applyQuaternion(p.quaternion);
      _tempUp.copy(_defaultUp).applyQuaternion(p.quaternion);
      _desiredUp.lerp(_tempUp, 0.28).normalize();
      _look.copy(p.position).addScaledVector(p.forward, 110);
    }

    p.model.visible = this.mode !== "cockpit" || game.state === "menu" || game.state === "intro";

    _pos.copy(p.position).add(_offset);
    const k = this.mode === "cockpit" ? 1 : 1 - Math.exp(-(game.state === "menu" ? 2.5 : 7) * dt);
    this.camera.position.lerp(_pos, k);

    this.up.lerp(_desiredUp, 1 - Math.exp(-6 * dt));
    this.camera.up.copy(this.up);

    // Smooth harmonic aerodynamic buffeting instead of jarring white-noise jitter
    this.shake = Math.max(0, this.shake - dt * 2.6);
    if (game.settings.shake && game.state === "playing" && (this.shake > 0.005 || p.boost)) {
      const time = (game.elapsed || 0) * 26;
      const boostAmp = p.boost ? 0.02 : 0;
      const totalShake = this.shake * 0.3 + boostAmp;
      this.camera.position.x += Math.sin(time) * totalShake * 0.18;
      this.camera.position.y += Math.cos(time * 1.3) * totalShake * 0.14;
    }

    this.camera.lookAt(_look);

    // Only update projection matrix when FOV changes significantly (prevents GPU pipeline invalidation)
    const targetFov = p.boost ? 78 : 68;
    const nextFov = damp(this.camera.fov, targetFov, 3, dt);
    if (Math.abs(nextFov - this.camera.fov) > 0.005) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }
  }
}

export { CameraController };
