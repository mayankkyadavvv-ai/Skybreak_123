import { escapeHTML } from './Accessibility.js';
const distance=(a,b)=>Math.hypot((a?.x || 0)-(b?.x || 0),(a?.y || 0)-(b?.y || 0),(a?.z || 0)-(b?.z || 0));
const position=entity=>entity.position || entity.p || entity.model?.position;
export function sensorContacts(game){
  const supplied=typeof game.getSensorContacts==='function'?game.getSensorContacts():game.sensorContacts;
  if(Array.isArray(supplied))return supplied.filter(c=>c.detected!==false&&c.alive!==false&&(!Number.isFinite(c.lastSeen)||game.elapsed-c.lastSeen<4));
  const player=game.player;if(!player)return [];
  return [...(game.allies || []),...(game.enemies || [])].filter(e=>e.alive!==false && e.detected!==false && distance(position(e),player.position)<35000 && (typeof game.isContactVisible!=='function'||game.isContactVisible(e))).map(e=>({id:e.id,entity:e,position:position(e),relation:e.team==='ally'?'friend':'enemy',kind:e.hostileLock?'lock':e.trackingPlayer?'tracking':'contact',callsign:e.callsign,detected:true}));
}
export function canDisplayContact(game,entity){
  if(entity===game.player)return true;
  const supplied=typeof game.getSensorContacts==='function'||Array.isArray(game.sensorContacts);
  return supplied?sensorContacts(game).some(c=>String(c.entityId ?? c.id)===String(entity.id)):entity.detected!==false && (typeof game.isContactVisible!=='function'||game.isContactVisible(entity));
}
export function relativeContact(player,contact){
  const p=position(contact.entity || contact) || contact.position;
  if(!p)return {bearing:0,direction:'DIRECTION UNKNOWN',altitude:'ALT UNKNOWN',range:null};
  const dx=p.x-player.position.x,dy=p.y-player.position.y,dz=p.z-player.position.z,f=player.forward || {x:0,z:-1};
  const bearing=Math.atan2(dx*-f.z+dz*f.x,dx*f.x+dz*f.z)*180/Math.PI;
  const direction=Math.abs(bearing)<45?'FRONT':Math.abs(bearing)>135?'REAR':bearing>0?'RIGHT':'LEFT';
  return {bearing,direction,altitude:dy>100?'ABOVE':dy<-100?'BELOW':'LEVEL',range:Math.round(Math.hypot(dx,dy,dz))};
}
export function threatState(game){
  if(!game.player)return [];
  const now=game.elapsed || 0,contacts=sensorContacts(game),incoming=(game.incoming || []).filter(m=>m.active!==false && (!m.target || m.target===game.player));
  const result=contacts.map(c=>({...c,...relativeContact(game.player,c),urgency:({missile:4,lock:3,tracking:2,contact:1})[c.kind] || 1}));
  incoming.forEach((m,i)=>result.push({id:`missile-${m.id ?? i}`,kind:'missile',relation:'enemy',...relativeContact(game.player,m),urgency:4}));
  if(game.hostileLock && !result.some(c=>c.kind==='lock'))result.push({id:'lock-warning',kind:'lock',relation:'enemy',direction:'SOURCE UNKNOWN',altitude:'',urgency:3});
  return result.filter(c=>!Number.isFinite(c.expiresAt)||c.expiresAt>now).sort((a,b)=>b.urgency-a.urgency||(a.range ?? Infinity)-(b.range ?? Infinity)).slice(0,4);
}
export function threatMarkup(game){
  const contacts=threatState(game);if(!contacts.length)return '';
  return `<span class="threat-caption">SENSOR CONTACTS</span>${contacts.map(c=>{const shape=c.kind==='missile'?'▲':c.relation==='friend'?'○':c.relation==='enemy'?'◇':'□';const state=({missile:'MISSILE',lock:'HOSTILE LOCK',tracking:'TRACKING',contact:c.relation==='friend'?'FRIEND':c.relation==='enemy'?'HOSTILE':'UNKNOWN'})[c.kind] || 'CONTACT';return `<div class="threat-contact threat-${c.kind}" data-urgency="${c.urgency}"><b aria-hidden="true">${shape}</b><span>${state} · ${c.direction}<small>${c.altitude}${c.range!=null?` · ${(c.range/1000).toFixed(1)} KM`:''}${c.callsign?` · ${escapeHTML(c.callsign)}`:''}</small></span></div>`;}).join('')}`;
}
