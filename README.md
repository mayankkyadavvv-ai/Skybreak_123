# Skybreak

A Three.js + Vite browser flight/combat game. This source includes the September 2026 upgrade pass: shared controls, camera interpolation, contextual HUD, graphics quality settings, chunked terrain, revised procedural aircraft and effects, accessible menu controls and independent information pages.

## Run locally

Use Node.js 20.19+ or 22+ (this pass was tested with Node 24.19.0).

```bash
npm ci
npm run dev
```

Open `http://localhost:4173`. On Windows, `Play Offline.bat` builds the current source and starts the local production preview. Internet is needed for the first dependency installation.

## Check the production build

```bash
npm test
npm run build
npm run audit:secrets
npm run preview
```

The preview uses production-like routing: `/about`, `/help`, `/privacy`, `/terms` and `/storage` work directly; unknown pages and missing assets return real 404s. It sends a local `noindex` header. Static host behavior must still be checked after a future deployment.

## Fly

- **↑ nose up, ↓ nose down; ←/→ roll; Q/E yaw and ground steering.**
- **W/S changes throttle and holds it after release.** Shift boosts, B brakes.
- Space/LMB cannon; M/RMB missile; X flares; R next target; `[` previous.
- G gear; N map; L airbase panel; C camera cycle; V cockpit/chase.
- MMB temporary free-look; Z recenter; H help; Escape pause/back.

See **CONTROLS_GUIDE.md**, generated from the action registry. Keyboard, mouse and standard gamepad are devices; Assisted and Manual are separate flight modes. Touch controls include steering, throttle, weapons, boost/brake, gear, view and pause.

## Multiplayer

```bash
npm run server
```

The local server listens on port 8080 by default. Run the development client separately. A static host does not run this WebSocket server. Hosted HTTPS clients accept secure WSS endpoints only, on the site origin or the explicitly configured public `VITE_SKYBREAK_WS_URL` origin. Never put a secret in a VITE variable. Configure production CSP before uploading source; see **HOSTING_GUIDE.md**.

Multiplayer protocol, rooms, scores and progression are preserved. Saved data stays in the browser; multiplayer sends names and game state to the chosen server. **Privacy and Terms are drafts pending operator/contact and provider details.**

## Handoff

- `SKYBREAK_UPGRADE_REPORT.md`: phase-by-phase results, evidence and limitations.
- `SKYBREAK_UPGRADE_PROGRESS.md`: execution status.
- `SKYBREAK_RELEASE_CHECKLIST.md`: remaining release gates.
- `QA.md`: real-browser, mobile, controller and performance checks.
- `ASSET_PROVENANCE.md`: procedural asset provenance and future GLB contract.
- `DATA_INVENTORY.md`: observed storage and network flows.

The requested Vercel update is blocked here: the connected deploy action returns “Tool not found”. No deployment was performed for this upgrade. Use **Verify and Deploy Skybreak.cmd** from the extracted source on a capable Windows PC to run the prepared verification and upload workflow. Actual GPU frame rate, real browser screenshots/visual behavior, physical controller behavior and a manual five-minute playthrough remain unverified. No licensed external GLB was provided; the enhanced procedural X-17 is the active model.
