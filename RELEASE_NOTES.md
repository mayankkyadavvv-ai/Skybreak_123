# Skybreak — September 2026 local upgrade

Local source/build handoff, 28 September 2026. Deployment is deferred. See SKYBREAK_UPGRADE_REPORT.md for phase status and verification limits.

## Controls and game fixes

- Central action registry, conflict-aware rebinding and migration notices. W/S adjusts throttle, which holds after release; arrow pitch, Q/E yaw, B brake and cannon/boost have separate actions.
- Separate input device, flight assistance and enemy difficulty. Mouse calibration/capture/free-look, standard gamepad mapping and expanded multitouch controls.
- Clear held inputs on blur, pointer cancellation, disconnect and modal transitions. Controller pause/resume uses press edges.
- Fix the hangar Weapons tab's invalid modification categories, missing multiplayer connection return, missing damping import, unsafe landing acceptance and blocked-storage startup handling.

## Camera, HUD and presentation

- Interpolated render transforms; configurable camera FOV, shake, horizon and landing behavior, with teleport/respawn reset.
- Contextual cruise/combat/approach/ground HUD, one priority warning, expandable navigation, current binding labels and cached telemetry updates.
- Shared graphics presets, correct color-space/output handling, bounded environment cache, terrain chunks, coherent weather and spatial cloud effects.
- Enhanced procedural X-17 panels, materials and animated gear; validated fallback-safe GLB integration interface. No external licensed aircraft is included.
- Alpha smoke and thin wingtip trails separated from additive luminous effects; quality budgets, cleanup and batched static scenery.
- Grouped settings, collapsible hangar panels, loadout stat changes, keyboard focus, responsive touch layout and reduced-motion defaults.

## Public pages and handoff

- Independent About, Help, draft Privacy/Terms and Storage pages; confirmed reset of only Skybreak's five local data keys.
- Real-origin metadata, original social artwork and icons, sitemap/robots, clean routes, true 404s, explicit CSP/WSS validation and cache rules.
- Fresh production output, secret-filtered source/master/build exports, binary-safe SHA-256 restoration, updated run/QA/provenance documentation.
- 111 automated tests pass, compared with the 82-test starting suite; build/static/15 local HTTP/six token-contrast checks pass. Real browser, GPU performance, accessibility audit, physical controller and live-host acceptance remain pending.

## Follow-up acceptance pass

- Correct nested aircraft attachment positions and preserve gear pivot transforms on reset/retract.
- Close live multiplayer sockets and room state during shutdown; extend real socket coverage to telemetry, weapons, radio, disconnect/rejoin and graceful closure.
- Add installed-Chrome/Edge QA and an exact-project Windows verification/deployment launcher; production checks compare actual current asset names instead of trusting a successful upload message.
- Rechecked the existing origin: HTTPS 200/HSTS are present, but old assets remain live. The connected deploy action is missing. A remote browser opens the page but has no WebGL 2. Publication is now requested and blocked, not deferred.
