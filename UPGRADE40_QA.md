# Skybreak F01–F40 verification

This is an evidence procedure, not a claim that every gate passed. `UPGRADE40_MATRIX.md` and evidence reports are the source of feature status. Scripted clients, synthetic inputs and mobile emulation must keep those labels.

## Baseline and candidate

Compare the same source-independent scene seed `4422`, Medium quality, DPR 1, 1366×768 viewport and browser/hardware. Use the isolated baseline checkout rather than reverting the shared candidate. Record the commit, built asset identity and dirty-working-tree status. A source commit alone does not identify uncommitted files.

Baseline known before this assignment: upstream `ae1fedbb9ae2a790832e0415029f2044ae77562d`; local verified baseline branch `baseline-ae1fedb`. Existing baseline unit/build/static/audit results are separate from graphical acceptance.

## Browser setup and first check

Install normal open-source tools once on a permitted machine:

```sh
npm install --no-save playwright agent-browser
npx playwright install chromium
npm run build
npm run preview
```

After a server starts, use the browser skill's initial verification:

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
