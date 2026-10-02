import {computeJetStats} from '../game/JetConfigs.js';
export function compareLoadouts(current,candidate){
  const before=computeJetStats(current?.modelId,current?.modifications),after=computeJetStats(candidate?.modelId,candidate?.modifications);
  return [['maxSpeedKmh','Top speed','km/h'],['agility','Handling','points'],['maxHp','Durability','HP'],['missiles','Missiles',''],['cannon','Cannon','rounds'],['flares','Flares',''],['cannonDamage','Cannon damage','HP']].map(([key,label,unit])=>({key,label,unit,before:before[key],after:after[key],delta:Math.round((after[key]-before[key])*100)/100}));
}
export function comparisonSummary(current,candidate){return compareLoadouts(current,candidate).filter(s=>s.delta).map(s=>`${s.delta>0?'+':''}${s.delta} ${s.unit || s.label.toLowerCase()}`).join(' · ') || 'Same flight and weapon performance';}
