import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { UI } from '../src/ui/UI.js';
import { Input } from '../src/game/Input.js';
import { FREE_FLIGHT, MISSIONS } from '../src/game/Missions.js';
import { Game } from '../src/game/Game.js';
import { OpenSkiesEncounter, scoreOpenSkies } from '../src/game/OpenSkies.js';

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

function battleScreen() {
  const s = screen(), { game, ui } = s;
  game.ui = ui;
  game.openSkies = new OpenSkiesEncounter(15); game.openSkies.start();
  game.mission = MISSIONS[2]; game.state = 'playing'; game.player = { alive: true };
  game.allies = [0, 1].map(i => ({ alive: true, hp: 100, maxHp: 100, callsign: `KESTREL ${i + 2}`, order: 'cover', combat: {}, aiState: 'covering' }));
  game.enemies = [{ alive: true, hp: 100, maxHp: 100, callsign: 'DOGFIGHTER 1' }]; game.target = game.enemies[0];
  game.input.clear = function () { this.keys.clear(); };
  game.notify = () => {};
  for (const method of ['action','openSquadronPanel','closeSquadronPanel','commandSquadron']) game[method] = Game.prototype[method];
  ui.inGame(); ui.resetBattleTutorial();
  return s;
}

test('Open Skies command UI exposes actual orders and custom labels, Esc restores flight without held keys', () => {
  const { game, ui, document, window, settings } = battleScreen();
  settings.keyBindings = { teamComms: 'KeyF', command2: 'KeyJ', pitchUp: 'KeyI', pitchDown: 'KeyK' };
  game.input.keys.add('ArrowUp'); click(document, '[data-action="squadron"]');
  assert.equal(ui.modalType, 'squadron'); assert.equal(game.state, 'paused'); assert.equal(game.input.keys.size, 0);
  assert.match(ui.modal.textContent, /JAttack my target/); assert.match(ui.modal.textContent, /F \/ Esc closes/);
  const key = new window.Event('keydown', { bubbles: true, cancelable: true }); key.code = 'KeyJ';
  window.dispatchEvent(key); assert.equal(game.allies[0].order, 'attack'); assert.equal(game.state, 'playing'); assert.equal(ui.modalType, null);
  click(document, '[data-action="squadron"]');
  const esc = new window.Event('keydown', { cancelable: true }); esc.code = 'Escape'; window.dispatchEvent(esc);
  assert.equal(game.state, 'playing'); assert.equal(ui.modalType, null);
  ui.showControls(); assert.match(ui.modal.textContent, /I Nose up/); assert.match(ui.modal.textContent, /K Nose down/);
  assert.match(ui.modal.textContent, /3 patrol fighters|Three waves: 3/); assert.match(ui.modal.textContent, /View\/Back/);
});

test('Open Skies touch buttons stay usable, dead/missing wingmen disable commands and coach can restart', () => {
  const { game, ui, document, settings } = battleScreen();
  assert.equal(document.querySelector('#battle-wing').hidden, false);
  game.target = null; click(document, '[data-action="squadron"]'); assert.equal(document.querySelector('[data-order="attack"]').disabled, true);
  game.closeSquadronPanel(); game.allies.forEach(j => j.alive = false); game.openSquadronPanel();
  assert.ok([...document.querySelectorAll('[data-order]')].every(button => button.disabled));
  game.closeSquadronPanel(); ui.action('battle-hint-skip'); assert.equal(settings.openSkiesGuideSeen, true);
  game.state = 'paused'; ui.showControls(); click(document, '[data-action="battle-tutorial"]');
  assert.equal(settings.openSkiesGuideSeen, false); assert.equal(ui.battleCoachStep, 0); assert.equal(game.state, 'playing');
  game.openSkies = null; game.start(3); assert.equal(document.querySelector('#battle-wing').hidden, true); assert.equal(document.querySelector('#battle-coach').hidden, true);
});

test('controller View opens command panel once, navigation/confirm sends one order and cannot launch a missile', () => {
  const { game, document, settings } = battleScreen(); settings.device = 'gamepad';
  const actions = [], realAction = game.action.bind(game);
  const input = new Input(document.getElementById('world'), action => { actions.push(action); realAction(action); }, () => game.state === 'playing' && !game.ui?.modalType, () => settings);
  game.input = input;
  // Use an explicit UI boundary to exercise Input → Game action routing without native focus assumptions.
  game.ui = { modalType: null, showSquadron() { this.modalType = 'squadron'; }, inGame() { this.modalType = null; input.menuMode = null; }, showPause() { this.modalType = 'pause'; }, message() {}, navigateSquadron(action) { if (action === 'uiConfirm') game.commandSquadron('regroup'); } };
  const pad = { connected: true, mapping: 'standard', axes: [0,0,0,0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  pad.buttons[8].pressed = true; input.poll(1/60, [pad]); assert.equal(game.state, 'paused');
  for (let i=0;i<20;i++) input.poll(1/60,[pad]); assert.equal(game.state, 'paused'); assert.equal(actions.filter(a=>a==='teamComms').length,1);
  pad.buttons[8].pressed = false; input.poll(1/60,[pad]); pad.buttons[13].pressed = true; input.poll(1/60,[pad]);
  assert.ok(actions.includes('uiNext')); pad.buttons[13].pressed = false; pad.buttons[0].pressed = true; input.poll(1/60,[pad]);
  assert.equal(game.allies[0].order,'regroup'); assert.equal(game.state,'playing');
  for(let i=0;i<20;i++)input.poll(1/60,[pad]); assert.equal(actions.filter(a=>a==='missile').length,0);
  input.dispose();
});

test('battle debrief displays the finite medal breakdown and promotion notices do not interrupt combat', () => {
  const { game, ui } = battleScreen(); game.ui = ui; game.stats = { kills: 8, shots: 0, hits: 0, missiles: 0 }; game.elapsed = 400; game.score = 8000;
  game.battleResult = scoreOpenSkies({ success: true, stats: game.stats, allies: game.allies, elapsed: game.elapsed, seed: 15 });
  ui.showResult(true); assert.match(ui.modal.textContent, /SILVER/); assert.match(ui.modal.textContent, /ACCURACY · 0%/); assert.match(ui.modal.textContent, /Seed 15/);
  assert.ok(!/NaN|Infinity/.test(ui.modal.textContent));
  ui.inGame(); ui.showLevelUpModal({ newRank: { name: 'Flying Officer', unlockName: 'Ghost' } }); assert.equal(ui.modalType, null);
});

test('world atlas remains available with region, world and city selection', async () => {
  const {document,ui,window}=screen();
  assert.ok(document.querySelector('[data-action="atlas"]'));
  await ui.showAtlas();
  assert.equal(ui.modalType,'atlas');
  const svg=document.querySelector('#earth-atlas');assert.ok(svg);
  assert.ok(svg.querySelectorAll('.atlas-country').length>100);
  click(document,'[data-atlas-view="world"]');assert.equal(svg.getAttribute('viewBox'),'0 0 360 180');
  const select=document.querySelector('#atlas-city-select');
  select.querySelectorAll('option')[1].selected=true;
  select.dispatchEvent(new window.Event('change',{bubbles:true}));
  assert.match(document.querySelector('#atlas-readout').textContent,/° N/);
  ui.closePanel();assert.equal(ui.modalType,null);
});
test('first launch defaults to Free Flight, shows arrow guidance, then starts the selected mode', () => {
  const { document, ui, settings, starts } = screen();
  assert.equal(ui.selected, 3);
  assert.equal(document.querySelectorAll('.mission-card').length, 4);
  assert.equal(document.querySelector('.mission-card.selected').dataset.mission, '3');
  click(document, '[data-action="play"]');
  assert.equal(ui.modalType, 'preflight');
  assert.match(ui.modal.textContent, /↑ Nose up/);assert.match(ui.modal.textContent, /↓ Nose down/);
  assert.equal(starts.length, 0);
  click(document, '[data-action="launch-flight"]');
  assert.deepEqual(starts, [3]);assert.equal(settings.guideSeen, true);
  assert.equal(ui.hudEl.hidden, false);assert.equal(ui.dom['practice-help'].hidden, false);
  assert.equal(document.querySelector('.hud-weapons').hidden, true);
  assert.match(document.querySelector('.flight-hints').textContent, /↑ NOSE UP/);
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
  assert.match(ui.modal.textContent, /M \/ RMB/);
  click(document, '#modal-root [data-flight-mode="manual"]');
  assert.match(ui.modal.textContent, /Manual flight keeps inertia/);
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
  assert.equal(ui.dom['lock-status'].textContent, '');
  assert.ok(document.querySelector('[data-action="flight-help"]'));
  assert.ok(ui.hudEl.classList.contains('quiet-hud'));
  click(document, '[data-action="toggle-instructions"]');
  assert.equal(ui.hudEl.classList.contains('quiet-hud'), false);
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
  ui.showSettings('audio');click(document, '#modal-root [data-action="sounds"]');ui.closePanel();assert.equal(ui.modalType, 'settings');
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

test('settings panels have dialog semantics, current bindings and release gameplay on close',()=>{
 const {ui,document,game}=screen();game.state='playing';game.pause();ui.showSettings('controls');
 const panel=document.querySelector('[role="dialog"]');assert.ok(panel);assert.equal(panel.getAttribute('aria-modal'),'true');assert.ok(document.getElementById(panel.getAttribute('aria-labelledby')));
 assert.equal(ui.hudEl.inert,true);assert.ok(document.querySelector('[data-setting="gamepadInvert"]'));
 ui.closePanel();ui.closePanel();assert.equal(game.state,'playing');assert.equal(ui.hudEl.inert,false);
});
test('touch exposes throttle, brake, gear, camera and pause; held input clears on modal opening',()=>{
 const {ui,document,game,window}=screen();game.state='playing';
 game.input.clear=()=>{game.input.fire=false;game.input.boost=false;game.input.touchBrake=false;};
 for(const action of ['fire','missile','flare','boost','brake','gear','camera','pause'])assert.ok(document.querySelector(`[data-touch="${action}"]`));
 const button=document.querySelector('[data-touch="fire"]');button.setPointerCapture=()=>{};
 const down=new window.Event('pointerdown');Object.defineProperty(down,'pointerId',{value:5});button.dispatchEvent(down);assert.equal(game.input.fire,true);
 ui.showSettings();assert.equal(game.input.fire,false);
 ui.closePanel();game.state='playing';button.dispatchEvent(down);assert.equal(game.input.fire,true);
 const cancel=new window.Event('pointercancel');Object.defineProperty(cancel,'pointerId',{value:5});button.dispatchEvent(cancel);assert.equal(game.input.fire,false);
});
test('controller pause edges work in both flight and paused menus without repeated toggles',()=>{
 const {document,game}=screen();game.state='playing';const actions=[];
 const input=new Input(document.getElementById('world'),action=>{actions.push(action);if(action==='pause'){game.state=game.state==='playing'?'paused':'playing';input.clear();}},()=>game.state==='playing',()=>({device:'gamepad'}));
 const pad={mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({value:0,pressed:false}))};
 pad.buttons[9].pressed=true;input.poll(.016,[pad]);input.poll(.016,[pad]);assert.equal(game.state,'paused');assert.equal(actions.length,1);
 pad.buttons[9].pressed=false;input.poll(.016,[pad]);pad.buttons[9].pressed=true;input.poll(.016,[pad]);assert.equal(game.state,'playing');assert.equal(actions.length,2);input.dispose();
});

