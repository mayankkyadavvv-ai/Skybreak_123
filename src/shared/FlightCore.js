import { Vector3, Quaternion, Euler } from 'three';
import { sanitizeInput, clamp, FIXED_DT } from './Protocol.js';
import { onRunway } from './WorldGeometry.js';
import { createDamageState, systemEffects } from './DamageSystems.js';
import { recoveryIntent } from '../game/FlightAssists.js';
import { collidesWithAegisLandmark } from './AegisLandmarks.js';

// The aircraft's browser-independent 60 Hz state transition. Positive pitch points -Z upward.
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const euler = new Euler(0, 0, 0, 'YXZ'), delta = new Quaternion(), stepEuler = new Euler(), up = new Vector3(0, 1, 0);
const forward = p => new Vector3(0, 0, -1).applyQuaternion(p.quaternion);
const vectors = ['position', 'velocity', 'angular'];
const scalars = ['speed', 'throttle', 'landedElev', 'currentG', 'recoveryTime', 'takeoffCooldown'];
const flags = ['boost', 'gearDown', 'airBrake', 'isLanded', 'landingMode', 'flaps', 'stall', 'alive'];
export function createFlightState(raw = {}) {
  const state = { position: new Vector3(0, 1600, 5200), quaternion: new Quaternion(), velocity: new Vector3(0, 0, -240), angular: new Vector3(), speed: 240, throttle: .6, boost: false, gearDown: false, airBrake: false, isLanded: false, landingMode: false, flaps: false, landedElev: 0, currentBase: null, stall: false, currentG: 1, recoveryTime: 0, takeoffCooldown: 0, alive: true, systems: createDamageState(), stats: { speedMult: 1, turnMult: 1, boostMult: 1 } };
  restoreFlightState(state, raw);
  return state;
}
export function restoreFlightState(state, raw = {}) {
  for (const key of vectors) {
    const v = raw[key] || raw[{ position: 'pos', velocity: 'vel', angular: 'ang' }[key]];
    if (!state[key]?.set) state[key] = new Vector3();
    if (Array.isArray(v) && v.slice(0, 3).every(Number.isFinite)) state[key].set(...v.slice(0, 3));
    else if (v && ['x', 'y', 'z'].every(k => Number.isFinite(v[k]))) state[key].set(v.x, v.y, v.z);
  }
  const q = raw.quaternion || raw.quat;
  if (!state.quaternion?.set) state.quaternion = new Quaternion();
  if (Array.isArray(q) && q.length === 4 && q.every(Number.isFinite)) state.quaternion.set(...q).normalize();
  else if (q && ['x', 'y', 'z', 'w'].every(k => Number.isFinite(q[k]))) state.quaternion.set(q.x, q.y, q.z, q.w).normalize();
  for (const key of scalars) if (Number.isFinite(raw[key])) state[key] = raw[key];
  for (const key of flags) if (typeof raw[key] === 'boolean') state[key] = raw[key];
  if ('currentBase' in raw) state.currentBase = typeof raw.currentBase === 'string' ? raw.currentBase : null;
  state.systems = createDamageState(raw.systems || state.systems);
  state.stats ||= { speedMult: 1, turnMult: 1, boostMult: 1 };
  for (const key of ['speedMult', 'turnMult', 'boostMult']) if (Number.isFinite(raw.stats?.[key])) state.stats[key] = clamp(raw.stats[key], .5, 1.5);
  return state;
}
export function serializeFlightState(state) {
  const raw = {};
  for (const key of vectors) raw[key] = { x: state[key].x, y: state[key].y, z: state[key].z };
  raw.quaternion = { x: state.quaternion.x, y: state.quaternion.y, z: state.quaternion.z, w: state.quaternion.w };
  for (const key of [...scalars, ...flags]) raw[key] = state[key];
  raw.currentBase = state.currentBase || null;
  raw.systems = { ...state.systems }; raw.stats = { ...state.stats };
  return raw;
}
export function stepFlight(p, raw = {}, dt = FIXED_DT, env = {}) {
  if (!Number.isFinite(dt) || dt <= 0) return { pitch: 0, roll: 0, yaw: 0, boost: false };
  dt = Math.min(dt, .05);
  // Accept plain snapshots as well as live THREE state, without importing rendering modules.
  if (!p.position?.addScaledVector || !p.quaternion?.multiply) restoreFlightState(p, p);
  const c = sanitizeInput(raw), result = { pitch: 0, roll: 0, yaw: 0, boost: c.boost, collision: false, landed: false, tookOff: false };
  if (p.alive === false) return result;
  p.systems ||= createDamageState(); p.stats ||= { speedMult: 1, turnMult: 1, boostMult: 1 };
  if (c.recover && Math.max(Math.abs(c.pitch), Math.abs(c.roll), Math.abs(c.yaw)) < .1) p.recoveryTime = 2;
  else if (Math.max(Math.abs(c.pitch), Math.abs(c.roll), Math.abs(c.yaw)) > .1) p.recoveryTime = 0;
  p.recoveryTime = Math.max(0, (p.recoveryTime || 0) - dt); p.takeoffCooldown = Math.max(0, (p.takeoffCooldown || 0) - dt);
  p.gearDown = c.gearDown; p.flaps = c.flaps; p.landingMode = c.landingMode;
  p.throttle = Number.isFinite(c.throttleSet) ? c.throttleSet : clamp((p.throttle ?? .6) + c.throttle * .3 * dt, 0, 1);
  p.boost = c.boost; p.airBrake = c.brake > .05;
  euler.setFromQuaternion(p.quaternion, 'YXZ');
  if (p.isLanded) {
    p.angular.set(0, 0, 0); p.velocity.y = 0; euler.z = damp(euler.z, 0, 10, dt);
    const steer = clamp(c.yaw, -1, 1), authority = p.speed < 20 ? 1.25 : Math.max(.42, 1.25 - p.speed / 100 * .83);
    euler.y -= steer * authority * dt;
    p.speed = clamp(p.speed + (p.throttle * 60 + (c.boost ? 38 : 0) - 10 - p.speed * .06 - c.brake * 100) * dt, 0, 225);
    euler.x = damp(euler.x, p.speed >= 48 && c.pitch > .15 ? .14 : 0, 6, dt); p.quaternion.setFromEuler(euler);
    const f = forward(p);
    if (p.speed >= 55 && c.pitch > .15) {
      p.isLanded = false; p.currentBase = null; p.takeoffCooldown = 4; p.landingMode = false; p.flaps = false;
      p.velocity.copy(f).multiplyScalar(p.speed); p.velocity.y = Math.max(12, p.speed * .2); p.position.y += 3.5;
      p.angular.set(.25, 0, 0); p.position.addScaledVector(p.velocity, dt); result.pitch = .4; result.tookOff = true;
    } else {
      p.position.y = damp(p.position.y, (p.landedElev ?? 0) + 3.2, 20, dt); f.y = 0; f.normalize();
      p.position.addScaledVector(f, p.speed * dt); p.velocity.copy(f).multiplyScalar(p.speed);
    }
    result.yaw = -steer;
  } else {
    const recovering = p.recoveryTime > 0, assisted = c.assisted || recovering;
    let pitch, roll, yaw;
    if (assisted) {
      const recovery = recovering ? recoveryIntent(p, c, env.terrainHeight || (()=>0)) : null;
      p.recoveryStatus=recovery;
      const turn = recovering ? recovery.roll : c.roll;
      let desiredPitch = (recovering ? recovery.pitch : c.pitch) * (p.landingMode ? .2 : .48) - (p.landingMode && p.flaps && !recovering ? .0523599 : 0);
      pitch = clamp((desiredPitch - euler.x) * 2.8, -1, 1);
      roll = clamp((-turn * (p.landingMode ? .28 : .60) - euler.z) * 3.2, -1, 1); yaw = -turn * .55 - c.yaw * .8;
    } else { pitch = c.pitch; roll = c.roll ? -c.roll : -euler.z * .18; yaw = -c.yaw; }
    const effects = systemEffects(p.systems, env.difficulty || 'easy');
    const turnMult = (p.stats.turnMult || 1) * effects.turnMult, speedMult = p.stats.speedMult || 1, boostMult = p.stats.boostMult || 1;
    const ratio = clamp(p.speed / 220, .45, 1.45), pressure = ratio <= 1 ? .55 + .45 * ratio : 1 - (ratio - 1) * .18;
    p.angular.x = damp(p.angular.x, pitch * .72 * turnMult * pressure, 4.8 * turnMult, dt);
    p.angular.y = damp(p.angular.y, yaw * .4 * turnMult * pressure, 3.8 * turnMult, dt);
    p.angular.z = damp(p.angular.z, roll * 1.4 * turnMult * pressure * effects.rollMult, 4.5 * turnMult, dt);
    delta.setFromEuler(stepEuler.set(p.angular.x * dt, p.angular.y * dt, p.angular.z * dt, 'XYZ')); p.quaternion.multiply(delta).normalize();
    delta.setFromAxisAngle(up, Math.sin(euler.z) * .24 * dt); p.quaternion.premultiply(delta);
    const engine = effects.thrustMult;
    const cruise = (75 + p.throttle * 270 * speedMult + (c.boost ? 235 * boostMult : 0)) * engine;
    const desired = p.landingMode ? Math.max(55, 65 + p.throttle * 125 + (c.boost ? 120 : 0) - c.brake * 35 - (p.flaps ? 15 : 0) - (p.gearDown ? 8 : 0)) : cruise * (1 - c.brake) + 62 * c.brake;
    p.speed = damp(p.speed, desired, c.boost ? .52 : c.brake ? .8 : .38, dt);
    const pull = Math.abs(p.angular.x) / .72, f = forward(p);
    p.currentG = 1 + pull * 6.5 * clamp(p.speed / 220, .4, 1.4);
    p.speed = clamp(p.speed - f.y * 15 * dt - Math.max(0, pull - .45) * 8.5 * dt, p.landingMode ? 45 : 56, 590 * Math.max(speedMult, boostMult));
    p.velocity.lerp(f.clone().multiplyScalar(p.speed), 1 - Math.exp(-3.8 * dt));
    p.stall = p.landingMode ? p.speed < (p.flaps ? 70 : 90) : !assisted && p.speed < 90 && f.y > .22;
    if (p.stall) p.velocity.y -= 26 * dt;
    p.position.addScaledVector(p.velocity, dt); Object.assign(result, { pitch, roll, yaw });
  }
  if (env.terrainHeight) {
    const runway = (env.runways || []).find(b => onRunway(b, p.position, 10));
    const ground = runway?.elevation ?? env.terrainHeight(p.position.x, p.position.z);
    if (p.position.y <= ground + 3.2 && !p.isLanded && !p.takeoffCooldown) {
      const attitude = new Euler().setFromQuaternion(p.quaternion, 'YXZ');
      const heading = Math.abs(forward(p).dot(new Vector3(Math.sin((runway?.runwayHeading || 0) * Math.PI / 180), 0, -Math.cos((runway?.runwayHeading || 0) * Math.PI / 180)))) > .96;
      if (runway && p.gearDown && p.velocity.y > -7 && p.speed < 115 && Math.abs(attitude.z) < .2 && heading) {
        p.isLanded = true; p.currentBase = runway.id; p.landedElev = ground; p.position.y = ground + 3.2; p.velocity.y = 0; result.landed = true;
      } else result.collision = true;
    }
    if (p.isLanded && !runway) result.collision = true;
  }
  if (env.terrainHeight && collidesWithAegisLandmark(p.position)) result.collision = true;
  if (Math.abs(p.position.x) > 95000 || Math.abs(p.position.z) > 95000 || p.position.y > 16000 || p.position.y < -100) result.collision = true;
  return result;
}
