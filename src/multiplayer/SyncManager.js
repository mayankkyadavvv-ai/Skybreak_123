import * as T from 'three';
const now = () => globalThis.performance?.now?.() ?? Date.now();
const clamp = (x, min, max) => Math.max(min, Math.min(max, x));

// Server timestamps, rather than packet arrival times, define the motion curve.
export class SyncManager {
  constructor(interpDelay = 100, { clock = now } = {}) {
    this.clock = clock; this.interpDelay = interpDelay; this.baseDelay = interpDelay;
    this.buffers = new Map(); this.maxBufferSize = 40; this.offset = null;
    this.lastArrival = null; this.lastServerTime = null; this.jitter = 0; this.epoch = null;
    this.predictionBuffer = []; this.maxPredictionSize = 180;
    this.metrics = { staleSnapshots: 0, extrapolations: 0, frozenFrames: 0, corrections: 0, correctionDistance: 0, maxCorrection: 0 };
  }
  beginEpoch(epoch) { if (epoch === this.epoch) return false; this.epoch = epoch; this.clearAll(); this.offset = null; this.lastArrival = this.lastServerTime = null; return true; }
  observeClock(serverTime, arrival = this.clock(), serverOffset) {
    if (!Number.isFinite(serverTime)) return;
    if (Number.isFinite(serverOffset)) this.offset = serverOffset;
    else if (this.offset == null) this.offset = serverTime - arrival;
    else this.offset += clamp(serverTime - arrival - this.offset, -5, 5) * .03;
    if (this.lastServerTime != null && serverTime > this.lastServerTime) {
      const variation = Math.abs((arrival - this.lastArrival) - (serverTime - this.lastServerTime));
      this.jitter += (variation - this.jitter) * .12;
      const desired = clamp(this.baseDelay + this.jitter * 2, 75, 250);
      this.interpDelay += (desired - this.interpDelay) * (desired > this.interpDelay ? .3 : .03);
    }
    if (this.lastServerTime == null || serverTime > this.lastServerTime) { this.lastArrival = arrival; this.lastServerTime = serverTime; }
  }
  addSnapshot(id, serverTime, data) {
    if (!Array.isArray(data?.pos) || !Array.isArray(data?.quat) || !data.pos.every(Number.isFinite) || !data.quat.every(Number.isFinite)) return false;
    if (!this.buffers.has(id)) this.buffers.set(id, []);
    const buf = this.buffers.get(id);
    if (buf.length && serverTime <= buf.at(-1).t) { this.metrics.staleSnapshots++; return false; }
    if (this.offset == null) this.observeClock(serverTime);
    buf.push({ ...data, t: serverTime, localTime: this.clock(), pos: new T.Vector3().fromArray(data.pos), quat: new T.Quaternion().fromArray(data.quat).normalize(), vel: new T.Vector3().fromArray(data.vel || [0, 0, 0]) });
    if (buf.length > this.maxBufferSize) buf.shift();
    return true;
  }
  clearPlayer(id) { this.buffers.delete(id); }
  clearAll() { this.buffers.clear(); this.predictionBuffer.length = 0; }
  getInterpolatedState(id, targetPos, targetQuat, at = this.clock()) {
    const buf = this.buffers.get(id); if (!buf?.length) return null;
    const renderTime = at + (this.offset || 0) - this.interpDelay;
    let s0 = buf[0], s1 = null;
    for (let i = 0; i < buf.length; i++) { if (buf[i].t <= renderTime) { s0 = buf[i]; s1 = buf[i + 1]; } }
    if (renderTime <= buf[0].t) { targetPos.copy(s0.pos); targetQuat.copy(s0.quat); return s0; }
    if (!s1) {
      const elapsed = Math.max(0, (renderTime - s0.t) / 1000);
      const dt = Math.min(.15, elapsed); targetPos.copy(s0.pos).addScaledVector(s0.vel, s0.alive === false ? 0 : dt); targetQuat.copy(s0.quat);
      if (elapsed > .15) this.metrics.frozenFrames++; else this.metrics.extrapolations++;
      return { ...s0, stalled: elapsed > .15 };
    }
    if (s0.inputEpoch !== s1.inputEpoch || s0.alive !== s1.alive || s0.pos.distanceToSquared(s1.pos) > 500 ** 2) {
      const s = renderTime < s1.t ? s0 : s1; targetPos.copy(s.pos); targetQuat.copy(s.quat); return s;
    }
    const seconds = Math.max(.001, (s1.t - s0.t) / 1000), a = clamp((renderTime - s0.t) / (s1.t - s0.t), 0, 1), a2 = a * a, a3 = a2 * a;
    targetPos.copy(s0.pos).multiplyScalar(2 * a3 - 3 * a2 + 1).addScaledVector(s0.vel, (a3 - 2 * a2 + a) * seconds).addScaledVector(s1.pos, -2 * a3 + 3 * a2).addScaledVector(s1.vel, (a3 - a2) * seconds);
    targetQuat.copy(s0.quat).slerp(s1.quat, a);
    return { ...s1, spd: T.MathUtils.lerp(s0.spd || 0, s1.spd || 0, a), thr: T.MathUtils.lerp(s0.thr || 0, s1.thr || 0, a) };
  }
  // Compatibility for existing tools. Live full-state prediction lives in FlightPrediction.
  recordLocalPrediction(seq, input, pos, quat, vel, dt) { this.predictionBuffer.push({ seq, input: { ...input }, pos: pos.clone(), quat: quat.clone(), vel: vel.clone(), dt }); if (this.predictionBuffer.length > this.maxPredictionSize) this.predictionBuffer.shift(); }
  reconcilePrediction(ackSeq, serverPos, serverQuat, player, replay) {
    const ack = this.predictionBuffer.find(f => f.seq === ackSeq); this.predictionBuffer = this.predictionBuffer.filter(f => f.seq > ackSeq);
    if (!ack || !player) return;
    if (ack.pos.distanceTo(serverPos) > .01) { player.position.copy(serverPos); player.quaternion.copy(serverQuat); for (const frame of this.predictionBuffer) replay?.(player, frame.input, frame.dt); }
  }
  getHistoricalSnapshot(id, timestamp) { return this.buffers.get(id)?.reduce((best, s) => !best || Math.abs(s.t - timestamp) < Math.abs(best.t - timestamp) ? s : best, null) || null; }
}
