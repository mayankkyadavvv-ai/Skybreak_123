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
  const incoming = game.weapons.missiles.find((m) => m.active && m.target === jet && m.p.distanceTo(jet.position) < 1700);
  if (incoming) {
    jet.evadeTimer = 2;
    if (jet.flares > 0 && incoming.p.distanceTo(jet.position) < 750 && skill > 0.7) {
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
    destination = jet.position.clone().add(jet.forward.multiplyScalar(1400)).add(new T.Vector3(Math.sin(jet.aiPhase) * 1600, 550, Math.cos(jet.aiPhase) * 1600));
  } else if (target) {
    const dist = jet.position.distanceTo(target.position);
    const inFront = jet.forward.dot(target.position.clone().sub(jet.position).normalize());
    if (dist < 750 || inFront < -0.35) {
      jet.aiState = "reposition";
      destination = target.position.clone().add(target.forward.multiplyScalar(-1400)).add(new T.Vector3(Math.sin(jet.aiPhase) * 1e3, 350, Math.cos(jet.aiPhase) * 700));
    } else {
      jet.aiState = dist > 6500 ? "patrol" : "attack";
      destination = target.position.clone().addScaledVector(target.velocity, 0.5).add(new T.Vector3(Math.sin(game.elapsed * 0.23 + jet.aiPhase) * 250, Math.sin(game.elapsed * 0.31 + jet.aiPhase) * 180, 0));
    }
    if (dist < 1600 && inFront > 0.96 && jet.fireTimer <= 0) {
      game.weapons.cannon(jet, target);
      jet.fireTimer = 0.13 / skill;
    }
    if (dist < 5700 && dist > 800 && inFront > 0.9 && jet.missileTimer <= 0 && game.elapsed > 12) {
      game.weapons.missile(jet, target);
      jet.missileTimer = 15 / skill + Math.random() * 6;
    }
  } else destination = jet.position.clone().add(jet.forward.multiplyScalar(1500));
  const ground = terrainHeight(jet.position.x + jet.forward.x * 1200, jet.position.z + jet.forward.z * 1200);
  destination.y = Math.max(destination.y, ground + 650, 700);
  for (const other of [...game.enemies, ...game.allies, game.player]) if (other !== jet && other.alive && jet.position.distanceToSquared(other.position) < 160 ** 2) destination.add(jet.position.clone().sub(other.position).normalize().multiplyScalar(400));
  const desired = destination.sub(jet.position).normalize();
  const f = jet.forward;
  const turn = f.clone().cross(desired).dot(UP);
  steerQuaternion(jet.quaternion, desired, jet.bomber ? 0.2 : 0.54 * skill, dt);
  jet.model.rotateZ(-turn * 0.52 * dt);
  jet.speed = damp(jet.speed, jet.bomber ? 125 : jet.aiState === "evade" ? 290 : enemy ? 205 + skill * 20 : 255, 0.5, dt);
  jet.velocity.copy(jet.forward).multiplyScalar(jet.speed);
  jet.position.addScaledVector(jet.velocity, dt);
  jet.animate(game.elapsed, jet.aiState === "evade");
}
export {
  updateAI
};
