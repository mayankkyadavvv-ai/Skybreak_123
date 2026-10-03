# Desktop weapons presentation update — 3 October 2026

## Implemented

- Shared-resource amber cannon tracers with a bright core and restrained halo; short muzzle flash, smoke and sparks at impacts.
- Finned metallic missiles with a blue exhaust cone and distance-spaced grey smoke. Terrain impacts now produce feedback once.
- Revised procedural cannon crack/body/mechanical cycle, missile ignition/motor rush and explosion tail. Existing volume controls, mute and audio previews remain.
- Compact weapon panel: lock/rearm progress, firing/empty/low-ammo states, launch status, short hit/destroyed confirmation on actual offline damage.
- Desktop instructions hidden by default with a Tips toggle. Smaller mission and border alerts.
- Remote multiplayer projectile meshes/trails use the same presentation and bounded live projectile counts. Server authority and flight/weapon bindings are preserved.
- Cannon aim assist uses a copy of the heading vector instead of mutating aircraft heading.

## Verification

- Production build and static validation: passed.
- Full regression suite including localhost multiplayer/route checks: 142 passed, 0 failed.
- Tests cover pool saturation, resource cleanup, terrain impact deduplication, missed rounds, trail spacing, effects-off, HUD state priority, sound buffer bounds, control and combat regressions.
- Secret-pattern audit: see release execution results.
- Browser/WebGL visual playthrough, speaker/headphone listening and Intel UHD frame-rate measurement still require actual runtime verification. Unit tests do not prove visual fidelity or performance.

## Controls and review

Open a combat mission (Free Flight intentionally disables weapons). Hold Space for cannon; keep an enemy inside the reticle until LOCKED, then press E for a missile. Custom bindings are preserved and shown by the HUD. Sounds can also be previewed in Sounds settings.

This is a procedural presentation upgrade, not a claim of matching the reference trailer. Replay, new weapon mechanics, free-flight target range and server-side missile simulation changes are outside this release.
