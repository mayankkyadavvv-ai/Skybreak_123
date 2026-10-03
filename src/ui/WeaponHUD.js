export function weaponHUD(game) {
  const empty = game.missilesLeft <= 0;
  const cooldown = Math.max(0, game.missileCooldown || 0);
  const lock = Math.min(1, Math.max(0, (game.lock || 0) / 1.4));
  const target = !!game.target?.alive;
  const mode = empty ? 'empty' : cooldown > 0 ? 'reload' : !target ? 'search' : lock >= 1 ? 'locked' : 'acquiring';
  const labels = { empty: 'NO MISSILES', reload: `REARM ${cooldown.toFixed(1)}s`, search: 'SEEKING TARGET', locked: 'LOCKED · READY', acquiring: `TRACK ${Math.round(lock * 100)}%` };
  return { mode, label: labels[mode], progress: empty ? 0 : cooldown > 0 ? 1 - Math.min(1, cooldown / 1.7) : lock,
    cannon: game.cannonLeft <= 0 ? 'EMPTY' : game.cannonCooldown > .02 ? 'FIRING' : game.cannonLeft < 100 ? 'LOW AMMO' : 'READY',
    hit: game.weaponHitUntil > game.elapsed ? (game.weaponHitKill ? 'DESTROYED' : 'HIT') : '',
    launched: game.weaponLaunchUntil > game.elapsed };
}
