import * as T from 'three';
import { Jet } from './Jet.js';
import { configureSquadronJet } from './SquadronAI.js';
import { terrainHeight } from '../shared/WorldGeometry.js';
import { cloudDensityAt } from '../shared/CloudField.js';
import { MISSION_TEMPLATES, MISSION_LOCATIONS, createMissionPreset, encodeMissionPreset, decodeMissionPreset } from '../shared/MissionGenerator.js';
import { MissionRuntime } from '../shared/MissionRuntime.js';
import { CAMPAIGN_SECTORS, createCampaign, loadCampaign, saveCampaign, campaignMission, applyCampaignResult } from '../shared/Campaign.js';
import { ActivityRuntime } from '../shared/Activities.js';
import { ContactTracker, evaluateDetection } from '../shared/Sensors.js';
import { createDamageState } from '../shared/DamageSystems.js';
import { IAF_BASES } from './GeoWorld.js';
import { recordOperationResult } from './OpenSkiesProgress.js';
import { progression } from './Progression.js';
const FORWARD = new T.Vector3(0, 0, -1);
const safeStorage = () => { try { return globalThis.localStorage; } catch { return null; } };
const localPlayers = game => game.localCoop?.players || game.localPlayers || [game.player];
const env = game => ({ terrainHeight, cloudDensityAt, weather: game.multiplayer?.active?game.multiplayer.matchOptions?.weather || 'clear':game.operation?.preset.weather || game.atmosphere?.weather || game.settings?.weather || 'clear' });
let sequence = 0;

/** Install once from Game constructor. Methods expose actual UI journeys, not demo loops. */
export function installMissionExtensions(game) {
  if (game._missionExtensions) return;
  game._missionExtensions = true; game.contactTracker = new ContactTracker(); game.sensorContacts = [];
  const loaded = loadCampaign(safeStorage()); game.campaignState = loaded.value; game.campaignStorageAvailable = loaded.storageAvailable;
  game.listOperations = () => Object.entries(MISSION_TEMPLATES).map(([template, value]) => ({ template, ...value }));
  game.generateMission = options => { try { return { ok: true, preset: createMissionPreset(options) }; } catch (error) { return { ok: false, error: error.message }; } };
  game.exportMissionPreset = preset => encodeMissionPreset(preset);
  game.importMissionPreset = text => { const result = decodeMissionPreset(text.trim()); return result.ok ? { ok: true, preset: result.value } : { ok: false, error: result.errors.join(' ') }; };
  game.startOperation = (template = 'escort', options = {}) => {
    const generated = game.generateMission(options.preset || { template, difficulty: game.settings?.difficulty || 'easy', seed: Number(options.seed ?? 1), ...options });
    if (!generated.ok) { game.ui?.message?.(generated.error, 5); return generated; }
    if (game.multiplayer?.active) return { ok: false, error: 'Choose the shared operation in the party lobby before launch.' };
    game.start(MISSION_TEMPLATES[generated.preset.template].id, { operationPreset: generated.preset, campaignContext: options.campaignContext });
    return { ok: true, preset: generated.preset };
  };
  game.getCampaign = () => ({ ...game.campaignState, storageAvailable: game.campaignStorageAvailable,
    sectors: CAMPAIGN_SECTORS.map(sector => ({ ...sector, ...game.campaignState.sectors[sector.id], locked: game.campaignState.sectors[sector.id].status === 'locked', completed: game.campaignState.sectors[sector.id].status === 'secured' })) });
  game.newCampaign = (seed = Date.now() >>> 0) => { game.campaignState = createCampaign({ seed, id: `campaign-${seed}-${++sequence}` }); game.campaignStorageAvailable = saveCampaign(safeStorage(), game.campaignState); return game.getCampaign(); };
  game.resetCampaign = () => game.newCampaign(game.campaignState.seed);
  game.startCampaignSector = sectorId => {
    const selected = campaignMission(game.campaignState, sectorId, game.settings?.difficulty || 'easy');
    if (!selected.ok) return selected;
    return game.startOperation(selected.preset.template, { preset: selected.preset, campaignContext: { campaignId: game.campaignState.id, ownerId: game.campaignState.ownerId, sectorId } });
  };
  game.startActivity = (type, options = {}) => {
    if (game.multiplayer?.active) {
      if (!game.multiplayer.startActivity) return { ok: false, error: 'The connected server does not support activities.' };
      if(!game.multiplayer.isHost)return {ok:false,error:'Room host starts a shared activity for everyone.'};
      const sent=game.multiplayer.startActivity(type, options);if(sent)game.ui?.inGame?.();return sent?{ok:true}:{ok:false,error:'Connection unavailable. Try again after reconnecting.'};
    }
    if (!game.mission?.freeFlight || game.state === 'menu' || game.state === 'result') game.start(3);
    if (game.state === 'paused') { game.state = 'playing'; game.input?.clear?.(); game.ui?.inGame?.(); }
    if (type === 'landing' && game.approachBase) game.approachBase(IAF_BASES[0].id);
    game.activity?.cancel(); clearActivityMarkers(game);
    const players = localPlayers(game), base = IAF_BASES.find(base => base.id === options.baseId) || IAF_BASES[0];
    try { game.activity = new ActivityRuntime(type, { participants: players.map(player => ({ id: String(player.id) })), seed: options.seed ?? 1,
      origin: { x: game.player.position.x, y: game.player.position.y, z: game.player.position.z }, base,
      instanceId: `activity-${Date.now().toString(36)}-${++sequence}` });
      game.ui?.inGame?.();game.ui?.message?.(`${game.activity.snapshot().name} · ${game.activity.snapshot().objective}`, 5); return { ok: true }; }
    catch (error) { return { ok: false, error: error.message }; }
  };
  game.cancelActivity = () => { if(game.multiplayer?.active){game.multiplayer.cancelActivity();return {ok:true};}game.activity?.cancel(); game.activity = null; clearActivityMarkers(game); return { ok: true }; };
  game.canDetect = (observer, target, sensor) => { const detected = evaluateDetection(observer, target, env(game)); return sensor ? !!detected[sensor] : detected.detected; };
  game.isContactVisible = entity => {
    if (!entity?.alive) return false;
    const id = entity.missionId || entity.battleId || entity.id;
    const contact = game.sensorContacts.find(item => item.id === id);
    return contact ? contact.detected : game.canDetect(game.player, entity);
  };
  game.getSensorContacts = () => game.sensorContacts || [];
}

/** Call near end of Game.start, before its interpolation/camera reset. */
export function startOperationRuntime(game, options = {}) {
  installMissionExtensions(game);
  game.operation?.abort(); game.operation = null; game.operationProtected = null; clearOperationMarkers(game);
  game.activity?.cancel(); game.activity = null; clearActivityMarkers(game); game.contactTracker.clear(); game.sensorContacts = [];
  if (!game.mission?.operation || game.multiplayer?.active) return null;
  const preset = options.operationPreset || createMissionPreset({ template: game.mission.template, difficulty: game.settings.difficulty || 'easy', seed: options.seed ?? 1 });
  game.operation = new MissionRuntime(preset, { terrainHeight }); game.operation.campaignContext = options.campaignContext || null;
  game.operation.instanceId = game.sortieId; game.expandedMapMode = true;
  game.player.position.set(...['x', 'y', 'z'].map(key => game.operation.setup.playerStart[key]));
  game.player.setGear?.(false); game.player.systems = createDamageState();
  const center = new T.Vector3(game.operation.setup.center.x, game.operation.setup.center.y, game.operation.setup.center.z);
  game.player.quaternion.setFromUnitVectors(FORWARD, center.sub(game.player.position).normalize());
  game.player.velocity.copy(game.player.forward).multiplyScalar(game.player.speed);
  game.lastPlayerPos?.copy?.(game.player.position);
  for (let i = 0; i < Math.max(0, 3 - localPlayers(game).length); i++) {
    const jet = new Jet('ally'); jet.position.copy(game.player.position).add(new T.Vector3(i ? 250 : -250, 70, 200));
    jet.quaternion.copy(game.player.quaternion); jet.velocity.copy(game.player.velocity);
    configureSquadronJet(jet, { role: 'wingman', seed: preset.seed + i + 91, slot: i, id: `operation-wing-${i}` }, 0);
    jet.systems = createDamageState(); game.allies.push(jet); game.scene.add(jet.model);
  }
  handleOperationEvents(game, game.operation.start());
  game.atmosphere?.setTimeOfDay?.('midday'); game.atmosphere?.setWeather?.(preset.weather);
  createOperationMarkers(game); return game.operation;
}
function spawnOperationEntity(game, descriptor) {
  if ([...game.enemies, ...game.allies].some(entity => entity.missionId === descriptor.id)) return;
  const jet = new Jet(descriptor.team, ['bomber', 'transport', 'strike'].includes(descriptor.role));
  jet.missionId = descriptor.id; jet.battleId = descriptor.id; jet.callsign = descriptor.callsign; jet.routeManaged = !!descriptor.routeManaged;
  jet.route = descriptor.route.map(point => ({ ...point })); jet.routeIndex = 0; jet.routeComplete = false; jet.missionRole = descriptor.role;
  jet.hp = jet.maxHp = descriptor.maxHp; jet.speed = descriptor.speed; jet.position.set(descriptor.position.x, descriptor.position.y, descriptor.position.z);
  const direction = new T.Vector3().copy(descriptor.route[0] || game.player.position).sub(jet.position).normalize();
  jet.quaternion.setFromUnitVectors(FORWARD, direction); jet.velocity.copy(direction).multiplyScalar(jet.speed); jet.setGear?.(false);
  jet.systems = createDamageState();
  if (!jet.routeManaged) { configureSquadronJet(jet, { role: descriptor.role, seed: descriptor.seed, slot: game.enemies.length, id: descriptor.id }, game.elapsed); jet.callsign = descriptor.callsign; }
  if (jet.team === 'ally' && jet.routeManaged) game.operationProtected = jet;
  (jet.team === 'enemy' ? game.enemies : game.allies).push(jet); game.scene.add(jet.model); jet.resetInterpolation?.();
}
export function handleOperationEvents(game, events) {
  for (const event of events) {
    if (event.type === 'spawn') {
      for (const entity of event.entities) spawnOperationEntity(game, entity);
    } else if (event.type === 'radio' || event.type === 'objective') {
      game.notify?.('MISSION CONTROL', event.text, 6);
    } else if (event.type === 'recall') {
      for (const jet of game.enemies) if (event.ids.includes(jet.missionId) && jet.combat) { jet.combat.target = null; jet.combat.targetTimer = 0; }
    } else if (event.type === 'complete' || event.type === 'failed') {
      game.operationResult = event.result;
      recordOperationResult(progression, game.operation.instanceId, event.result, game.operation.campaignContext ? 'campaign' : 'custom');
      if (game.operation.campaignContext) {
        const applied = applyCampaignResult(game.campaignState, { ...game.operation.campaignContext, instanceId: game.operation.instanceId, result: event.result });
        if (applied.ok) { game.campaignState = applied.value; game.campaignStorageAvailable = saveCampaign(safeStorage(), applied.value); }
      }
      game.finish(event.type === 'complete', event.reason);
    }
  }
}
/** Call for a routeManaged aircraft in Game AI loop, instead of generic combat AI. */
export function updateOperationAircraft(jet, game) {
  if (!jet.routeManaged || !jet.alive) return false;
  if (jet.velocity.lengthSq() > .001) jet.quaternion.setFromUnitVectors(FORWARD, new T.Vector3().copy(jet.velocity).normalize());
  jet.animate?.(game.elapsed, false); return true;
}
/** Call once per simulation tick after weapons, before legacy missionStatus. */
export function stepMissionExtensions(game, dt) {
  if (!game._missionExtensions) installMissionExtensions(game);
  const entities = game.multiplayer?.active?[...game.multiplayer.remotePlayers.values()]:[...game.enemies, ...game.allies], players = localPlayers(game);
  if (game.operation && !game.multiplayer?.active && !game.resultCommitted) handleOperationEvents(game, game.operation.step(dt, { entities, players, playing: ['playing', 'dying'].includes(game.state) }));
  if (game.activity && !game.multiplayer?.active) {
    for (const event of game.activity.step(dt, { players })) {
      if (event.type === 'checkpoint') game.ui?.message?.(`CHECKPOINT ${event.checkpoint}/${event.total}`, 1.5);
      else if (event.type === 'activity-complete') { game.activityResult = event.results; game.ui?.message?.('Activity complete · results available in Activities', 6); }
      else if (event.type === 'activity-landing-rejected') game.ui?.message?.(event.reason, 4);
    }
  }
  game._sensorTime = (game._sensorTime || 0) - dt;
  if (game._sensorTime <= 0) {
    game._sensorTime = .2;
    const observer=game.multiplayer?.active?{position:game.player.position,alive:game.player.alive,systems:game.player.systems,team:game.multiplayer.localTeam}:game.player;
    game.sensorContacts = game.contactTracker.update(observer, entities, game.elapsed, env(game));
    if(game.multiplayer?.active)for(const threat of game.multiplayer.threats || []){const contact=game.sensorContacts.find(c=>String(c.entityId ?? c.id)===threat.id);if(contact?.detected)contact.kind=threat.kind;}
    for (const enemy of game.enemies) {
      const contact = game.sensorContacts.find(item => item.id === (enemy.missionId || enemy.battleId || enemy.id));
      if (contact?.detected && enemy.combat?.target === game.player && enemy.combat.lock > .3) contact.kind = enemy.combat.lock >= 1.4 ? 'lock' : 'tracking';
    }
    for (const [index, missile] of (game.incoming || []).entries()) if (missile.active !== false) game.sensorContacts.push({ id: `missile-${index}`, position: { x: missile.p.x, y: missile.p.y, z: missile.p.z }, relation: 'enemy', kind: 'missile', detected: true, lastSeen: game.elapsed, label: 'INCOMING' });
  }
  updateMissionMarkers(game);
}
function clearGroup(group) {
  if (!group) return;
  group.removeFromParent?.();
  group.traverse(node => { node.geometry?.dispose?.(); if (Array.isArray(node.material)) node.material.forEach(material => material.dispose?.()); else node.material?.dispose?.(); });
}
function clearOperationMarkers(game) { clearGroup(game.operationMarkers); game.operationMarkers = null; }
function clearActivityMarkers(game) { clearGroup(game.activityMarkers); game.activityMarkers = null; game._activityMarkerId = null; }
function ring(position, radius = 160, color = 0x68daef) {
  const mesh = new T.Mesh(new T.TorusGeometry(radius, Math.max(3, radius * .025), 6, 36), new T.MeshBasicMaterial({ color, transparent: true, opacity: .64, depthWrite: false }));
  mesh.position.copy(position); return mesh;
}
function createOperationMarkers(game) {
  clearOperationMarkers(game); if (!game.operation) return;
  const group = new T.Group(); group.name = 'operation-navigation';
  for (const descriptor of game.operation.setup.objectives) for (const point of descriptor.route) group.add(ring(point, 170, descriptor.team === 'ally' ? 0x68daef : 0xffb454));
  game.operationMarkers = group; game.scene.add(group);
}
function updateMissionMarkers(game) {
  const activity = game.activity?.snapshot() || game.activitySnapshot;
  if (!activity || ['cancelled', 'complete'].includes(activity.state)) { if (game.activityMarkers) clearActivityMarkers(game); return; }
  if (game._activityMarkerId !== activity.instanceId) {
    clearActivityMarkers(game); const group = new T.Group(); group.name = 'activity-navigation';
    if (activity.type === 'race') for (const gate of activity.gates) group.add(ring(gate, gate.radius));
    if (activity.type === 'formation') for (const target of activity.targets) group.add(ring(target, 70, 0xffc876));
    if (activity.type === 'landing' && activity.base) { const base = activity.base, a = (base.runwayHeading || 0) * Math.PI / 180;
      const marker = ring({ x: base.x - Math.sin(a) * 1400, y: base.elevation + 90, z: base.z + Math.cos(a) * 1400 }, 90, 0x94e8af); marker.rotation.y = -a; group.add(marker); }
    game.activityMarkers = group; game._activityMarkerId = activity.instanceId; game.scene.add(group);
  }
  if (activity.type === 'formation') for (let i = 0; i < activity.targets.length; i++) game.activityMarkers.children[i]?.position.copy(activity.targets[i]);
  if (activity.type === 'race') {
    const playerId = String(game.multiplayer?.localId || game.player.id), participant = activity.participants.find(p => p.id === playerId) || activity.participants[0];
    for (let i = 0; i < game.activityMarkers.children.length; i++) { const marker = game.activityMarkers.children[i]; marker.visible = i >= (participant?.checkpoint || 0); marker.material.opacity = i === participant?.checkpoint ? .85 : .24; }
  }
}
/** Call on menu/dispose/restart before replacing scene aircraft. */
export function clearMissionExtensions(game) {
  game.operation?.abort(); game.operation = null; game.operationProtected = null; game.operationResult = null;
  game.activity?.cancel(); game.activity = null; game.activitySnapshot = null; game.activityResult = null;
  game.contactTracker?.clear(); game.sensorContacts = []; clearOperationMarkers(game); clearActivityMarkers(game);
}
