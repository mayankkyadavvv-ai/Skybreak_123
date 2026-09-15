import { JET_PROFILES, CANNON_PROFILES, PREVIEW_LABELS } from '../game/SoundDesign.js';

export function soundSettingsMarkup(settings) {
  const select = (key, label, choices) => `<label class="setting"><span>${label}</span><select data-audio-setting="${key}">${choices.map(([value, text]) => `<option value="${value}" ${settings[key] === value ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`;
  const range = (key, label) => `<label class="setting sound-slider"><span>${label}</span><div><input type="range" data-audio-setting="${key}" min="0" max="1" step="0.05" value="${settings[key]}" aria-valuetext="${Math.round(settings[key] * 100)} percent"><output>${Math.round(settings[key] * 100)}%</output></div></label>`;
  return `<p class="sound-intro">Choose a preset, then click <b>▶ Play</b> to preview. Close when satisfied — settings save automatically.</p>
    <div class="settings-list sound-presets">${select('jetSound', 'Jet sound profile', Object.entries(JET_PROFILES).map(([key, profile]) => [key, profile.label]))}${select('cannonSound', 'Cannon / bullets', Object.entries(CANNON_PROFILES))}</div>
    <div class="sound-section-heading"><h3>Preview Sounds</h3><button data-action="sound-stop" disabled>■ Stop preview</button></div>
    <div class="sound-preview-grid">${Object.entries(PREVIEW_LABELS).map(([key, label]) => `<button data-preview="${key}" aria-label="Preview ${label}" aria-pressed="false"><span>${label}</span><small>▶ Play</small></button>`).join('')}</div>
    <p id="sound-preview-status" class="sound-status" role="status" aria-live="polite">Press any ▶ Play button to preview.</p>
    <h3 class="sound-mix-heading">Volume & Audio Mix</h3><div class="settings-list sound-mix">${range('volume', 'Master Volume')}${range('sound', 'All sound effects')}${range('engineVolume', 'Engine & afterburner')}${range('weaponsVolume', 'Weapons & explosions')}${range('warningVolume', 'Warnings & target lock')}${range('music', 'Background music')}</div>
    <p class="panel-footnote">0% = mute. Master controls overall volume; Sound effects controls all sounds except music. Sound preview respects these volume levels.</p>
    <div class="sound-flight-tip"><p><kbd>SHIFT</kbd> = afterburner boost.<br><kbd>SPACE</kbd> = 20mm cannon in combat missions.</p><p>You can preview all audio profiles in Free Flight. Previews do not consume ammunition or disrupt flight.</p></div>`;
}

export function previewMuteReason(settings, type) {
  if (settings.volume === 0) return 'Master volume is 0%';
  if (settings.sound === 0) return 'All sound effects are 0%';
  const [key, label] = ['engine', 'afterburner'].includes(type) ? ['engineVolume', 'Jet engine volume'] : ['lock', 'warning'].includes(type) ? ['warningVolume', 'Warnings volume'] : ['weaponsVolume', 'Weapons volume'];
  return settings[key] === 0 ? `${label} 0%` : '';
}
