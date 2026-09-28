// SyncManager: Hermite cubic position interpolation and SLERP quaternion smoothing
import * as T from "three";

export class SyncManager {
  constructor(interpDelay = 100) {
    this.interpDelay = interpDelay; // 100ms buffer for 30Hz network tick
    this.buffers = new Map(); // playerId -> [ snapshots ]
    this.maxBufferSize = 15;

    // Scratch math objects to avoid garbage collection allocations
    this._p0 = new T.Vector3();
    this._p1 = new T.Vector3();
    this._v0 = new T.Vector3();
    this._v1 = new T.Vector3();
    // Client-side prediction buffer
    this.predictionBuffer = [];
    this.maxPredictionSize = 60;
  }

  addSnapshot(playerId, serverTime, data) {
    if (!this.buffers.has(playerId)) {
      this.buffers.set(playerId, []);
    }
    const buf = this.buffers.get(playerId);

    const snapshot = {
      t: serverTime,
      localTime: performance.now(),
      pos: new T.Vector3(data.pos[0], data.pos[1], data.pos[2]),
      quat: new T.Quaternion(data.quat[0], data.quat[1], data.quat[2], data.quat[3]),
      vel: new T.Vector3(data.vel[0], data.vel[1], data.vel[2]),
      spd: data.spd,
      thr: data.thr,
      hp: data.hp,
      alive: data.alive,
      boost: data.boost,
      gear: data.gear,
      landed: data.landed,
      shield: data.shield,
      respawn: data.respawn
    };

    buf.push(snapshot);
    if (buf.length > this.maxBufferSize) buf.shift();
  }

  clearPlayer(playerId) {
    this.buffers.delete(playerId);
  }

  clearAll() {
    this.buffers.clear();
  }

  getInterpolatedState(playerId, targetPos, targetQuat) {
    const buf = this.buffers.get(playerId);
    if (!buf || buf.length === 0) return null;

    // Single snapshot: return directly
    if (buf.length === 1) {
      const s = buf[0];
      targetPos.copy(s.pos);
      targetQuat.copy(s.quat);
      return s;
    }

    const now = performance.now();
    const renderTime = now - this.interpDelay;

    // Find surrounding snapshots
    let s0 = null;
    let s1 = null;

    for (let i = buf.length - 1; i >= 0; i--) {
      if (buf[i].localTime <= renderTime) {
        s0 = buf[i];
        s1 = buf[i + 1] || null;
        break;
      }
    }

    // Extrapolation: if renderTime is past newest snapshot
    if (!s0) {
      // All snapshots in buffer are newer than renderTime, use oldest
      s0 = buf[0];
      targetPos.copy(s0.pos);
      targetQuat.copy(s0.quat);
      return s0;
    }

    if (!s1) {
      // Extrapolate beyond newest snapshot using velocity dead-reckoning
      const newest = buf[buf.length - 1];
      const dt = Math.min(0.2, (renderTime - newest.localTime) / 1000);
      targetPos.copy(newest.pos).addScaledVector(newest.vel, dt);
      targetQuat.copy(newest.quat);
      return newest;
    }

    // Teleport threshold: if distance between consecutive packets > 350m (e.g. respawn)
    if (s0.pos.distanceToSquared(s1.pos) > 350 * 350) {
      targetPos.copy(s1.pos);
      targetQuat.copy(s1.quat);
      return s1;
    }

    // Smooth Interpolation
    const total = s1.localTime - s0.localTime;
    const alpha = total > 0 ? Math.max(0, Math.min(1, (renderTime - s0.localTime) / total)) : 1;

    // Position: Hermite smoothstep / lerp
    targetPos.lerpVectors(s0.pos, s1.pos, alpha);

    // Orientation: Slerp
    targetQuat.copy(s0.quat).slerp(s1.quat, alpha);

    return {
      spd: T.MathUtils.lerp(s0.spd, s1.spd, alpha),
      thr: T.MathUtils.lerp(s0.thr, s1.thr, alpha),
      hp: s1.hp,
      alive: s1.alive,
      boost: s1.boost,
      gear: s1.gear,
      landed: s1.landed,
      shield: s1.shield,
      respawn: s1.respawn,
      vel: s1.vel
    };
  }

  /**
   * Record local predicted frame in client-side prediction buffer.
   */
  recordLocalPrediction(seq, input, pos, quat, vel, dt) {
    this.predictionBuffer.push({
      seq,
      time: performance.now(),
      input: { ...input },
      pos: pos.clone(),
      quat: quat.clone(),
      vel: vel.clone(),
      dt
    });
    if (this.predictionBuffer.length > this.maxPredictionSize) {
      this.predictionBuffer.shift();
    }
  }

  /**
   * Reconcile local prediction with authoritative server packet.
   * If server position diverges by more than tolerance, replay remaining inputs.
   */
  reconcilePrediction(ackSeq, serverPos, serverQuat, localPlayer, reapplyInputFn) {
    const idx = this.predictionBuffer.findIndex(f => f.seq === ackSeq);
    if (idx === -1) return;

    const acknowledged = this.predictionBuffer[idx];
    const diff = acknowledged.pos.distanceTo(serverPos);

    // Remove acknowledged frames up to ackSeq
    this.predictionBuffer.splice(0, idx + 1);

    // If divergence exceeds 1.6 meters, correct and replay unacknowledged frames
    if (diff > 1.6 && localPlayer) {
      localPlayer.position.copy(serverPos);
      localPlayer.quaternion.copy(serverQuat);

      if (typeof reapplyInputFn === "function") {
        for (const frame of this.predictionBuffer) {
          reapplyInputFn(localPlayer, frame.input, frame.dt);
          frame.pos.copy(localPlayer.position);
          frame.quat.copy(localPlayer.quaternion);
        }
      }
    }
  }

  /**
   * Search historical snapshots for backward-reconciliation hit checks.
   */
  getHistoricalSnapshot(playerId, timestamp) {
    const buf = this.buffers.get(playerId);
    if (!buf || buf.length === 0) return null;
    let closest = buf[0];
    let minDiff = Math.abs(buf[0].t - timestamp);
    for (let i = 1; i < buf.length; i++) {
      const diff = Math.abs(buf[i].t - timestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closest = buf[i];
      }
    }
    return closest;
  }
}
