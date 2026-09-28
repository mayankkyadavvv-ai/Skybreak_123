# Open Skies upgrade — implementation and verification

Date: 2026-09-28. Base commit: `fda260d57a6dd00c0ee3241cec91454a426e5bcb`.

## Implemented

- Explicit briefing → active → recovery → next phase → complete/failed/aborted encounter state. Three waves (3 + 4 + 1), two persistent wingmen, 10-second recovery gaps, eight-second arrival grace. Timers advance only with simulation. Wingman losses never auto-fail Easy; player loss fails. Missing targets cannot prevent phase completion.
- Real persistent Cover me / Attack my target / Regroup orders. Threat prioritization, sticky targets, invalid-target fallback, speed matching, separation and terrain avoidance. Rate-limited radio acknowledgements, reinforcement/ace announcements and wingman distress calls.
- Dogfighter cannon attacks, missile standoff/locks, support pressure on wingmen, and VIPER in a distinctive SU-57S with limited missiles/flares. Configured reaction delay, aim error, aggression, turn rate, target switching and recovery. Ace high yo-yo, break turn and post-launch recovery. Difficulty is fixed for each Open Skies sortie to keep medal records comparable.
- Objective and wave/overall counts; selected target; wingman health, order and status; ace identity/health; one prioritized warning. Guided hints can be skipped or reopened through Help. Rebound keys and independent input inversion drive actual labels. Promotions use radio during this mission rather than blocking flight.
- Local Bronze/Silver/Gold medals, per-difficulty personal best, once-per-instance mission/medal XP, replay with a fresh or repeated seed. Existing profile key/ranks/unlocks/settings are preserved. Invalid or unavailable storage falls back safely. Seeds reproduce encounter placement and AI random decisions; global VFX/flare randomness is not a deterministic replay recording.
- Aegis Strait now starts over the existing southwestern sea and procedural coastal islands. Rendering and collisions retain the shared `terrainHeight` function. Clear midday mission lighting and capped bloom restore the user's saved sky/weather on leaving. Existing terrain LOD, effect/projectile pools and quality settings remain in use. No external artwork or paid service was added; terrain does not mask radar/missile locks.
- Existing assisted/manual flight retained with first-step response, held throttle, explicit nose-up rotation and camera smoothing separate from aircraft physics. Added reduced-motion switch disables camera shake, speed FOV and speed streaks. Touch capture now ignores released/stale pointers.

## How to play

1. Missions → **Open Skies** → Play. Assisted flight and Easy are the defaults.
2. **↑ = nose up; ↓ = nose down.** ←/→ roll and turn; Q/E yaw. W/S sets throttle and holds it, Shift boosts, B brakes. Release steering to level in Assisted mode.
3. R selects a hostile. Keep its diamond in the reticle for 1.4 seconds until LOCKED; M/right click fires a missile. Space/left click fires cannon. X deploys flares after a missile warning.
4. **Y** opens squadron orders and pauses flight: **1 Cover me, 2 Attack my target, 3 Regroup**. Numbers act only inside this panel. Esc/Y closes and restores the prior state. Touch WING or standard controller View/Back opens the same panel; D-pad navigates, A confirms, B closes. Multiplayer retains its separate commands.
5. Clear the patrol, protect your squadron from reinforcements, then defeat VIPER. H opens Help. Keep wingmen alive and avoid damage for a better medal.

Default bindings can be customized in Settings; the in-game guide reflects those preferences. Controller pitch follows the displayed LS direction and its independent inversion setting.

## Medal and persistence rules

`points = completion + accuracy + protection + wingmen`, bounded to 0–100:

| Component | Points |
|---|---|
| Complete all three phases alive | 50 |
| Combined cannon/missile hits ÷ shots launched | 0–20, rounded; zero shots = 0 |
| `1 − min(1, cumulative damage / starting maximum HP)` | 0–20, rounded |
| Surviving wingmen | 5 each, maximum 10 |

Completion is required for a medal. Bronze <65, Silver ≥65, Gold ≥85. Failure shows a breakdown but awards no completion/medal XP. Completion gives the existing 500 XP plus 100/250/400 medal XP; kill XP continues independently. Repairs do not erase damage. An aborted sortie has no completion reward.

The `openSkies` version-1 extension within `skybreak_pilot_profile_v1` stores per-difficulty best points/medal/time/seed and a bounded set of processed sortie IDs. The game also guards finish once in memory. Browser settings store whether guided hints were dismissed. No server/cloud save was added.

## Integration map

| Module | Responsibility |
|---|---|
| `src/game/OpenSkies.js` | Phase configuration/state, seeded waves, medal formula |
| `src/game/SquadronAI.js` | Orders, role tactics, defensive reactions, formation |
| `src/game/OpenSkiesProgress.js` | Profile normalization, result deduplication, personal best |
| `src/game/Game.js` | Spawn/lifecycle, event integration, damage, environment, release of input |
| `src/ui/OpenSkiesUI.js` | Battle HUD, orders, guide, medal markup |
| `src/game/InputActions.js`, `Input.js` | Shared/rebound actions, controller menu routing |

Live aircraft are capped by the configured wave: at most four hostiles plus two wingmen and the player. The encounter retains at most eight hostile models including wrecks until exit. Existing pools cap bullets at 180 and missiles at 36. Restart disposes all NPC models and clears projectile owner/target references, spatial queries, encounter state, locks and input. HUD content updates at 8 Hz and uses cached markup.

## Verification evidence

Baseline: **119 tests passed**, production build passed. Final: **137 tests passed**, production build and secret pattern scan passed (zero identified privileged credentials). Evidence is in `evidence/open-skies/test.log`, `build.log`, `secrets.log` and `browser-acceptance.json`.

Automated coverage includes three-phase completion using real projectile pools; once-only transitions/rewards; pause timing; losses and restart from every phase; repeated scene disposal; invalid orders/targets; multiplayer routing; command keyboard/controller edges; saved settings/profile migration; fixed-step flight equivalence at 30/60/144 render rates; first-tick pitch response; throttle/rotation; long coastal AI manoeuvres; and existing landing/atlas/hangar/multiplayer tests. The combat completion harness controls target placement; it is not a human playthrough or a difficulty/pacing measurement.

**Unverified in this execution environment:** GPU rendering, desktop/mobile screenshots and visual overlap, browser runtime gameplay, measured FPS/p95/draw-call/memory comparisons, physical controller/touch feel, screen reader, and the 6–10 minute target playthrough duration. Node runs on Linux / Intel Xeon Platinum 8573C. No Chrome/Edge/Chromium executable is installed; the attempted optional browser gate records `blocked`. The connected cloud browser was previously observed with WebGL disabled. CPU/DOM tests do not establish GPU quality or human playability. No FPS claim is made.

## Reproduce browser acceptance on a machine with WebGL 2

```sh
npm ci
npm test
npm run build
npm run audit:secrets
npm run preview
```

In a second terminal, install optional QA tooling locally (`npm install --no-save --package-lock=false playwright axe-core`), then run `node scripts/open-skies-browser.mjs` with installed Chrome/Edge or Playwright Chromium. `SKYBREAK_QA_URL` can point to a deployment; default is `http://localhost:4173`. `HEADED=1` opens a visible browser. The script captures 1366×768 and 390×844 HUD/orders/debrief screenshots, checks ↑/↓, exercises phase/replay lifecycle, samples rendering and performs ten restarts. Scripted damage is labelled separately from real combat. The broader `scripts/browser-acceptance.mjs` covers the older six-viewport/free-flight/axe gate.

Manually fly all three phases on Easy/Medium at each requested viewport, use all wingman orders, intentionally lose a wingman, lose/retry the player, interrupt focus/pointer lock, test simultaneous touch steering/fire, and connect/disconnect a controller. Review lock/missile warnings, silhouettes, central reticle clearance and medal totals. Compare `window.game.getPerformanceSnapshot()` before/after on identical hardware, resolution, quality, seed and sample length. Test Low and reduced-motion readability. Tune pacing only from those measured human runs.

## Release

Publish to the existing `mayankkyadavvv-ai/Skybreak_123` main branch without rewriting history. Its existing Vercel Git integration runs tests/build and deploys to **https://skybreak-iota.vercel.app/**. Verify READY and matching source SHA, then root/assets/help before reporting release complete. Domain and protection configuration are preserved.
