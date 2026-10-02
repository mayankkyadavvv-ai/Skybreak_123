import test from 'node:test';
import assert from 'node:assert/strict';
import { Jet } from '../src/game/Jet.js';
import { updateFlight, flightCommands } from '../src/game/FlightPhysics.js';
import { normalizeSettings } from '../src/game/Settings.js';
import { actionForCode, bindingError, bindingLabel, readGamepad } from '../src/game/InputActions.js';
const input = (...keys) => ({keys:new Set(keys),mouse:{x:0,y:0}});
const run = (jet,control,settings,seconds) => { for(let i=0;i<seconds*60;i++) updateFlight(jet,control,1/60,settings); };
test('throttle holds after release, controls speed, and never commands pitch in either flight mode', () => {
  for(const flightMode of ['assisted','manual']) {
    const settings={device:'keyboard',flightMode}; const low=new Jet('player'), high=new Jet('player');
    run(low,input('KeyS'),settings,2); run(high,input('KeyW'),settings,2);
    const throttle=high.throttle; run(high,input(),settings,15); run(low,input(),settings,15);
    assert.equal(high.throttle,throttle); assert.ok(high.speed>low.speed+180);
    assert.ok(Math.abs(high.forward.y)<.001 && Math.abs(low.forward.y)<.001);
    run(high,input('ShiftLeft'),settings,2); assert.equal(high.throttle,throttle);
  }
});
test('cannon and afterburner cannot rotate a ground aircraft; nose-up command can', () => {
  for(const keys of [['Space'],['ShiftLeft'],['Space','ShiftLeft']]) {
    const jet=new Jet('player');jet.isLanded=true;jet.speed=90;jet.throttle=1;jet.landedElev=38;
    run(jet,input(...keys),{flightMode:'assisted'},2); assert.equal(jet.isLanded,true);
    run(jet,input('ArrowUp'),{flightMode:'assisted'},.5); assert.equal(jet.isLanded,false);
  }
});
test('rebinding updates behavior and labels, rejects collisions, and preserves supported custom settings', () => {
  const old={input:'advanced',invert:true,volume:0,controlsVersion:3,keyBindings:{pitchUp:'ArrowDown',pitchDown:'ArrowUp',missile:'KeyF',airBrake:'KeyJ',chaff:'KeyZ'}};
  const {settings,notices}=normalizeSettings(old);
  assert.equal(settings.device,'keyboard');assert.equal(settings.flightMode,'manual');assert.equal(settings.mouseInvert,true);assert.equal(settings.volume,0);
  assert.equal(actionForCode('KeyE',settings),'missile');assert.equal(actionForCode('KeyM',settings),undefined);assert.equal(bindingLabel('missile',settings),'E / RMB');
  assert.ok(bindingError('missile','KeyN',settings));assert.ok(notices.some(n=>n.includes('chaff')));
  assert.equal(flightCommands(input('KeyJ'),settings).brake,1);assert.equal(flightCommands(input('KeyB'),settings).brake,0);
  const jet=new Jet('player');run(jet,input('ArrowUp'),settings,1);assert.ok(jet.forward.y>0);
  assert.equal(bindingLabel('pitchUp',settings),'↑');assert.ok(notices[0].includes('↑ nose up'));
  const custom=normalizeSettings({controlsVersion:3,keyBindings:{pitchUp:'KeyI',pitchDown:'KeyK'}}).settings;
  assert.ok(flightCommands(input('KeyI'),custom).pitch>0);assert.ok(flightCommands(input('KeyK'),custom).pitch<0);
  const rebound=normalizeSettings({controlsVersion:4,keyBindings:{pitchUp:'ArrowDown',pitchDown:'ArrowUp'}}).settings;
  assert.ok(flightCommands(input('ArrowDown'),rebound).pitch>0);
});
test('mouse deadzone, inversion and free-look are independent of keyboard pitch inversion', () => {
  const settings={device:'mouse',keyboardInvert:true,sensitivity:1};
  assert.ok(flightCommands(input('ArrowUp'),settings).pitch<0);
  const stick={...input(),mouse:{x:.02,y:-.02}};assert.equal(flightCommands(stick,settings).pitch,0);
  stick.mouse.y=-.8;assert.ok(flightCommands(stick,settings).pitch>0);
  assert.ok(flightCommands(stick,{...settings,mouseInvert:true}).pitch<0);
  stick.freeLook=true;assert.equal(flightCommands(stick,settings).pitch,0);
});
test('standard controller conversion handles drift, analog triggers, buttons and unsupported mappings', () => {
  const pad={mapping:'standard',axes:[.02,-.02,.5,-.7],buttons:Array.from({length:17},()=>({value:0,pressed:false}))};
  pad.buttons[6].value=.4;pad.buttons[0].pressed=true;
  const state=readGamepad(pad);assert.equal(state.axes.pitch,0);assert.equal(state.axes.roll,0);assert.equal(state.axes.brake,.4);assert.ok(state.held.has('missile'));assert.ok(state.axes.lookX>0);
  pad.axes[0]=.9;pad.axes[1]=.9;const stick=readGamepad(pad);const jet=new Jet('player');
  run(jet,{...input(),axes:stick.axes,heldActions:new Set()}, {device:'gamepad',flightMode:'assisted'},1);
  assert.ok(jet.forward.y>0 && jet.forward.x>0);
  assert.equal(readGamepad({...pad,mapping:''}).supported,false);assert.equal(readGamepad(null).held.size,0);
});
test('fixed simulation results are independent of render frame limits', () => {
  const positions=[];
  for(const fps of [30,60,144]) {
    const jet=new Jet('player');let accumulator=0,ticks=0;
    for(let frame=0;frame<fps*8;frame++) {accumulator+=1/fps;while(accumulator+1e-10>=1/60){updateFlight(jet,input('ArrowUp','ArrowRight','KeyW'),1/60,{flightMode:'assisted'});accumulator-=1/60;ticks++;}}
    assert.equal(ticks,480);positions.push(jet.position.clone());
  }
  assert.ok(positions[0].distanceTo(positions[2])<.001);
});
