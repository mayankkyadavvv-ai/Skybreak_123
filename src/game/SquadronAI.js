import * as T from 'three';
import { damp, steerQuaternion, UP } from './math.js';
import { terrainHeight } from './World.js';
import { OPEN_SKIES, seededRandom } from './OpenSkies.js';

export const SQUADRON_ORDERS = Object.freeze({ cover: 'Cover me', attack: 'Attack my target', regroup: 'Regroup' });
export const COMBAT_DIFFICULTY = Object.freeze({
  easy: { reaction: 2.3, switchDelay: 4, aimError: .026, turn: .28, fireDelay: .23, missileCooldown: 24, recovery: 4, aggression: .6 },
  medium: { reaction: 1.6, switchDelay: 3, aimError: .014, turn: .36, fireDelay: .17, missileCooldown: 19, recovery: 3, aggression: .8 },
  hard: { reaction: 1, switchDelay: 2.2, aimError: .007, turn: .44, fireDelay: .13, missileCooldown: 15, recovery: 2.2, aggression: 1 },
});
export const COMBAT_ROLES = Object.freeze({
  dogfighter: { label: 'DOGFIGHTER', missiles: 0, range: 1500, speed: 215 },
  missile: { label: 'MISSILE FIGHTER', missiles: 4, range: 5200, speed: 235 },
  support: { label: 'SUPPORT', missiles: 2, range: 3600, speed: 225 },
  ace: { label: 'VIPER', missiles: 4, range: 5600, speed: 255 },
  wingman: { label: 'WINGMAN', missiles: 4, range: 5000, speed: 240 },
});

export function configureSquadronJet(jet, { role = 'wingman', seed = 1, slot = 0, id = '' } = {}, now = 0) {
  jet.combatRole = role; jet.battleId = id; jet.squadSlot = slot;
  jet.callsign = role === 'ace' ? 'VIPER' : role === 'wingman' ? `KESTREL ${slot + 2}` : `${COMBAT_ROLES[role].label} ${slot + 1}`;
  jet.combat = { random: seededRandom(seed), destination: new T.Vector3(), offset: new T.Vector3(), desired: new T.Vector3(),
    target: null, targetTimer: 0, reaction: 0, lock: 0, graceUntil: now + OPEN_SKIES.spawnGrace, fire: 0, missile: 0, recovery: 0,
    cannon: jet.stats?.cannon || 1200, missiles: Math.min(jet.stats?.missiles || 6, COMBAT_ROLES[role].missiles), evade: 0, flare: 0 };
  jet.aiPhase = jet.combat.random() * Math.PI * 2;
  jet.order = 'cover'; jet.orderTarget = null;
  jet.setGear?.(false);
  if (role === 'ace') { jet.hp = jet.maxHp = Math.round(jet.maxHp * 1.45); }
}

export function issueSquadronOrder(game, order) {
  if (!(game.openSkies || game.operation) || game.multiplayer?.active || !SQUADRON_ORDERS[order]) return false;
  const available = game.allies.filter(jet => jet.alive && jet.combat && !jet.isHuman);
  if (!available.length) { game.ui.message('No wingmen remain. You can still complete the mission.', 3); return false; }
  const target = game.target;
  if (order === 'attack' && (!target?.alive || !game.enemies.includes(target))) {
    game.ui.message('Select a living hostile before ordering an attack.', 3); return false;
  }
  for (const jet of available) {
    jet.order = order; jet.orderTarget = order === 'attack' ? target : null;
    jet.combat.target = null; jet.combat.targetTimer = 0; jet.combat.lock = 0;
  }
  if ((game.openSkies || game.operation).canRadio('order', 2)) game.notify('SQUADRON', `${SQUADRON_ORDERS[order]}${order === 'attack' ? ` · ${target.callsign}` : ''}. Acknowledged.`, 3);
  return true;
}

function nearest(jet, candidates, weight = () => 1) {
  let best = null, bestScore = Infinity;
  for (const candidate of candidates) {
    if (!candidate?.alive) continue;
    const score = jet.position.distanceToSquared(candidate.position) * weight(candidate);
    if (score < bestScore) { best = candidate; bestScore = score; }
  }
  return best;
}

export function selectSquadronTarget(jet, game) {
  if (jet.team === 'ally') {
    if (jet.order === 'regroup') return null;
    if (jet.order === 'attack') {
      if (jet.orderTarget?.alive && game.enemies.includes(jet.orderTarget)) return canSense(game, jet, jet.orderTarget) ? jet.orderTarget : null;
      jet.order = 'cover'; jet.orderTarget = null;
      if ((game.openSkies || game.operation)?.canRadio('target-lost')) game.notify('SQUADRON', 'Assigned target is gone. Resuming cover.', 3);
    }
    const protectedJet = chooseProtectedAlly(jet, game);
    jet.coverTarget = protectedJet;
    const threats = game.enemies.filter(enemy => enemy.alive && canSense(game, jet, enemy) && enemy.position.distanceToSquared(protectedJet.position) < 7500 ** 2);
    const reserved = new Set(game.allies.filter(ally => ally !== jet && ally.alive && ally.combat?.target).map(ally => ally.combat.target));
    return nearest(jet, threats, enemy => (enemy.combat?.target === protectedJet || enemy.combat?.target === game.player ? .12 : 1) * (reserved.has(enemy) ? 2.4 : 1));
  }
  const friendlies = [game.player, ...game.allies].filter(j => j.alive && canSense(game, jet, j));
  if (game.operationProtected?.alive && canSense(game, jet, game.operationProtected) && ['support', 'missile'].includes(jet.combatRole)) return game.operationProtected;
  if (jet.combatRole === 'support') {
    return nearest(jet, friendlies, target => target.team === 'ally' ? .25 + .4 * target.hp / target.maxHp : 1);
  }
  if (jet.combatRole === 'ace') return game.player.alive && canSense(game, jet, game.player) ? game.player : nearest(jet, friendlies);
  // Dogfighters defend a threatened teammate; missile fighters favour the player.
  const threat = game.allies.find(ally => ally.alive && game.enemies.some(enemy => enemy.alive && ally.combat?.target === enemy));
  return jet.combatRole === 'dogfighter' && threat && canSense(game, jet, threat) && jet.squadSlot % 2 ? threat : nearest(jet, friendlies, target => target === game.player ? .45 : 1);
}

export function updateSquadronAI(jet, game, dt) {
  if (!jet.alive || jet.isHuman || jet.routeManaged) return;
  const c = jet.combat, role = COMBAT_ROLES[jet.combatRole];
  const encounter = game.openSkies || game.operation;
  const difficulty = encounter?.difficulty || game.settings.difficulty;
  const tuning = COMBAT_DIFFICULTY[difficulty] || COMBAT_DIFFICULTY.easy;
  const ally = jet.team === 'ally';
  c.targetTimer -= dt; c.fire -= dt; c.missile -= dt; c.recovery -= dt; c.flare -= dt; c.evade -= dt;
  // A destroyed/missing target is dropped immediately; living targets are sticky.
  const targetVisible = c.target && canSense(game, jet, c.target);
  const targetPresent = ally ? game.enemies.includes(c.target) : c.target === game.player || game.allies.includes(c.target);
  if (c.targetTimer <= 0 || !targetVisible || !c.target?.alive || !targetPresent || ally && jet.order === 'attack' && !jet.orderTarget?.alive) {
    const target = selectSquadronTarget(jet, game);
    if (target !== c.target) { c.target = target; c.reaction = 0; c.lock = 0; }
    c.targetTimer = tuning.switchDelay;
  }
  c.reaction += dt;
  const target = c.target, dest = c.destination, offset = c.offset;
  let speed = role.speed;
  const incoming = game.weapons.missiles.find(m => m.active && m.target === jet && m.p.distanceToSquared(jet.position) < 1800 ** 2);
  if (incoming) {
    c.evade = 2;
    if (jet.flares > 0 && c.flare <= 0 && incoming.p.distanceToSquared(jet.position) < 750 ** 2) {
      jet.flares--; c.flare = 8; game.weapons.deployFlares(jet);
    }
  }
  const formationLead = jet.order === 'regroup' ? game.player : jet.coverTarget?.alive ? jet.coverTarget : game.player;
  if (ally && (jet.order === 'regroup' || !target || jet.position.distanceToSquared(formationLead.position) > 8500 ** 2)) {
    offset.set(jet.squadSlot ? 210 : -210, 65, 260).applyQuaternion(formationLead.quaternion);
    dest.copy(formationLead.position).add(offset);
    const forwardError = offset.copy(dest).sub(jet.position).dot(formationLead.forward);
    speed = Math.max(110, Math.min(460 * (jet.stats?.speedMult || 1), formationLead.speed + Math.max(-75, Math.min(95, forwardError * .15))));
    if (jet.position.distanceToSquared(dest) < 90 ** 2) dest.addScaledVector(formationLead.forward, 700);
    jet.aiState = jet.order === 'regroup' ? 'formation' : formationLead !== game.player ? `covering ${formationLead.callsign || 'teammate'}` : 'covering';
  } else if (c.evade > 0 || c.recovery > 0) {
    dest.copy(jet.position).addScaledVector(jet.forward, 1300);
    offset.set(Math.cos(jet.aiPhase) * 1100, 350, Math.sin(jet.aiPhase) * 1100); dest.add(offset);
    speed += 25; jet.aiState = c.evade > 0 ? 'defending' : 'recovering'; c.lock = 0;
  } else if (target?.alive) {
    const dist = jet.position.distanceTo(target.position);
    const facing = jet.forward.dot(offset.copy(target.position).sub(jet.position).normalize());
    dest.copy(target.position).addScaledVector(target.velocity, Math.min(.8, dist / 1800));
    if (ally && jet.order === 'attack' && dist > 1400) { offset.copy(target.forward).cross(UP).multiplyScalar(jet.squadSlot % 2 ? 450 : -450); dest.add(offset); jet.aiState = 'pincer approach'; }
    // Standoff passes and ace repositioning create a visible attack/recovery rhythm.
    if ((jet.combatRole === 'missile' && c.missiles > 0 && dist < 1800) || dist < 420 || facing < -.5) {
      dest.addScaledVector(target.forward, -1600);
      dest.y += jet.combatRole === 'ace' ? 380 : 150;
      jet.aiState = 'repositioning';
    } else jet.aiState = jet.combatRole === 'missile' ? 'standoff' : 'attacking';
    if (jet.combatRole === 'ace' && dist < 1500 && facing > .7 && jet.speed > target.speed + 15) {
      // Visible high yo-yo trades pursuit speed for altitude before another pass.
      dest.copy(target.position).addScaledVector(target.forward, 550); dest.y += 500;
      speed = 190; jet.aiState = 'high yo-yo';
    } else if (jet.combatRole === 'ace' && facing < -.3) {
      offset.copy(jet.forward).cross(UP).multiplyScalar(Math.sin(jet.aiPhase) < 0 ? -1400 : 1400);
      dest.copy(jet.position).add(offset); dest.y += 180;
      speed = 225; jet.aiState = 'break turn';
    }
    const ready = game.elapsed >= c.graceUntil && c.reaction >= (ally ? .8 : tuning.reaction);
    const firingCone = facing > .97 && dist < 1650 && canSense(game, jet, target, 'visual');
    if (ready && firingCone && c.fire <= 0 && c.cannon > 0 && (jet.combatRole !== 'missile' || !c.missiles)) {
      if (game.weapons.cannon(jet, target, { spread: ally ? .009 : tuning.aimError, random: c.random })) c.cannon--;
      c.fire = ally ? .18 : tuning.fireDelay;
      // Short bursts followed by recovery; no constant cannon hose on Easy.
      if (c.random() > tuning.aggression) c.recovery = tuning.recovery;
    }
    const inLockCone = dist < role.range && dist > 950 && facing > .965 && canSense(game, jet, target, 'infrared');
    c.lock = ready && inLockCone ? Math.min(1.8, c.lock + dt) : Math.max(0, c.lock - 2 * dt);
    if (target === game.player && c.lock > .3 && c.missile <= 0 && c.missiles) game.hostileLock = true;
    const saturated = !ally && difficulty === 'easy' && game.weapons.missiles.some(m => m.active && m.target === target);
    if (c.lock >= 1.8 && c.missile <= 0 && c.missiles > 0 && !saturated && game.weapons.missile(jet, target)) {
      c.missiles--; c.lock = 0; c.missile = tuning.missileCooldown; c.recovery = tuning.recovery;
      if (jet.combatRole === 'ace' && encounter?.canRadio('ace-launch', 8)) game.notify(game.allies.find(jet => jet.alive)?.callsign || 'AEGIS CONTROL', 'VIPER launched. Defend, then turn back in!', 3);
    }
  } else {
    const center = game.operation?.setup.center || OPEN_SKIES.center;
    dest.set(center.x, center.y || 1800, center.z); jet.aiState = 'patrolling'; c.lock = 0;
  }
  const center = game.operation?.setup.center || OPEN_SKIES.center;
  if (!ally && Math.hypot(jet.position.x - center.x, jet.position.z - center.z) > 11500) {
    dest.set(center.x, center.y || 1800, center.z); jet.aiState = 'returning';
  }
  const f = jet.forward;
  const floor = Math.max(terrainHeight(jet.position.x, jet.position.z), terrainHeight(jet.position.x + f.x * 1300, jet.position.z + f.z * 1300), terrainHeight(dest.x, dest.z)) + 450;
  dest.y = Math.max(dest.y, floor, 650);
  for (const group of [game.enemies, game.allies, [game.player]]) for (const other of group) {
    if (other !== jet && other.alive && jet.position.distanceToSquared(other.position) < 210 ** 2) {
      offset.copy(jet.position).sub(other.position);
      if (offset.lengthSq() < 1) offset.set(jet.squadSlot % 2 ? 1 : -1, 1, .5);
      dest.addScaledVector(offset.normalize(), 650);
    }
  }
  c.desired.copy(dest).sub(jet.position).normalize();
  const turnRate = (ally ? .42 : tuning.turn * (jet.combatRole === 'ace' ? 1.12 : 1)) * (jet.stats?.turnMult || 1);
  steerQuaternion(jet.quaternion, c.desired, turnRate, dt);
  jet.speed = damp(jet.speed, speed, .7, dt);
  jet.velocity.copy(jet.forward).multiplyScalar(jet.speed);
  jet.position.addScaledVector(jet.velocity, dt);
  jet.animate(game.elapsed, c.evade > 0);
}

function canSense(game, observer, target, mode) {
  if (!target?.alive) return false;
  if (game.canDetect) return game.canDetect(observer, target, mode);
  return true;
}
export function chooseProtectedAlly(jet, game) {
  const friendlies = [game.player, ...game.allies].filter(ally => ally.alive && ally !== jet && !ally.routeManaged);
  let damaged = null;
  for (const ally of friendlies) if (ally.hp / ally.maxHp < .45 && (!damaged || ally.hp / ally.maxHp < damaged.hp / damaged.maxHp)) damaged = ally;
  return damaged || (game.operationProtected?.alive ? game.operationProtected : game.player);
}
