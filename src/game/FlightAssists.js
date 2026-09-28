const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

// Intent only: shared simulations still apply their physical turn/climb limits.
export function recoveryIntent(state, command = {}, terrainHeight = () => 0) {
  const overridden=Math.abs(command.pitch||0)+Math.abs(command.roll||0)+Math.abs(command.yaw||0)>.08;
  if(overridden || state.isLanded) return {pitch:0,roll:0,urgent:false,clearance:Infinity,overridden};
  const p=state.position, q=state.quaternion;
  const forward=state.forward || {x:-2*(q.x*q.z+q.y*q.w),y:2*(q.x*q.w-q.y*q.z),z:-1+2*(q.x*q.x+q.y*q.y)};
  const speed=Math.max(60,state.speed||180), heading=Math.atan2(forward.x,-forward.z);
  const sample=angle=>{
    let clearance=p.y-Math.max(0,terrainHeight(p.x,p.z)), obstacle=0;
    for(const seconds of [1,2,4,6]) {
      const x=p.x+Math.sin(angle)*speed*seconds,z=p.z-Math.cos(angle)*speed*seconds;
      const h=Math.max(0,terrainHeight(x,z));
      const predicted=p.y+(state.velocity?.y || 0)*Math.min(seconds,2);
      clearance=Math.min(clearance,predicted-h);obstacle=Math.max(obstacle,h);
    }
    return {clearance,obstacle};
  };
  const centre=sample(heading),left=sample(heading-.55),right=sample(heading+.55);
  const urgent=centre.clearance<90;
  const pitch=centre.clearance<220?clamp((260-centre.clearance)/400,.15,.8):0;
  const best=Math.max(left.clearance,right.clearance);
  const roll=urgent && best>centre.clearance+50?(left.clearance>right.clearance?-.6:.6):0;
  return {pitch,roll,urgent,clearance:centre.clearance,overridden:false,unrecoverable:centre.clearance<0&&best<0};
}

export function controllerDeadzone(samples) {
  if(!Array.isArray(samples)||samples.length<8) return {ok:false,reason:'Keep the sticks centred while calibration samples are collected.'};
  const values=samples.flatMap(sample=>Array.isArray(sample)?sample:sample?.axes||[]).filter(Number.isFinite);
  if(!values.length) return {ok:false,reason:'No controller axes were sampled.'};
  const peak=Math.max(...values.map(Math.abs));
  if(peak>.28) return {ok:false,reason:'Release both sticks, then calibrate again.'};
  return {ok:true,deadzone:clamp(peak+.035,.05,.35),peak,sampleCount:samples.length};
}
