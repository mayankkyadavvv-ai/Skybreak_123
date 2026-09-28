import { bindingLabel } from '../game/InputActions.js';
import { DEFAULT_SETTINGS } from '../game/Settings.js';
import { escapeHTML } from './Accessibility.js';
const sections = {
  graphics: [
    ['select','quality','Quality','low:Low · performance|medium:Medium · balanced|high:High · detailed|ultra:Ultra · maximum detail'],
    ['select','timeOfDay','Time of day','morning:Morning|midday:Midday|day:Day|sunset:Sunset|night:Night'],
    ['select','weather','Weather','clear:Clear|cloudy:Cloudy|storm:Storm'],
    ['check','adaptiveQuality','Adapt graphics to sustained frame time'], ['select','adaptiveTargetFps','Adaptive target','60:60 FPS|30:30 FPS'],
    ['range','effectIntensity','Effect intensity',0,1.5,.05],
  ],
  controls: [
    ['select','device','Input device','keyboard:Keyboard|mouse:Mouse|gamepad:Gamepad'],
    ['select','mouseMode','Mouse steering','virtual-stick:Virtual stick|point-to-fly:Point to fly'],
    ['select','flightMode','Flight assistance','assisted:Assisted|manual:Manual'],
    ['select','difficulty','Enemy difficulty','easy:Easy|medium:Medium|hard:Hard'],
    ['range','pitchSensitivity','Pitch sensitivity',.4,1.6,.05], ['range','rollSensitivity','Roll sensitivity',.4,1.6,.05],
    ['check','keyboardInvert','Invert keyboard pitch'], ['check','mouseInvert','Invert mouse Y'],
    ['range','sensitivity','Mouse sensitivity',.2,2,.05], ['range','mouseDeadzone','Mouse deadzone',0,.3,.01],
    ['range','mouseCurve','Mouse response curve',1,2.5,.05], ['check','mouseLock','Capture mouse on flight-view click'],
    ['select','mouseRecenter','Captured stick recenter','spring:Spring to centre|hold:Hold position · press recenter key'],
    ['range','gamepadDeadzone','Controller deadzone',.05,.35,.01], ['check','gamepadInvert','Invert controller pitch'],
    ['check','autoCruise','Auto-cruise assistance'], ['range','cruiseThrottle','Auto-cruise throttle',.1,1,.05],
  ],
  camera: [
    ['range','fov','Field of view',50,95,1], ['range','speedFov','Speed / boost FOV',0,1.5,.05],
    ['range','shakeIntensity','Camera shake',0,1,.05], ['range','horizonStabilization','Horizon stabilization',0,1,.05],
    ['check','landingCamera','Steadier landing camera'], ['check','targetCamera','Track selected target in chase view'], ['range','touchCameraSensitivity','Touch / controller look sensitivity',.3,2,.05],
  ],
  hud: [ ['select','hudDetail','Instrument detail','full:Full HUD|compact:Compact HUD'], ['check','subtitles','Audio subtitles'], ['range','hudScale','HUD scale',.8,1.4,.05], ['range','hudOpacity','Panel opacity',.72,1,.02], ['check','highContrast','High contrast'], ['check','reducedMotion','Reduced motion · no camera shake or speed FOV'] ],
  audio: [],
};
export function settingsMarkup(value, section = 'graphics') {
  const settings = {...DEFAULT_SETTINGS,...value};
  const controls = (sections[section] || sections.graphics).map(([type,key,label,min,max,step]) => {
    let input;
    if (type === 'select') input = `<select data-setting="${key}">${min.split('|').map(choice => {const [id,text]=choice.split(':');return `<option value="${id}" ${String(settings[key])===id?'selected':''}>${text}</option>`}).join('')}</select>`;
    else if (type === 'check') input = `<input data-setting="${key}" type="checkbox" ${settings[key]?'checked':''}>`;
    else input = `<div><input data-setting="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${settings[key]}" aria-valuetext="${settings[key]}"><output>${settings[key]}</output></div>`;
    return `<label class="setting"><span>${label}</span>${input}</label>`;
  }).join('');
  return `<nav class="settings-tabs" aria-label="Settings category">${Object.keys(sections).map(id=>`<button data-settings-tab="${id}" aria-pressed="${id===section}">${id[0].toUpperCase()+id.slice(1)}</button>`).join('')}</nav><div class="settings-list">${controls}</div>
    ${section==='controls'?`<p class="panel-footnote">Arrow Up = nose up · Arrow Down = nose down by default. Explicit inversion is shown above. Your custom bindings are preserved.</p><div class="replay-toolbar"><button class="primary" data-action="keybindings">Keyboard bindings</button><button data-action="touch-layout">Arrange touch controls</button></div><section class="control-studio"><h3>Live control preview</h3><p>Keyboard: ${bindingLabel('pitchUp',settings)} / ${bindingLabel('pitchDown',settings)} pitch, ${bindingLabel('rollLeft',settings)} / ${bindingLabel('rollRight',settings)} roll. Mouse: move over the preview. Controller: move its sticks.</p><div id="control-preview" tabindex="0" aria-label="Live aircraft control preview"><svg id="control-aircraft" viewBox="0 0 140 100" aria-hidden="true"><path d="M70 5 82 48 128 76 128 83 79 69 81 91 95 96 95 100 70 94 45 100 45 96 59 91 61 69 12 83 12 76 58 48Z" fill="#8fe9dd"/></svg></div><output id="control-preview-values">Pitch 0 · Roll 0</output><p id="gamepad-status" role="status">Connect a standard controller and press a button.</p><div class="axis-preview"><i id="gamepad-stick-preview"></i></div><output id="gamepad-values">Pitch 0 · Roll 0</output><p id="raw-pad-values"></p><button id="calibrate-pad">Measure controller drift · 3 seconds</button><h3>Named device profiles</h3><div class="profile-controls"><input id="profile-name" maxlength="32" aria-label="New profile name" placeholder="e.g. Mayank controller"><button id="save-profile">Save current</button><select id="control-profiles" aria-label="Saved control profile"><option value="">Choose profile</option>${(settings.controlProfiles || []).map(p=>`<option value="${escapeHTML(p.id)}">${escapeHTML(p.name)}</option>`).join('')}</select><button id="load-profile">Load</button><button id="remove-profile">Remove</button></div><p id="profile-status" role="status">Settings apply immediately; profiles keep your device-specific choices.</p></section>`:''}
    ${section==='camera'?'<p class="panel-footnote">Zero disables shake or speed FOV. Horizon stabilization only changes the camera.</p>':''}
    ${section==='audio'?'<p>Engine and weapon sounds, mix levels and previews.</p><button class="primary" data-action="sounds">Sounds &amp; previews</button>':''}
    <div class="settings-footer"><button data-action="fullscreen">Fullscreen</button><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/storage">Storage settings</a></div><p class="panel-footnote">Preferences save automatically on this device.</p>`;
}
