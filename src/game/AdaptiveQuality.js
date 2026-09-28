// F08: bounded cosmetic budgets; never writes the saved user preset or simulation.
export const ADAPTIVE_LEVELS = Object.freeze([
  Object.freeze({ resolution: 1, particles: 1, clouds: 1, shadows: 1 }),
  Object.freeze({ resolution: .9, particles: .85, clouds: .82, shadows: 1 }),
  Object.freeze({ resolution: .8, particles: .68, clouds: .64, shadows: .5 }),
  Object.freeze({ resolution: .7, particles: .5, clouds: .42, shadows: .5 }),
]);

export class AdaptiveQuality {
  constructor({ enabled = false, targetFps = 60, sampleSeconds = 3, cooldownSeconds = 12 } = {}) {
    this.enabled=enabled;this.targetFps=targetFps===30?30:60;
    this.sampleSeconds=sampleSeconds;this.cooldownSeconds=cooldownSeconds;
    this.level=0;this.current=ADAPTIVE_LEVELS[0];this.samples=new Float32Array(600);
    this.sampleCount=0;this.sampleCursor=0;this.elapsed=0;this.cooldown=6;
    this.badWindows=0;this.goodWindows=0;this.changes=[];this.time=0;
  }
  configure({enabled=this.enabled,targetFps=this.targetFps}={}) {
    const changed=this.enabled!==!!enabled || this.targetFps!==targetFps;
    this.enabled=!!enabled;this.targetFps=targetFps===30?30:60;
    if(!this.enabled) { this.level=0;this.current=ADAPTIVE_LEVELS[0]; }
    if(changed)this.resetWindow();
    return this.current;
  }
  resetWindow() { this.sampleCount=0;this.sampleCursor=0;this.elapsed=0;this.badWindows=0;this.goodWindows=0; }
  update(frameMs,dt,{active=true}={}) {
    if(!this.enabled || !active || !Number.isFinite(frameMs) || frameMs<=0 || frameMs>250 || !Number.isFinite(dt) || dt<=0) return null;
    // Tab resumes/loading pauses do not downgrade the preset.
    const seconds=Math.min(dt,.25);this.time+=seconds;this.cooldown=Math.max(0,this.cooldown-seconds);
    this.samples[this.sampleCursor++ % this.samples.length]=frameMs;
    this.sampleCount=Math.min(this.sampleCount+1,this.samples.length);this.elapsed+=seconds;
    if(this.elapsed<this.sampleSeconds || this.sampleCount<30)return null;
    const sorted=Array.from(this.samples.subarray(0,this.sampleCount)).sort((a,b)=>a-b);
    const p=(ratio)=>sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*ratio))];
    const median=p(.5),p95=p(.95),p99=p(.99),budget=1000/this.targetFps;
    this.lastSample={median,p95,p99,count:sorted.length};
    this.sampleCount=0;this.sampleCursor=0;this.elapsed=0;
    this.badWindows=median>budget*1.16 || p95>budget*1.65?this.badWindows+1:0;
    this.goodWindows=median<budget*1.03 && p95<budget*1.10?this.goodWindows+1:0;
    if(this.cooldown>0)return null;
    const next=this.badWindows>=2?Math.min(3,this.level+1):this.goodWindows>=4?Math.max(0,this.level-1):this.level;
    if(next===this.level)return null;
    this.level=next;this.current=ADAPTIVE_LEVELS[next];this.cooldown=this.cooldownSeconds;
    this.badWindows=0;this.goodWindows=0;
    this.changes.push({time:this.time,level:next,median,p95,p99});if(this.changes.length>32)this.changes.shift();
    return this.current;
  }
  snapshot() { return {enabled:this.enabled,targetFps:this.targetFps,level:this.level,current:this.current,lastSample:this.lastSample||null,changes:this.changes.slice()}; }
}
