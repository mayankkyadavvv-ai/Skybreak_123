# Weapon polish — 2026-10-03

Baseline: `e453ba5`, latest fetched `origin/feature/skybreak-40-upgrade`; work branch `codex/weapon-polish`. Existing uncommitted mobile, controls and public-site edits are preserved. Baseline: 233 tests passed, 1 skipped; production build passed after allowing esbuild outside the filesystem sandbox.

| Requirement | Implementation / verification |
| --- | --- |
| Defaults and saved bindings, press edges, focus lifecycle | InputActions.js, Settings.js, Input.js; controls and input regressions |
| Cannon cadence and ammo, immutable aircraft direction | Game.js, Weapons.js; weapon-polish tests |
| Swept impacts, surface feedback | SpatialHash.js, Weapons.js, World.js; collision tests |
| Separation, ignition, bounded steering, expiry and pool reuse | Weapons.js; weapon-polish tests |
| Distinct hits and destruction, bounded particles | Effects.js, Game.js; effect lifecycle tests |
| Moving motor audio, mix, mute, restart cleanup | Audio.js, SoundDesign.js; audio tests |
| Accurate weapon states and actual bindings | HUDState.js, UI.js; HUD and controls tests |
| Build, security, actual browser | Logs in qa-artifacts; results appended below |

No downloaded weapon assets; effects and audio use original procedural generation. Existing QA.md and UPGRADE40_QA.md limitations remain applicable until explicitly superseded by new evidence. Physical Intel UHD performance and audible speaker quality require device testing. No FPS promise.

## Implemented

- Defaults remain Up = nose up, Down = nose down, Space/LMB = held cannon, E/RMB = one missile per press. Valid explicit saved bindings, including old profiles, survive normalization; HUD uses active bindings.
- Cannon uses a simulation-time .065 second scheduler with fractional carry, no release backlog, bounded dry-fire feedback, shared tracer geometry/material, one tracer per three rounds and a compact barrel-attached flash. Aim assistance no longer modifies aircraft orientation. Swept hits include aircraft straddling grid cells and choose the nearest candidate; feedback is positioned on the hit segment.
- Missiles separate for .12 seconds before ignition and arm target impact at .18 seconds. Existing speed cap (1050), acceleration (240), damage (110), lifetime (18 seconds) and cooldown (1.7 seconds) remain. Guidance is capped at 2.6 radians/second. Lost targets coast until expiry; reuse resets age, ignition and trail state. Far/low-quality smoke emission is reduced.
- Aircraft cannon impacts use short metal sparks; actual terrain collision classifies dust or water spray. Missile hits and aircraft destruction no longer duplicate the large burst/shockwave. Confirmed damage shows a brief marker; kills use amber. Explosion shake attenuates with distance and uses existing reduced-motion controls.
- Original procedural release, motor, ground and water sounds use the existing mix. Launch/hit audio receives world-position stereo attenuation; short overlapping motor layers update at the missile position. Maximum eight motor voices inside the existing 48-voice cap. Pause/restart stops flight sources, mute rejects new sources, weapon volume remains the existing setting.
- Multiplayer authority and balance remain on the existing server pipeline; this pass changes local/offline projectile simulation. Online events and physical multi-client audio have not been revalidated end to end.

## Evidence and limits

- `npm test`: 242 passed, 1 existing skipped, 0 failed (243 tests).
- `npm run build`: passed, including static site validation. Existing large-chunk warning remains.
- `node scripts/weapon-browser.mjs`: real headless Chrome WebGL 2, ANGLE Intel UHD D3D11; combat start, actual target lock, cannon damage, missile damage, E repeat, pause/resume, restart, simultaneous explosions, all presets, mute, volume and Free Flight restrictions passed; no console/shader errors. Captures and JSON: `qa-artifacts/weapon-browser/`.
- Browser scenario uses the existing targeting-training mode and explicitly places its cannon drone 420 m ahead. Explosions are an explicitly injected 20-event visual stress case. These are automated fixtures, not a claim of manual mission completion.
- The automated run observed roughly 10–13 FPS in its rolling snapshots. These include headless execution, preset changes and capture overhead; they are not isolated preset benchmarks. Smooth Intel UHD performance is **not established**. World draw counts remain high; overall resolution/world quality was not silently lowered. Foreground long-duration measurements, audible speaker quality, day/night weapon readability and physical multiplayer remain UNVERIFIED.
- Five restart snapshots showed stable renderer resource counts after warm-up; this is a short resource check, not a long combat soak or heap-leak proof. No comparable pre-change GPU baseline was captured.
- `npm run audit:secrets` returns 1 solely because its policy flags any local `.env*` file; the pre-existing `.env.local` is ignored by Git and `.vercelignore`. No source/build token pattern finding was reported. Separate built-artifact scan found no credential patterns or environment files. No secret values are included in reports.

## Reproduce / manual desktop checks

Run `npm test`, `npm run build`, then `node scripts/weapon-browser.mjs` (installed Chrome required). For the broader existing regression journey: `npm run verify:browser-build`.

1. Start Open Skies. Verify Up/Down directions and active controls in Help.
2. Hold/release Space; verify amber tracers, ammo, hit sparks and no firing after release.
3. Acquire LOCKED, press and hold E; only one missile leaves. Try no target, cooldown and empty ammo.
4. Pause while firing, resume, switch tabs and restart; no stuck fire or old trails/audio.
5. Compare low/medium/high presets and day/night; mute and adjust weapon volume. Listen for clicks, harsh peaks and moving missile sound.
6. Fly repeated combat in a foreground browser for at least five minutes; record frame times and resource/voice counts. Verify Free Flight still blocks weapons except explicit training.
