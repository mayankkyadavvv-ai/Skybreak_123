import * as T from "three";
import { clamp, damp, UP } from "./math.js";
import { isHeld, curveAxis } from "./InputActions.js";
import { GLIDE_ANGLE } from "./Landing.js";
import { recoveryIntent } from './FlightAssists.js';
import { systemEffects } from '../shared/DamageSystems.js';

// ============================================================================
// SKYBREAK FLIGHT DYNAMICS & CONTROL SYSTEM (STAGE 1)
// Design Reference: Ace Combat 7 (responsive & accessible) + DCS World (weight & inertia)
// ============================================================================

export const FLIGHT_TUNING = {
  // Aerodynamic control surface baseline maximum angular rates (rad/s)
  PITCH_RATE: 0.72,       // Elevator authority for high-G maneuvers
  ROLL_RATE: 1.40,        // Agile aileron response for rapid banking transitions
  YAW_RATE: 0.40,         // Directional rudder authority for target gun alignment

  // Angular rate damping frequencies (1/s) - prevents twitchiness and overshooting
  PITCH_DAMPING: 4.8,     // Pitch rate settling
  ROLL_DAMPING: 4.5,      // Roll rate settling
  YAW_DAMPING: 3.8,       // Rudder damping / yaw oscillation suppression

  // Speed & Dynamic Pressure (q) Reference Speeds (m/s)
  CORNER_SPEED: 220.0,    // Optimal aerodynamic maneuverability speed (~790 km/h)
  MIN_CONTROL_AUTH: 0.55, // Minimum control authority at near-stall airspeeds
  MAX_CONTROL_AUTH: 1.05, // Peak aerodynamic authority at corner velocity

  // Aerodynamic Forces & Energy Bleed
  GRAVITY_PITCH_ACCEL: 15.0,  // Kinetic/Potential energy trade in climbs & dives (m/s²)
  INDUCED_DRAG_COEFF: 8.5,    // Airspeed bleed under high-G turns (energy-combat fidelity)
  VELOCITY_ALIGN_RATE: 3.8,   // Dynamic wing lift vector tracking rate (1/s)

  // Autopilot / Assisted Mode Proportional Gains
  ASSIST_PITCH_GAIN: 2.8, // Proportional pitch correction to commanded angle
  ASSIST_ROLL_GAIN: 3.2,  // Proportional bank correction to commanded angle
  ASSIST_MAX_PITCH: 0.48, // Safe pitch ceiling (~27.5 deg climb/dive limit)
  ASSIST_MAX_BANK: 0.60,  // Safe bank ceiling (~34.4 deg coordinated bank limit)

  // Speed & Thrust Limits (m/s)
  EASY_CRUISE_SPEED: 220.0,
  EASY_BOOST_SPEED: 520.0,
  EASY_BRAKE_SPEED: 130.0,
  ADVANCED_BASE_THRUST: 90.0,
  ADVANCED_MAX_THRUST: 260.0,
  ADVANCED_BOOST_BONUS: 235.0,
  ADVANCED_BRAKE_TARGET: 100.0,
  ABSOLUTE_MIN_SPEED: 56.0,
  ABSOLUTE_MAX_SPEED: 590.0,
};

const euler = new T.Euler(0, 0, 0, "YXZ");
const dq = new T.Quaternion();
const stepEuler = new T.Euler();
const aimDirection=new T.Vector3(),inverseHeading=new T.Quaternion();
export function flightCommands(input, settings = {}, player = input?.player) {
  const held = action => isHeld(input, action, settings);
  let pitch = (Number(held('pitchUp')) - Number(held('pitchDown'))) * (settings.keyboardInvert ? -1 : 1);
  let roll = Number(held('rollRight')) - Number(held('rollLeft'));
  const yaw = Number(held('yawRight')) - Number(held('yawLeft'));
  const device = settings.device || settings.input;
  if ((device === 'mouse' || input.touchActive) && (!input.freeLook || input.touchActive)) {
    const zone = input.touchActive ? .04 : settings.mouseDeadzone ?? .08;
    const curve = settings.mouseCurve ?? 1.35;
    const sensitivity = settings.sensitivity ?? .8;
    if(!input.touchActive && settings.mouseMode==='point-to-fly' && input.pointAim && player?.quaternion) {
      aimDirection.copy(input.pointAim).applyQuaternion(inverseHeading.copy(player.quaternion).invert());
      if(!pitch&&!roll){
        roll=clamp(Math.atan2(aimDirection.x,-aimDirection.z)*1.4*sensitivity,-1,1);
        pitch=clamp(Math.atan2(aimDirection.y,Math.hypot(aimDirection.x,aimDirection.z))*2.2*sensitivity,-1,1);
      }
    }else if(input.touchActive || settings.mouseMode!=='point-to-fly'){
      roll += curveAxis(input.mouse.x * sensitivity, zone, curve);
      pitch -= curveAxis(input.mouse.y * sensitivity, zone, curve) * (settings.mouseInvert ? -1 : 1);
    }
  }
  if (device === 'gamepad') { pitch += (input.axes?.pitch || 0)*(settings.gamepadInvert?-1:1); roll += input.axes?.roll || 0; }
  return {
    pitch: clamp(pitch, -1, 1) * (settings.pitchSensitivity ?? 1) || 0,
    roll: clamp(roll, -1, 1) * (settings.rollSensitivity ?? 1), yaw,
    throttle: Number(held('throttleUp')) - Number(held('throttleDown')),
    brake: held('airBrake') ? 1 : input.axes?.brake || 0,
    boost: held('afterburner'),
  };
}

function updateFlight(p, input, dt, settings, environment = {}) {
  const command = flightCommands(input, settings, p);
  if(input.levelTimer>0 && (Math.abs(command.pitch)+Math.abs(command.roll)+Math.abs(command.yaw)>.08 || p.isLanded)) input.levelTimer=0;
  const recovery=input.levelTimer>0?recoveryIntent(p,command,environment.terrainHeight):null;
  p.recoveryStatus=recovery;
  const boost = command.boost, brake = command.brake;
  const landingMode = !!p.landingMode;
  const assisted = (settings.flightMode || (settings.input === 'advanced' ? 'manual' : 'assisted')) === 'assisted' || input.levelTimer > 0;
  input.levelTimer = Math.max(0, (input.levelTimer || 0) - dt);
  p.throttle = clamp((p.throttle ?? .58) + command.throttle * .3 * dt, 0, 1);
  if (Number.isFinite(input.touchThrottle)) p.throttle = clamp(input.touchThrottle, 0, 1);
  if (settings.autoCruise && !command.throttle && !p.isLanded && !landingMode) p.throttle = damp(p.throttle, settings.cruiseThrottle ?? .58, 1.3, dt);
  p.boost = boost; p.airBrake = brake > .05;
  euler.setFromQuaternion(p.quaternion, 'YXZ');
  let pitch = 0, roll = 0, yaw = 0;

  if (p.isLanded) {
    p.angular.set(0, 0, 0); p.velocity.y = 0;
    euler.z = damp(euler.z, 0, 10, dt);
    const steer = clamp(command.yaw + ((settings.device || settings.input) === 'mouse' || input.touchActive ? command.roll : 0), -1, 1);
    const authority = p.speed < 20 ? 1.25 : Math.max(.42, 1.25 - p.speed / 100 * .83);
    euler.y -= steer * authority * dt;
    const acceleration = p.throttle * 60 + (boost ? 38 : 0) - 10 - p.speed * .06 - brake * 100;
    p.speed = clamp(p.speed + acceleration * dt, 0, 225);
    const wantRotate = command.pitch > .15;
    euler.x = damp(euler.x, p.speed >= 48 && wantRotate ? .14 : 0, 6, dt);
    p.quaternion.setFromEuler(euler);
    const forward = p.forward;
    if (p.speed >= 55 && wantRotate) {
      p.isLanded = false; p.currentBase = null; p.justLiftedOff = true; p.takeoffCooldown = 4;
      p.landingMode = false; p.flaps = false;
      p.velocity.copy(forward).multiplyScalar(p.speed); p.velocity.y = Math.max(12, p.speed * .2);
      p.position.y += 3.5; p.angular.set(.25, 0, 0); p.position.addScaledVector(p.velocity, dt);
      p.animate(performance.now() / 1000, boost, .4, 0, p.speed);
      return { pitch: .4, roll: 0, yaw: -steer, boost };
    }
    p.position.y = damp(p.position.y, (p.landedElev ?? 38) + 3.2, 20, dt);
    forward.y = 0; forward.normalize(); p.position.addScaledVector(forward, p.speed * dt);
    p.velocity.copy(forward).multiplyScalar(p.speed);
    p.animate(performance.now() / 1000, boost, 0, 0, p.speed);
    return { pitch: 0, roll: 0, yaw: -steer, boost };
  }
  if (assisted) {
    const recovering = input.levelTimer > 0;
    const climb = recovering ? recovery?.pitch || 0 : command.pitch, turn = recovering ? recovery?.roll || 0 : command.roll;
    const desiredPitch = climb * (landingMode ? .2 : FLIGHT_TUNING.ASSIST_MAX_PITCH) - (landingMode && p.flaps && !recovering ? GLIDE_ANGLE : 0);
    pitch = clamp((desiredPitch - euler.x) * FLIGHT_TUNING.ASSIST_PITCH_GAIN, -1, 1);
    roll = clamp((-turn * (landingMode ? .28 : FLIGHT_TUNING.ASSIST_MAX_BANK) - euler.z) * FLIGHT_TUNING.ASSIST_ROLL_GAIN, -1, 1);
    yaw = -turn * .55 - command.yaw * .8;
  } else {
    pitch = command.pitch; roll = -command.roll; yaw = -command.yaw;
    if (!roll) roll = -euler.z * .18;
  }

  const damage=systemEffects(p.systems,settings.difficulty || 'easy');
  const turnMult = (p.stats?.turnMult || 1)*damage.turnMult;
  const speedMult = (p.stats?.speedMult || 1)*damage.thrustMult;
  const boostMult = p.stats?.boostMult || 1;

  // Dynamic aerodynamic pressure scaling factor (q-factor)
  // Maneuverability is optimal around corner speed (~220 m/s), reduced at stall, and stiffened at extreme Mach.
  const speedRatio = clamp(p.speed / FLIGHT_TUNING.CORNER_SPEED, 0.45, 1.45);
  const dynamicPressure = speedRatio <= 1.0
    ? FLIGHT_TUNING.MIN_CONTROL_AUTH + (1.0 - FLIGHT_TUNING.MIN_CONTROL_AUTH) * speedRatio
    : 1.0 - (speedRatio - 1.0) * 0.18;
  const effectiveTurn = turnMult * dynamicPressure;

  // Angular rate damping with aircraft inertia & control surface authority
  p.angular.x = damp(p.angular.x, pitch * FLIGHT_TUNING.PITCH_RATE * effectiveTurn, FLIGHT_TUNING.PITCH_DAMPING * turnMult, dt);
  p.angular.y = damp(p.angular.y, yaw * FLIGHT_TUNING.YAW_RATE * effectiveTurn, FLIGHT_TUNING.YAW_DAMPING * turnMult, dt);
  p.angular.z = damp(p.angular.z, roll * FLIGHT_TUNING.ROLL_RATE * effectiveTurn * damage.rollMult, FLIGHT_TUNING.ROLL_DAMPING * turnMult, dt);

  dq.setFromEuler(stepEuler.set(p.angular.x * dt, p.angular.y * dt, p.angular.z * dt, "XYZ"));
  p.quaternion.multiply(dq).normalize();

  // Coordinated turn: bank-induced turning moment
  dq.setFromAxisAngle(UP, Math.sin(euler.z) * 0.24 * dt);
  p.quaternion.premultiply(dq);

  // Engine thrust target based on flight mode and power setting
  const cruiseTarget = 75 + p.throttle * 270 * speedMult + (boost ? FLIGHT_TUNING.ADVANCED_BOOST_BONUS * boostMult : 0);
  const desired = landingMode
    ? Math.max(55, 65 + p.throttle * 125 + (boost ? 120 : 0) - brake * 35 - (p.flaps ? 15 : 0) - (p.gearDown ? 8 : 0))
    : cruiseTarget * (1 - brake) + 62 * brake;
  p.speed = damp(p.speed, desired, boost ? .52 : brake ? .8 : .38, dt);

  // Induced drag from high-G maneuvering (energy bleed during sustained hard turns)
  const gPull = Math.abs(p.angular.x) / FLIGHT_TUNING.PITCH_RATE;
  p.currentG = 1.0 + gPull * 6.5 * clamp(p.speed / 220.0, 0.4, 1.4);
  const inducedDrag = gPull > 0.45 ? (gPull - 0.45) * FLIGHT_TUNING.INDUCED_DRAG_COEFF * dt : 0;

  // Potential-kinetic energy exchange: climbing bleeds speed, diving gains speed
  const gravityEffect = p.forward.y * FLIGHT_TUNING.GRAVITY_PITCH_ACCEL * dt;

  const maxAllowedSpeed = FLIGHT_TUNING.ABSOLUTE_MAX_SPEED * Math.max(speedMult, boostMult);
  const minAllowedSpeed = landingMode ? 45 : FLIGHT_TUNING.ABSOLUTE_MIN_SPEED;
  p.speed = clamp(p.speed - gravityEffect - inducedDrag, minAllowedSpeed, maxAllowedSpeed);

  // Aerodynamic velocity realignment (lift pulls velocity vector towards heading)
  const desiredVelocity = p.forward.multiplyScalar(p.speed);
  p.velocity.lerp(desiredVelocity, 1 - Math.exp(-FLIGHT_TUNING.VELOCITY_ALIGN_RATE * dt));

  // Low speed stall warning & aerodynamic mush
  p.stall = landingMode ? p.speed < (p.flaps ? 70 : 90) : !assisted && p.speed < 90 && p.forward.y > 0.22;
  if (p.stall) p.velocity.y -= 26 * dt;

  p.position.addScaledVector(p.velocity, dt);
  p.boost = boost;
  p.animate(performance.now() / 1000, boost, pitch, roll, p.speed);
  return { pitch, roll, yaw, boost };
}

export { updateFlight };
