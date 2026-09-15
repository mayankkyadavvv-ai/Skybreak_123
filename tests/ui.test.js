import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { UI } from '../src/ui/UI.js';
import { Input } from '../src/game/Input.js';
import { FREE_FLIGHT, MISSIONS } from '../src/game/Missions.js';

function screen() {
  const { window, document } = parseHTML('<html><body><canvas id="world"></canvas><main id="app"></main></body></html>');
  const saves = [];
  Object.assign(globalThis, { window, document, innerWidth: 1366, innerHeight: 768, devicePixelRatio: 1, localStorage: { setItem(key, value) { saves.push(JSON.parse(value)); }, getItem() { return null; } } });
  const context = new Proxy({}, { get: (target, key) => target[key] ?? (() => {}), set: (target, key, value) => { target[key] = value; return true; } });
  window.HTMLCanvasElement.prototype.getContext = () => context;
  const settings = { input: 'keyboard', quality: 'medium', sensitivity: .8, difficulty: 'easy', volume: .6, sound: .8, music: .1, invert: false, shake: true, guideSeen: false };
  const ui = new UI(document.getElementById('app'), settings);
  const starts = [];
  const game = {
    settings, mission: FREE_FLIGHT, selectedMission: 3, state: 'menu',
    audio: { previewType: null, play() {}, init() {}, syncMix() {}, async preview(type) { this.previewType = type;return true; }, stopPreview() { this.previewType = null; } }, input: { mouse: { x: 0, y: 0 }, keys: new Set() },
    settingsApplied: 0, applySettings() { this.settingsApplied++; }, start(id) { starts.push(id);this.state = 'intro';this.mission = id === 3 ? FREE_FLIGHT : MISSIONS[id];ui.inGame(); },
    pause() { this.state = 'paused';ui.showPause(); }, resume() { this.state = 'playing';ui.inGame(); },
    resetPracticePosition() { this.resets = (this.resets || 0) + 1; },
    menu() { this.state = 'menu';ui.showMenu(); }
  };
  ui.attach(game);
  return { ui, game, settings, document, window, starts, saves };
}
function click(document, selector) { const target = document.querySelector(selector);assert.ok(target, selector);target.click(); }

test('first launch defaults to Free Flight, shows arrow guidance, then starts the selected mode', () => {
  const { document, ui, settings, starts } = screen();
  assert.equal(ui.selected, 3);
  assert.equal(document.querySelectorAll('.mission-card').length, 4);
  assert.equal(document.querySelector('.mission-card.selected').dataset.mission, '3');
  click(document, '[data-action="play"]');
  assert.equal(ui.modalType, 'preflight');
  assert.match(ui.modal.textContent, /↑ Climb/);assert.match(ui.modal.textContent, /↓ Dive/);
  assert.equal(starts.length, 0);
  click(document, '[data-action="launch-flight"]');
  assert.deepEqual(starts, [3]);assert.equal(settings.guideSeen, true);
  assert.equal(ui.hudEl.hidden, false);assert.equal(ui.dom['practice-help'].hidden, false);
  assert.equal(document.querySelector('.hud-weapons').hidden, true);
  assert.match(document.querySelector('.flight-hints').textContent, /↑ ↓ ← →/);
});
test('mission selection, switching modes and Help all use the current controls', () => {
  const { document, ui, game, settings, starts } = screen();
  settings.guideSeen = true;
  click(document, '.mission-card[data-mission="0"]');
  click(document, '[data-action="play"]');
  assert.deepEqual(starts, [0]);assert.equal(document.querySelector('.hud-weapons').hidden, false);
  click(document, '[data-action="flight-help"]');
  assert.equal(game.state, 'paused');assert.equal(ui.modalType, 'controls');
  click(document, '#modal-root [data-mode="mouse"]');
  assert.equal(settings.input, 'mouse');assert.match(ui.modal.textContent, /Aim mouse toward/);
  assert.match(ui.modal.textContent, /E \/ RIGHT CLICK/);
  click(document, '#modal-root [data-mode="advanced"]');
  assert.match(ui.modal.textContent, /W = pitch down, S = pitch up/);
  ui.closePanel();assert.equal(ui.modalType, 'pause');ui.closePanel();assert.equal(game.state, 'playing');
});
test('Free Flight HUD has no zero-division progress or hostile objective; reset button works', () => {
  const { document, ui, game } = screen();game.start(3);
  ui.drawHUD = () => {};
  Object.assign(game, { enemies: [], score: 0, player: { speed: 220, hp: 100, throttle: .58, position: { x: 0, y: 1550, z: 5200 } }, cam: { mode: 'chase' }, missilesLeft: 6, cannonLeft: 1200, flaresLeft: 20, elapsed: 50, fps: 60, notifications: [], damageFlash: 0, incoming: [], lock: 0, target: null });
  ui.update(game, .04);
  assert.equal(ui.dom['objective-count'].textContent, 'NO ENEMIES · NO TIME LIMIT');
  assert.equal(ui.dom['objective-fill'].style.width, '0%');
  assert.equal(ui.dom['objective-fill'].parentElement.hidden, true);
  assert.match(ui.dom['lock-status'].textContent, /HELP/);
  assert.equal(ui.dom.threat.hidden, true);
  click(document, '[data-action="practice-reset"]');assert.equal(game.resets, 1);
});
test('arrow input is captured, page scroll prevented, key-up released, and blur clears it', () => {
  const { window, document } = screen();const actions = [];
  const input = new Input(document.getElementById('world'), code => actions.push(code), () => true);
  const down = new window.Event('keydown', { bubbles: true, cancelable: true });down.code = 'ArrowUp';down.repeat = false;
  document.body.dispatchEvent(down);
  assert.ok(input.keys.has('ArrowUp'));assert.equal(down.defaultPrevented, true);
  const up = new window.Event('keyup', { bubbles: true });up.code = 'ArrowUp';document.body.dispatchEvent(up);
  assert.equal(input.keys.has('ArrowUp'), false);
  input.keys.add('ArrowLeft');window.dispatchEvent(new window.Event('blur'));
  assert.equal(input.keys.size, 0);assert.ok(actions.includes('Blur'));
});

test('Sounds is reachable in the menu, Settings and paused Free Flight; closing returns correctly', () => {
  const { document, ui, game } = screen();
  click(document, '.menu-nav [data-action="sounds"]');assert.equal(ui.modalType, 'sounds');
  assert.equal(ui.modal.querySelectorAll('[data-preview]').length, 8);
  assert.equal(ui.modal.querySelectorAll('input[type="range"]').length, 6);
  ui.closePanel();assert.equal(ui.modalType, null);assert.equal(game.state, 'menu');
  ui.showSettings();click(document, '#modal-root [data-action="sounds"]');ui.closePanel();assert.equal(ui.modalType, 'settings');
  game.start(3);game.state = 'playing';game.pause();
  click(document, '#modal-root [data-action="sounds"]');assert.equal(ui.modalType, 'sounds');assert.equal(game.state, 'paused');
  ui.closePanel();assert.equal(ui.modalType, 'pause');ui.closePanel();assert.equal(game.state, 'playing');
});

test('sound presets and volume changes save immediately without rebuilding graphics', () => {
  const { document, ui, game, settings, window, saves } = screen();ui.showSoundSettings();
  const jet = document.querySelector('[data-audio-setting="jetSound"]');
  jet.querySelector('option[value="deep"]').selected = true;
  jet.dispatchEvent(new window.Event('input', { bubbles: true }));assert.equal(settings.jetSound, 'deep');
  const volume = document.querySelector('[data-audio-setting="weaponsVolume"]');volume.value = '0';
  volume.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(settings.weaponsVolume, 0);assert.equal(saves.at(-1).weaponsVolume, 0);assert.equal(saves.at(-1).jetSound, 'deep');
  assert.equal(volume.parentElement.querySelector('output').textContent, '0%');assert.equal(volume.getAttribute('aria-valuetext'), '0 percent');
  assert.equal(game.settingsApplied, 0);
});

test('Free Flight previews work while paused, report mute and stop without changing ammunition', async () => {
  const { ui, game, settings, document } = screen();game.start(3);game.state = 'playing';game.cannonLeft = 1200;
  ui.showSoundSettings();assert.equal(game.state, 'paused');settings.weaponsVolume = 0;
  await ui.previewSound('cannon');
  assert.equal(game.audio.previewType, 'cannon');assert.match(ui.modal.querySelector('#sound-preview-status').textContent, /Weapons volume 0%/);
  assert.equal(game.cannonLeft, 1200);assert.equal(game.mission, FREE_FLIGHT);
  click(document, '[data-action="sound-stop"]');assert.equal(game.audio.previewType, null);
  await ui.previewSound('engine');ui.closePanel();assert.equal(game.audio.previewType, null);assert.equal(ui.modalType, 'pause');
});

test('preview feedback reports success, completion and unavailable audio in the menu', async () => {
  const { ui, game } = screen();ui.showSoundSettings();
  await ui.previewSound('engine');assert.match(ui.modal.querySelector('#sound-preview-status').textContent, /Jet engine playing/);
  assert.equal(ui.modal.querySelector('[data-preview="engine"]').getAttribute('aria-pressed'), 'true');
  game.audio.previewType = null;ui.update(game, .04);assert.match(ui.modal.querySelector('#sound-preview-status').textContent, /Press any ▶ Play/);
  game.audio.preview = async () => false;await ui.previewSound('missile');assert.match(ui.modal.querySelector('#sound-preview-status').textContent, /Audio playback failed/);
});

test('closing during audio unlock discards delayed UI feedback', async () => {
  const { ui, game } = screen();ui.showSoundSettings();
  let resolve;game.audio.preview = () => new Promise(done => { resolve = done; });
  const pending = ui.previewSound('engine');ui.closePanel();resolve(false);await pending;
  assert.equal(ui.modalType, null);assert.equal(ui.modal.textContent, '');
});
