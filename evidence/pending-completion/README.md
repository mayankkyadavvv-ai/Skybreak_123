# Pending-work follow-up — 29 September 2026

Yeh **automated evidence** hai; physical devices, human multiplayer aur production release ka substitute nahi hai.

## Code aur fixes

- Current runtime source: remote `2dac955028de20fd9245e8c31b5d982e59ab16d4`, local `6f64e14` (full local revision in the source manifest), identical Git tree `206bef7ec19084a6ac7d9ab50ef768c81525467e`.
- Friends ke offline Ace Duel/Free Flight ab normal Game lifecycle use karte hain. Purani battle, campaign, damage ya control state carry nahi hoti; Restart chosen mode rakhta hai.
- Cockpit MFD elapsed-time reset par refresh hota hai. Coaming ab instruments cover nahi karta; ray/viewport regression checks included hain.
- Weapons panel flexible columns use karta hai; duplicate radio subtitles hide hote hain; cockpit instructions/notifications ka placement improve hua.
- Default **↑ nose up, ↓ nose down, E missile**, Q/D yaw aur gentler Assisted Open Skies retained hain.
- LAN packaging actual public source inputs aur built assets ke SHA-256 verify karti hai. Missing/stale/tampered manifest ya mismatched source/output reject hota hai. Credentials inventory mein include nahi hote.
- Locked Playwright, PR acceptance workflow, two actual browser sessions ka party/reconnect harness, packaged HTTP/socket checks aur match-worker Docker build added hain.

## Evidence scope

| Evidence | Result / exact scope |
|---|---|
| `baseline-tests.log` | This follow-up began with 206 passing tests. |
| `tests.log` | **217/217 pass**, zero skipped; Node 24.19.0/Linux. Includes full Game offline-mode restarts and cockpit regressions. |
| `manifest-tests.log` | Five manifest integrity/staleness cases pass. |
| `build.log` | Vite production build and seven-page static validation pass. Two chunks still exceed 500 kB; this is not a hardware performance result. |
| `audit.log` | Pattern scan: zero identified privileged credentials. Not an exhaustive credential guarantee. |
| `source-manifest.json` | Exact local public input and asset hashes. Working-source digest is authoritative; local and GitHub commit IDs differ despite identical runtime trees. |
| `lan.json` | **58 assertions pass** on the newly packaged build: hashes, HTTP, two scripted sockets, create/join/start, roster agreement, shutdown. One environment, not two physical offline devices. |
| `network.json` | Earlier this follow-up: eight scripted clients, 600.322 seconds, 59.969 Hz, zero dropped snapshots; all ten assertions pass, including ten-second disconnect/resume and room cleanup. Source was `ab31cdc873255211cd389689b52343f4e981b0ee`, before the client/UI fixes. Backend source is unchanged. |
| `ci-network-initial.json` | Independent GitHub Linux runner: ten-minute eight-client soak passed. First workflow also passed tests/build/LAN and Docker image build. |
| `ci-network-c59.json` | c59 CI: 65.145 seconds, eight clients, 59.881 Hz; ten assertions pass. |
| `ci-network-c72.json` | c72 CI: 65.119 seconds, eight clients, 59.905 Hz, zero dropped snapshots; ten assertions pass. |
| `ci-network.json` | Final 2dac955 CI: 65.149 seconds, eight clients, 59.878 Hz, zero dropped snapshots; ten assertions pass. |
| `ci-tests.log`, `ci-build.log`, `ci-lan.json` | Final runtime: 217/217 tests, production build, 58 LAN checks and Docker image build pass on GitHub Ubuntu/Node 24.21.0. CI source and asset hashes exactly match the final local build. |
| `deployment.json` | Current runtime READY Vercel preview; authenticated root HTTP 200, manifest fetch encountered existing SSO protection. Earlier c59 successful manifest comparison is in `deployment-c59.json`. No preview acceptance is inferred from HTTP alone. |
| `browser-initial.json` | **Failed** initial real Chromium run: 13 screenshots and ten-minute SwiftShader sample collected; first desktop control tests passed, next Settings click timed out waiting for navigation. Failures retained, not called complete. |

Initial workflow: https://github.com/mayankkyadavvv-ai/Skybreak_123/actions/runs/36521031893 (PR head `ab31cdc`, checkout merge `7018c4ee1e98ea896374dd6fcc76794adb9ecbdd`). The renderer was **SwiftShader software WebGL2**, p50/p95/p99 approximately **616.6/683.3/700 ms**. These poor software-rendered timings cannot establish laptop/mobile GPU FPS. Ten restart cycles kept 1,888 geometries, 26 textures and 72 programs stable in that run.

Corrected runtime workflow: https://github.com/mayankkyadavvv-ai/Skybreak_123/actions/runs/36525244904. The in-page click harness now waits for the actual modal state instead of unrelated scheduled navigation. Actual screenshots exposed the cockpit/panel issues above. That c59 run **passed**: 64 top-level checks plus seven two-browser journey assertions, 44 main captures and two party captures, no errors. Its full report is `browser-c59.json`. Agent inspection confirmed the cockpit and desktop weapons fixes, then exposed portrait/landscape HUD overlap, incomplete online mission metadata and an unapplied touch layout preference. Those concrete findings were corrected in c72; its later report is kept separately.

## Final visual/control follow-up

- **F19:** saved touch layouts now move the live controls, not only the editor preview. Resize and scale recompute safe target bounds; overlapping buttons are moved to the nearest available space. Reset restores the responsive CSS layout. Two regression cases cover real DOM application and nine viewport/scale combinations.
- Portrait weapons inventory is moved away from right-hand touch actions; the HP readout is compact. Landscape stick/actions are below the information panels. Captions and comms avoid radar/weapon inventory where space permits.
- Online mission cards show friendly mode/map/objective fields and authoritative phase/hostile counts. They do not display `undefined`, solo `0 / 0 HOSTILES`, or an incorrect hard-coded 30 Hz tick label.
- New browser assertions check actual touch target overlap, actual Save/Reset and the online card. Normal CI now avoids repeating identical keyboard tests at every viewport and does not recollect a software FPS sample on every fix. `long_run=true` retains the complete repeated-controls/restart/600-second path.

### c72 browser findings

`browser-c72.json` retains the failed run https://github.com/mayankkyadavvv-ai/Skybreak_123/actions/runs/36528198051. **50 of 51 top-level checks passed**, including all five default HUD layouts, actual touch Save/Reset and the online mission card; six party assertions passed. During guest reload the unattended co-op ended in defeat. The client correctly resumed the same party's authoritative debrief, while the harness incorrectly required an active flight and timed out. The next harness accepts the same epoch/identity in flight or in its debrief and compares both browsers' actual result fields when ended. It does not resurrect the match, make pilots invulnerable or fabricate a success. The failed report is preserved.

Visual review also confirmed the portrait HP/ammo/caption improvements. Landscape throttle needed its own anchor after making the stick absolute; that is corrected in the final CSS, with additional checks for touch targets overlapping each other. Required physical device/feel acceptance remains separate.

## Final runtime result — 2dac955

[Workflow 36530102137](https://github.com/mayankkyadavvv-ai/Skybreak_123/actions/runs/36530102137) **passed both jobs**. Checkout merge `3d2be3df76b06a5c31eda6ea7a05085d1d91cf07` corresponds to runtime head `2dac955028de20fd9245e8c31b5d982e59ab16d4`. `ci-summary.json` records the mapping, artifact identities and successful job IDs. The CI browser and package manifests match final local source digest `bc2102a58b51a013d896392486d1330e20d690bddfdc92da57da61812882a985` and asset digest `2e1661bdd8dce9fe563c02107c1b7b260abbe5691347cc6eae0baeae52301650`.

`browser.json`: **51/51 top-level checks plus eight party checks pass**, no browser errors; **44 main screenshots + two party screenshots**, five viewport sizes. Actual keyboard checks confirm physical nose direction, throttle hold, one missile on E (including repeated keydown), and no missile through pause. Offline Ace Duel/Free Flight restart correctly. Touch Save changes real buttons and Reset restores defaults. Online create/join/ready, same authoritative epoch/roster, Arrow Up, no solo Restart, reload and leave pass. Final reconnect outcome: **same in-flight match**. The completed-debrief conditional was not exercised in this final run; c72's separately retained failure records why that supported recovery needed to be accepted by the harness.

Screenshot inspection: portrait coach buttons are visible; mobile HUD leaves the default fire/action targets clear; landscape stick and throttle are separated; cockpit instrument readouts are visible and reset; online mode/map/objective labels are populated. These images still show dense combat overlays on small viewports. This is targeted regression review, not blanket visual polish, physical touch feel or all-F01–F40 acceptance.

Renderer: actual Chromium 153 WebGL2 using **SwiftShader software rendering**, Low preset. Normal quick CI omits repeated controls at every viewport, resource loops and a new timed FPS sample. The prior c59 full-path pass remains separately identified. No hardware FPS or human smoothness claim is made. Full final screenshot archive: [browser artifact](https://github.com/mayankkyadavvv-ai/Skybreak_123/actions/runs/36530102137/artifacts/11016113586), expires 13 October 2026; selected JSON/text reports here are durable.

The following documentation/evidence publication does not change any build input, test, workflow or executable source. It uses `[skip actions]` to avoid rerunning the same runtime suite; it does not count as another CI run or authorize production promotion. Runtime verification remains pinned to the exact successful commit and hashes above.

## Release boundary

The existing Vercel project has a READY **preview**, not a production promotion. Public protocol-2 WSS hosting, expiring TURN credentials, four people on two networks, physical offline LAN/controllers/touch and actual hardware/beginner acceptance remain required by `spec/UPGRADE40.md`. No paid resources were purchased and protection settings were not weakened. F32 remains automated-verified; F31/F38 blocked; other 37 implemented/unverified; released 0/40.
