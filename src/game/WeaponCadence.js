// Simulation-time scheduler. No accumulated backlog after release or a rejected shot.
export function advanceCannon(cooldown, dt, firing, shoot, interval = .065) {
  if (!firing) return Math.max(0, cooldown - dt);
  let remaining = Math.max(0, cooldown) - Math.max(0, Math.min(.5, dt));
  let count = 0;
  while (remaining < -1e-9 && count++ < 8) {
    if (!shoot()) return 0;
    remaining += interval;
  }
  return remaining;
}
