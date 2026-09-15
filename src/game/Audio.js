import { AUDIO_DEFAULTS, JET_PROFILES, PREVIEW_LABELS, makeEffect, makeNoise, normalizeAudioSettings } from './SoundDesign.js';

class AudioManager {
  constructor(settings) {
    this.settings = normalizeAudioSettings(settings);
    this.ready = false;
    this.voices = new Set();
    this.loops = [];
    this.previewState = null;
    this.previewSerial = 0;
    this.variant = 0;
    this.lastCamera = 'chase';
  }
  init() {
    if (this.ready) { this.ctx.resume()?.catch(() => {});return true; }
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return false;
    try {
      this.ctx = new Context({ latencyHint: 'interactive' });
      const ctx = this.ctx;
      this.master = ctx.createGain();this.master.gain.value = 0;
      this.compressor = ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -16;this.compressor.knee.value = 18;
      this.compressor.ratio.value = 4;this.compressor.attack.value = .006;this.compressor.release.value = .2;
      this.limiter = ctx.createWaveShaper();
      const curve = new Float32Array(2048);
      for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh((i / (curve.length - 1) * 2 - 1) * 1.35) / 1.35;
      this.limiter.curve = curve;this.limiter.oversample = '2x';
      this.compressor.connect(this.limiter);this.limiter.connect(this.master);this.master.connect(ctx.destination);
      this.sfx = ctx.createGain();this.sfx.connect(this.compressor);
      this.engineBus = ctx.createGain();this.engineBus.connect(this.sfx);
      this.weaponsBus = ctx.createGain();this.weaponsBus.connect(this.sfx);
      this.warningBus = ctx.createGain();this.warningBus.connect(this.sfx);
      this.musicBus = ctx.createGain();this.musicBus.connect(this.compressor);
      this.engineGain = ctx.createGain();this.engineGain.gain.value = 0;this.engineGain.connect(this.engineBus);
      this.cabinFilter = ctx.createBiquadFilter();this.cabinFilter.type = 'lowpass';this.cabinFilter.frequency.value = 12000;this.cabinFilter.connect(this.engineGain);
      this.noiseBuffer = this.buffer(makeNoise(ctx.sampleRate, 4));
      this.airBuffer = this.buffer(makeNoise(ctx.sampleRate, 5.3, 198));
      this.rumble = this.noiseLayer(this.noiseBuffer, 'lowpass', 420, this.cabinFilter);
      this.air = this.noiseLayer(this.airBuffer, 'bandpass', 1800, this.cabinFilter);
      this.air.filter.Q.value = .45;
      this.burner = this.noiseLayer(this.noiseBuffer, 'lowpass', 1600, this.cabinFilter);
      this.wind = this.noiseLayer(this.airBuffer, 'highpass', 1700, this.cabinFilter);
      this.turbine = this.toneLayer('triangle', 240, this.cabinFilter);
      this.whine = this.toneLayer('sine', 740, this.cabinFilter);
      this.beat = this.toneLayer('sine', 83, this.cabinFilter);
      this.musicVoices = [55, 82.4, 110.2].map(f => this.toneLayer('sine', f, this.musicBus));
      this.musicVoices.forEach(v => v.gain.gain.value = .028);
      this.samples = new Map();
      for (const style of ['rotary', 'heavy']) for (let i = 0; i < 4; i++) this.samples.set(`cannon:${style}:${i}`, this.buffer(makeEffect('cannon', ctx.sampleRate, i, style)));
      for (const type of ['missile', 'explosion', 'flare', 'hit', 'lock', 'warning', 'click']) this.samples.set(type, this.buffer(makeEffect(type, ctx.sampleRate)));
      this.ready = true;this.syncMix();ctx.resume()?.catch(() => {});
      return true;
    } catch {
      this.ctx?.close()?.catch(() => {});this.loops.length = 0;this.ready = false;return false;
    }
  }
  buffer(data) {
    const result = this.ctx.createBuffer(data.channels.length, data.channels[0].length, data.sampleRate);
    data.channels.forEach((channel, index) => result.getChannelData(index).set(channel));return result;
  }
  noiseLayer(buffer, type, frequency, destination) {
    const source = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter(), gain = this.ctx.createGain();
    source.buffer = buffer;source.loop = true;filter.type = type;filter.frequency.value = frequency;gain.gain.value = 0;
    source.connect(filter);filter.connect(gain);gain.connect(destination);source.start();this.loops.push(source);
    return { source, filter, gain };
  }
  toneLayer(type, frequency, destination) {
    const source = this.ctx.createOscillator(), gain = this.ctx.createGain();
    source.type = type;source.frequency.value = frequency;gain.gain.value = 0;
    source.connect(gain);gain.connect(destination);source.start();this.loops.push(source);return { source, gain };
  }
  param(parameter, value, smoothing = .08) {
    parameter.setTargetAtTime(value, this.ctx.currentTime, smoothing);
  }
  syncMix() {
    normalizeAudioSettings(this.settings);
    if (!this.ready) return;
    this.param(this.master.gain, this.settings.volume, .015);
    this.param(this.sfx.gain, this.settings.sound);
    this.param(this.engineBus.gain, this.settings.engineVolume);
    this.param(this.weaponsBus.gain, this.settings.weaponsVolume);
    this.param(this.warningBus.gain, this.settings.warningVolume);
    this.param(this.musicBus.gain, this.settings.music * (this.previewState ? .2 : 1));
  }
  get previewType() {
    return this.ready && this.previewState && this.ctx.currentTime < this.previewState.end ? this.previewState.type : null;
  }
  update(player, playing, camera) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.lastCamera = camera;
    if (this.previewState && t >= this.previewState.end) this.stopPreview();
    const demo = this.previewState && ['engine', 'afterburner'].includes(this.previewState.type);
    const sample = demo ? { throttle: .55 + Math.min(.45, (t - this.previewState.start) * .18), speed: 250, boost: this.previewState.type === 'afterburner' && t - this.previewState.start > .5 } : player;
    const profile = JET_PROFILES[this.settings.jetSound] || JET_PROFILES.turbine;
    const throttle = Math.max(0, Math.min(1, sample.throttle));
    const speed = Math.max(0, Math.min(590, sample.speed));
    const cockpit = !demo && camera === 'cockpit';
    const active = playing || demo;
    this.syncMix();
    this.param(this.engineGain.gain, active ? (cockpit ? .58 : 1) : 0, active ? .17 : .055);
    this.param(this.cabinFilter.frequency, cockpit ? 2100 : 14000, .2);
    this.param(this.rumble.gain.gain, profile.rumble * (1.2 + throttle * 1.8));
    this.param(this.rumble.filter.frequency, 220 + throttle * 500, .3);
    this.param(this.air.gain.gain, profile.air * (.35 + throttle * 1.3));
    this.param(this.air.filter.frequency, 900 + throttle * 2500, .3);
    this.param(this.wind.gain.gain, profile.air * (speed / 590) ** 2 * .35);
    this.param(this.turbine.source.frequency, (150 + throttle * 260) * profile.pitch, .38);
    this.param(this.turbine.gain.gain, profile.whine * (.5 + throttle));
    this.param(this.whine.source.frequency, (630 + throttle * 1100) * profile.pitch, .42);
    this.param(this.whine.gain.gain, profile.whine * .45 * (.5 + throttle));
    this.param(this.beat.source.frequency, (61 + throttle * 45) * profile.pitch, .3);
    this.param(this.beat.gain.gain, profile.rumble * .09);
    this.param(this.burner.gain.gain, sample.boost ? profile.burner * 1.7 : 0, .17);
    this.param(this.burner.filter.frequency, sample.boost ? 1750 : 350, .23);
  }
  play(type, options = {}) {
    if (!this.ready || this.ctx.state === 'closed') return false;
    if (this.voices.size >= 48) return false;
    const key = type === 'cannon' ? `cannon:${this.settings.cannonSound}:${this.variant++ % 4}` : type;
    const buffer = this.samples.get(key);if (!buffer) return false;
    const t = options.at ?? this.ctx.currentTime;
    const source = this.ctx.createBufferSource(), gain = this.ctx.createGain();
    const pan = this.ctx.createStereoPanner();
    const warnings = ['lock', 'warning', 'click'].includes(type);
    const bus = warnings ? this.warningBus : this.weaponsBus;
    const distance = Math.max(0, options.distance || 0);
    const attenuation = 1 / (1 + (distance / 1400) ** 1.35);
    const volumes = { cannon: .46, missile: .5, explosion: .68, flare: .3, hit: .33, lock: .18, warning: .24, click: .055 };
    gain.gain.value = volumes[type] * attenuation * (!options.preview && this.lastCamera === 'cockpit' && !warnings ? .72 : 1);
    pan.pan.value = Math.max(-.75, Math.min(.75, options.pan || 0));
    source.buffer = buffer;source.playbackRate.value = type === 'cannon' ? .975 + (this.variant % 4) * .017 : 1;
    source.connect(gain);gain.connect(pan);pan.connect(bus);
    const voice = { source, gain, pan, preview: !!options.preview };
    this.voices.add(voice);
    source.onended = () => { source.disconnect();gain.disconnect();pan.disconnect();this.voices.delete(voice); };
    source.start(t);
    return true;
  }
  stopPreview() {
    this.previewSerial++;
    const wasEngine = this.previewState && ['engine', 'afterburner'].includes(this.previewState.type);
    this.previewState = null;
    for (const voice of [...this.voices]) if (voice.preview) {
      try { voice.source.stop(); } catch {}
      voice.source.disconnect();voice.gain.disconnect();voice.pan.disconnect();this.voices.delete(voice);
    }
    if (this.ready && wasEngine) this.param(this.engineGain.gain, 0, .03);
    this.syncMix();
  }
  async preview(type) {
    if (!Object.hasOwn(PREVIEW_LABELS, type)) return false;
    this.stopPreview();const serial = this.previewSerial;
    if (!this.init()) return false;
    try { await this.ctx.resume(); } catch { return false; }
    if (serial !== this.previewSerial || this.ctx.state === 'closed') return false;
    const t = this.ctx.currentTime;
    const duration = ['engine', 'afterburner'].includes(type) ? 4 : type === 'cannon' ? 1.1 : (this.samples.get(type)?.duration || 1) + .15;
    this.previewState = { type, start: t, end: t + duration };
    this.syncMix();
    if (type === 'cannon') {
      for (let i = 0; i < 12; i++) this.play('cannon', { at: t + i * .065, preview: true });
    } else if (!['engine', 'afterburner'].includes(type)) this.play(type, { preview: true });
    return true;
  }
  dispose() {
    this.stopPreview();
    for (const voice of [...this.voices]) { try { voice.source.stop(); } catch {} }
    for (const source of this.loops) { try { source.stop();source.disconnect(); } catch {} }
    this.loops.length = 0;this.voices.clear();this.ready = false;
    return this.ctx?.close();
  }
}
export { AudioManager, AUDIO_DEFAULTS };
