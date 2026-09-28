export const CONTROLS_VERSION = 4;
export const ACTIONS = Object.freeze({
  pitchDown: { label: 'Nose down', key: 'ArrowDown', kind: 'axis' },
  pitchUp: { label: 'Nose up', key: 'ArrowUp', kind: 'axis' },
  rollLeft: { label: 'Roll left', key: 'ArrowLeft', kind: 'axis' },
  rollRight: { label: 'Roll right', key: 'ArrowRight', kind: 'axis' },
  yawLeft: { label: 'Yaw / steer left', key: 'KeyQ', kind: 'axis' },
  yawRight: { label: 'Yaw / steer right', key: 'KeyE', kind: 'axis' },
  throttleUp: { label: 'Increase throttle', key: 'KeyW', kind: 'held' },
  throttleDown: { label: 'Decrease throttle', key: 'KeyS', kind: 'held' },
  afterburner: { label: 'Afterburner', key: 'ShiftLeft', alternate: 'ShiftRight', kind: 'held' },
  airBrake: { label: 'Air / wheel brake', key: 'KeyB', kind: 'held' },
  cannon: { label: 'Cannon', key: 'Space', mouse: 'Mouse0', kind: 'held' },
  missile: { label: 'Missile', key: 'KeyM', mouse: 'Mouse2', kind: 'press' },
  flare: { label: 'Flares', key: 'KeyX', kind: 'press' },
  targetNext: { label: 'Next target', key: 'KeyR', kind: 'press' },
  targetPrev: { label: 'Previous target', key: 'BracketLeft', kind: 'press' },
  landingGear: { label: 'Landing gear', key: 'KeyG', kind: 'toggle' },
  tacticalMap: { label: 'Tactical map', key: 'KeyN', kind: 'toggle' },
  landingAssist: { label: 'Airbases / approach', key: 'KeyL', kind: 'press' },
  camera: { label: 'Cycle camera', key: 'KeyC', kind: 'press' },
  cockpit: { label: 'Cockpit / chase', key: 'KeyV', kind: 'toggle' },
  freeLook: { label: 'Temporary free-look', mouse: 'Mouse1', kind: 'held' },
  recenter: { label: 'Recenter mouse stick', key: 'KeyZ', kind: 'press' },
  levelFlight: { label: 'Assisted recovery', key: 'KeyA', kind: 'press' },
  timeOfDay: { label: 'Cycle time of day', key: 'KeyT', kind: 'press' },
  targetCamera: { label: 'Target tracking camera', key: 'KeyK', kind: 'toggle' },
  priorityTarget: { label: 'Select priority threat', key: 'KeyF', kind: 'press' },
  pushToTalk: { label: 'Push to talk', key: 'KeyP', kind: 'held' },
  scoreboard: { label: 'Multiplayer scoreboard', key: 'Tab', kind: 'held' },
  teamComms: { label: 'Squadron / team commands', key: 'KeyY', kind: 'press' },
  allComms: { label: 'All quick commands', key: 'KeyU', kind: 'press' },
  ...Object.fromEntries(Array.from({length:7},(_,i)=>[`command${i+1}`,{label:`Quick command ${i+1}`,key:`Digit${i+1}`,kind:'press'}])),
  help: { label: 'Controls / help', key: 'KeyH', kind: 'press' },
  pause: { label: 'Pause / back', key: 'Escape', kind: 'press', fixed: true },
});
const names = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ShiftLeft: 'L Shift', ShiftRight: 'R Shift', ControlLeft: 'L Ctrl', ControlRight: 'R Ctrl', AltLeft: 'L Alt', AltRight: 'R Alt', Space: 'Space', Escape: 'Esc', BracketLeft: '[', BracketRight: ']', Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB', Backquote: '`' };
export const formatKey = code => (code || '').split('+').map(part => names[part] || part.replace(/^Key|^Digit/, '')).join(' + ');
export function bindingsFor(action, settings = {}) {
  const definition = ACTIONS[action];
  if (!definition) return [];
  const custom = settings.keyBindings?.[action];
  if(!custom && ['targetCamera','priorityTarget','pushToTalk'].includes(action) && Object.values(settings.keyBindings || {}).includes(definition.key))return [];
  return [custom || definition.key, !custom && definition.alternate, definition.mouse].filter(Boolean);
}
export const GAMEPAD_LABELS=Object.freeze({pitchUp:'LS down',pitchDown:'LS up',rollLeft:'LS left',rollRight:'LS right',yawLeft:'LB',yawRight:'RB',throttleUp:'D-pad ↑',throttleDown:'D-pad ↓',afterburner:'LS click',airBrake:'LT',cannon:'RT',missile:'A',flare:'B',targetNext:'X',landingGear:'D-pad →',tacticalMap:'D-pad ←',camera:'Y',freeLook:'RS',teamComms:'View / Back',pause:'Menu'});
export function bindingLabel(action, settings = {}, mouse = true) {
  if(settings.device==='gamepad'){
    const labelAction=settings.gamepadInvert && ['pitchUp','pitchDown'].includes(action)?(action==='pitchUp'?'pitchDown':'pitchUp'):action;
    if(GAMEPAD_LABELS[labelAction])return GAMEPAD_LABELS[labelAction];
  }
  if (settings.keyboardInvert && (action === 'pitchUp' || action === 'pitchDown')) action = action === 'pitchUp' ? 'pitchDown' : 'pitchUp';
  return bindingsFor(action, settings).filter(code => mouse || !code.startsWith('Mouse')).map(formatKey).join(' / ');
}
export function actionForCode(code, settings = {}) { return Object.keys(ACTIONS).find(action => bindingsFor(action, settings).includes(code)); }
export function isHeld(input, action, settings = {}) {
  if (!input) return false;
  if (input.heldActions?.has(action)) return true;
  if (action === 'airBrake' && input.touchBrake) return true;
  if (action === 'cannon' && input.fire) return true;
  if (action === 'afterburner' && input.boost) return true;
  return bindingsFor(action, settings).some(code => input.keys?.has(code));
}
export function chordFromEvent(event) {
  if (/^(Shift|Control|Alt|Meta)/.test(event.code)) return event.code;
  return [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Meta', event.code].filter(Boolean).join('+');
}
export function bindingError(action, code, settings = {}) {
  if (!ACTIONS[action]?.key || ACTIONS[action].fixed) return 'This control cannot be rebound.';
  if (!/^(?:(?:Ctrl|Alt|Shift)\+)*(?:Key[A-Z]|Digit[0-9]|Arrow(?:Up|Down|Left|Right)|Shift(?:Left|Right)|Space|Tab|Bracket(?:Left|Right)|Backquote|Comma|Period|Slash|Semicolon|Quote|Minus|Equal)$/.test(code || '')) return 'Choose a letter, number, arrow or supported punctuation key. Escape cancels.';
  if (/^(Ctrl|Alt)\+(?:Key[WTRLNFPSOHJKD]|Digit[0-9]|Arrow(?:Left|Right)|Space)$/.test(code)) return 'That combination is reserved for browser navigation.';
  const conflict = Object.keys(ACTIONS).find(other => other !== action && bindingsFor(other, settings).includes(code));
  return conflict ? `Already used by ${ACTIONS[conflict].label}. Choose another key.` : '';
}
export function migrateBindings(saved = {}) {
  const bindings = {}, notices = [];
  for (const [action, code] of Object.entries(saved || {})) {
    if (!ACTIONS[action]?.key || ACTIONS[action].fixed || typeof code !== 'string') { notices.push(action); continue; }
    bindings[action] = code;
  }
  for (let pass = 0; pass < Object.keys(ACTIONS).length; pass++) {
    let changed = false;
    for (const [action, code] of Object.entries(bindings)) if (bindingError(action, code, { keyBindings: bindings })) { delete bindings[action]; notices.push(action); changed = true; }
    if (!changed) break;
  }
  return { bindings, notices: [...new Set(notices)] };
}
export function curveAxis(value, deadzone = .08, curve = 1.35) {
  value = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
  const amount = Math.max(0, (Math.abs(value) - deadzone) / (1 - deadzone));
  return amount === 0 ? 0 : Math.sign(value) * amount ** curve;
}
export const GAMEPAD_BUTTONS = Object.freeze({ 0: 'missile', 1: 'flare', 2: 'targetNext', 3: 'camera', 4: 'yawLeft', 5: 'yawRight', 6: 'airBrake', 7: 'cannon', 8: 'teamComms', 9: 'pause', 10: 'afterburner', 12: 'throttleUp', 13: 'throttleDown', 14: 'tacticalMap', 15: 'landingGear' });
export function readGamepad(pad, deadzone = .14) {
  const state = { supported: pad?.mapping === 'standard', axes: { pitch: 0, roll: 0, lookX: 0, lookY: 0, brake: 0 }, held: new Set() };
  if (!state.supported) return state;
  state.axes.pitch = curveAxis(pad.axes?.[1], deadzone); state.axes.roll = curveAxis(pad.axes?.[0], deadzone);
  state.axes.lookX = curveAxis(pad.axes?.[2], deadzone); state.axes.lookY = curveAxis(pad.axes?.[3], deadzone);
  state.axes.brake = Math.max(0, Math.min(1, pad.buttons?.[6]?.value || 0));
  for (const [index, action] of Object.entries(GAMEPAD_BUTTONS)) if (pad.buttons?.[index]?.pressed || pad.buttons?.[index]?.value > .5) state.held.add(action);
  return state;
}
