import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioManager } from '../src/game/Audio.js';
import { AUDIO_DEFAULTS, makeEffect, makeNoise, normalizeAudioSettings } from '../src/game/SoundDesign.js';

// Web Audio graph contract double; this does not emulate speaker output or a browser.
class Param {
  constructor(value = 0) { this.value = value; }
  setTargetAtTime(value, at, smoothing) {
    assert.ok(Number.isFinite(value));assert.ok(at >= 0);assert.ok(smoothing > 0);
    this.value = value;
  }
}
class Node {
  constructor() { this.connections = []; }
  connect(destination) { this.connections.push(destination);return destination; }
  disconnect() { this.connections = [];this.disconnected = true; }
}
class Source extends Node {
  constructor() { super();this.frequency = new Param();this.playbackRate = new Param(1); }
  start(at = 0) { this.startedAt = at; }
  stop() { this.stopped = true;this.onended?.(); }
}
class Context {
  constructor() { this.currentTime = 0;this.sampleRate = 48000;this.state = 'suspended';this.destination = new Node(); }
  resume() { this.state = 'running';return Promise.resolve(); }
  close() { this.state = 'closed';return Promise.resolve(); }
  createGain() { return Object.assign(new Node(), { gain: new Param(1) }); }
  createBiquadFilter() { return Object.assign(new Node(), { frequency: new Param(350), Q: new Param(1) }); }
  createStereoPanner() { return Object.assign(new Node(), { pan: new Param() }); }
  createWaveShaper() { return new Node(); }
  createDynamicsCompressor() { return Object.assign(new Node(), Object.fromEntries(['threshold', 'knee', 'ratio', 'attack', 'release'].map(key => [key, new Param()]))); }
  createOscillator() { return new Source(); }
  createBufferSource() { return new Source(); }
  createBuffer(count, length, rate) {
    const channels = Array.from({ length: count }, () => new Float32Array(length));
    return { duration: length / rate, getChannelData(index) { return channels[index]; } };
  }
}
function setup(overrides = {}) {
  globalThis.window = { AudioContext: Context };
  const settings = { ...AUDIO_DEFAULTS, ...overrides }, audio = new AudioManager(settings);
  assert.equal(audio.init(), true);return { audio, settings };
}
const player = { throttle: .6, speed: 220, boost: false };
function rms(channel, from = 0, to = channel.length) {
  let energy = 0;for (let i = from; i < to; i++) energy += channel[i] ** 2;
  return Math.sqrt(energy / (to - from));
}

test('older settings gain audio defaults without losing mute; invalid settings are bounded', () => {
  const settings = normalizeAudioSettings({ volume: 0, sound: .4, music: .1, engineVolume: 3, weaponsVolume: -2, warningVolume: NaN, jetSound: 'invalid', cannonSound: '__proto__' });
  assert.equal(settings.volume, 0);assert.equal(settings.sound, .4);assert.equal(settings.music, .1);
  assert.equal(settings.engineVolume, 1);assert.equal(settings.weaponsVolume, 0);
  assert.equal(settings.warningVolume, .7);assert.equal(settings.jetSound, 'turbine');assert.equal(settings.cannonSound, 'rotary');
});

test('sound buffers contain bounded audible energy, fade cleanly and work at both common sample rates', () => {
  for (const rate of [44100, 48000]) for (const type of ['cannon', 'missile', 'explosion', 'flare', 'hit', 'lock', 'warning', 'click']) {
    const data = makeEffect(type, rate);
    assert.equal(data.channels.length, 2);assert.ok(data.duration > .04 && data.duration < 2);
    for (const channel of data.channels) {
      assert.ok(rms(channel) > .005, type);
      for (const value of channel) assert.ok(Number.isFinite(value) && Math.abs(value) <= .881, type);
      assert.ok(Math.abs(channel[0]) < 1e-6);assert.ok(Math.abs(channel.at(-1)) < 1e-6);
    }
  }
  const a = makeEffect('cannon', 48000), b = makeEffect('cannon', 48000, 1), heavy = makeEffect('cannon', 48000, 0, 'heavy');
  assert.notDeepEqual(a.channels[0], b.channels[0]);assert.ok(heavy.duration > a.duration);
  assert.ok(rms(a.channels[0], 0, 960) > rms(a.channels[0], 5760, 7200) * 5);
  const noise = makeNoise(44100, .2);
  assert.notDeepEqual(noise.channels[0], noise.channels[1]);assert.ok(rms(noise.channels[0]) > .2);
});

test('jet spools with throttle, boost adds a roar, cockpit muffles it and pause silences the engine', () => {
  const { audio, settings } = setup();
  audio.update({ ...player, throttle: .2 }, true, 'chase');
  const idlePitch = audio.turbine.source.frequency.value, idleRumble = audio.rumble.gain.gain.value;
  audio.update({ ...player, throttle: 1, boost: true, speed: 520 }, true, 'chase');
  assert.ok(audio.turbine.source.frequency.value > idlePitch);assert.ok(audio.rumble.gain.gain.value > idleRumble);
  assert.ok(audio.burner.gain.gain.value > 0);
  const brightPitch = audio.turbine.source.frequency.value;
  settings.jetSound = 'deep';audio.update({ ...player, throttle: 1 }, true, 'cockpit');
  assert.ok(audio.turbine.source.frequency.value < brightPitch);
  assert.ok(audio.cabinFilter.frequency.value < 3000);assert.ok(audio.engineGain.gain.value < 1);
  assert.equal(audio.burner.gain.gain.value, 0);
  audio.update(player, false, 'chase');assert.equal(audio.engineGain.gain.value, 0);
});

test('master and category mute are independent and persist during previews', async () => {
  const { audio, settings } = setup({ volume: 0, engineVolume: 0, weaponsVolume: 0 });
  assert.equal(await audio.preview('afterburner'), true);
  audio.ctx.currentTime = 1;audio.update(player, false, 'chase');
  assert.ok(audio.burner.gain.gain.value > 0);assert.equal(audio.master.gain.value, 0);
  assert.equal(audio.engineBus.gain.value, 0);assert.equal(audio.weaponsBus.gain.value, 0);assert.ok(audio.warningBus.gain.value > 0);
  settings.volume = .5;settings.warningVolume = 0;audio.syncMix();
  assert.equal(audio.master.gain.value, .5);assert.equal(audio.warningBus.gain.value, 0);
  assert.equal(audio.engineBus.gain.value, 0);assert.equal(audio.weaponsBus.gain.value, 0);
});

test('cannon preview schedules a burst, respects selected samples and stops all queued shots', async () => {
  const { audio } = setup({ cannonSound: 'heavy' });
  assert.equal(await audio.preview('cannon'), true);assert.equal(audio.previewType, 'cannon');
  const voices = [...audio.voices];assert.equal(voices.length, 12);
  voices.forEach((v, i) => { assert.ok(Math.abs(v.source.startedAt - i * .065) < 1e-6);assert.ok(v.source.buffer.duration >= .23); });
  audio.stopPreview();assert.equal(audio.previewType, null);assert.equal(audio.voices.size, 0);
  assert.ok(voices.every(v => v.source.stopped && v.source.disconnected));
  assert.equal(audio.musicBus.gain.value, AUDIO_DEFAULTS.music);
});

test('engine preview expires, switches cleanly to another sound and ignores a cancelled audio unlock', async () => {
  const { audio } = setup();
  await audio.preview('engine');audio.update(player, false, 'chase');assert.equal(audio.engineGain.gain.value, 1);
  await audio.preview('warning');audio.update(player, false, 'chase');assert.equal(audio.engineGain.gain.value, 0);
  audio.ctx.currentTime = 5;audio.update(player, false, 'chase');assert.equal(audio.previewType, null);
  let unlock;const pending = new Promise(resolve => { unlock = resolve; });audio.ctx.resume = () => pending;
  const preview = audio.preview('cannon');audio.stopPreview();unlock();
  assert.equal(await preview, false);assert.equal(audio.previewType, null);
});

test('weapons attenuate with distance, warnings use their own bus and finished voices release resources', () => {
  const { audio } = setup();
  audio.play('explosion', { distance: 0 });const near = [...audio.voices].at(-1);
  audio.play('explosion', { distance: 6000 });const far = [...audio.voices].at(-1);
  assert.ok(far.gain.gain.value < near.gain.gain.value / 5);
  audio.play('warning');const warning = [...audio.voices].at(-1);
  assert.equal(warning.pan.connections[0], audio.warningBus);assert.equal(near.pan.connections[0], audio.weaponsBus);
  near.source.onended();assert.equal(audio.voices.has(near), false);assert.equal(near.pan.disconnected, true);
  for (let i = 0; i < 100; i++) audio.play('cannon');assert.equal(audio.voices.size, 48);
  assert.equal(audio.play('cannon'), false);
});

test('missing audio support fails gracefully and disposal stops continuous sources', async () => {
  globalThis.window = {};const unsupported = new AudioManager({});
  assert.equal(unsupported.init(), false);assert.equal(await unsupported.preview('cannon'), false);
  assert.equal(unsupported.play('missile'), false);unsupported.stopPreview();
  const { audio } = setup();const loops = [...audio.loops];await audio.preview('cannon');await audio.dispose();
  assert.ok(loops.every(source => source.stopped));assert.equal(audio.voices.size, 0);assert.equal(audio.ctx.state, 'closed');
});
