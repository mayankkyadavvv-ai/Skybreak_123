# Skybreak 1.2 review and changes

## Source and scope
All 37 fenced file sections were recovered from the supplied consolidated source document. That snapshot contains five jets, customization, weather, a compressed geographic game world and 14 airfields. Its baseline was 57 passing tests (the document header claimed 56). This update preserves that source's systems. It is not built from the older 1.1 ZIP.

## Implemented
### Landing and controls
- Shared runway coordinate math for footprint, approach path, heading and touchdown assessment.
- Continuous crossing detection: fast descent cannot skip the runway surface merely because a simulation step jumps across it.
- Gear, sink rate, bank/pitch and heading alignment checks; hard-landing damage.
- Takeoff climb velocity no longer gets overwritten by ground movement. Rotation now needs a deliberate pull-up command, not just boost or downward input.
- Manual approach throttle, flap-dependent speed/stall response and assisted 3-degree approach; easy cruise remains available.
- Braking/rollout, ground gear lock, runway excursion recovery, five-second stopped ground service. Touchdown itself no longer grants immediate full repair.
- Correct equipment-specific ammunition capacities when servicing.
- Starting a mission clears old landed state. Approach placement follows runway heading and fixes the previous metres/second versus km/h instruction mismatch.
- Air station dialogs pause flying. The teleport shortcut is honestly labelled Start parked, separate from ILS Approach.
- Detailed keyboard guidance added. Mouse inversion no longer reverses arrow-key steering.

### Airfields and visual rendering
- Aprons, parallel taxiway markings, shoulder surfaces, runway threshold/aiming marks, instanced runway/approach lights, 4-light PAPI indications and decorative windsocks.
- Fixed runway centreline stripes extending far beyond runway ends.
- Removed procedural city buildings around airbase centres that blocked the runway.
- Expanded the terrain mesh from 80km square to 200km square so outer airfields no longer sit outside the terrain mesh. Terrain texture V alignment corrected.
- Runway terrain flattening covers runway length and overrides overlapping practice-area terrain.
- Added an environment reflection map for metallic airframes; restrained bloom thresholds and corrected composer pixel ratio updates.
- Separate alpha-blended smoke instead of making dark smoke additive glow; layered blast smoke, tyre smoke and existing shockwaves retained.
- Fixed logarithmic-depth shader integration after actual browser validation exposed missing shader includes.
- Parked idle jets no longer show afterburner flames. Low-altitude warnings are suppressed on the runway.
- Menu headline and practice control layout fit without overflow.

### Geographic atlas
177 Natural Earth country features are bundled as vector data, with city markers from the supplied city latitude/longitude database. Whole-world and regional views and city lookup work offline after loading the game. This is a separate overview: it does not convert the 3D flight terrain into Earth terrain. Country outlines are coarse 1:110m, de facto boundaries; city coordinates and airbase data inherited from the supplied project have not been independently surveyed/verified. In-game coordinates are now labelled SIM COORD.

## Verification
- 62 tests pass, including a continuous approach at every one of the 14 airfields, rejected unsafe contacts, braking/rotation, gear lock, manual throttle, and rotated runway math.
- Vite production build succeeds. The Three.js bundle still produces a size advisory; it is not a build error.
- Headless Chromium with software WebGL loaded the compiled game and atlas; city lookup correctly displayed New Delhi coordinates.
- Browser-driven simulation at Ambala completed approach → touchdown → braking → stopped ground service. The run reached touchdown after 2,544 fixed steps, stopped at 0 m/s, and completed service with no captured page/console errors.
- Browser evidence is a functional/render check, not a laptop FPS benchmark or subjective proof of photorealism. Simulation was advanced programmatically in the browser, not flown by a human tester.

## Still needed to reach the requested visual target
This remains a procedural WebGL prototype. Photoreal terrain and buildings, scanned/PBR aircraft assets, physically volumetric clouds, true engine heat refraction, detailed animated flaps, runway-specific surveyed airport layouts, live wind/crosswind aerodynamics, full-world streaming, and accurate state-boundary gameplay are NOT implemented in this update. The atlas does not imply those features exist. The provided aircraft, apron/taxiway structures, windsocks and airbase layouts are stylized.

Recommended order: choose one real airport region; bring in elevation/imagery with clear usage terms; implement terrain tile streaming and local origin handling; replace one jet with a detailed original glTF/PBR asset; profile on the actual target GPU; then expand airports and weather. A whole globe at uniform detail is not a realistic promise for this codebase. Maintain a reliable landing loop while upgrading the assets and world.

## Delivery
Full source, locked dependencies, tests, compiled dist and a Node-only Windows launcher are included. No authentication tokens or installed node_modules are included. The existing skybreak-iota.vercel.app deployment has not been updated.
