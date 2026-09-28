import { bindingLabel } from './InputActions.js';

export const FLIGHT_LESSONS = Object.freeze([
  { id: 'climb', name: 'Climb & level', description: 'Gain 120 metres, then hold a level attitude for two seconds.', actions: ['pitchUp','pitchDown'] },
  { id: 'turn', name: 'Coordinated turn', description: 'Turn at least 60 degrees without losing more than 200 metres.', actions: ['rollLeft','rollRight'] },
  { id: 'throttle', name: 'Manage your speed', description: 'Increase throttle by 20%, then reduce it by 20%.', actions: ['throttleUp','throttleDown'] },
  { id: 'targeting', name: 'Acquire & engage', description: 'Select the practice target, hold a lock and launch one missile.', actions: ['targetNext','missile'] },
  { id: 'flare', name: 'Defensive timing', description: 'Wait for the real practice missile warning, then deploy a flare to divert it.', actions: ['flare'] },
  { id: 'landing', name: 'Runway approach', description: 'Lower your gear, align with the runway and complete a controlled touchdown.', actions: ['landingGear','airBrake','throttleDown','pitchUp'] },
]);
const KEY = 'skybreak-flight-school-v1';
const heading = player => Math.atan2(player.forward?.x || 0, -(player.forward?.z ?? -1));
const angle = (a,b) => Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
const copy = value => JSON.parse(JSON.stringify(value));
export class FlightSchool {
  constructor({storage = globalThis.localStorage, onSetup = () => {}, onCleanup = () => {}, onFeedback = () => {}} = {}) {
    this.storage=storage;this.onSetup=onSetup;this.onCleanup=onCleanup;this.onFeedback=onFeedback;
    this.progress={version:1,completed:[]};this.active=false;
    try { const saved=JSON.parse(storage?.getItem(KEY) || 'null');if(saved?.version===1)this.progress.completed=[...new Set(saved.completed?.filter(id=>FLIGHT_LESSONS.some(l=>l.id===id)) || [])]; } catch {}
  }
  start(id, game) {
    const lesson=FLIGHT_LESSONS.find(item=>item.id===id);if(!lesson)return {ok:false,error:'Unknown lesson'};
    this.stop();const result=this.onSetup(id,game);if(result?.ok===false)return result;
    const p=game.player; if(!p)return {ok:false,error:'Aircraft unavailable'};
    this.lesson=lesson;this.active=true;this.completed=false;this.elapsed=0;this.hold=0;this.stage=0;this.progressValue=0;
    this.initial={altitude:p.position.y,heading:heading(p),throttle:p.throttle,missiles:game.missilesLeft,flares:game.flaresLeft};
    this.feedback=lesson.description;this.seenThreat=false;this.practiceThreats=[];this.hadLock=false;this.wasAirborne=!p.isLanded;
    this.onFeedback(`FLIGHT SCHOOL · ${lesson.name}`);return {ok:true};
  }
  update(game,dt) {
    if(!this.active || this.completed || !game.player?.alive || game.state!=='playing')return;
    const p=game.player;this.elapsed+=Math.min(.1,Math.max(0,dt));
    if(this.lesson.id==='climb'){
      if(p.position.y-this.initial.altitude>=120)this.stage=1;
      this.hold=this.stage && Math.abs(p.forward?.y || 0)<.08 ? this.hold+dt : 0;
      this.progressValue=this.stage ? .7+Math.min(.3,this.hold/2*.3) : Math.max(0,Math.min(.7,(p.position.y-this.initial.altitude)/120*.7));
      this.feedback=this.stage?'Release pitch and hold the horizon for two seconds.':p.position.y<this.initial.altitude-50?'Nose up raises your flight path. Use short inputs.':this.lesson.description;
      if(this.hold>=2)this.complete();
    }else if(this.lesson.id==='turn'){
      this.progressValue=Math.min(1,angle(heading(p),this.initial.heading)/(Math.PI/3));
      this.feedback=p.position.y<this.initial.altitude-200?'Altitude is falling. Ease the bank and raise the nose.':this.lesson.description;
      if(this.progressValue>=1 && p.position.y>=this.initial.altitude-200)this.complete();
    }else if(this.lesson.id==='throttle'){
      if(!this.stage && p.throttle>=Math.min(.95,this.initial.throttle+.2)){this.stage=1;this.peakThrottle=p.throttle;}
      this.progressValue=this.stage ? .5+Math.min(.5,Math.max(0,(this.peakThrottle-p.throttle)/.2)*.5) : Math.min(.5,Math.max(0,p.throttle-this.initial.throttle)/.2*.5);
      this.feedback=this.stage?'Now reduce throttle by at least 20%. It holds when released.':'Increase throttle by at least 20%.';
      if(this.stage && p.throttle<=this.peakThrottle-.19)this.complete();
    }else if(this.lesson.id==='targeting'){
      this.hadLock ||= game.lock>=1.4;this.progressValue=this.hadLock?.7:Math.min(.65,(game.lock || 0)/1.4*.65);
      this.feedback=this.hadLock?'Lock achieved. Launch one missile at the practice target.':'Select the practice target and keep it inside the reticle.';
      if(this.hadLock && game.missilesLeft<this.initial.missiles)this.complete();
    }else if(this.lesson.id==='flare'){
      const incoming=game.incoming?.filter(m=>m.active!==false && m.target===p) || [];
      if(incoming.length){this.seenThreat=true;this.practiceThreats=[...incoming];}
      this.progressValue=this.seenThreat?.5:0;this.feedback=this.seenThreat?'Missile inbound: deploy a flare now.':'Wait for the practice missile warning before using a flare.';
      if(this.seenThreat && game.flaresLeft<this.initial.flares && this.practiceThreats.some(m=>m.active!==false && m.target!==p))this.complete();
    }else if(this.lesson.id==='landing'){
      if(!p.isLanded)this.wasAirborne=true;
      this.progressValue=p.gearDown?.4:0;
      this.feedback=p.gearDown?'Line up with the runway. Reduce speed and descent gently.':'Lower your landing gear before the final approach.';
      if(this.wasAirborne && p.isLanded && p.alive && p.gearDown && Math.abs(p.velocity?.y || 0)<4)this.complete();
    }
  }
  complete(){
    if(this.completed)return;this.completed=true;this.progressValue=1;this.feedback='Lesson complete. Repeat, choose the next lesson or return to Free Flight.';
    if(!this.progress.completed.includes(this.lesson.id))this.progress.completed.push(this.lesson.id);
    try{this.storage?.setItem(KEY,JSON.stringify(this.progress));}catch{}
    this.onFeedback(`LESSON COMPLETE · ${this.lesson.name}`);
  }
  reset(game){return this.lesson?this.start(this.lesson.id,game):{ok:false,error:'Choose a lesson first'};}
  skip(game){const next=FLIGHT_LESSONS[FLIGHT_LESSONS.findIndex(l=>l.id===this.lesson?.id)+1];return next?this.start(next.id,game):(this.stop(),{ok:true,finished:true});}
  stop(){if(this.active)this.onCleanup();this.active=false;}
  snapshot(settings={}){return {active:this.active,completed:!!this.completed,id:this.lesson?.id,name:this.lesson?.name,feedback:this.feedback,progress:this.progressValue || 0,elapsed:this.elapsed || 0,completedIds:copy(this.progress.completed),controls:(this.lesson?.actions || []).map(action=>({action,label:bindingLabel(action,settings)}))};}
}
