import { AUDIO_DEFAULTS, normalizeAudioSettings } from './SoundDesign.js';
import { CONTROLS_VERSION, migrateBindings, bindingLabel } from './InputActions.js';
export const DEFAULT_SETTINGS = Object.freeze({
  quality: 'medium', timeOfDay: 'day', weather: 'clear', difficulty: 'easy', device: 'keyboard', input: 'keyboard', flightMode: 'assisted',
  sensitivity: .8, pitchSensitivity: 1, rollSensitivity: 1, keyboardInvert: false, mouseInvert: false,
  mouseDeadzone: .08, mouseCurve: 1.35, mouseLock: false, mouseRecenter: 'spring', gamepadDeadzone: .14, gamepadInvert: false,
  autoCruise: false, cruiseThrottle: .58, fov: 64, speedFov: .65, shakeIntensity: .35, horizonStabilization: .65,
  landingCamera: true, hudScale: 1, hudOpacity: .76, highContrast: false, effectIntensity: .8, reducedMotion: false, openSkiesGuideSeen: false,
  ...AUDIO_DEFAULTS, shake: true, guideSeen: false, controlsVersion: CONTROLS_VERSION,
});
const bounds = { sensitivity: [.2, 2], pitchSensitivity: [.4, 1.6], rollSensitivity: [.4, 1.6], mouseDeadzone: [0, .3], mouseCurve: [1, 2.5], gamepadDeadzone: [.05, .35], cruiseThrottle: [.1, 1], fov: [50, 95], speedFov: [0, 1.5], shakeIntensity: [0, 1], horizonStabilization: [0, 1], hudScale: [.8, 1.4], hudOpacity: [.72, 1], effectIntensity: [0, 1.5] };
export function normalizeSettings(saved = {}, reducedMotion = false) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
  const value = normalizeAudioSettings({ ...DEFAULT_SETTINGS, ...saved });
  if (!saved.device) value.device = saved.input === 'mouse' ? 'mouse' : 'keyboard';
  if (!saved.flightMode) value.flightMode = saved.input === 'advanced' ? 'manual' : 'assisted';
  if (saved.mouseInvert === undefined) value.mouseInvert = Boolean(saved.invert);
  if (saved.shake === false) value.shakeIntensity = 0;
  if (reducedMotion && saved.shakeIntensity === undefined) { value.shakeIntensity = 0; value.speedFov = 0; }
  if (reducedMotion && saved.reducedMotion === undefined) value.reducedMotion = true;
  for (const [key, allowed] of Object.entries({ timeOfDay: ['morning','midday','day','sunset','night'], weather: ['clear','storm'], quality: ['low','medium','high','ultra'], difficulty: ['easy','medium','hard'], device: ['keyboard','mouse','gamepad'], flightMode: ['assisted','manual'], mouseRecenter: ['spring','hold'] })) if (!allowed.includes(value[key])) value[key] = DEFAULT_SETTINGS[key];
  for (const [key, [min,max]] of Object.entries(bounds)) value[key] = Number.isFinite(value[key]) ? Math.max(min, Math.min(max, value[key])) : DEFAULT_SETTINGS[key];
  for (const key of ['keyboardInvert','gamepadInvert','mouseInvert','mouseLock','autoCruise','landingCamera','highContrast','reducedMotion','openSkiesGuideSeen']) value[key] = value[key] === true;
  const savedBindings = { ...saved.keyBindings };
  if ((Number(saved.controlsVersion) || 0) < 4) {
    if (savedBindings.pitchUp === 'ArrowDown') delete savedBindings.pitchUp;
    if (savedBindings.pitchDown === 'ArrowUp') delete savedBindings.pitchDown;
  }
  const migrated = migrateBindings(savedBindings);
  value.keyBindings = migrated.bindings; value.controlsVersion = CONTROLS_VERSION; value.input = value.device;
  delete value.invert;
  const notices = migrated.notices.map(action => `Reset conflicting or unsupported binding: ${action}.`);
  if (saved.controlsVersion !== CONTROLS_VERSION && Object.keys(saved).length) notices.unshift(`Pitch controls updated: ${bindingLabel('pitchUp', value, false)} nose up, ${bindingLabel('pitchDown', value, false)} nose down. Check Controls before flight.`);
  return { settings: value, notices };
}
