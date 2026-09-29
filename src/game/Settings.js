import { AUDIO_DEFAULTS, normalizeAudioSettings } from './SoundDesign.js';
import { CONTROLS_VERSION, migrateBindings, bindingLabel } from './InputActions.js';
export const DEFAULT_SETTINGS = Object.freeze({
  quality: 'medium', timeOfDay: 'day', weather: 'clear', difficulty: 'easy', device: 'keyboard', input: 'keyboard', flightMode: 'assisted',
  sensitivity: .8, pitchSensitivity: 1, rollSensitivity: 1, keyboardInvert: false, mouseInvert: false,
  mouseDeadzone: .08, mouseCurve: 1.35, mouseLock: false, mouseRecenter: 'spring', gamepadDeadzone: .14, gamepadInvert: false,
  autoCruise: false, cruiseThrottle: .58, fov: 64, speedFov: .65, shakeIntensity: .35, horizonStabilization: .65,
  landingCamera: true, hudScale: 1, hudOpacity: .76, highContrast: false, effectIntensity: .8, reducedMotion: false, openSkiesGuideSeen: false,
  adaptiveQuality: false, adaptiveTargetFps: 60, hudDetail: 'full', mouseMode: 'virtual-stick', targetCamera: false, openSkiesEasyControls: true,
  subtitles: true, radioVolume: .75, warningDucking: true, lastMissionId: 3, lastSoloPlayed: false,
  touchCameraSensitivity: 1, controlProfiles: [], activeControlProfile: '', gamepadIndex: -1,
  ...AUDIO_DEFAULTS, shake: true, guideSeen: false, controlsVersion: CONTROLS_VERSION,
});
const bounds = { sensitivity: [.2, 2], pitchSensitivity: [.4, 1.6], rollSensitivity: [.4, 1.6], mouseDeadzone: [0, .3], mouseCurve: [1, 2.5], gamepadDeadzone: [.05, .35], cruiseThrottle: [.1, 1], fov: [50, 95], speedFov: [0, 1.5], shakeIntensity: [0, 1], horizonStabilization: [0, 1], hudScale: [.8, 1.4], hudOpacity: [.72, 1], effectIntensity: [0, 1.5], radioVolume:[0,1], touchCameraSensitivity:[.2,2] };
export const TOUCH_POSITIONS = Object.freeze({stick:{x:.16,y:.76},throttle:{x:.28,y:.73},fire:{x:.83,y:.70},missile:{x:.92,y:.70},flare:{x:.83,y:.82},boost:{x:.92,y:.82},brake:{x:.75,y:.90},gear:{x:.83,y:.93},camera:{x:.92,y:.93},pause:{x:.95,y:.15}});
export function normalizeTouchLayout(raw = {}) {
  const layout = {handedness:raw?.handedness==='left'?'left':'right',scale:Math.max(.8,Math.min(1.4,Number(raw?.scale)||1)),positions:{}};
  for(const [id,fallback] of Object.entries(TOUCH_POSITIONS)) {
    const p=raw?.positions?.[id];
    layout.positions[id]={x:Math.max(.06,Math.min(.94,Number.isFinite(p?.x)?p.x:fallback.x)),y:Math.max(.08,Math.min(.92,Number.isFinite(p?.y)?p.y:fallback.y))};
  }
  layout.customized=raw?.customized===true || Object.entries(layout.positions).some(([id,p])=>Math.abs(p.x-Math.max(.06,Math.min(.94,TOUCH_POSITIONS[id].x)))>.001 || Math.abs(p.y-Math.max(.08,Math.min(.92,TOUCH_POSITIONS[id].y)))>.001);
  return layout;
}
export const CONTROL_PROFILE_FIELDS=Object.freeze(['controlsVersion','device','flightMode','openSkiesEasyControls','sensitivity','pitchSensitivity','rollSensitivity','keyboardInvert','mouseInvert','gamepadInvert','mouseDeadzone','mouseCurve','mouseMode','mouseLock','mouseRecenter','gamepadDeadzone','gamepadIndex','touchCameraSensitivity','keyBindings','touchLayout']);
export function normalizeSettings(saved = {}, reducedMotion = false) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
  const value = normalizeAudioSettings({ ...DEFAULT_SETTINGS, ...saved });
  if (!saved.device) value.device = saved.input === 'mouse' ? 'mouse' : 'keyboard';
  if (!saved.flightMode) value.flightMode = saved.input === 'advanced' ? 'manual' : 'assisted';
  if (saved.mouseInvert === undefined) value.mouseInvert = Boolean(saved.invert);
  if (saved.shake === false) value.shakeIntensity = 0;
  if (reducedMotion && saved.shakeIntensity === undefined) { value.shakeIntensity = 0; value.speedFov = 0; }
  if (reducedMotion && saved.reducedMotion === undefined) value.reducedMotion = true;
  for (const [key, allowed] of Object.entries({ timeOfDay: ['morning','midday','day','sunset','night'], weather: ['clear','cloudy','storm'], quality: ['low','medium','high','ultra'], difficulty: ['easy','medium','hard'], device: ['keyboard','mouse','gamepad'], flightMode: ['assisted','manual'], mouseRecenter: ['spring','hold'],mouseMode:['virtual-stick','point-to-fly'],hudDetail:['compact','full'] })) if (!allowed.includes(value[key])) value[key] = DEFAULT_SETTINGS[key];
  for (const [key, [min,max]] of Object.entries(bounds)) value[key] = Number.isFinite(value[key]) ? Math.max(min, Math.min(max, value[key])) : DEFAULT_SETTINGS[key];
  for (const key of ['keyboardInvert','gamepadInvert','mouseInvert','mouseLock','autoCruise','landingCamera','highContrast','reducedMotion','openSkiesGuideSeen']) value[key] = value[key] === true;
  for (const key of ['adaptiveQuality','targetCamera','lastSoloPlayed']) value[key]=value[key]===true;
  for (const key of ['subtitles','warningDucking']) value[key]=value[key]!==false;
  value.openSkiesEasyControls=value.openSkiesEasyControls!==false;
  value.lastMissionId=Number.isInteger(value.lastMissionId)&&value.lastMissionId>=0&&value.lastMissionId<=8?value.lastMissionId:3;
  value.gamepadIndex=Number.isInteger(value.gamepadIndex)&&value.gamepadIndex>=0&&value.gamepadIndex<=15?value.gamepadIndex:-1;
  value.adaptiveTargetFps=value.adaptiveTargetFps===30?30:60;
  value.touchLayout=normalizeTouchLayout(value.touchLayout);
  value.controlProfiles=Array.isArray(saved.controlProfiles)?saved.controlProfiles.filter(p=>p&&typeof p.id==='string'&&typeof p.name==='string'&&p.settings&&typeof p.settings==='object').slice(0,10).map(p=>{
    const profile=normalizeSettings({...p.settings,controlsVersion:p.settings.controlsVersion ?? saved.controlsVersion,controlProfiles:[]}).settings;
    return {id:p.id.slice(0,64),name:p.name.trim().slice(0,32)||'Controls',settings:Object.fromEntries(CONTROL_PROFILE_FIELDS.filter(k=>Object.hasOwn(p.settings,k)||['controlsVersion','keyBindings'].includes(k)).map(k=>[k,profile[k]]))};
  }):[];
  value.activeControlProfile=typeof value.activeControlProfile==='string'&&value.controlProfiles.some(p=>p.id===value.activeControlProfile)?value.activeControlProfile:'';
  const savedBindings = { ...saved.keyBindings };
  if ((Number(saved.controlsVersion) || 0) < 4) {
    if (savedBindings.pitchUp === 'ArrowDown') delete savedBindings.pitchUp;
    if (savedBindings.pitchDown === 'ArrowUp') delete savedBindings.pitchDown;
  }
  if ((Number(saved.controlsVersion) || 0) < 5) {
    // Apply the requested E missile mapping once, including saved profiles.
    // Later v5 user rebindings stay intact. E can never also command yaw.
    delete savedBindings.missile;
    for (const [action, code] of Object.entries(savedBindings)) if (code === 'KeyE') delete savedBindings[action];
  }
  const migrated = migrateBindings(savedBindings);
  value.keyBindings = migrated.bindings; value.controlsVersion = CONTROLS_VERSION; value.input = value.device;
  delete value.invert;
  const notices = migrated.notices.map(action => `Reset conflicting or unsupported binding: ${action}.`);
  if (saved.controlsVersion !== CONTROLS_VERSION && Object.keys(saved).length) notices.unshift(`Controls updated: ${bindingLabel('pitchUp', value, false)} nose up, ${bindingLabel('pitchDown', value, false)} nose down. Missile = ${bindingLabel('missile', value, false)}; yaw = ${bindingLabel('yawLeft', value, false)} / ${bindingLabel('yawRight', value, false)}. Previous missile/E bindings were updated, including saved profiles.`);
  return { settings: value, notices };
}
