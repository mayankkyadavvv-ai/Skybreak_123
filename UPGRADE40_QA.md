# Skybreak F01–F40 verification

This is an evidence procedure, not a claim that every gate passed. `UPGRADE40_MATRIX.md` and evidence reports are the source of feature status. Scripted clients, synthetic inputs and mobile emulation must keep those labels.

## Baseline and candidate

Compare the same source-independent scene seed `4422`, Medium quality, DPR 1, 1366×768 viewport and browser/hardware. Use the isolated baseline checkout rather than reverting the shared candidate. Record the commit, built asset identity and dirty-working-tree status. A source commit alone does not identify uncommitted files.

Baseline known before this assignment: upstream `ae1fedbb9ae2a790832e0415029f2044ae77562d`; local verified baseline branch `baseline-ae1fedb`. Existing baseline unit/build/static/audit results are separate from graphical acceptance.

## Browser setup and first check

Install normal open-source tools once on a permitted machine:

```sh
npm ci
npx --no-install playwright install chromium
npm run build
npm run verify:browser-build
```

The wrapper starts the actual built frontend plus local match service and closes both after testing. It also exercises two independent browser sessions through Friends, room creation/join, readiness, flight, reload/resume and leave. For separate interactive inspection after `npm run preview`, the browser skill can use:

```sh
npx agent-browser open http://localhost:4173
npx agent-browser wait --load networkidle
npx agent-browser snapshot -i
npx agent-browser screenshot qa-artifacts/initial-page.png
npx agent-browser eval 'document.querySelector("vite-error-overlay,[data-nextjs-dialog]") ? "ERROR_OVERLAY" : "OK"'
npx agent-browser close
```

Do not disable browser/TLS/security policies to make a test pass. If browser installation or WebGL is blocked, retain the error and continue unit, server, bundle and static validation. No screenshot/benchmark means no visual/performance claim.

## Reproducible WebGL evidence

`npm run verify:upgrade40` launches a real local Chrome/Edge/Chromium, identifies the renderer, captures five viewport sizes, checks default pitch direction and throttle holding, visits cockpit/hangar/settings/orders, records three lighting setups, checks public pages and performs ten restart cycles. Its default ten-minute sample measures actual requestAnimationFrame intervals. Automatic mission restarts are listed and are not claimed to be a human sortie.

Windows PowerShell example:

```powershell
$env:SKYBREAK_QA_URL = 'http://localhost:4173'
$env:SKYBREAK_QA_LABEL = 'candidate'
$env:SKYBREAK_QA_SECONDS = '600'
$env:SKYBREAK_BROWSER_CHANNEL = 'msedge'
npm run verify:upgrade40
```

macOS/Linux example:

```sh
SKYBREAK_QA_LABEL=candidate SKYBREAK_QA_SECONDS=600 npm run verify:upgrade40
```

Optional `SKYBREAK_BROWSER_PATH` points to an installed local browser. `HEADED=1` shows it. `SKYBREAK_QA_VIEWPORTS='[[1366,768],[390,844]]'` limits a diagnostic run; this does not replace all required layouts. `SKYBREAK_QA_OUTPUT` selects the evidence directory. Run the same command with label `baseline` against the baseline server for comparable files.

Reports include OS, CPU, browser user-agent, GPU renderer when exposed, software-renderer detection, viewport/DPR/preset/seed, load time, p50/p95/p99, draw calls, triangles, resource counts and snapshots. Software rendering is useful for correctness but does not establish laptop/mobile GPU performance. Screenshots require actual inspection; capture success does not establish good visual quality.

Exit codes: `0` automated checks passed; `1` actual failure; `2` missing browser capability. Reports persist on failure.

## LAN package

```sh
npm run build
npm run package:lan
npm run verify:lan
```

The package has `dist`, one bundled Node server, Windows/shell launchers, licences and a hash manifest. The acceptance script verifies package hashes, starts the bundled executable without runtime npm installation, fetches local assets and QR/health routes, connects two **scripted clients in one environment**, creates/joins/starts a match, compares player identities in snapshots, then verifies graceful shutdown and port release.

`node --test tests/lan.test.js` covers address selection, runtime endpoint injection, local QR generation, health, route traversal/symlink protections, DNS-rebinding Host rejection, cross-site WebSocket Origin rejection, room connectivity and cleanup.

Real two-device/offline instructions are in `LAN_PLAY_GUIDE.md`. This gate cannot be replaced by two tabs or two processes on the same host.

## Automated candidate evidence collected on 2026-09-28

`evidence/upgrade40/candidate/` retains the final unit/regression, build, static and secret-scan logs. The baseline had 137 passing tests; the final candidate has **192/192 passing tests**, zero skipped, in Node 24.19.0/Linux. Production build and seven-page static validation passed. The source/config/output pattern scan found no identified privileged credentials; this is not a guarantee against every secret. Vite still reports two chunks above 500 kB, so actual load/GPU performance remains a browser gate. New coverage includes shared/offline default pitch, recovery/calibration, mission objective success/failure, campaign saves, validated generator presets, damage/repair, sensor filtering, input/menu isolation, actual replay identity, activity ranks, lobby loading/countdown changes and local seat lifecycle. `evidence/upgrade40/source-manifest.json` hashes the exact source/config/test/public inputs and built assets; it does not make the blocked visual run a pass.

`qa-network-soak.json`: eight scripted real WebSocket clients, one Linux host (AMD EPYC 9V74, Node 24.19.0), 600.15 wall seconds, 36,001 simulation ticks, 59.986 Hz; simulation cost p50 0.157 ms / p95 0.277 ms / p99 0.442 ms. Artificial ordered 50/100/180 ms RTT queues, deterministic jitter, a 400 ms snapshot stall, and an actual ten-second socket disconnect/resume passed. All eight received the same authoritative result; room cleanup passed; zero protocol errors, rejected snapshots, prediction stalls or dropped snapshots. Maximum measured reconciliation correction was approximately 12 metres; this needs rendered comfort review. CPU was 24.7% of one core and peak RSS 213.1 MB **including all eight scripted prediction clients**. RSS was about 210.1 MB during the final seconds; this is not a browser memory result.

Remote snapshot compaction reduced measured outbound rate from approximately 1.586 MB/s in the 65-second baseline to 0.914 MB/s in the 10-minute candidate run. Scenarios differ in duration, so this is an observed rate comparison, not a normalized universal bandwidth guarantee. Reports retain both runs. The longer run captured the compact-snapshot implementation before later lobby validation, optional configuration/version metadata, AI-cover and host-centred activity changes; final regression/socket/LAN tests cover those later changes. It is not a four-human co-op test.

`qa-lan.json`: packaged files/hashes, standalone bundled service, HTTP assets, protocol-2 create/join/start, public roster agreement and clean shutdown/port release passed with two scripted clients on one host. Adapter enumeration is denied in this workspace; the launcher now remains usable locally and honestly reports no LAN address. No address was fabricated. QR generation/address handling is covered separately with explicit unit fixtures. Physical same-Wi-Fi offline play remains unverified.

`qa-model-inventory.json`: eight X-17 scene models built/disposed headlessly; CPU geometry inventory only. `qa-candidate-browser/acceptance.json` and the baseline browser report are **blocked**, with zero screenshots/frames because no browser executable could be installed through normal permitted paths. No visual regression, GPU FPS, audible mix, physical touch/controller, or human playtest is claimed.

## Required physical and human acceptance still to collect

| Gate | Procedure and evidence |
|---|---|
| Graphics and UI | Inspect matched midday/sunset/cloudy, coast/cloud entry, eight visible aircraft, cockpit and airbase approaches. Review 1366×768, 1920×1080, smaller desktop, 390×844 and 844×390; dense warnings, long callsigns, touch, orders, chat and each modal. Record screenshots and findings. |
| Beginner flight | A first-time player completes climb/turn/lock/flare/landing lessons and a sortie. Record real input device, bindings, issues, and corrections; default ↑ nose up / ↓ nose down. |
| Four-person co-op | Four actual players on at least two networks complete a shared mission with identical objectives/results. Exercise death, respawn, orders, retries and party continuation. Scripted bots are additional evidence. |
| Competitive/network | Supported eight-client match, real input and malicious-message regression tests, 50/100/180 ms delay with jitter and interrupted delivery. Record correction error, server tick rate, bandwidth and agreed results. Apply artificial delay only on authorized local test connections. |
| Reconnect | Interrupt a player's network for ten seconds. Verify the same identity, score/loadout and seat return within grace, no duplicated entities/rewards. Expired tokens and process restarts must show honest recovery errors. |
| Voice | Opt-in permission/denial, PTT, per-user volume, mute/deafen, output changes, team isolation, leaving and reconnecting. Include an actual relay-required path with authorized short-lived TURN credentials. Missing relay provisioning keeps F38 voice blocked. |
| Offline LAN | Two physical devices, same trusted network, internet disconnected after setup; actual shared match completes and closing launcher terminates the service. Record host/client OS/browser and network adapter used. |
| Split-screen | Two humans with keyboard+controller and two controllers independently steer/fire/flare, use separate HUDs and menus, disconnect/reconnect a controller, resize, die and restart. Record real FPS and supported hardware. |
| Long-session/resource | Ten-to-fifteen-minute representative sortie, ten complete start/restart/exit cycles and aircraft changes. Compare resource counts after warm-up; explain bounded caches versus growth. |
| Release | Verify exact frontend/backend version/protocol, secure socket, create/join, actual mission interaction, reconnect, debrief and rollback. HTTP 200 alone is insufficient. |

## Current environment recovery record

During the upgrade, the workspace initially had Playwright libraries but no Chrome/Edge/Chromium executable. Normal `agent-browser` installation succeeded. Its documented browser install failed because the Chrome manifest connection reported an unknown certificate issuer. The primary runtime's normal Playwright install received a 195-byte `text/html` response in place of a Chromium ZIP and failed extraction. The verified OS package-manager route failed container `setgroups`/`seteuid` permissions. No certificate, browser security or sandbox policy was disabled. Until an authorized browser becomes available, keep graphical, audible, physical-device and real-network gates **unverified**.

## Post-audit fixes — 2026-09-29 IST

The earlier 192-test candidate evidence above is retained as historical evidence. The follow-up fixes all six reported code flaws, the newly exposed operation terminal-event routing bug, and updates Open Skies steering and default missile fire to E (Q/D yaw). Full suite: **206/206 pass**, including 14 new regression tests. See `FLAW_FIXES.md` and `evidence/flaw-fixes/`. These automated fixes do not satisfy the outstanding graphics/device, public WSS worker, TURN or production release gates.

## Follow-up evidence — 29 September 2026

Current local suite: **217/217 pass**, zero skipped. Fresh LAN package: **58 checks pass**. Full logs and source/build identity: `evidence/pending-completion/`. The older unavailable-browser record above is historical: GitHub Actions now installs Chromium through its normal secure installer. Local browser installation remains restricted; CI browser evidence is labelled with its actual renderer and environment.

The first CI run passed simulation/build/LAN/Docker and collected a ten-minute, eight-scripted-client network soak. Its browser job collected thirteen real screenshots and a ten-minute **SwiftShader software** frame sample before failing a Settings click's navigation wait. That failure is retained. It exposed cockpit coaming/readout and weapons overflow issues that were fixed in the next runtime candidate; no hardware FPS or human visual-acceptance claim follows from these screenshots.

Normal PR CI checks five rendered layouts, the first viewport's keyboard/weapon/offline-restart flow, touch-layout Save/Reset, two-browser party/reconnect, and a 65-second network sample. It omits repeated per-viewport keyboard tests, resource loops and frame sampling. Use workflow dispatch `long_run=true` for 600-second samples; compare the run's commit/build digest, not a later branch label. Manual full equivalent: `SKYBREAK_QA_QUICK=0 SKYBREAK_QA_SECONDS=600 npm run verify:browser-build`. GitHub artifacts retain reports/screenshots and the runnable LAN ZIP for 14 days. Durable selected reports are committed to `evidence/pending-completion/`.

`npm run build` now writes `dist/build-manifest.json`. Packaging checks current public source inputs and output hashes before bundling the matching server, and the LAN verifier checks the same provenance. Do not copy a historical evidence manifest over a newer build. If a previous package contains unmanaged files, choose a fresh output directory; do not delete unrelated files to bypass the guard.

Final runtime `2dac955028de20fd9245e8c31b5d982e59ab16d4`, workflow `36530102137`: both jobs passed. `evidence/pending-completion/browser.json` has 51 top-level checks and eight party assertions, 44 scene/UI captures and two party captures, zero errors. Five layouts, actual saved touch placement/reset, ↑/↓/E, offline mode/restart, complete online mission labels and same-flight reload/leave passed. Chromium used SwiftShader software WebGL2; this quick run collected no hardware or timed FPS sample. Targeted screenshot review confirmed the cockpit and touch-layout corrections, while dense small-screen combat overlays and real-device feel remain review work. `ci-tests.log`, `ci-build.log`, `ci-lan.json`, `ci-network.json` retain the final independent CI results; local and CI source/assets hashes match. The following documentation/evidence commit changes no build input/test/workflow and skips a redundant Actions run; it is not relabelled as tested executable source.

## Public-worker preparation follow-up

Production config validation, redacted revision/config health, Compose/Caddy gateway and `npm run verify:server` now cover the concrete host-preparation gap. **226/226 local tests and 58 fresh packaged-LAN checks pass**; frontend asset hashes are unchanged from the previous browser-verified runtime. See `evidence/server-readiness/README.md` for current source identity and CI result, and `ops/README_HINGLISH.md` for exact deployment commands. Public WSS/DNS/TURN access and physical human/device gates remain blocked; no production promotion or paid provisioning.

Voice lifecycle follow-up: **230 tests pass**, build and 58 current LAN checks pass. Credentials renew before expiry, failure closes mic/peers, and team/mode changes revoke the old voice membership. Guide updated. Latest source/build identity and separate CI results are in `evidence/server-readiness/README.md`; real relay/human/device acceptance is still required.
