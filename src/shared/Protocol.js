export const RELEASE_VERSION = '2.0.0-rc.1';
/** Wire protocol shared by the browser and the room worker. No credentials live here. */
export const PROTOCOL_VERSION = 2;
export const SIMULATION_HZ = 60;
export const SNAPSHOT_HZ = 20;
export const FIXED_DT = 1 / SIMULATION_HZ;
export const RESUME_GRACE_MS = 45_000;
export const MAX_INPUT_BATCH = 12;
export const MAX_INPUT_QUEUE = 120;
export const MAX_MESSAGE_BYTES = 16 * 1024;
export const MAX_BUFFERED_BYTES = 512 * 1024;
export const MODES = ['1v1', '2v2', '3v3', '4v4', 'team_deathmatch', 'free_flight', 'open_skies_coop', 'air_superiority'];
export const PING_KINDS = ['attack', 'defend', 'help', 'move'];
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const finiteVector = v => !!v && ['x', 'y', 'z'].every(k => Number.isFinite(v[k]));
export function sanitizeInput(raw = {}) {
  const axis = key => Number.isFinite(raw[key]) ? clamp(raw[key], -1, 1) : 0;
  const command = { pitch: axis('pitch'), roll: axis('roll'), yaw: axis('yaw'), throttle: axis('throttle'), brake: Math.max(0, axis('brake')), boost: raw.boost === true, gearDown: raw.gearDown === true, landingMode: raw.landingMode === true, flaps: raw.flaps === true, assisted: raw.assisted !== false, recover: raw.recover === true, targetId: typeof raw.targetId === 'string' ? raw.targetId.slice(0, 64) : null };
  if (Number.isFinite(raw.throttleSet)) command.throttleSet = clamp(raw.throttleSet, 0, 1);
  return command;
}
export function validateInputBatch(msg, player, epoch) {
  if (msg.epoch !== epoch || msg.inputEpoch !== player.inputEpoch) return { ok: false, reason: 'stale_epoch' };
  if (!Array.isArray(msg.inputs) || msg.inputs.length < 1 || msg.inputs.length > MAX_INPUT_BATCH) return { ok: false, reason: 'invalid_input_batch' };
  let last = player.lastReceivedSeq || 0;
  const accepted = [];
  for (const raw of msg.inputs) {
    if (!raw || !Number.isSafeInteger(raw.seq) || raw.seq < 1 || raw.seq > last + MAX_INPUT_QUEUE + 1) return { ok: false, reason: 'invalid_sequence' };
    if (raw.seq <= last) continue;
    for (const key of ['pitch', 'roll', 'yaw', 'throttle', 'brake', 'throttleSet']) if (key in raw && !Number.isFinite(raw[key])) return { ok: false, reason: 'invalid_axis' };
    accepted.push({ ...sanitizeInput(raw), seq: raw.seq });
    last = raw.seq;
  }
  if ((player.inputQueue?.length || 0) + accepted.length > MAX_INPUT_QUEUE) return { ok: false, reason: 'input_backpressure' };
  return { ok: true, accepted, last };
}
