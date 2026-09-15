// Original procedural audio. No recordings, downloaded samples or network requests.
export const AUDIO_DEFAULTS = {
  volume: .65, sound: .8, music: .18,
  engineVolume: .75, weaponsVolume: .8, warningVolume: .7,
  jetSound: 'turbine', cannonSound: 'rotary'
};
export const JET_PROFILES = {
  turbine: { label: 'Turbine jet', rumble: .34, air: .24, whine: .052, burner: .4, pitch: 1 },
  deep: { label: 'Deep roar', rumble: .49, air: .2, whine: .027, burner: .51, pitch: .8 },
  soft: { label: 'Soft / quieter', rumble: .23, air: .12, whine: .022, burner: .23, pitch: .93 }
};
export const CANNON_PROFILES = { rotary: 'Rotary cannon · rapid burst', heavy: 'Heavy cannon · deeper punch' };
export const PREVIEW_LABELS = {
  engine: 'Jet engine', afterburner: 'Afterburner', cannon: 'Cannon burst',
  missile: 'Missile launch', explosion: 'Explosion', warning: 'Missile warning', lock: 'Target lock', flare: 'Flares'
};
export function normalizeAudioSettings(settings) {
  for (const [key, fallback] of Object.entries(AUDIO_DEFAULTS)) {
    if (typeof fallback === 'number') settings[key] = Number.isFinite(settings[key]) ? Math.max(0, Math.min(1, settings[key])) : fallback;
  }
  if (!Object.hasOwn(JET_PROFILES, settings.jetSound)) settings.jetSound = AUDIO_DEFAULTS.jetSound;
  if (!Object.hasOwn(CANNON_PROFILES, settings.cannonSound)) settings.cannonSound = AUDIO_DEFAULTS.cannonSound;
  return settings;
}
function random(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;return seed / 2147483648 - 1; };
}
function finish(channels, sampleRate, peak = .88, loop = false) {
  let maximum = 0;
  for (const channel of channels) {
    let mean = 0;for (const value of channel) mean += value;mean /= channel.length;
    for (let i = 0; i < channel.length; i++) {
      const fade = loop ? 1 : Math.min(1, i / (sampleRate * .0005), (channel.length - 1 - i) / (sampleRate * .009));
      channel[i] = (channel[i] - mean) * fade;maximum = Math.max(maximum, Math.abs(channel[i]));
    }
  }
  const gain = maximum > 0 ? peak / maximum : 1;
  for (const channel of channels) for (let i = 0; i < channel.length; i++) channel[i] *= gain;
  return { channels, duration: channels[0].length / sampleRate, sampleRate };
}
export function makeNoise(sampleRate, seconds = 4, seed = 37) {
  const channels = [new Float32Array(Math.ceil(sampleRate * seconds)), new Float32Array(Math.ceil(sampleRate * seconds))];
  for (let c = 0; c < 2; c++) {
    const rand = random(seed + c * 7717);
    for (let i = 0; i < channels[c].length; i++) channels[c][i] = rand();
  }
  return finish(channels, sampleRate, .9, true);
}
export function makeEffect(type, sampleRate, variant = 0, style = 'rotary') {
  const durations = { cannon: style === 'heavy' ? .23 : .15, missile: 1.05, explosion: 1.65, flare: .36, hit: .25, lock: .3, warning: .72, click: .045 };
  if (!Object.hasOwn(durations, type)) throw new Error('Unknown sound effect: ' + type);
  const duration = durations[type], n = Math.ceil(sampleRate * duration);
  const lowRate = 1 - Math.exp(-2 * Math.PI * 180 / sampleRate);
  const warmRate = 1 - Math.exp(-2 * Math.PI * 1450 / sampleRate);
  const channels = [new Float32Array(n), new Float32Array(n)];
  for (let c = 0; c < 2; c++) {
    const rand = random(9181 + variant * 1103 + c * 5531 + type.length * 479);
    let low = 0, warm = 0, previous = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate, w = rand();
      low += lowRate * (w - low);warm += warmRate * (w - warm);
      const high = w - previous;previous = w;
      let value;
      if (type === 'cannon') {
        const heavy = style === 'heavy', punch = heavy ? 81 : 126;
        const crack = high * Math.exp(-t / .008) * .75;
        const body = Math.sin(2 * Math.PI * (punch + variant * 2) * t) * Math.exp(-t / (heavy ? .07 : .035)) * .42;
        const report = warm * Math.exp(-t / (heavy ? .075 : .035)) * 1.35;
        const mechanism = (Math.sin(2 * Math.PI * 1190 * t) + .4 * Math.sin(2 * Math.PI * 2317 * t)) * Math.exp(-t / .017) * .07;
        value = crack + body + report + mechanism;
      } else if (type === 'missile') {
        const blast = warm * Math.exp(-t / .05) * 1.2;
        const rush = (w * .16 + warm * .8) * (1 - Math.exp(-t / .045)) * Math.exp(-t / .31);
        value = blast + rush + Math.sin(2 * Math.PI * 72 * t) * Math.exp(-t / .06) * .17;
      } else if (type === 'explosion') {
        value = high * Math.exp(-t / .008) * .38 + warm * Math.exp(-t / .11) * 1.1 + low * Math.exp(-t / .44) * 3.5;
        value += (Math.sin(2 * Math.PI * 48 * t) + .3 * Math.sin(2 * Math.PI * 69 * t)) * Math.exp(-t / .3) * .28;
      } else if (type === 'flare') {
        value = high * Math.exp(-t / .013) * .3 + w * .3 * (1 - Math.exp(-t / .008)) * Math.exp(-t / .07);
      } else if (type === 'hit') {
        value = warm * Math.exp(-t / .034) + (Math.sin(2 * Math.PI * 673 * t) + .5 * Math.sin(2 * Math.PI * 1381 * t)) * Math.exp(-t / .042) * .15;
      } else if (type === 'lock') {
        const local = t < .115 ? t : t - .15;
        const active = (t < .115 || t > .15) && local >= 0;
        const release = Math.min(1, ((t < .115 ? .115 : .15) - local) / .012);
        value = active ? Math.sin(2 * Math.PI * (t < .115 ? 880 : 1320) * t) * Math.min(1, local / .008) * release * Math.exp(-local / .065) * .32 : 0;
      } else if (type === 'warning') {
        const local = t % .36;
        value = local < .22 ? Math.sin(2 * Math.PI * 620 * t + 1.5 * Math.sin(2 * Math.PI * 7 * t)) * Math.min(1, local / .012, (.22 - local) / .02) * Math.exp(-local / .16) * .35 : 0;
      } else value = Math.sin(2 * Math.PI * 900 * t) * Math.exp(-t / .012) * .25;
      channels[c][i] = value;
    }
  }
  return finish(channels, sampleRate, type === 'click' ? .3 : .88);
}
