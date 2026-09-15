import * as T from "three";
import { clamp, damp, UP } from "./math.js";

const euler = new T.Euler(0, 0, 0, "YXZ");
const dq = new T.Quaternion();
const stepEuler = new T.Euler();
const deadzone = (value) => Math.abs(value) < 0.08 ? 0 : Math.sign(value) * (Math.abs(value) - 0.08) / 0.92;

function updateFlight(p, input, dt, settings) {
  const held = (code) => input.keys.has(code);
  const boost = held("ShiftLeft") || held("ShiftRight") || held("Tab") || held("KeyZ") || held("Numpad0") || input.boost;
  const brake = held("KeyB") || held("ControlLeft") || held("ControlRight");
  const assisted = settings.input !== "advanced" || input.touchActive || input.levelTimer > 0;
  input.levelTimer = Math.max(0, (input.levelTimer || 0) - dt);
  euler.setFromQuaternion(p.quaternion, "YXZ");
  let pitch = 0, roll = 0, yaw = 0;

  const landingMode = !!p.landingMode;
  if (landingMode || p.isLanded) {
    const throttleAxis = (held("PageUp") || held("Equal") ? 1 : 0) - (held("PageDown") || held("Minus") ? 1 : 0);
    p.throttle = clamp(p.throttle + throttleAxis * .35 * dt, 0, 1);
    if (boost) p.throttle = 1;
  }
  if (p.isLanded) {
    p.angular.set(0,0,0);
    euler.x=damp(euler.x,0,8,dt); euler.z=damp(euler.z,0,8,dt);
    const turn=(held("ArrowRight")||held("KeyD")?1:0)-(held("ArrowLeft")||held("KeyA")?1:0);
    euler.y -= turn * .65 * clamp(p.speed / 8,0,1) / (1+p.speed/35) * dt;
    p.quaternion.setFromEuler(euler);
    p.speed=Math.max(0,p.speed+((boost?48:28)*p.throttle-3-(brake?42:0))*dt);
    const fwd=p.forward;fwd.y=0;fwd.normalize();
    p.velocity.copy(fwd).multiplyScalar(p.speed);
    p.position.y=(p.landedElev ?? 38)+3.2;
    p.position.addScaledVector(p.velocity,dt);
    const rotate=held("ArrowUp") || (settings.input==='advanced'?held("KeyS"):held("KeyW"));
    if(p.speed>95 && rotate) {
      p.isLanded=false;p.currentBase=null;
      euler.x=.09;p.quaternion.setFromEuler(euler);
      p.velocity.y=8;p.position.y+=.2;
    }
    p.boost=boost;
    p.animate(performance.now()/1000,boost,0,0,p.speed);
    return {pitch:0,roll:0,yaw:0,boost};
  }

  if (assisted) {
    // Easy controls command a safe pitch/bank angle, rather than an endless rotation.
    let climb = (held("KeyW") || held("ArrowUp") || held("Numpad8") ? 1 : 0) -
                (held("KeyS") || held("ArrowDown") || held("Numpad2") ? 1 : 0);
    let turn = (held("KeyD") || held("ArrowRight") || held("Numpad6") ? 1 : 0) -
               (held("KeyA") || held("ArrowLeft") || held("Numpad4") ? 1 : 0);
    if ((settings.input === "mouse" || input.touchActive) && !input.freeLook) {
      turn += deadzone(clamp(input.mouse.x * settings.sensitivity, -1, 1));
      climb -= deadzone(clamp(input.mouse.y * settings.sensitivity, -1, 1)) * (settings.invert ? -1 : 1);
    }
    if (input.levelTimer > 0) climb = turn = 0;
    const desiredPitch = clamp(climb, -1, 1) * (landingMode ? .2 : .48) - (landingMode && p.flaps ? .052 : 0);
    const desiredBank = -clamp(turn, -1, 1) * (landingMode ? .28 : .6);
    pitch = clamp((desiredPitch - euler.x) * 2.8, -1, 1);
    roll = clamp((desiredBank - euler.z) * 3.2, -1, 1);
    yaw = -clamp(turn, -1, 1) * 0.65;
    if (!landingMode) p.throttle = damp(p.throttle, boost ? 1 : brake ? 0.25 : 0.58, 1.8, dt);
  } else {
    // The original unrestricted aircraft controls remain available under Advanced.
    pitch = (held("KeyS") ? 1 : 0) - (held("KeyW") ? 1 : 0);
    roll = (held("KeyA") ? 1 : 0) - (held("KeyD") ? 1 : 0);
    yaw = (held("KeyQ") ? 1 : 0) - (held("KeyE") ? 1 : 0);
    if (!roll) roll = -euler.z * 0.42;
    if (!landingMode) p.throttle = clamp(p.throttle + (boost ? 0.26 : brake ? -0.4 : 0) * dt, 0.08, 1);
  }

  const turnMult = p.stats?.turnMult || 1;
  const speedMult = p.stats?.speedMult || 1;
  const boostMult = p.stats?.boostMult || 1;

  p.angular.x = damp(p.angular.x, pitch * 0.72 * turnMult, 4.8 * turnMult, dt);
  p.angular.y = damp(p.angular.y, yaw * 0.4 * turnMult, 3.8 * turnMult, dt);
  p.angular.z = damp(p.angular.z, roll * 1.4 * turnMult, 4.5 * turnMult, dt);
  dq.setFromEuler(stepEuler.set(p.angular.x * dt, p.angular.y * dt, p.angular.z * dt, "XYZ"));
  p.quaternion.multiply(dq).normalize();
  dq.setFromAxisAngle(UP, Math.sin(euler.z) * 0.24 * dt);
  p.quaternion.premultiply(dq);

  const desired = landingMode ? Math.max(55, 65 + p.throttle * 125 + (boost ? 120 : 0) - (brake ? 35 : 0) - (p.flaps ? 15 : 0) - (p.gearDown ? 8 : 0)) : assisted
    ? (boost ? 520 * boostMult : brake ? 130 : 220 * speedMult)
    : brake ? 100 : 90 + p.throttle * 260 * speedMult + (boost ? 235 * boostMult : 0);
  p.speed = damp(p.speed, desired, boost ? 0.52 : brake ? 0.8 : assisted ? 0.8 : 0.3, dt);
  const maxAllowedSpeed = 590 * Math.max(speedMult, boostMult);
  p.speed = clamp(p.speed - p.forward.y * 15 * dt, landingMode ? 45 : assisted ? 115 : 56, maxAllowedSpeed);
  const desiredVelocity = p.forward.multiplyScalar(p.speed);
  p.velocity.lerp(desiredVelocity, 1 - Math.exp(-3.8 * dt));
  p.stall = landingMode ? p.speed < (p.flaps ? 70 : 90) : !assisted && p.speed < 90 && p.forward.y > 0.22;
  if (p.stall) p.velocity.y -= 26 * dt;
  p.position.addScaledVector(p.velocity, dt);
  p.boost = boost;
  p.animate(performance.now() / 1000, boost, pitch, roll, p.speed);
  return { pitch, roll, yaw, boost };
}
export { updateFlight };
