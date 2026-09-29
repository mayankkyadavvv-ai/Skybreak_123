# Skybreak

A Three.js + Vite browser flight/combat game. This source includes the September 2026 upgrade pass: shared controls, camera interpolation, contextual HUD, graphics quality settings, chunked terrain, revised procedural aircraft and effects, accessible menu controls and independent information pages.

## Run locally

Use Node.js 22+ (automated checks use Node 24.19.0 locally and 24.21.0 in CI).

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

The preview uses production-like routing: `/about`, `/help`, `/privacy`, `/terms` and `/storage` work directly; unknown pages and missing assets return real 404s. It sends a local `noindex` header. The existing Vercel preview is deployed through the authorized feature branch. Browser checks run against the matching built game and local service; production promotion has separate gates.

## Fly

- **↑ nose up, ↓ nose down; ←/→ roll; Q/D yaw and ground steering.**
- **W/S changes throttle and holds it after release.** Shift boosts, B brakes.
- Space/LMB cannon; E/RMB missile; X flares; R next target; `[` previous.
- G gear; N map; L airbase panel; C camera cycle; V cockpit/chase.
- MMB temporary free-look; Z recenter; H help; Escape pause/back.

See **CONTROLS_GUIDE.md**, generated from the action registry. Keyboard, mouse and standard gamepad are devices; Assisted and Manual are separate flight modes. Touch controls include steering, throttle, weapons, boost/brake, gear, view and pause.

## Multiplayer

```bash
npm run server
```

The local server listens on port 8080 by default. Run the development client separately. A static host does not run this WebSocket server. Hosted HTTPS clients accept secure WSS endpoints only, on the site origin or the explicitly configured public `VITE_SKYBREAK_WS_URL` origin. Never put a secret in a VITE variable. Configure production CSP before uploading source; see **HOSTING_GUIDE.md**.

The current candidate uses authoritative multiplayer protocol 2; it requires the matching server, not the old protocol-1 worker. Saved data stays in the browser; multiplayer sends names and game state to the chosen server. **Privacy and Terms are drafts pending operator/contact and provider details.**

## Current status and handoff

Source and evidence are published to `feature/skybreak-40-upgrade`, [draft PR #1](https://github.com/mayankkyadavvv-ai/Skybreak_123/pull/1), with a [playable preview](https://skybreak-d6sz7jh10-mayankkyadavvv-3062.vercel.app/) in the existing Skybreak Vercel project. Vercel sign-in may be required by existing preview protection. Production stays on its previous release until the specification's acceptance gates pass.

- [UPGRADE40_PROGRESS.md](UPGRADE40_PROGRESS.md): current implementation status.
- [UPGRADE40_CHECKPOINT.md](UPGRADE40_CHECKPOINT.md): reproducible continuation point and deployment identity.
- [evidence/pending-completion/README.md](evidence/pending-completion/README.md): current test/build/LAN, real Chromium and CI evidence with exact scope.
- [UPGRADE40_QA.md](UPGRADE40_QA.md): automated and required physical/human acceptance.
- [UPGRADE40_RELEASE.md](UPGRADE40_RELEASE.md): match/voice service requirements and production gates.
- [Public server setup — Hinglish](ops/README_HINGLISH.md): Docker/Caddy configuration and `npm run verify:server` for the actual authorized worker.
- [ASSET_PROVENANCE.md](ASSET_PROVENANCE.md) and [DATA_INVENTORY.md](DATA_INVENTORY.md): assets, storage and network behavior.

Current automated suite: **230 tests**. Browser screenshots and two-browser local-party evidence now exist; actual hardware GPU FPS, physical touch/controllers/split-screen, four humans on two networks, offline physical LAN and relay-required voice remain separate requirements. A persistent public WSS worker and authorized TURN configuration are still needed. No licensed external GLB was supplied; the procedural X-17 remains the active model.

## F01–F40 candidate upgrade (2.0.0-rc.1)

This branch contains the upgrade candidate. It is not a claim that every visual, device and external multiplayer release gate passed. See [UPGRADE40_MATRIX.md](UPGRADE40_MATRIX.md) for one row per feature and actual evidence/blockers, [PLAYING_GUIDE_HINGLISH.md](PLAYING_GUIDE_HINGLISH.md) for playing instructions, [LAN_PLAY_GUIDE.md](LAN_PLAY_GUIDE.md) for the offline package, and [UPGRADE40_RELEASE.md](UPGRADE40_RELEASE.md) for worker configuration and gated promotion. Protocol 2 replaces trusted position telemetry with server-owned simulation; it is incompatible with the previous match server.

Verification: `npm test`, `npm run build`, `npm run verify:network`, `npm run package:lan`, `npm run verify:lan`. Real automated browser evidence: install Chromium normally with `npx --no-install playwright install chromium`, then `npm run verify:browser-build`. Physical devices/human play are not simulated by that command. The Vercel production site remains unchanged until the required release gates pass.
