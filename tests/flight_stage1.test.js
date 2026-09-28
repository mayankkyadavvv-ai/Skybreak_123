import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { Jet } from "../src/game/Jet.js";
import { updateFlight, FLIGHT_TUNING } from "../src/game/FlightPhysics.js";

const easySettings = { input: "keyboard", sensitivity: 1, invert: false, difficulty: "easy" };
const advSettings = { input: "advanced", sensitivity: 1, invert: false, difficulty: "easy" };
const input = (...keys) => ({ keys: new Set(keys), mouse: { x: 0, y: 0 }, touchActive: false, levelTimer: 0, boost: false });

test("Stage 1: Straight flight stability & zero altitude drift (Advanced mode)", () => {
  const p = new Jet("player");
  const initY = p.position.y;
  for (let i = 0; i < 600; i++) {
    updateFlight(p, input(), 1 / 60, advSettings);
  }
  const deltaY = Math.abs(p.position.y - initY);
  assert.ok(deltaY < 0.01, "Altitude must remain perfectly stable during hands-off flight");
  assert.ok(p.position.z < -1800, "Jet must maintain forward momentum");
});

test("Stage 1: High-G pitch pull & induced drag energy bleed (DCS World Reference)", () => {
  const p = new Jet("player");
  p.speed = 300;
  const initialSpeed = p.speed;
  for (let i = 0; i < 180; i++) {
    updateFlight(p, input("ArrowUp"), 1 / 60, advSettings);
  }
  assert.ok(p.speed < initialSpeed, "Induced drag & climbing must bleed kinetic energy");
  assert.ok(p.forward.y > 0.5, "Pitch up must achieve authoritative vertical climb");
  assert.ok(p.angular.x > 0.6, "Pitch angular velocity must remain firm and damped");
});

test("Stage 1: Coordinated banking turn & roll responsiveness (Ace Combat 7 Reference)", () => {
  const p = new Jet("player");
  for (let i = 0; i < 60; i++) {
    updateFlight(p, input("ArrowRight"), 1 / 60, easySettings);
  }
  const euler = new T.Euler(0, 0, 0, "YXZ").setFromQuaternion(p.quaternion);
  assert.ok(Math.abs(euler.z) > 0.1, "Aircraft must bank into turn");
  assert.ok(p.forward.x > 0.18, "Banking must generate coordinated aerodynamic turn");
});

test("Stage 1: Throttle response, spooling & flight envelope limits", () => {
  const p = new Jet("player");
  // Afterburner acceleration
  for (let i = 0; i < 600; i++) updateFlight(p, input("ShiftLeft"), 1 / 60, easySettings);
  assert.ok(p.speed > 450 && p.speed <= 590, "Afterburner speed within flight envelope");

  // Release to military cruise
  for (let i = 0; i < 600; i++) updateFlight(p, input(), 1 / 60, easySettings);
  assert.ok(Math.abs(p.speed - (75 + p.throttle * 270)) < 6, "Speed must settle at the selected throttle, without auto-cruise");

  // Airbrake deceleration
  for (let i = 0; i < 600; i++) updateFlight(p, input("KeyB"), 1 / 60, easySettings);
  assert.ok(p.speed >= 56 && p.speed < 70, "Airbrake must decelerate into the landing speed range");

  // Advanced Afterburner Top Speed ceiling
  const pAdv = new Jet("player"); pAdv.throttle = 1;
  for (let i = 0; i < 1500; i++) updateFlight(pAdv, input("ShiftLeft"), 1 / 60, advSettings);
  assert.ok(pAdv.speed > 550 && pAdv.speed <= 590, "Advanced top speed ceiling respected");
});

test("Stage 1: Beginner auto-leveling & recovery from high bank/pitch (Ace Combat 7 Reference)", () => {
  const p = new Jet("player");
  // Put jet into extreme bank and climb
  for (let i = 0; i < 120; i++) updateFlight(p, input("ArrowUp", "ArrowRight"), 1 / 60, easySettings);

  // Release all controls (hands off)
  for (let i = 0; i < 600; i++) updateFlight(p, input(), 1 / 60, easySettings);
  const settledEuler = new T.Euler(0, 0, 0, "YXZ").setFromQuaternion(p.quaternion);
  assert.ok(Math.abs(settledEuler.x) < 0.025, "Pitch must return to level flight");
  assert.ok(Math.abs(settledEuler.z) < 0.025, "Wings must return to level flight");
});

test("Stage 1: Dynamic pressure control authority scaling (q-factor)", () => {
  const lowSpeedJet = new Jet("player");
  lowSpeedJet.speed = 100;
  updateFlight(lowSpeedJet, input("ArrowUp"), 0.1, advSettings);

  const cornerSpeedJet = new Jet("player");
  cornerSpeedJet.speed = 220;
  updateFlight(cornerSpeedJet, input("ArrowUp"), 0.1, advSettings);

  assert.ok(cornerSpeedJet.angular.x > lowSpeedJet.angular.x, "Corner velocity must have superior control authority than near-stall speed");
});
