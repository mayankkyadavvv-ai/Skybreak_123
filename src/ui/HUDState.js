import { bindingLabel } from '../game/InputActions.js';
export function hudContext(game, ground, nearest) {
  const p=game.player;
  return p.isLanded ? 'ground' : nearest?.distance<12000 && p.position.y-ground<550 ? 'approach' : game.mission?.freeFlight ? 'cruise' : 'combat';
}
export function primaryWarning(game, ground, context) {
  const p=game.player, key=action=>bindingLabel(action,game.settings || {});
  if(game.incoming?.length) return {id:'missile',tone:'danger',text:`MISSILE INCOMING · ${key('flare')} FLARES`};
  if(p.stall) return {id:'stall',tone:'danger',text:`STALL · LOWER NOSE · ${key('throttleUp')} INCREASE THROTTLE`};
  if(!p.isLanded && p.position.y-ground<100 && p.velocity?.y < -4) return {id:'terrain',tone:'danger',text:`TERRAIN · ${key('pitchUp')} PULL UP`};
  if(game.outOfArea) return {id:'boundary',tone:'caution',text:'RETURN TO FLIGHT AREA'};
  if(context==='approach' && !p.gearDown) return {id:'gear',tone:'caution',text:`GEAR UP · ${key('landingGear')} LOWER GEAR`};
  if(p.isLanded && p.speed>=55) return {id:'rotate',tone:'info',text:`ROTATE · ${key('pitchUp')} NOSE UP`};
  return {id:'none',tone:'none',text:''};
}
