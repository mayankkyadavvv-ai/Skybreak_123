// Bounded recorded state. Playback never invokes Game, weapons or progression APIs.
export const REPLAY_VERSION=1;
const MAX_FRAMES=9000,MAX_EVENTS=1000,MAX_ENTITIES=32;
const finite=n=>Number.isFinite(n)?n:0;
const tuple=p=>[finite(p?.x),finite(p?.y),finite(p?.z)];
const clone=v=>JSON.parse(JSON.stringify(v));
export function replayEntity(entity,relation='unknown'){
  return {id:String(entity.id ?? entity.callsign ?? 'player').slice(0,64),callsign:String(entity.callsign || entity.name || entity.modelId || 'Aircraft').slice(0,48),modelId:String(entity.modelId || entity.jetModel || 'x17').slice(0,24),relation,position:tuple(entity.position || entity.p),quaternion:[finite(entity.quaternion?.x),finite(entity.quaternion?.y),finite(entity.quaternion?.z),entity.quaternion?.w ?? 1],hp:finite(entity.hp),maxHp:finite(entity.maxHp),alive:entity.alive!==false,speed:finite(entity.speed),gearDown:!!entity.gearDown,systems:{engine:entity.systems?.engine??1,wing:entity.systems?.wing??1,sensor:entity.systems?.sensor??1}};
}
export class SortieRecorder {
  constructor({hz=10,seconds=900,maxEntities=MAX_ENTITIES}={}){this.hz=Math.max(1,Math.min(20,hz));this.limit=Math.min(MAX_FRAMES,Math.ceil(Math.max(10,seconds)*this.hz));this.maxEntities=Math.min(MAX_ENTITIES,Math.max(1,maxEntities));this.reset();}
  reset(meta={}){this.meta={version:REPLAY_VERSION,mission:'Sortie',startedAt:new Date().toISOString(),...meta};this.frames=[];this.events=[];this.previous=new Map();this.lastTime=-Infinity;this.active=true;this.finished=false;this.startTime=0;}
  capture(time,entities,{phase='',score=0,lock=0}={}){
    if(!this.active || !Number.isFinite(time) || time<this.lastTime || time-this.lastTime<1/this.hz-1e-6)return false;
    this.lastTime=time;const states=entities.slice(0,this.maxEntities).map(({entity,relation,id})=>({...replayEntity(entity,relation),...(id?{id:String(id).slice(0,64)}:{})}));
    for(const state of states){const old=this.previous.get(state.id);if(old){if(old.hp>state.hp)this.event(time,'damage',`${state.callsign}: ${Math.round(old.hp-state.hp)} damage`,state.id);if(old.alive&&!state.alive)this.event(time,state.relation==='friend'?'wingman-loss':'destroyed',`${state.callsign} down`,state.id);}this.previous.set(state.id,state);}
    const currentIds=new Set(states.map(s=>s.id));for(const id of this.previous.keys())if(!currentIds.has(id))this.previous.delete(id);
    if(this.frames.at(-1)?.phase!==phase && phase)this.event(time,'phase',phase);
    this.frames.push({t:time,entities:states,phase:String(phase).slice(0,128),score:finite(score),lock:finite(lock)});
    if(this.frames.length>this.limit)this.frames.shift();this.startTime=this.frames[0]?.t || 0;
    while(this.events[0]?.t<this.startTime)this.events.shift();return true;
  }
  event(t,type,text,id=''){if(!this.active)return;const last=this.events.at(-1);if(last?.text===text && t-last.t<1)return;this.events.push({t:finite(t),type:String(type).slice(0,32),text:String(text).slice(0,180),id:String(id).slice(0,64)});if(this.events.length>MAX_EVENTS)this.events.shift();}
  finish(result={}){if(!this.finished){this.event(this.lastTime,'result',result.success?'Mission complete':'Sortie ended');this.result=clone(result);this.finished=true;this.active=false;}return this.export();}
  export(){return clone({version:REPLAY_VERSION,meta:this.meta,frames:this.frames,events:this.events,result:this.result || {},recordingLimitSeconds:this.limit/this.hz});}
}
export function validateReplay(input){
  if(!input || input.version!==REPLAY_VERSION || !Array.isArray(input.frames)||!input.frames.length||input.frames.length>MAX_FRAMES)throw new Error('Unsupported or empty replay.');
  if(!input.meta || typeof input.meta.mission!=='string' || input.meta.mission.length>180)throw new Error('Replay mission metadata is missing or invalid.');
  let last=-1;
  for(const frame of input.frames){if(!Number.isFinite(frame.t)||frame.t<last||!Array.isArray(frame.entities)||frame.entities.length>MAX_ENTITIES)throw new Error('Invalid replay timeline.');last=frame.t;for(const e of frame.entities)if(typeof e.id!=='string'||!Array.isArray(e.position)||e.position.length!==3||e.position.some(n=>!Number.isFinite(n)))throw new Error('Invalid replay aircraft state.');}
  if(!Array.isArray(input.events)||input.events.length>MAX_EVENTS||input.events.some(e=>!e||!Number.isFinite(e.t)||typeof e.type!=='string'||typeof e.text!=='string'||e.text.length>180||typeof e.id!=='string'))throw new Error('Invalid replay events.');
  return clone(input);
}
export class ReplayPlayer {
  constructor(recording){this.recording=validateReplay(recording);this.start=this.recording.frames[0].t;this.end=this.recording.frames.at(-1).t;this.time=this.start;this.playing=false;this.rate=1;}
  seek(time){this.time=Math.max(this.start,Math.min(this.end,finite(time)));return this.frame();}
  update(dt){if(this.playing){this.seek(this.time+Math.max(0,dt)*this.rate);if(this.time>=this.end)this.playing=false;}return this.frame();}
  frame(){
    const frames=this.recording.frames;let lo=0,hi=frames.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(frames[mid].t<=this.time)lo=mid;else hi=mid-1;}
    const a=frames[lo],b=frames[Math.min(lo+1,frames.length-1)],f=b.t>a.t?(this.time-a.t)/(b.t-a.t):0,next=new Map(b.entities.map(e=>[e.id,e]));
    return {...a,t:this.time,entities:a.entities.map(e=>{const n=next.get(e.id);return {...e,position:e.position.map((v,i)=>n?v+(n.position[i]-v)*f:v)};}),events:this.recording.events.filter(e=>e.t<=this.time && e.t>=this.time-4)};
  }
  highlight(){const moment=this.recording.events.find(e=>e.type==='destroyed') || this.recording.events.find(e=>e.type==='damage');const start=Math.max(this.start,(moment?.t ?? this.start)-5);return {start,end:Math.min(this.end,start+20)};}
}
export function replayAdvice(recording){
  const lost=recording.events.filter(e=>e.type==='wingman-loss').length,damage=recording.events.filter(e=>e.type==='damage').length;
  if(lost)return 'Next sortie: regroup damaged wingmen and cover their escape before committing to a new target.';
  if(damage>3)return 'Next sortie: break away after a firing pass and watch the directional threat indicator.';
  if(recording.result?.stats?.shots>20 && recording.result.stats.hits/recording.result.stats.shots<.15)return 'Next sortie: use short cannon bursts when the target is close to your reticle.';
  return 'Next sortie: keep your speed through turns and use a stable target lock before launching.';
}
