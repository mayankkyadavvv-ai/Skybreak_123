# Upgrade 40 checkpoint — updated 2026-09-29

Candidate: **2.0.0-rc.1**, multiplayer protocol **2**. Upstream baseline: `ae1fedbb9ae2a790832e0415029f2044ae77562d`. Working/review branch: `feature/skybreak-40-upgrade` in `mayankkyadavvv-ai/Skybreak_123`.

The supplied specification is retained verbatim in `spec/UPGRADE40.md`; its SHA-256 is `e3daee237bcf78d296a296ca1001c102377c303f86686cba460b428945ae0de5`. The F01–F40 matrix has exactly 40 rows: F32 automated authority acceptance verified, F31/F38 blocked by external service/acceptance needs, other 37 implemented/unverified. **Released: zero.** This is not a 40/40 completion claim.

## Saved implementation and evidence

- Integrated shared authoritative flight/combat, prediction/reconciliation, party/reconnect, co-op mission templates, activities, generator/campaign, sensors/damage, controls/training, graphics/UI, replay/audio, voice client, LAN and local two-seat mode.
- Mandatory default ↑ nose up and ↓ nose down is tested in offline and shared flight; instructions are derived from active bindings where supported.
- Baseline: 137 passing tests. Candidate: 192 passing tests, build, seven-page static validation and credential-pattern scan passed. Logs are in `evidence/upgrade40/`.
- One-host eight-scripted-client 600-second real-socket soak passed at 59.986 Hz with identical final results, reconnect and cleanup. Scope and subsequent changes are recorded in `UPGRADE40_QA.md`.
- Standalone LAN package launch/create/join/shutdown is covered by `verify:lan`. This does not count as two physical offline devices.
- Source and built asset hashes are retained in `evidence/upgrade40/source-manifest.json`. LAN ZIP includes the guides, licences, standalone server, production assets and manifest; it requires Node.js 22+ to be installed once.

## Remaining concrete gates

1. Collect actual beginner/device/split-screen sessions. CI browser installation now works; screenshot inspection exposed and drove cockpit/HUD/touch corrections. Final runtime browser verification is recorded below. Software rendering does not establish hardware GPU performance.
2. Provision/connect an authorized continuous protocol-2 WSS worker and short-lived TURN credentials through approved resources/spending scope. No new paid resource has been purchased. Deployment files and exact configuration are in `UPGRADE40_RELEASE.md`.
3. Collect four-person/two-network co-op and relay-required voice evidence, plus two-physical-device offline LAN. Automated clients cannot replace these gates.
4. Resolve findings, update the matrix, then promote the exact tested frontend/backend pair to the existing Vercel project and run the recorded release/rollback procedures.

Existing production remains `skybreak-iota.vercel.app`, deployment `dpl_t1vnXgFBprQXXBnd4Kkm3RAeGZAu`. No production promotion has been attempted. Publishing a draft review branch does not satisfy the release gates.

## Publishing status

Earlier GitHub publication attempts were blocked by automatic approval review. On 2026-09-28 the user explicitly authorized publication of the source and test evidence to the public repository `mayankkyadavvv-ai/Skybreak_123`, branch `feature/skybreak-40-upgrade`, creation of a draft PR, and a preview deployment in the existing Skybreak Vercel project. The first source upload under that explicit authorization succeeded.

The candidate is committed locally and is being published through the approved branch/review workflow. The branch and its linked draft PR/deployment checks are the authoritative current publication status. A full-index patch against the exact upstream baseline preserves the implementation changes; the downloadable LAN package was saved separately. GitHub publication and a READY preview do not satisfy the pending production acceptance gates above.

## Post-audit fixes — 2026-09-29 IST

The earlier 192-test candidate evidence above is retained as historical evidence. The follow-up fixes all six reported code flaws, the newly exposed operation terminal-event routing bug, and updates Open Skies steering and default missile fire to E (Q/D yaw). Full suite: **206/206 pass**, including 14 new regression tests. See `FLAW_FIXES.md` and `evidence/flaw-fixes/`. These automated fixes do not satisfy the outstanding graphics/device, public WSS worker, TURN or production release gates.

## Current continuation point — 29 September 2026

Runtime remote commit: `2dac955028de20fd9245e8c31b5d982e59ab16d4`; local commit: `6f64e1496e8d47b861c1c531cdc91d63226aa35b`; identical tree: `206bef7ec19084a6ac7d9ab50ef768c81525467e`. Local history differs from the external repository. Preserve the current remote parent; never force-push the synthetic local history.

Completed after the audit: fresh build/package provenance, locked browser tooling and GitHub acceptance CI, offline Friends sortie/restart lifecycle, cockpit time-reset and instrument occlusion, responsive weapons panel and duplicate radio subtitles; actual touch-layout Save/Reset, non-overlapping landscape controls and complete online mission metadata. **217 tests pass; build/static validation pass; 58 current packaged-LAN checks pass.** Evidence and exact source hashes are in `evidence/pending-completion/`.

Initial CI run `36521031893` failed its browser Settings wait; c59 run `36525244904` passed the full browser path. c72 run `36528198051` exposed a harness expectation when a live match ended during reload. Failed reports are retained with original revisions. **Final runtime run `36530102137` passed both jobs: 217 tests, build/LAN/network/Docker, 51 browser checks plus eight party checks, 46 screenshots, zero browser errors.** Reload restored the same in-flight identity/epoch. CI and local source/assets digests agree exactly. Renderer is SwiftShader software, not hardware FPS acceptance. See `evidence/pending-completion/ci-summary.json` and `browser.json`.

Final documentation/evidence handoff is a separate commit with `[skip actions]`, no build inputs or test/workflow changes. Preserve the successful runtime identity above; do not present the docs revision as a separate browser run.

Preview for this runtime: `https://skybreak-d6sz7jh10-mayankkyadavvv-3062.vercel.app`, deployment `dpl_L47MV5cC5DCtjrAPsbhhTYzkBH58`, READY, authenticated root HTTP 200. Production remains the deployment listed above. Deployment protection is retained. PR #1 is draft; `UPGRADE40_RELEASE.md` lists the required promotion gates.

No persistent local dev or match server is required: packaged and CI verification owns and closes its test services. Use `npm run build`, `npm run verify:browser-build` and the package guide to reproduce. Remaining IDs retain the matrix's honest states: F31/F38 require public services; all other unverified features need their listed hardware/human or scenario acceptance. Next steps require an authorized continuous WSS worker and short-lived TURN configuration, then the listed external human/device acceptance. No known automated failure remains in the final runtime run. Do not mark those external gates complete from CI screenshots or scripted clients.

## Public-worker preparation follow-up

Production config validation, redacted revision/config health, Compose/Caddy gateway and `npm run verify:server` now cover the concrete host-preparation gap. **226/226 local tests and 58 fresh packaged-LAN checks pass**; frontend asset hashes are unchanged from the previous browser-verified runtime. See `evidence/server-readiness/README.md` for current source identity and CI result, and `ops/README_HINGLISH.md` for exact deployment commands. Public WSS/DNS/TURN access and physical human/device gates remain blocked; no production promotion or paid provisioning.

Voice lifecycle follow-up: **230 tests pass**, build and 58 current LAN checks pass. Credentials renew before expiry, failure closes mic/peers, and team/mode changes revoke the old voice membership. Guide updated. Latest source/build identity and separate CI results are in `evidence/server-readiness/README.md`; real relay/human/device acceptance is still required.
