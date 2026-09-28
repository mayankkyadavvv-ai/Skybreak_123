# Project structure

| Area | Responsibility |
|---|---|
| `src/game/InputActions.js`, `Input.js`, `Settings.js` | Shared actions, input lifecycle, mapping/migration and persistence defaults |
| `src/game/FlightPhysics.js`, `Landing.js`, `Game.js` | Fixed 60 Hz flight/combat and landing rules |
| `src/game/Camera.js`, `Jet.js` | Interpolated visuals, camera smoothing and aircraft behavior |
| `src/game/Quality.js`, `Environment.js`, `Resources.js` | Renderer/composer settings, bounded PMREM and disposal |
| `src/game/TerrainChunks.js`, `StaticScenery.js`, `World.js` | Authoritative terrain samples, incremental local detail, static scenery and clouds |
| `src/game/Atmosphere.js`, `Effects.js`, `SpeedEffects.js` | Coherent sun/weather, split smoke/glow pools and spatial moisture |
| `src/game/JetAsset.js` | Validated licensed local GLB interface with procedural fallback |
| `src/ui/` and `src/upgrade.css` | Menu, hangar, settings, contextual HUD, modal/touch accessibility |
| `src/multiplayer/`, `server/` | Existing WebSocket rooms, interpolation and combat state |
| `site.config.js`, `scripts/build-public.mjs` | Site origin, route metadata, public content and control/legal docs |
| `public/` | Independent help/legal/storage pages, brand assets, icons, robots and sitemap |
| `scripts/preview.mjs`, `validate-site.mjs`, `audit-secrets.mjs` | Strict production preview, local reference checks and redacted credential scan |
| `tests/` | Simulation, controls, UI, networking, render-configuration and routing regressions |
| `evidence/`, `QA.md` | Local evidence and explicit unverified browser/hardware gates |
