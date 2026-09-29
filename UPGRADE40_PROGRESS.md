# F01–F40 current progress — 29 September 2026

Current review branch: `feature/skybreak-40-upgrade`, draft PR #1. `SKYBREAK_UPGRADE_PROGRESS.md` describes the older sequential upgrade; this file tracks the current F01–F40 assignment.

- Integrated candidate and initial audit fixes are retained. Default ↑ nose up / ↓ nose down / E missile and gentle Assisted Open Skies are implemented and regression-tested.
- Follow-up completed locally: **217 tests**, production build, seven static pages, credential-pattern scan and **58 fresh packaged-LAN assertions**.
- Stale LAN source evidence is fixed: build and package now verify actual source/output hashes. Old or modified builds are rejected before packaging.
- New actual Game regressions exposed offline Friends shortcuts retaining previous sortie state. Ace Duel/Free Flight now share the normal lifecycle and restart correctly.
- Real CI screenshots exposed cockpit instrument occlusion/stale values and weapons overflow. Corrections and regression tests are published in runtime commit `c59bbfff597d867dcc9def3ecba1232a52f93e6f`.
- GitHub CI successfully installs Chromium normally, builds the Docker match worker and exercises packaged HTTP/sockets. Initial 600-second browser evidence includes a failed Settings wait and a software-rendered performance sample; see the evidence README, not a blanket pass claim.
- Existing Vercel project preview is READY. Its authenticated homepage fetch returned HTTP 200. Production promotion remains gated by the supplied specification.

Status: **F32 automated-verified; F31/F38 blocked; other 37 implemented/unverified; released 0/40.** Public persistent WSS/short-lived TURN configuration, actual four-person/two-network play, physical offline LAN/controllers/touch, and hardware/beginner acceptance remain. No new paid resource was provisioned.

Detailed results: `evidence/pending-completion/README.md`. Recovery point and next steps: `UPGRADE40_CHECKPOINT.md`. Playing instructions: `PLAYING_GUIDE_HINGLISH.md`.

Final screenshot follow-up: default touch buttons are separated from HUD panels in portrait/landscape; saved touch layout positions now affect actual controls, are bounded and spaced apart, and Reset restores responsive defaults. Online cards use complete room metadata and authoritative phase counts instead of undefined fields / solo 0-of-0 labels. False 30 Hz telemetry was removed. Current runtime candidate: `2dac955028de20fd9245e8c31b5d982e59ab16d4`; full prior c59 browser run passed 64 checks plus seven party checks, with 46 screenshots.

Final runtime verification: [run 36530102137](https://github.com/mayankkyadavvv-ai/Skybreak_123/actions/runs/36530102137) passed both jobs: **217 tests, 58 packaged-LAN checks, 51 browser checks plus eight party checks**, 46 screenshots and zero browser errors. CI/local source and asset digests match. The eight-client 65-second CI soak ran at 59.878 Hz without dropped snapshots; the separate ten-minute evidence remains labelled with its earlier revision. Final reload restored the same in-flight match. Only documentation/evidence changes follow this tested runtime; all external/human/device gates above remain.

## Public-worker preparation follow-up

Production config validation, redacted revision/config health, Compose/Caddy gateway and `npm run verify:server` now cover the concrete host-preparation gap. **226/226 local tests and 58 fresh packaged-LAN checks pass**; frontend asset hashes are unchanged from the previous browser-verified runtime. See `evidence/server-readiness/README.md` for current source identity and CI result, and `ops/README_HINGLISH.md` for exact deployment commands. Public WSS/DNS/TURN access and physical human/device gates remain blocked; no production promotion or paid provisioning.

Voice lifecycle follow-up: **230 tests pass**, build and 58 current LAN checks pass. Credentials renew before expiry, failure closes mic/peers, and team/mode changes revoke the old voice membership. Guide updated. Latest source/build identity and separate CI results are in `evidence/server-readiness/README.md`; real relay/human/device acceptance is still required.
