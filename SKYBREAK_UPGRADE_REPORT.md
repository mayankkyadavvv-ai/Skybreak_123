# Skybreak upgrade report

> Historical stage report. Current controls/fixes: [FLAW_FIXES.md](FLAW_FIXES.md) and [PLAYING_GUIDE_HINGLISH.md](PLAYING_GUIDE_HINGLISH.md). Defaults are ↑ nose up, ↓ nose down, E missile, Q/D yaw.

**28 September 2026 · Follow-up source/build handoff · Vercel publication blocked**

The supplied sequential prompt was worked through from Phase 0 to Phase 15. Controls, game fixes, camera, HUD, rendering, terrain/effects, menus and public pages have source implementations. Release acceptance remains **partial** because real-browser/GPU/hardware checks were unavailable, a licensed external aircraft was not supplied, and operator/legal facts remain unknown.

## Follow-up: what was completed and what blocks the rest

- **Completed:** nested model transforms now control wingtip/exhaust emission; the optional X-17 descriptor is connected to construction/customization; gear animation preserves a model pivot’s original offset and scale.
- **Completed:** multiplayer shutdown closes sockets and clears room/client/queue state. Real TCP/WebSocket coverage includes two-client join/start, telemetry, cannon, flares, radio, disconnect/rejoin and close code 1001. This is local networking, not a hosted two-browser WSS match.
- **Prepared:** expanded browser automation uses installed Chrome/Edge, six viewport captures, axe, startup timings, five-minute frame sampling, throttle/pause checks and ten lifecycle resource samples. It remains unexecuted on a working GPU here.
- **Observed live:** the existing HTTPS origin responds 200 and sends HSTS. Its `index-CaKcqXbW.js` / `three-ByaEJwel.js` are older than this build. Do not present that URL as serving this update. See `evidence/access-checks.json`.
- **Publication blocker:** Vercel project reads work, but the exposed deploy action returns “Tool not found”; a direct API request from this environment returned HTTP 403. No access/protection settings were changed. The user explicitly chose to keep Vercel; no alternative Site was created.
- **Graphics blocker:** local browser installation is unavailable and remote Chrome reports WebGL 2 unavailable. This says nothing about the user’s laptop GPU. No software-FPS estimate is substituted for hardware evidence.
- **Asset blocker:** the Game Asset Vendoring workflow requires a verified canonical package and its local `game-dev` tool. That tool and Blender are unavailable, so no third-party GLB was admitted. The procedural aircraft remains active.
- **Facts still missing:** public operator/contact/provider details were not supplied. Selecting “I will provide details” is not the actual information; policies remain draft. Physical controller testing and screen-reader/manual visual review also need the corresponding hardware/person.

## Phase results

Completed means the phase's local deliverable and available checks passed. Partial means implementation exists but an explicit requirement or acceptance gate remains. No unavailable test is counted as passed.

| Phase | Result | Delivered / remaining requirement |
|---|---|---|
| 0 Baseline | Partial | Original 82 tests and build recorded; no visual/gameplay baseline capture. |
| 1 Security/transport | Partial | Secret-filtered exports, redacted scan, explicit CSP and secure endpoint validation; existing origin returns HTTPS 200 and HSTS; current-code deployment, HTTP redirect/cookies and account-side credential action remain unverified. |
| 2 Action registry | Completed locally | One action source, conflict-aware rebinding, current labels, migration notices and generated controls guide; targeted tests pass. |
| 3 Flight input | Partial | Throttle hold, separate pitch/fire/boost, device/mode separation, mouse/controller/touch lifecycle; real pointer capture and physical controller feel pending. |
| 4 Camera | Partial | Simulation/render separation, interpolation, resets, clearance and configurable effects; camera pixels/feel pending. |
| 5 HUD | Partial | Context panels, one warning, expanded navigation, current bindings and 8 Hz changed-value updates; flight-level overlap/readability pending. |
| 6 Rendering | Partial | Quality/DPR/AA/color/environment/light/cleanup work; actual GPU pipeline and long-run resources pending. |
| 7 Aircraft | Partial | Procedural X-17 materials/details/gear and GLB loading contract; no approved external GLB or full external-model LOD set. |
| 8 Terrain/airbase | Partial | Incremental nearby LOD chunks, aligned height/UV/normals, skirts, bounded cache, home-base details and static batches; low-level flight visual review pending. |
| 9 Atmosphere/effects | Partial | Layered cloud sprites, spatial fog/moisture, coherent weather, smoke/additive separation and budgets; busy GPU scene pending. |
| 10 Menus/settings | Partial | Grouped settings, repaired weapons tab, stat deltas, keyboard focus and collapsible panels; rendered layout at all sizes pending. |
| 11 Privacy/storage | Partial | Accurate data inventory, independent draft policies and confirmed scoped reset; owner/contact/jurisdiction/provider/retention facts pending. |
| 12 Metadata/assets | Partial | Real canonical origin, distinct raw metadata, 1200×630 original artwork, icons and crawl files; remote social/crawler fetch pending. |
| 13 Mobile/accessibility | Partial | Touch/focus/modal regressions and six contrast calculations pass; six viewport captures, 200% zoom, screen reader and axe/Lighthouse pending. |
| 14 Links/routes | Partial | Seven HTML files and 15 actual local HTTP cases pass; real hosting adapter responses pending. |
| 15 Acceptance | Partial | 111 tests, production build, static/HTTP/contrast/secret checks and usable exports; five-minute playable route, GPU FPS and page-load timing audits pending. |

## Main visible and control changes

- Throttle stays where the player sets it. Shooting and afterburner no longer command runway rotation. Landing acceptance checks gear, speed, descent and attitude.
- Camera uses interpolated render transforms; shake and speed FOV can be fully disabled. Chase/cockpit/cinematic views, free-look and recentering share the controls registry.
- HUD changes for cruise, combat, approach and ground. One highest-priority warning is shown; navigation expands on demand. High contrast, opacity and scale are configurable.
- Enhanced procedural X-17, animated gear, nearby terrain detail, airbase markings, coherent day/weather lighting, spatial clouds and correctly separated smoke/glow effects.
- Grouped settings and a repaired hangar Weapons tab with the real loadouts and before/after stat changes. Keyboard focus and multitouch release behavior are implemented.
- Independent Help/About/Storage/draft policy pages, original brand icons/social artwork and real missing-page/asset errors.

## Main files changed and purpose

Paths below are relative to the source archive root.

| Files | Purpose |
|---|---|
| `src/game/InputActions.js`, `Input.js`, `Settings.js`, `FlightPhysics.js`, `Landing.js` | Shared actions, independent device/assistance, safe input lifecycle, throttle and landing behavior. |
| `src/game/Game.js`, `Jet.js`, `Camera.js` | Simulation/render separation, lifecycle/respawn handling, camera and render orchestration. |
| `src/ui/HUDState.js`, `UI.js`, `SettingsUI.js`, `HangarUI.js`, `Accessibility.js`, `Icons.js` | Context HUD, grouped settings, real weapons categories, focus/keyboard/touch and local icons. |
| `src/game/Quality.js`, `Environment.js`, `Resources.js`, `Atmosphere.js` | Shared budgets, postprocessing/environment configuration, coherent weather and disposal. |
| `src/game/World.js`, `TerrainChunks.js`, `StaticScenery.js`, `GeoTexture.js` | Nearby terrain detail, shared surface data, scenery batching and explicit texture color spaces. |
| `src/game/Effects.js`, `SpeedEffects.js`, `JetAsset.js` | Particle blending/budgets, spatial moisture and validated optional aircraft loading. |
| `src/multiplayer/Endpoint.js`, `src/multiplayer/NetworkManager.js`, `src/game/Storage.js`, `server/` | Endpoint validation, connection behavior, safe storage access and restrained server logging. |
| `src/upgrade.css`, `public/site.css`, `site.config.js`, `scripts/build-public.mjs` | UI tokens/responsiveness, lightweight public pages and shared metadata/legal/controls generation. |
| `scripts/security.mjs`, `preview.mjs`, `validate-site.mjs`, `vite.config.js`, host configs | Explicit headers, actual local 404s/MIME/cache, static validation and clean output. |
| `tests/`, `scripts/browser-acceptance.mjs`, `evidence/`, `restore.js`, `scripts/export-source.py` | Regression coverage, prepared browser gate, recorded evidence and verified source restoration. |

## Default controls and migration

| Action | Default |
|---|---|
| Pitch / roll / yaw | ↑ nose down, ↓ nose up; ←/→ roll; Q/E yaw/ground steer |
| Throttle / boost / brake | W/S adjusts then holds; either Shift boosts; B brakes |
| Cannon / missile / flares | Space or LMB; M or RMB; X |
| Next / previous target | R / `[` |
| Gear / map / airbases | G / N / L |
| Camera / cockpit toggle | C cycles chase/cockpit/cinematic; V toggles cockpit/chase |
| Free-look / recenter / recovery | Hold MMB / Z / A |
| Time / help / pause | T / H / Escape |
| Multiplayer scoreboard / quick commands | Tab / Y team, U all, then 1–7 |

Standard controller: left stick flight, right stick look; RT cannon, LT brake; A missile, B flares, X target, Y view; LB/RB yaw; left-stick press boost; D-pad up/down throttle, left map, right gear; Menu pause. Mapping and deadzone calibration are shown in Settings. Touch exposes steering, throttle, weapons, boost/brake, gear, view and pause.

Defaults: **Medium, day/clear, keyboard, Assisted, Easy**, auto-cruise off; FOV 64°, speed-FOV strength 0.65, shake 0.35, HUD scale 100%, opacity 76%, effects 0.8. Mouse sensitivity 0.8/deadzone 0.08/curve 1.35; controller deadzone 0.14. Reduced-motion defaults disable shake and speed FOV.

Controls schema is version 3. Legacy `advanced` maps to keyboard + Manual; mouse and legacy inversion settings migrate. Valid nonconflicting bindings survive; unsupported/conflicting aliases reset with notices. Progress and unrelated audio/settings are preserved. Escape remains Pause/Back. See generated `CONTROLS_GUIDE.md` for every action.

## Observed verification

Environment: **Node 24.19.0, Vite 6.1.0, Three.js 0.180.0**, workspace CPU execution. `@napi-rs/canvas` supplied procedural 2D textures for the CPU scene check. No WebGL renderer or user's laptop was measured.

| Check | Actual result |
|---|---|
| Regression suite | **111/111 pass**, zero failures/skips; starting suite was 82. `evidence/test-results.txt`. |
| Production build | Pass; 67 modules transformed. Four current generated chunks after a clean rebuild. Vite's >500 kB Three chunk warning remains visible. `evidence/build-results.txt`. |
| Static pages/assets | Seven HTML files validated for IDs, metadata, local targets/fragments and 1200×630 social PNG. |
| Local HTTP | 15 checks pass: six public routes, two clean-URL redirects, unknown page, missing JS/image and four public assets. `evidence/http-checks.json`. |
| Contrast | Six listed token pairs exceed 4.5:1; minimum **4.94:1**. Calculation only, not all rendered text. `evidence/contrast.json`. |
| Secrets | Zero identified patterns in scanned source/config/docs/build; private env/account/dependency paths excluded from source exports. Pattern scan is not proof of all possible secret absence. `evidence/secret-scan.json`. |
| Source export | ZIP contents and master-file restoration checked with SHA-256, including binary PNG/ICO assets; private paths excluded. |
| Browser/hardware | **Gameplay unverified**. No local browser executable; downloads failed. The dedicated remote browser opened the old live page but displayed “WebGL 2 is required”; its local-preview navigation was blocked. No working GPU frame, manual flight or gameplay screenshots were produced. |

### Findings fixed and targeted rechecks

| Finding | Repair and evidence |
|---|---|
| Hangar Weapons referenced nonexistent modification groups | Uses the actual weapon/loadout categories; DOM test opens/equips and checks stat deltas. |
| Input conflicts and throttle/rotation coupling | Central actions and separate flight commands; throttle hold, cannon/boost, inversion, remap and fixed-step tests pass. |
| Pause/blur/modal/touch could leave held input or miss controller resume | Clear/cancel lifecycle and button edges; input and UI regressions pass. |
| Unsafe landing and underground gear collision exception | Attitude/sink/speed/gear validation and collision correction; landing tests pass. |
| Repeated weather application accumulated changes | Idempotent weather parameters; repeated storm/day changes tested. |
| HUD minimum-opacity muted text below 4.5:1 | Minimum dark-panel opacity raised to 72%; recomputed worst listed pair is 4.94:1. |
| Missing page/assets could be served as game HTML | Strict local production routes, independent pages and no catch-all rewrite; actual 404/MIME cases pass. |
| Old hashed bundles remained in output | Removed generated output, made emptyOutDir explicit and rebuilt; archive contains only current generated chunks. |

## Performance evidence and limits

CPU scene counts before/after static batching, same current world, Medium, 240 updates at a fixed position:

| Measure | Before batching | After batching |
|---|---:|---:|
| Compatible opaque static meshes | 716 | 129 |
| Total World meshes | 2,514 | 1,927 |
| World triangles | 186,464 | 186,464 |
| Terrain cache entries | 9 | 9 |

This demonstrates fewer scene meshes/potential submissions; it does **not** measure GPU draw calls or prove an FPS improvement. See `evidence/scene-check.json`. Runtime `game.getPerformanceSnapshot()` exposes frame samples, DPR/quality, complete-frame render counters and resource counts for the next hardware run. Stable 60 FPS at an appropriate Medium setting remains a target.

Current clean build, actual raw bytes and gzip bytes (decimal kB):

| File | Raw kB | Gzip kB |
|---|---:|---:|
| Entry HTML | 3.23 | 1.23 |
| Game JS | 356.77 | 111.38 |
| Three/addons JS | 565.55 | 144.77 |
| Game CSS | 74.99 | 16.33 |
| Optional GLTF loader chunk | 43.91 | 12.92 |
| Help HTML + public CSS | 8.72 | 3.38 |

Baseline build logs reported approximately 317 kB game JS, 526 kB Three and 58 kB CSS; added systems increase bundle size. No startup speedup is claimed. Public information pages contain no Three/game scripts. These are compressed-size calculations, not observed transfer/readiness timings. LCP/INP/CLS, Lighthouse, cold/warm loads, average FPS and p95/1% lows are **unmeasured**. No before/after gameplay captures exist.

## Release checklist and facts still needed

`SKYBREAK_RELEASE_CHECKLIST.md` records every requested privacy/consent/security/metadata/mobile/404/performance gate. `DATA_INVENTORY.md` records five actual Skybreak browser keys and multiplayer flows. No optional tracking integration was found in source; no fictitious consent categories were added. Hosting/provider behavior still needs observation.

- **Policies:** provide operator identity/contact, relevant jurisdiction, actual hosting/WebSocket providers and retention practices. Privacy/Terms remain explicitly draft and noindex; no jurisdiction-wide compliance claim is made.
- **Credential handling:** the earlier upload's expired runtime OIDC token was removed from the repaired code/exports. Account-side revocation/history cleanup was not performed; old unsafe copies must not be reused.
- **Hosting:** configure a real WSS endpoint and matching CSP before uploading source if multiplayer uses another origin. Future verification must inspect actual TLS/redirect/HSTS/headers/cookies/404s and preserve existing project protection.
- **Assets:** original procedural aircraft/world, locally authored vector branding/icons and MIT Three.js/addons are documented in `ASSET_PROVENANCE.md` and `THIRD_PARTY_NOTICES.md`. No licensed external GLB is included. Clouds are sprites; exhaust glow is not heat refraction; the social image is labelled artwork, not gameplay.
- **Browser/hardware:** run `QA.md` on a capable browser and the target laptop, including the five-minute flight, touch/six viewports/zoom, real controller, repeated lifecycle/resource checks and two-client WSS multiplayer. The prepared capture script is not a completed test.

**Deployment:** requested by the user in the follow-up, but none performed. The intended existing origin is `https://skybreak-iota.vercel.app`; this is not evidence that it serves these changes. The refreshed `Skybreak-Windows-Deploy.zip` contains the current source and verification/deployment launcher; it supersedes the older helper.

## Files and next checkpoint

- `skybreak-complete-project(1).zip`: editable source, lockfile, tests, original assets, instructions, report and master export; excludes installed dependencies and private account data.
- `SKYBREAK_ALL_CODES.md`: complete text/binary source representation; use its matching `restore.js` from the source ZIP for SHA-256-checked restoration.
- `skybreak-deploy-ready.zip`: clean prebuilt static files, explicit static-host configuration and deployment notes. It is not a live release and does not contain the separate multiplayer service.
- `Skybreak-Windows-Deploy.zip`: current source with the installed-Chrome/Edge verification and exact-project deployment launcher, plus Hinglish start instructions.

Run `npm ci`, `npm test`, `npm run build`, then `npm run preview`. The next concrete checkpoint is **Verify and Deploy Skybreak.cmd** on a capable Windows PC with the owner’s Vercel account. The launcher runs the prepared browser gate, then uploads only to the exact existing project. Its complete Windows execution is unverified here; a failure stops it and leaves diagnostics under `qa-artifacts/`. Manual visual/device review remains separate. The connected deployment action was attempted and returned `McpServerError: Tool deploy_to_vercel not found`; no source was uploaded.

## Implementation references

Primary references checked for the relevant implementation details: [Vite public environment variables](https://vite.dev/guide/env-and-mode), [Three PMREM](https://threejs.org/docs/pages/PMREMGenerator.html), [Three OutputPass](https://threejs.org/docs/pages/OutputPass.html), [Vercel configuration](https://vercel.com/docs/project-configuration/vercel-json), [Vercel security headers](https://vercel.com/docs/cdn-security/security-headers), [Google noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing) and [Google canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls). Legal drafts describe observed project behavior; they do not establish jurisdictional applicability or legal approval.
