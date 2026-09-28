import * as T from "three";
import { steerQuaternion, damp, UP } from "./math.js";
import { terrainHeight, BASE } from "./World.js";

function updateAI(jet, game, dt) {
  if (!jet.alive) return;
  const difficulty = game.settings.difficulty;
  const skill = difficulty === "easy" ? 0.65 : difficulty === "hard" ? 1.3 : 1;
  const enemy = jet.team === "enemy";
  let target = enemy ? game.player : game.enemies.filter((e) => e.alive).sort((a, b) => jet.position.distanceToSquared(a.position) - jet.position.distanceToSquared(b.position))[0];
  if (!target?.alive) target = null;

  jet.fireTimer -= dt;
  jet.missileTimer -= dt;
  jet.evadeTimer -= dt;
  jet.bfmTimer = Math.max(0, (jet.bfmTimer || 0) - dt);

  // Tactical Radar Warning & Defensive Flare Deployment
  const incoming = game.weapons.missiles.find((m) => m.active && m.target === jet && m.p.distanceTo(jet.position) < 2200);
  if (incoming) {
    jet.evadeTimer = 2.2;
    const incomingDist = incoming.p.distanceTo(jet.position);
    if (jet.flares > 0 && incomingDist < 850 && skill > 0.7) {
      jet.flares--;
      game.weapons.deployFlares(jet);
    }
  }

  let destination;
  if (jet.bomber) {
    destination = BASE.clone().setY(800);
    jet.aiState = "bombing run";
  } else if (jet.evadeTimer > 0) {
    jet.aiState = "evade";
    if (jet.position.y > 1400 && skill > 0.8) {
      jet.bfmManeuver = "split_s";
      destination = jet.position.clone().add(jet.forward.clone().multiplyScalar(900)).add(new T.Vector3(Math.sin(jet.aiPhase) * 1200, -600, Math.cos(jet.aiPhase) * 1200));
    } else {
      jet.bfmManeuver = "barrel_roll";
      destination = jet.position.clone().add(jet.forward.clone().multiplyScalar(1400)).add(new T.Vector3(Math.sin(jet.aiPhase) * 1600, 550, Math.cos(jet.aiPhase) * 1600));
    }
  } else if (target) {
    const dist = jet.position.distanceTo(target.position);
    const toTarget = target.position.clone().sub(jet.position).normalize();
    const inFront = jet.forward.dot(toTarget);
    const targetFacingJet = target.forward ? target.forward.dot(toTarget.clone().negate()) : 0;

    // Tactical BFM Selection:
    if (inFront < -0.35 && targetFacingJet > 0.7 && skill > 0.75) {
      // 1. Break Turns & Rolling Scissors: Target is on AI's 6 o'clock
      jet.aiState = "reposition";
      jet.bfmManeuver = "rolling_scissors";
      const breakDir = jet.forward.clone().cross(UP).multiplyScalar(Math.sin(jet.aiPhase) > 0 ? 1 : -1);
      destination = target.position.clone().add(breakDir.multiplyScalar(1200)).add(new T.Vector3(0, 300, 0));
    } else if (dist < 1100 && inFront > 0.7 && jet.speed > (target.speed || 200) + 25 && skill > 0.8) {
      // 2. High Yo-Yo: Overshoot danger, pitch up to trade speed for angle
      jet.aiState = "attack";
      jet.bfmManeuver = "high_yo_yo";
      destination = target.position.clone().add(new T.Vector3(0, 650, 0)).add(target.forward.clone().multiplyScalar(200));
    } else if (dist > 3200 && dist < 6500 && inFront > 0.6 && skill > 0.85) {
      // 3. Low Yo-Yo: Target extending away, dive to accelerate
      jet.aiState = "attack";
      jet.bfmManeuver = "low_yo_yo";
      destination = target.position.clone().add(new T.Vector3(0, -350, 0)).add(target.forward.clone().multiplyScalar(600));
    } else if (dist < 750 || inFront < -0.35) {
      // 4. Reposition
      jet.aiState = "reposition";
      destination = target.position.clone().add(target.forward.clone().multiplyScalar(-1400)).add(new T.Vector3(Math.sin(jet.aiPhase) * 1e3, 350, Math.cos(jet.aiPhase) * 700));
    } else {
      // 5. Patrol or Direct Attack with lead pursuit
      jet.aiState = dist > 6500 ? "patrol" : "attack";
      const leadTime = Math.min(1.2, dist / 1600);
      destination = target.position.clone().addScaledVector(target.velocity, leadTime * 0.7).add(new T.Vector3(Math.sin(game.elapsed * 0.23 + jet.aiPhase) * 200, Math.sin(game.elapsed * 0.31 + jet.aiPhase) * 150, 0));
    }

    if (dist < 1800 && inFront > 0.95 && jet.fireTimer <= 0) {
      game.weapons.cannon(jet, target);
      jet.fireTimer = 0.13 / skill;
    }
    if (dist < 5700 && dist > 800 && inFront > 0.90 && jet.missileTimer <= 0 && game.elapsed > 8) {
      game.weapons.missile(jet, target);
      jet.missileTimer = 14 / skill + Math.random() * 5;
    }
  } else {
    destination = jet.position.clone().add(jet.forward.clone().multiplyScalar(1500));
  }

  // Terrain floor safety
  const ground = terrainHeight(jet.position.x + jet.forward.x * 1200, jet.position.z + jet.forward.z * 1200);
  destination.y = Math.max(destination.y, ground + 650, 700);

  // Formation collision avoidance
  for (const other of [...game.enemies, ...game.allies, game.player]) {
    if (other !== jet && other.alive && jet.position.distanceToSquared(other.position) < 160 ** 2) {
      destination.add(jet.position.clone().sub(other.position).normalize().multiplyScalar(400));
    }
  }

  const desired = destination.sub(jet.position).normalize();
  const f = jet.forward;
  const turn = f.clone().cross(desired).dot(UP);

  const steerSpeed = jet.bomber ? 0.2 : (jet.bfmManeuver === "rolling_scissors" ? 0.72 : 0.54) * skill;
  steerQuaternion(jet.quaternion, desired, steerSpeed, dt);

  if (jet.bfmManeuver === "rolling_scissors" || jet.bfmManeuver === "barrel_roll") {
    jet.model.rotateZ(-turn * 1.6 * dt);
  } else {
    jet.model.rotateZ(-turn * 0.52 * dt);
  }

  let targetSpeed = 205 + skill * 20;
  if (jet.bomber) targetSpeed = 125;
  else if (jet.aiState === "evade") targetSpeed = 295;
  else if (jet.bfmManeuver === "high_yo_yo") targetSpeed = 180;
  else if (jet.bfmManeuver === "low_yo_yo") targetSpeed = 280;

  jet.speed = damp(jet.speed, targetSpeed, 0.5, dt);
  jet.velocity.copy(jet.forward).multiplyScalar(jet.speed);
  jet.position.addScaledVector(jet.velocity, dt);
  jet.animate(game.elapsed, jet.aiState === "evade");
}

export { updateAI };
