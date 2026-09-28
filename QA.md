# Skybreak acceptance gates

## Performed here

Node 24.19.0 on this workspace; Vite 6.1.0 and Three 0.180.0. Automated simulation/DOM/configuration/routing tests, production build, static reference validation, local HTTP checks, token contrast calculations, redacted credential pattern scan and CPU-only scene construction/disposal. Details and exact counts are in SKYBREAK_UPGRADE_REPORT.md and evidence/.

A Playwright library was present, but no Chromium executable. Chromium installation returned empty/invalid ZIP downloads. A dedicated remote browser was subsequently opened on the existing live site, but it displayed “WebGL 2 is required”; local preview access was blocked. No successful WebGL GPU frame, Lighthouse report, physical gamepad or user laptop result is available. The following gates are **unverified**, not passed.

## Run real-browser capture on a capable computer

```bash
npm ci
npm run build
npm run preview
```

In another terminal:

```bash
npm install --no-save --package-lock=false playwright@1.62.1 axe-core@4
node scripts/browser-acceptance.mjs
```

The harness first tries your installed Chrome, then Edge, then a bundled Chromium. No separate browser download is needed when Chrome/Edge works. Optional `HEADED=1` displays the browser; `SKYBREAK_BROWSER_CHANNEL=chrome` or `msedge` selects a specific installed browser. The script writes `qa-artifacts/` with menu/settings/hangar/flight captures at 360×800, 390×844, 412×915, 768×1024, 1366×768 and 1920×1080. It collects five minutes of frame samples on desktop, checks throttle hold and pause/resume, records startup timings and ten restart resource samples, and runs axe on menu/settings/public pages when installed. It checks JavaScript errors/document overflow. Scene resets used for sustained sampling are recorded as automated setup, not manual flight acceptance. It also captures day/sunset/night, approach and ground using explicit scene setup. It is prepared but was not run here. Inspect the images; absence of a script error does not prove visual quality or accessibility.

## Manual five-minute flight and focus test

1. Reload from persisted settings; enter menu, hangar, aircraft/livery/weapons tabs, and all settings sections using keyboard only. Verify focus returns and panels scroll at 200% zoom. Check selected/locked states.
2. Start Free Flight. Hold/release W and S; confirm throttle holds. Verify ↑ nose down, ↓ nose up, left/right roll, Q/E yaw, B brake, Shift boost. Space must not rotate on a runway. Try custom bindings and conflicts.
3. Try mouse unlocked/locked, inversion, deadzone, response curve, Z recenter and MMB free-look. Escape, pointer-lock rejection/loss, tab switching and window blur must leave no held input.
4. Try Assisted and Manual on each supported input device. Test a real standard controller's triggers, shoulders, right stick, deadzone, Menu pause/resume, D-pad map and disconnect. Confirm unsupported mapping feedback.
5. Use real touch at each portrait size and tablet/landscape. Steer and fire simultaneously; adjust throttle; pause, camera, gear and brake. Test pointer cancel and lost capture. Check no touch target is obscured.
6. Cruise low over terrain, enter an actual cloud, fly combat with lock/fire/flares, approach a runway, land and take off. Check a single priority warning and readable runway/target area at 80–140% HUD scale. Test keyboard/gamepad labels after rebinding.
7. Cycle cameras, quality, weather and time; set shake/speed FOV to zero. Check day/night/storm, flare occlusion, transparent smoke, correct wingtip/nozzle origins, cloud fog, runway flattening and LOD seams. Compare captures with identical scene/camera conditions.
8. Repeat restart, mission transition, aircraft/livery changes, respawn and menu/hangar open/close at least ten times. Inspect `game.getPerformanceSnapshot()` and DevTools for growing geometries, textures, programs/listeners, stuck effects and console errors.
9. Verify multiplayer with an actual compatible WSS server and two clients, including death, respawn, scores, quick commands, spectator and reconnect. Source protocol regressions pass; no production server round-trip was performed here.

## Performance and public-page checks

Record OS, CPU, GPU/driver, browser/version, canvas resolution, DPR, quality and power mode. Measure average FPS plus p95 frame time/1% lows in a repeatable busy-combat scene; 60 FPS at Medium is a target only. Renderer counters now aggregate a complete displayed frame including postprocessing; CPU scene mesh counts are not GPU draw counts.

Use Lighthouse/DevTools separately for `/`, `/help`, `/privacy`, `/terms` and `/storage`, with recorded desktop/mobile throttling. Record transfer, startup/long tasks, LCP/CLS and interactions; never substitute these for in-flight FPS. Confirm no Three/game chunk is fetched on independent pages. Run an automated accessibility scan and a screen-reader/focus review. Six token contrast pairs passed calculations; unmeasured legacy/canvas/dynamic combinations still need actual pixel review.

After eventual deployment, recheck real 200/404/redirect/MIME/cache/security headers, TLS/HSTS, social fetches, missing assets, provider logs/cookies, intended production protection and preview noindex. Finalize draft operator/contact/legal facts before treating the policies as approved.

## Windows verify and publish

Extract the latest complete source (or Skybreak-Windows-Deploy.zip), then double-click **Verify and Deploy Skybreak.cmd**. It installs locked dependencies, runs tests/build/secret scan, installs the optional QA libraries without editing the lockfile, runs the six-viewport/five-minute browser gate, signs into Vercel when necessary, verifies the exact existing team/project, uploads, and compares live asset references and routes with the build. A failed command stops the release; no protection setting is changed. The launcher and expanded browser harness were syntax/source checked here, not executed on Windows or with a working GPU.

If the final live check sees a sign-in wall, the upload may have succeeded but live verification remains incomplete. Open the site in your own signed-in browser; do not disable deployment protection as a shortcut. Keep qa-artifacts/acceptance.json, release-status.json and live-check.json for diagnosis. Read errors before sharing logs and never share passwords, login codes or tokens.
