import { createFlightState, stepFlight, serializeFlightState, restoreFlightState } from '../shared/FlightCore.js';

/** Full-state rollback and replay. Render interpolation stays on the Jet. */
export class FlightPrediction {
  constructor({ step = stepFlight, environment = {} } = {}) {
    this.stepFlight = step; this.environment = environment; this.state = null;
    this.epoch = null; this.inputEpoch = null; this.seq = 0; this.lastAck = -1;
    this.pending = []; this.outbound = []; this.maxPending = 180; this.lastServerTick = -1;
    this.metrics = { corrections: 0, correctionTotal: 0, maxCorrection: 0, rejectedSnapshots: 0, stalls: 0 };
  }
  reset(raw, epoch, inputEpoch, ack = 0, tick = -1) {
    this.state = createFlightState(raw); this.epoch = epoch; this.inputEpoch = inputEpoch;
    this.seq = Math.max(0, ack); this.lastAck = ack; this.lastServerTick = tick;
    this.pending.length = 0; this.outbound.length = 0;
  }
  predict(command, dt = 1 / 60) {
    if (!this.state || this.pending.length >= this.maxPending) { this.metrics.stalls++; return false; }
    const input = { ...command, seq: ++this.seq };
    // Commands always represent one shared fixed tick; rendering never changes this.
    this.stepFlight(this.state, input, dt, this.environment);
    this.pending.push({ input, dt }); this.outbound.push(input);
    return true;
  }
  flush(network) {
    if (!this.outbound.length) return true;
    const inputs = this.outbound.slice(0, 12);
    if (!network.send('input', { epoch: this.epoch, inputEpoch: this.inputEpoch, inputs })) return false;
    this.outbound.splice(0, inputs.length); return true;
  }
  reconcile(player, { epoch, tick } = {}) {
    if (!player?.flight) return false;
    if (this.state && (epoch !== this.epoch || tick <= this.lastServerTick)) { this.metrics.rejectedSnapshots++; return false; }
    if (player.inputEpoch !== this.inputEpoch || !this.state) {
      this.reset(player.flight, epoch, player.inputEpoch, player.ack || 0, tick); return true;
    }
    if (tick <= this.lastServerTick || player.ack < this.lastAck) { this.metrics.rejectedSnapshots++; return false; }
    this.lastServerTick = tick; this.lastAck = player.ack || 0;
    const previous = this.state.position.clone();
    this.pending = this.pending.filter(frame => frame.input.seq > this.lastAck);
    this.outbound = this.outbound.filter(input => input.seq > this.lastAck);
    restoreFlightState(this.state, player.flight);
    if (this.state.alive !== false) for (const frame of this.pending) this.stepFlight(this.state, frame.input, frame.dt, this.environment);
    const error = previous.distanceTo(this.state.position);
    if (error > .01) { this.metrics.corrections++; this.metrics.correctionTotal += error; this.metrics.maxCorrection = Math.max(this.metrics.maxCorrection, error); }
    return true;
  }
  applyToJet(jet) {
    if (!this.state || !jet) return;
    const state = this.state;
    for (const key of ['position', 'quaternion', 'velocity', 'angular']) jet[key]?.copy?.(state[key]);
    for (const key of ['speed', 'throttle', 'boost', 'gearDown', 'airBrake', 'isLanded', 'landingMode', 'flaps', 'landedElev', 'currentBase', 'stall', 'currentG', 'recoveryTime']) jet[key] = state[key];
    jet.systems = { ...state.systems };
    jet.recoveryStatus=state.recoveryStatus;
  }
  snapshot() { return this.state && serializeFlightState(this.state); }
  clear() { this.state = null; this.pending.length = this.outbound.length = 0; this.epoch = this.inputEpoch = null; }
}
