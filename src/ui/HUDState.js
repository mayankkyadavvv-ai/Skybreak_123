import { bindingLabel } from '../game/InputActions.js';
export function weaponStatus(game) {
  if (game.missilesLeft <= 0) return 'OUT OF AMMO';
  if (game.missileCooldown > 0) return `MISSILE RELOADING · ${game.missileCooldown.toFixed(1)}s`;
  if (!game.target?.alive) return 'NO TARGET';
  const locked = game.multiplayer?.active ? game.multiplayer.authoritativeLock?.locked && game.multiplayer.authoritativeLock.targetId === game.target.id : game.lock >= 1.4;
  return locked ? `LOCKED · ${bindingLabel('missile',game.settings)}` : `ACQUIRING LOCK ${Math.round(Math.min(1, game.lock / 1.4)*100)}%`;
}
export function onlineObjectiveSummary(multiplayer) {
  const mission = multiplayer.missionState;
  if (mission) {
    const phase = Number.isFinite(mission.phaseIndex) && Number.isFinite(mission.totalPhases) ? `PHASE ${mission.phaseIndex}/${mission.totalPhases}` : 'SHARED OBJECTIVE';
    return phase + (Number.isFinite(mission.enemiesRemaining) ? ` · ${mission.enemiesRemaining} HOSTILES` : '');
  }
  return multiplayer.matchOptions?.mode === 'free_flight' ? 'FLY WITH YOUR SQUADRON' : multiplayer.matchOptions?.mode === 'air_superiority' ? 'CAPTURE & HOLD THE ZONE' : 'SHARED MATCH · TEAM SCORE';
}
export function hudContext(game, ground, nearest) {
  const p=game.player;
  return p.isLanded ? 'ground' : nearest?.distance<12000 && p.position.y-ground<550 ? 'approach' : game.mission?.freeFlight ? 'cruise' : 'combat';
}
export function primaryWarning(game, ground, context) {
  const p=game.player, key=action=>bindingLabel(action,game.settings || {});
  if(game.incoming?.length) return {id:'missile',tone:'danger',text:`MISSILE INCOMING · ${key('flare')} FLARES`};
  if(p.stall) return {id:'stall',tone:'danger',text:`STALL · LOWER NOSE · ${key('throttleUp')} INCREASE THROTTLE`};
  if(!p.isLanded && p.position.y-ground<100 && p.velocity?.y < -4) return {id:'terrain',tone:'danger',text:`TERRAIN · ${key('pitchUp')} PULL UP`};
  if(game.hostileLock) return {id:'lock',tone:'caution',text:'HOSTILE LOCK · TURN TO BREAK TRACK'};
  if(game.outOfArea) return {id:'boundary',tone:'caution',text:'RETURN TO FLIGHT AREA'};
  if(p.recoveryStatus?.unrecoverable)return {id:'recovery-limit',tone:'danger',text:'RECOVERY LIMITED · TERRAIN TOO CLOSE · MANUAL CONTROL AVAILABLE'};
  const damaged=['engine','wing','sensor'].filter(key=>(p.systems?.[key]??1)<.7);
  if(damaged.length)return {id:'systems',tone:'caution',text:`${damaged.map(key=>`${key.toUpperCase()} ${Math.round(p.systems[key]*100)}%`).join(' · ')} · LAND AT A BASE FOR REPAIR`};
  if(game.input?.levelTimer>0)return {id:'recovery',tone:'info',text:'TERRAIN RECOVERY ACTIVE · STEER TO OVERRIDE'};
  if(context==='approach' && !p.gearDown) return {id:'gear',tone:'caution',text:`GEAR UP · ${key('landingGear')} LOWER GEAR`};
  if(p.isLanded && p.speed>=55) return {id:'rotate',tone:'info',text:`ROTATE · ${key('pitchUp')} NOSE UP`};
  return {id:'none',tone:'none',text:''};
}
