import { DEFAULT_SETTINGS } from '../game/Settings.js';
const sections = {
  graphics: [
    ['select','quality','Quality','low:Low · performance|medium:Medium · balanced|high:High · detailed|ultra:Ultra · maximum detail'],
    ['select','timeOfDay','Time of day','morning:Morning|midday:Midday|day:Day|sunset:Sunset|night:Night'],
    ['select','weather','Weather','clear:Clear|storm:Storm'],
    ['range','effectIntensity','Effect intensity',0,1.5,.05],
  ],
  controls: [
    ['select','device','Input device','keyboard:Keyboard|mouse:Mouse|gamepad:Gamepad'],
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
    ['check','landingCamera','Steadier landing camera'],
  ],
  hud: [ ['range','hudScale','HUD scale',.8,1.4,.05], ['range','hudOpacity','Panel opacity',.72,1,.02], ['check','highContrast','High contrast'], ['check','reducedMotion','Reduced motion · no camera shake or speed FOV'] ],
  audio: [],
};
export function settingsMarkup(value, section = 'graphics') {
  const settings = {...DEFAULT_SETTINGS,...value};
  const controls = (sections[section] || sections.graphics).map(([type,key,label,min,max,step]) => {
    let input;
    if (type === 'select') input = `<select data-setting="${key}">${min.split('|').map(choice => {const [id,text]=choice.split(':');return `<option value="${id}" ${settings[key]===id?'selected':''}>${text}</option>`}).join('')}</select>`;
    else if (type === 'check') input = `<input data-setting="${key}" type="checkbox" ${settings[key]?'checked':''}>`;
    else input = `<div><input data-setting="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${settings[key]}" aria-valuetext="${settings[key]}"><output>${settings[key]}</output></div>`;
    return `<label class="setting"><span>${label}</span>${input}</label>`;
  }).join('');
  return `<nav class="settings-tabs" aria-label="Settings category">${Object.keys(sections).map(id=>`<button data-settings-tab="${id}" aria-pressed="${id===section}">${id[0].toUpperCase()+id.slice(1)}</button>`).join('')}</nav><div class="settings-list">${controls}</div>
    ${section==='controls'?'<p class="panel-footnote">W/S adjusts throttle in both flight modes. Auto-cruise is optional. Device and enemy difficulty do not change flight assistance.</p><button class="primary" data-action="keybindings">Keyboard bindings</button><div class="controller-calibration"><h3>Controller calibration</h3><p id="gamepad-status" role="status">Connect a standard controller and press a button.</p><div class="axis-preview"><i id="gamepad-stick-preview"></i></div><output id="gamepad-values">Pitch 0 · Roll 0</output></div>':''}
    ${section==='camera'?'<p class="panel-footnote">Zero disables shake or speed FOV. Horizon stabilization only changes the camera.</p>':''}
    ${section==='audio'?'<p>Engine and weapon sounds, mix levels and previews.</p><button class="primary" data-action="sounds">Sounds &amp; previews</button>':''}
    <div class="settings-footer"><button data-action="fullscreen">Fullscreen</button><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/storage">Storage settings</a></div><p class="panel-footnote">Preferences save automatically on this device.</p>`;
}
