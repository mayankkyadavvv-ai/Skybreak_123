/** F23/F30 mission configuration shared verbatim by browser and match authority. */
export const MISSION_SCHEMA_VERSION = 1;
export const MAX_PRESET_BYTES = 4096;
export const MISSION_TEMPLATES = Object.freeze({
  escort: { id: 4, name: 'Safe Passage', objective: 'Escort LANTERN to the extraction gate', brief: 'Protect the transport along the marked route. Intercept attackers before they reach LANTERN. Arrival with the transport alive completes the mission.', role: 'Protect transport', limit: 540 },
  intercept: { id: 5, name: 'Broken Spear', objective: 'Stop both bombers before the release line', brief: 'Two bombers approach a protected zone. Destroy both before either reaches the release line, then clear the escort fighters.', role: 'Intercept bombers', limit: 480 },
  'base-defence': { id: 6, name: 'Last Watch', objective: 'Protect the airbase and eliminate the raid', brief: 'Defend the base against staggered bomber raids. Each bomber that reaches its release line damages the base. Keep the base operational and destroy the fighter escorts.', role: 'Protect airbase', limit: 540 },
  'strike-support': { id: 7, name: 'Clear Corridor', objective: 'Clear the defence patrol and cover HAMMER through its strike', brief: 'HAMMER needs a clear approach. Destroy the marked defence patrol; then protect HAMMER during its attack run and withdrawal to the exit gate.', role: 'Cover strike package', limit: 600 },
});
export const MISSION_LOCATIONS = Object.freeze({
  aegis: { name: 'Aegis Strait', center: { x: -14500, y: 1900, z: 47500 }, heading: 0 },
  ridge: { name: 'Talon Ridge', center: { x: -14000, y: 3900, z: 16000 }, heading: .35 },
  coast: { name: 'Sable Coast', center: { x: -4200, y: 2900, z: -12500 }, heading: -.25 },
});
const has = (value, list) => typeof value === 'string' && Object.hasOwn(list, value);
const validObject = value => value && typeof value === 'object' && !Array.isArray(value);
export function validateMissionPreset(input) {
  const errors = [];
  if (!validObject(input)) return { ok: false, errors: ['Mission must be a JSON object.'] };
  if (input.version !== MISSION_SCHEMA_VERSION) errors.push(`Unsupported mission version. Expected ${MISSION_SCHEMA_VERSION}.`);
  if (!has(input.template, MISSION_TEMPLATES)) errors.push('Choose escort, intercept, base-defence or strike-support.');
  if (!has(input.location, MISSION_LOCATIONS)) errors.push('Unknown mission location.');
  if (input.template === 'base-defence' && input.location !== 'coast') errors.push('Airbase defence uses Sable Coast, where the defended runway exists.');
  if (!['easy', 'medium', 'hard'].includes(input.difficulty)) errors.push('Unknown difficulty.');
  if (!['clear', 'cloudy', 'storm'].includes(input.weather)) errors.push('Unknown weather.');
  if (!['fixed', 'adaptive'].includes(input.pacing)) errors.push('Pacing must be fixed or adaptive.');
  if (!Number.isInteger(input.enemyBudget) || input.enemyBudget < 2 || input.enemyBudget > 12) errors.push('Enemy budget must be between 2 and 12.');
  if (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 0xFFFFFFFF) errors.push('Seed must be an unsigned 32-bit integer.');
  if (input.routeVariant !== undefined && ![0, 1].includes(input.routeVariant)) errors.push('Unsupported route variant.');
  const allowed = new Set(['version', 'template', 'location', 'difficulty', 'weather', 'pacing', 'enemyBudget', 'seed', 'routeVariant']);
  if (Object.keys(input).some(key => !allowed.has(key))) errors.push('Mission contains unsupported fields.');
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { version: MISSION_SCHEMA_VERSION, template: input.template, location: input.location, difficulty: input.difficulty,
    weather: input.weather, pacing: input.pacing, enemyBudget: input.enemyBudget, seed: input.seed, routeVariant: input.routeVariant || 0 } };
}
export function createMissionPreset(options = {}) {
  const preset = { version: MISSION_SCHEMA_VERSION, template: 'escort', location: options.template === 'base-defence' ? 'coast' : 'aegis', difficulty: 'easy', weather: 'clear', pacing: 'adaptive', enemyBudget: 6, seed: 1, routeVariant: 0, ...options };
  const result = validateMissionPreset(preset);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return result.value;
}
export function missionRandom(seed) {
  let state = seed >>> 0;
  const random = () => { state = (state + 0x6D2B79F5) >>> 0; let n = Math.imul(state ^ state >>> 15, 1 | state); n ^= n + Math.imul(n ^ n >>> 7, 61 | n); return ((n ^ n >>> 14) >>> 0) / 4294967296; };
  random.state = () => state;
  random.restore = value => { state = value >>> 0; };
  return random;
}
export function missionPoint(preset, x, y, z) {
  const site = MISSION_LOCATIONS[preset.location];
  const angle = site.heading + (preset.routeVariant ? .42 : 0), c = Math.cos(angle), s = Math.sin(angle);
  return { x: site.center.x + x * c - z * s, y: site.center.y + y, z: site.center.z + x * s + z * c };
}
export function missionSetup(input, { terrainHeight } = {}) {
  const preset = createMissionPreset(input), rand = missionRandom(preset.seed);
  const point = (x, y, z) => {
    const result = missionPoint(preset, x, y, z);
    if (terrainHeight) result.y = Math.max(result.y, Number(terrainHeight(result.x, result.z)) + 700 || result.y);
    return result;
  };
  const playerStart = point(0, 100, 8000);
  const route = [point(-750, 0, 7000), point(-2000, 100, 2000), point(1200, 100, -3000), point(0, 0, -10500)];
  const target = point(0, -300, -7000);
  const objectives = [];
  if (preset.template === 'escort') objectives.push({ id: 'transport', callsign: 'LANTERN', team: 'ally', role: 'transport', hp: 400, maxHp: 400, speed: 145, position: { ...route[0] }, route: route.slice(1), routeIndex: 0, routeManaged: true });
  if (['intercept', 'base-defence'].includes(preset.template)) {
    const count = preset.template === 'intercept' ? 2 : 3;
    for (let i = 0; i < count; i++) {
      const start = point((i - 1) * 950, 350 + i * 80, -14500 - i * 1400);
      objectives.push({ id: `bomber-${i}`, callsign: `RAIDER ${i + 1}`, team: 'enemy', role: 'bomber', hp: 140, maxHp: 140, speed: preset.template === 'intercept' ? 110 : 95,
        position: start, route: [point((i - 1) * 350, 100, preset.template === 'base-defence' ? -4000 : 1500), point((i - 1) * 80, -300, preset.template === 'base-defence' ? 0 : 9000)], routeIndex: 0, routeManaged: true });
    }
  }
  if (preset.template === 'strike-support') objectives.push({ id: 'strike-package', callsign: 'HAMMER', team: 'ally', role: 'strike', hp: 350, maxHp: 350, speed: 160,
    position: point(-850, 0, 7200), route: [point(-1500, 50, 2000), target, point(7500, 50, -10500)], routeIndex: 0, routeManaged: true });
  const fighters = Array.from({ length: preset.enemyBudget }, (_, i) => ({
    id: `fighter-${i}`, callsign: `${i % 3 === 1 ? 'LANCER' : 'BANDIT'} ${i + 1}`, team: 'enemy', role: i % 3 === 1 ? 'missile' : 'dogfighter', hp: 100, maxHp: 100, speed: 220,
    position: point((rand() - .5) * 6400, 250 + rand() * 300, 2500 - rand() * 1900), route: [], routeIndex: 0, routeManaged: false,
    seed: Math.floor(rand() * 0x100000000), defencePatrol: preset.template === 'strike-support' && i < Math.min(2, preset.enemyBudget),
  }));
  return { version: MISSION_SCHEMA_VERSION, preset, name: MISSION_TEMPLATES[preset.template].name, briefing: MISSION_TEMPLATES[preset.template].brief,
    objective: MISSION_TEMPLATES[preset.template].objective, playerStart, center: point(0, 0, 0), route, target,
    protectedZone: point(0, -300, preset.template === 'base-defence' ? 0 : 9000), objectives, fighters, boundsRadius: 24000, category: `custom-${preset.pacing}` };
}
export function encodeMissionPreset(input) {
  const value = createMissionPreset(input), text = JSON.stringify(value);
  const bytes = typeof globalThis.btoa === 'function' ? globalThis.btoa(text) : globalThis.Buffer.from(text).toString('base64');
  return `SBM1.${bytes.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}
export function decodeMissionPreset(encoded) {
  if (typeof encoded !== 'string' || encoded.length > MAX_PRESET_BYTES || !/^SBM1\.[A-Za-z0-9_-]+$/.test(encoded)) return { ok: false, errors: ['Invalid mission share code or file is too large.'] };
  try {
    let value = encoded.slice(5).replace(/-/g, '+').replace(/_/g, '/'); value += '='.repeat((4 - value.length % 4) % 4);
    const text = typeof globalThis.atob === 'function' ? globalThis.atob(value) : globalThis.Buffer.from(value, 'base64').toString('utf8');
    return validateMissionPreset(JSON.parse(text));
  } catch { return { ok: false, errors: ['Mission share code is damaged.'] }; }
}
