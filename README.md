# Skybreak 1.2 — Airfield & visual systems update

Recovered from your 37-file Antigravity source document and extended in place.

## Run on Windows
1. Extract this ZIP completely.
2. Open the skybreak folder, then double-click START-GAME.bat.
3. Node.js must be installed. No npm install is needed to play the included build.
4. Keep the terminal open. If needed, open http://127.0.0.1:4173 manually.

## Fly and land
- Start Free Flight. Arrow keys steer; Shift boosts; H opens help.
- L: air stations. Select ILS Approach for a manual approach or Start parked for takeoff practice. Resume after selecting the scenario.
- J: toggle landing mode. In landing mode PgUp/PgDn (or +/−) adjusts throttle.
- K: flaps. G: gear. B: airbrake / wheel brake.
- On approach target roughly 400 km/h, wings level. Keep the runway centreline aligned. Two white/two red PAPI lights indicate the intended path. The HUD shows lateral and glideslope errors.
- Gently pull up before touchdown. Hard/sideways/gear-up landings are rejected or penalized. These are gameplay thresholds, not real aircraft operating limits.
- After landing throttle is idle. Hold B to stop. Remain stationary at idle for five seconds to repair/rearm.
- Takeoff: PgUp to increase power, accelerate straight, then Up to rotate above 342 km/h. Boost alone cannot take off. Raise gear/flaps when airborne; J restores cruise assist.
- Earth atlas opens a separate geographic country/city overview. The flight terrain is still compressed/procedural, not satellite terrain.

## Edit and build
npm ci
npm run dev
npm test
npm run build

The included dist folder is the compiled game. Rebuild it after source edits.
The source includes Vercel and Netlify configuration; the existing Vercel site has not been changed by this package.

See UPDATE-NOTES.md for validation, limitations and next priorities.
